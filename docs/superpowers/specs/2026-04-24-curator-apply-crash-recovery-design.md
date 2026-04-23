# Curator Apply Crash Recovery — Design

**Status:** Approved 2026-04-24
**Author:** Ionuț Roșu (collaborative brainstorm with Claude)
**SMAC finding:** #4 — inter-burst crash recovery for `applyProposals`

---

## Problem

After the transaction-safety work that landed in commits `164e64e` through `dd04060`, Curator's `applyProposals` handler performs two atomic DB bursts around an async Python sidecar call:

```
[Electron] INSERT sessions + INSERT actions (status='pending')   (atomic)
[Electron] await sidecar.applyActions(...)                        (async gap)
[Python]   for each action: shutil.move; record to manifest
[Python]   write <session_id>.json at end of loop
[Electron] UPDATE actions (per-action status) + UPDATE sessions.completed_at  (atomic)
```

The inter-burst async gap is unprotected. If the process dies during the gap (power loss, force-quit, Windows update reboot, sidecar segfault), the DB is left with:

- `sessions` row where `completed_at IS NULL`
- `actions` rows stuck at `status='pending'`
- Files on disk in an unknown mid-move state

Nothing cleans this up on next launch. The session sits in the UI history as never-finished forever, and the user has no way to learn what actually happened.

## Approach

Two cooperating changes:

1. **Make the Python-side manifest crash-safe** by writing an incremental `<session_id>.jsonl` log — one JSON object per successful `shutil.move`, flushed per write. The existing `<session_id>.json` manifest is still written at end-of-loop (preserves undo). The `.jsonl` is the ground truth for what actually happened before a crash; the `.json` signals the session completed normally.

2. **Add a startup reconciliation pass** in the Electron main process that, for every session with `completed_at IS NULL`, cross-references the two files and heals or flags the DB accordingly. Interrupted sessions surface in the UI with an "interrupted" badge and a Retry button.

Scope is deliberately limited to sessions where the DB already knows something was started (`sessions` row exists with `completed_at IS NULL`). The design does NOT probe the filesystem to discover sessions the DB never heard about.

## Python-side changes — `python/curator/apply.py`

### Incremental JSONL log

During `apply_actions`:

