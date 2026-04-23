// src/main/reconcile.ts
import type Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface ReconcileSummary {
  autoHealed: number;
  interrupted: number;
  neverStarted: number;
  total: number;
}

interface ManifestJsonEntry {
  action: string;
  src: string;
  dst: string;
  reason?: string | null;
}

interface ManifestJson {
  session_id: string;
  archive_root?: string;
  output_root?: string | null;
  started_at?: string;
  actions: ManifestJsonEntry[];
}

function readJsonIfExists<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw err;
  }
}

function readJsonlBodyIfExists(path: string): Set<string> | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw err;
  }
  const srcs = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as { src?: string; __header__?: boolean };
      if (obj.__header__) continue;
      if (typeof obj.src === "string") srcs.add(obj.src);
    } catch {
      // Truncated or corrupt last line; ignore.
    }
  }
  return srcs;
}

export function reconcileInterruptedSessions(
  db: Database.Database,
  stateDir: string,
): ReconcileSummary {
  const sessionsDir = join(stateDir, "sessions");
  const pending = db
    .prepare("SELECT id FROM sessions WHERE completed_at IS NULL AND kind = 'apply'")
    .all() as Array<{ id: string }>;

  const selectActions = db.prepare("SELECT src_path FROM actions WHERE session_id = ?");
  const markApplied = db.prepare(
    "UPDATE actions SET status = 'applied', error = NULL, executed_at = datetime('now') WHERE session_id = ? AND src_path = ?",
  );
  const markFailed = db.prepare(
    "UPDATE actions SET status = 'failed', error = ?, executed_at = datetime('now') WHERE session_id = ? AND src_path = ?",
  );
  const markInterrupted = db.prepare(
    "UPDATE actions SET error = ? WHERE session_id = ? AND src_path = ? AND status = 'pending'",
  );
  const completeSession = db.prepare(
    "UPDATE sessions SET completed_at = datetime('now') WHERE id = ?",
  );

  let autoHealed = 0;
  let interrupted = 0;
  let neverStarted = 0;

  for (const { id } of pending) {
    const jsonPath = join(sessionsDir, `${id}.json`);
    const jsonlPath = join(sessionsDir, `${id}.jsonl`);

    try {
      const manifest = readJsonIfExists<ManifestJson>(jsonPath);
      const movedSrcs = readJsonlBodyIfExists(jsonlPath);

      if (manifest) {
        const manifestSrcs = new Set(manifest.actions.map((a) => a.src));
        const actions = selectActions.all(id) as Array<{ src_path: string }>;
        db.transaction(() => {
          for (const { src_path } of actions) {
            if (manifestSrcs.has(src_path)) {
              markApplied.run(id, src_path);
            } else {
              markFailed.run("manifest completed but action not logged", id, src_path);
            }
          }
          completeSession.run(id);
        })();
        autoHealed += 1;
        continue;
      }

      if (movedSrcs !== null) {
        const actions = selectActions.all(id) as Array<{ src_path: string }>;
        db.transaction(() => {
          for (const { src_path } of actions) {
            if (movedSrcs.has(src_path)) {
              markApplied.run(id, src_path);
            } else {
              markInterrupted.run("interrupted; action not logged before crash", id, src_path);
            }
          }
        })();
        interrupted += 1;
        continue;
      }

      const actions = selectActions.all(id) as Array<{ src_path: string }>;
      db.transaction(() => {
        for (const { src_path } of actions) {
          markFailed.run("apply never started", id, src_path);
        }
        completeSession.run(id);
      })();
      neverStarted += 1;
    } catch {
      // A corrupt manifest for one session must not block the rest.
    }
  }

  return { autoHealed, interrupted, neverStarted, total: pending.length };
}
