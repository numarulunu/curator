// tests/main/retrySession.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { openDb, runMigrations } from "@main/db";
import type { SidecarLike } from "@main/apply";
import { retrySession } from "@main/apply";
import type { ApplyResult } from "@shared/types";

describe("retrySession", () => {
  let dir: string;
  let db: Database.Database;
  let sessionsDir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "retry-"));
    db = openDb(join(dir, "index.db"));
    runMigrations(db);
    sessionsDir = join(dir, "sessions");
    mkdirSync(sessionsDir, { recursive: true });

    db.prepare("INSERT INTO sessions (id, started_at, kind) VALUES (?, datetime('now'), 'apply')").run("s1");
    const insertAction = db.prepare(
      "INSERT INTO actions (session_id, action, src_path, dst_path, reason, status) VALUES (?, 'quarantine', ?, NULL, 'dup', ?)",
    );
    insertAction.run("s1", "/arc/a.jpg", "applied");
    insertAction.run("s1", "/arc/b.jpg", "pending");

    writeFileSync(
      join(sessionsDir, "s1.jsonl"),
      [{ __header__: true, archive_root: "/arc", output_root: null }].map((l) => JSON.stringify(l)).join("\n") + "\n",
    );
  });

  afterEach(() => {
    db.close();
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows EBUSY */ }
  });

  function makeSidecar(result: ApplyResult): SidecarLike {
    return { call: vi.fn(async () => result) as SidecarLike["call"] };
  }

  it("sends only pending actions to the sidecar and finalizes the session on success", async () => {
    const sidecar = makeSidecar({ ok: 1, failed: 0, errors: [], session_id: "s1" });

    const result = await retrySession(db, sidecar, "s1", dir);

    expect(result.ok).toBe(1);
    const rows = db.prepare("SELECT src_path, status FROM actions ORDER BY src_path").all();
    expect(rows).toEqual([
      { src_path: "/arc/a.jpg", status: "applied" },
      { src_path: "/arc/b.jpg", status: "applied" },
    ]);
    const session = db.prepare("SELECT completed_at FROM sessions WHERE id = 's1'").get() as { completed_at: string | null };
    expect(session.completed_at).not.toBeNull();

    const call = (sidecar.call as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("applyActions");
    expect((call[1] as { archive_root: string }).archive_root).toBe("/arc");
    expect((call[1] as { actions: Array<{ src_path: string }> }).actions.map((a) => a.src_path)).toEqual(["/arc/b.jpg"]);
  });

  it("is a no-op that closes the session when no actions are pending", async () => {
    db.prepare("UPDATE actions SET status = 'applied' WHERE src_path = '/arc/b.jpg'").run();
    const sidecar = makeSidecar({ ok: 0, failed: 0, errors: [], session_id: "s1" });

    const result = await retrySession(db, sidecar, "s1", dir);

    expect(result).toEqual({ ok: 0, failed: 0, errors: [], session_id: "s1", skipped: true });
    expect((sidecar.call as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    const session = db.prepare("SELECT completed_at FROM sessions WHERE id = 's1'").get() as { completed_at: string | null };
    expect(session.completed_at).not.toBeNull();
  });

  it("records a failed retry in the actions table and keeps the session closed", async () => {
    const sidecar = makeSidecar({
      ok: 0,
      failed: 1,
      errors: [{ src: "/arc/b.jpg", error: "EACCES" }],
      session_id: "s1",
    });

    await retrySession(db, sidecar, "s1", dir);

    const row = db.prepare("SELECT status, error FROM actions WHERE src_path = '/arc/b.jpg'").get() as { status: string; error: string };
    expect(row).toEqual({ status: "failed", error: "EACCES" });
    const session = db.prepare("SELECT completed_at FROM sessions WHERE id = 's1'").get() as { completed_at: string | null };
    expect(session.completed_at).not.toBeNull();
  });

  it("throws when no .jsonl header is available", async () => {
    rmSync(join(sessionsDir, "s1.jsonl"));
    const sidecar = makeSidecar({ ok: 0, failed: 0, errors: [], session_id: "s1" });

    await expect(retrySession(db, sidecar, "s1", dir)).rejects.toThrow(/no \.jsonl header/);
    expect((sidecar.call as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