- Before the loop, compute `jsonl_path = sessions_root / f"{session_id}.jsonl"` and `session_path = sessions_root / f"{session_id}.json"`.
- Ensure `sessions_root` exists (`mkdir(parents=True, exist_ok=True)`) BEFORE the loop, not after (today it's created post-loop at `apply.py:80`).
- Inside the for-loop, after each successful `shutil.move`, open `jsonl_path` in append mode, write one JSON object terminated by `\n`, then explicitly call `file.flush()` and `os.fsync(file.fileno())` before the file is closed (the `with` block handles close on exit). The `fsync` forces the OS buffer to disk — without it, a crash within seconds of the write can still lose the line on Windows. Open/close per move is deliberate; a single long-lived handle defers OS flushes.
- At end of loop, write `<session_id>.json` exactly as today. No change to that file's shape; `undo_session` continues to read it.

### JSONL line schema

Each line is one JSON object with the same shape as an entry in the existing manifest `actions` array:

```json
{"action":"quarantine","src":"/arc/a.jpg","dst":"/arc/_curator_quarantine/.../a.jpg","reason":"dup"}
```

No additional fields. Readers must tolerate blank lines (defensive against a crash mid-newline-write).

### Retry idempotence

Add a pre-move guard in `apply_actions`: if `src` does not exist when the loop reaches an action, record an error `src no longer exists` for that action and continue. Today's code would hit an OS error in `shutil.move` and handle it via the existing `except Exception` branch — the explicit pre-check is clearer and survives a successful-but-unlogged move from a prior interrupted attempt without fabricating a hash-suffixed duplicate through `_ensure_unique`.

The existing `_ensure_unique` hash-suffix behavior for destination collisions is unchanged.

### Tests in `python/tests/test_apply.py`

- Test: `apply_actions` writes one line per successful move to `<session_id>.jsonl`, and also writes the final `<session_id>.json`. Verify line count + content.
- Test: monkeypatch `shutil.move` to raise on the second action. Verify `.jsonl` has exactly one entry; `.json` does NOT exist; `errors` contains one entry; function returned with `ok=1, failed=1`.
- Test: run `apply_actions` with a pre-existing `.jsonl` (simulated retry state). Verify a second run APPENDS to the same `.jsonl` — existing lines preserved, new lines added. The final `.json` merges new results with old.
- Test: run `apply_actions` where a src file is deleted between scheduling and the move. Verify the action is recorded as failed with error containing `src no longer exists`.

## Electron-side changes — new `src/main/reconcile.ts`

### Pure reconciliation function

Export `reconcileInterruptedSessions(db: Database.Database, stateDir: string): ReconcileSummary` from a new file `src/main/reconcile.ts`. Pure: no IPC, no global state, takes its two dependencies as parameters so it can be unit-tested.

`ReconcileSummary` counts sessions into buckets: `autoHealed`, `interrupted`, `neverStarted`, `total`.

```ts
export interface ReconcileSummary {
  autoHealed: number;
  interrupted: number;
  neverStarted: number;
  total: number;
}

export function reconcileInterruptedSessions(
  db: Database.Database,
  stateDir: string,
): ReconcileSummary;
```

### Algorithm

For each row from `SELECT id FROM sessions WHERE completed_at IS NULL AND kind = 'apply'`:

- Resolve `manifestJson = stateDir / "Curator" / "sessions" / "${id}.json"` and `manifestJsonl = stateDir / "Curator" / "sessions" / "${id}.jsonl"`.
- Classify the session:
  - **autoHealed**: `.json` exists. Trust it — the sidecar signed off on the session. Read it, and for each action row, match by `src_path`: if an entry exists in `.json.actions`, set `status='applied'`; otherwise set `status='failed'` with `error='manifest completed but action not logged'`. Set `session.completed_at = now()`. One `db.transaction` per session.
  - **interrupted**: `.json` missing but `.jsonl` exists. Read `.jsonl` (one object per line, skip blanks). For each action row, if `src_path` matches an entry in the JSONL, set `status='applied'`. Otherwise leave `status='pending'` and populate `error='interrupted; action not logged before crash'`. Do NOT set `completed_at` — the session stays flagged for Retry.
  - **neverStarted**: both files missing. Set `session.completed_at = now()`, all actions `status='failed'`, `error='apply never started'`. This closes out pre-sidecar-crash sessions.
- If reading either file throws, log the error and skip that session (leave DB untouched). Don't let a single corrupted manifest block reconciliation of other sessions.

### Wiring into startup

In `src/main/index.ts`, inside `initializeBackend`, call `reconcileInterruptedSessions(db, stateDir)` AFTER `runMigrations(db)` and BEFORE `sidecar.start(...)`. Write one `writeStartupLog` line per session reconciled plus one summary line.

The renderer never sees intermediate state because `backendReady` only resolves after `initializeBackend` completes.

### Tests in new `tests/main/reconcile.test.ts`

- Seed an in-memory DB with three pending sessions. Seed a tmpdir with matching manifest files:
  - Session A: both `.json` + `.jsonl` → autoHealed.
  - Session B: `.jsonl` only → interrupted.
  - Session C: neither file → neverStarted.
- Call `reconcileInterruptedSessions`, assert `ReconcileSummary` counts, assert DB state per session (statuses, `completed_at`).
- Test: pre-existing completed sessions (`completed_at IS NOT NULL`) are untouched.
- Test: corrupted JSON (invalid parse) → session skipped, other sessions still reconciled, no throw leaks out of the function.
- Test: `.json` present with an action row whose `src_path` is NOT in the JSON's actions array → that row gets `status='failed'`, others get `status='applied'`.

## UI changes

### New preload field

Extend `SessionRow` in `src/main/queries.ts` and `Session` in `src/shared/types.ts` with a derived status. Don't compute in SQL — derive in the renderer from existing fields:

- `completed_at` set AND no action has `status='pending'` → `complete`
- `completed_at` set AND any action `status='failed'` → `complete` (with warning indicator via existing error display)
- `completed_at` NULL → `interrupted`
- `completed_at` NULL AND session `kind='apply'` → `interrupted` and eligible for Retry

Expose pending-action count in `SessionRow`:

```ts
export interface SessionRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  kind: string;
  action_count: number;
  pending_count: number;  // NEW — used by the UI to show "N actions never completed" on interrupted rows
}
```

`listSessions` in `src/main/queries.ts` gets a new subquery: `(SELECT COUNT(*) FROM actions a WHERE a.session_id = s.id AND a.status = 'pending') AS pending_count`.

The UI renders `pending_count` inline with the Interrupted badge: e.g. `"Interrupted · 2 pending"`. For complete sessions (pending_count = 0), the count is not displayed.

### Interrupted row rendering

In `src/renderer/components/dashboard/DashboardSurface.tsx`, the session strip (`RightSection title="Sessions"` area near line 340) gets an interrupted-aware row: warning-tone dot, "Interrupted" status word, and a "Retry" inline button when `completed_at IS NULL AND kind = 'apply'`.

### Retry flow

Clicking Retry calls a new `window.curator.retrySession(sessionId)` IPC method. The main-process handler:

1. Reads the pending actions for the session: `SELECT action, src_path, dst_path, reason FROM actions WHERE session_id = ? AND status = 'pending' ORDER BY id`. Actions with `status='applied'` or `'failed'` are NOT re-sent — reconciliation has already classified them from the JSONL / JSON.
2. Calls the sidecar's `applyActions` with that filtered list and the SAME `session_id`. No further client-side filtering against the JSONL is needed — the Python-side pre-move guard (`if not src.exists()`) handles the already-moved case defensively.
3. On sidecar return, wraps the per-action UPDATE + `completed_at` UPDATE in a `db.transaction`, same as the original post-sidecar burst in `applyProposals`.

Retry is implemented by extracting a shared helper from `src/main/apply.ts`:

```ts
// src/main/apply.ts
function recordFinish(db, sessionId, proposals, result): void { /* existing post-sidecar transaction */ }
export function retrySession(db, sidecar, sessionId): Promise<ApplyResult>;
```

### Preload + IPC contract

Add to `src/preload/index.ts` and `src/shared/types.ts`:

```ts
retrySession: (sessionId: string) => Promise<ApplyResult>;
```

Main-process handler `curator:retrySession` registered in `src/main/index.ts` wrapping `retrySession(db!, sidecar!, id)`.

### Tests

- `tests/main/retrySession.test.ts`: seed DB with a pending session + actions, mock sidecar, assert retry calls sidecar with the correct filtered payload and updates DB state.
- `tests/renderer/dashboardSurface.test.ts`: extend existing tests with a recentSessions entry where `completed_at === null` and assert the Interrupted badge + Retry button render.
- `tests/e2e/smoke.spec.ts`: optionally extend the existing apply-undo happy-path test with a retry path — deferred; the unit and renderer coverage is sufficient for ship.

## Data flow (normal + crash timeline)

```
User clicks Apply
  └─> Electron pre-sidecar transaction
        INSERT sessions  (completed_at=NULL, kind='apply')
        INSERT actions × N  (status='pending')
      COMMIT
  └─> sidecar.applyActions(...)
        Python: for each action:
          try: shutil.move(src, dst)
               write line to <id>.jsonl          (durable after this line)
          except: append to errors
        Python: write <id>.json                  (signals session complete)
        return {ok, failed, errors, session_id}
  └─> Electron post-sidecar transaction
        UPDATE actions × N (per-action status from sidecar's errors)
        UPDATE sessions SET completed_at = now()
      COMMIT

— normal end —

Crash points and recovery:

  Crash before pre-sidecar COMMIT
    → no session row, no actions, no files touched. Reconcile finds nothing.

  Crash after pre-sidecar COMMIT, before sidecar starts
    → session completed_at=NULL, all actions pending, no .json, no .jsonl.
    Reconcile: neverStarted.

  Crash mid Python loop
    → session completed_at=NULL, all actions pending, .jsonl has K entries, no .json.
    Reconcile: interrupted. K actions flip to 'applied', rest stay 'pending' with
    informational error. User sees "Interrupted — Retry?" in sessions strip.

  Crash after Python finishes loop and writes .json, before sidecar IPC returns
    → session completed_at=NULL, all actions pending, .jsonl has N entries, .json exists.
    Reconcile: autoHealed. DB catches up to reality from .json. User sees a normal
    complete session; a single startup-log line notes the heal happened.

  Crash after sidecar IPC returns, before post-sidecar COMMIT
    → identical to previous case from DB's perspective. Same auto-heal path.

  Crash after post-sidecar COMMIT
    → session is complete on disk and in DB. Reconcile skips it.
```

## Out of scope

- **`undoSession` retry / reconciliation.** Undo has symmetric exposure (its sidecar call is also async) but this spec covers apply only. Undo reconciliation is a follow-on design.
- **Filesystem probing.** Inferring action state from `src_exists` / `dst_exists` on disk is not part of this design. Every such rule is a new bug surface.
- **Auto-retry.** Retry is user-initiated only. Silent retries hide bugs and surprise users.
- **New action-status values** (`interrupted`, `reverse_failed`, etc.). The design reuses the existing `pending | applied | failed | reversed` quadrant.
- **Schema migrations.** No new columns on any table. Derived UI state uses existing fields.
- **Cleanup of legacy `.jsonl` files after session auto-heal.** The `.jsonl` can stay on disk as a forensic record. Future cleanup is a separate concern.
- **Pre-ship historical interrupted sessions in users' databases.** The reconciliation code handles them the same way — the first app launch after shipping this walks the history and closes everything out.

## Open questions / known risks

- **Windows file-flush semantics.** The design relies on `open(mode='a', buffering=1)` + explicit `flush()` + `close()` per move being durable after the call returns. If a power loss happens mid-write, the `.jsonl` may contain a partial last line. The reader must tolerate a partial last line (skip on JSON parse failure) for this to be robust. The spec says "tolerate blank lines"; the implementation must ALSO tolerate truncated lines.

- **Retry interleaving.** If the user clicks Retry on a session while the original sidecar call is STILL in flight (not crashed, just slow), we'd double-apply. The UI should disable Retry while `backendReady` has an in-flight `applyActions` call for that session. Simple: gate Retry behind a main-process check that no other RPC is currently holding this session_id.

- **Concurrent reconciliation.** This spec assumes a single Electron instance. If two Curator processes race to launch on the same state dir, reconciliation could run twice. SQLite locking via WAL + `busy_timeout=5000` protects DB integrity; reconciliation is idempotent by design (auto-heal sets statuses that don't flip-flop), so double-run is harmless.

## Acceptance

The design is accepted when all of the following are true after ship:

- An interrupted Apply (killed the app mid-sidecar-call) shows the session as "Interrupted — Retry?" next launch, with correct per-action statuses reflecting what actually moved.
- Clicking Retry completes any still-pending actions and flips the session to "complete" in the UI.
- A successful Apply that happened to crash only in the tiny window between sidecar-return and post-sidecar-COMMIT auto-heals silently (one startup-log line, no UI indication).
- Pre-existing zombie sessions in users' DBs from before the fix are closed out on first post-ship launch.
- No new action-status values, no new schema columns.
