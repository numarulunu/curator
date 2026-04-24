import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { openDb, runMigrations } from "@main/db";
import type { SidecarLike } from "@main/apply";
import { undoSession, type UndoResult } from "@main/undo";

describe("undoSession", () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "undo-"));
    db = openDb(join(dir, "index.db"));
    runMigrations(db);

    db.prepare("INSERT INTO sessions (id, started_at, completed_at, kind) VALUES (?, datetime('now'), datetime('now'), 'apply')").run("s1");
    const insertAction = db.prepare(
      "INSERT INTO actions (session_id, action, src_path, dst_path, reason, status) VALUES (?, ?, ?, ?, ?, 'applied')",
    );
    insertAction.run("s1", "quarantine", "/arc/a.jpg", null, "dup");
    insertAction.run("s1", "quarantine", "/arc/b.jpg", null, "dup");
  });

  afterEach(() => {
    db.close();
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows EBUSY */ }
  });

  function makeSidecar(result: UndoResult): SidecarLike {
    return { call: vi.fn(async () => result) as SidecarLike["call"] };
  }

  it("marks every action reversed when sidecar restores all", async () => {
    const sidecar = makeSidecar({ restored: 2, failed: 0, errors: [], session_id: "s1" });
    await undoSession(db, sidecar, "s1");

    const rows = db.prepare("SELECT src_path, status, error FROM actions ORDER BY src_path").all() as Array<{ src_path: string; status: string; error: string | null }>;
    expect(rows).toEqual([
      { src_path: "/arc/a.jpg", status: "reversed", error: null },
      { src_path: "/arc/b.jpg", status: "reversed", error: null },
    ]);
  });

  it("clears applied cluster markers when sidecar restores all", async () => {
    db.prepare("INSERT INTO clusters (id, method, confidence, created_at, applied_session_id) VALUES (42, 'phash', 1.0, datetime('now'), 's1')").run();
    const sidecar = makeSidecar({ restored: 2, failed: 0, errors: [], session_id: "s1" });

    await undoSession(db, sidecar, "s1");

    const row = db.prepare("SELECT applied_session_id FROM clusters WHERE id = 42").get() as { applied_session_id: string | null };
    expect(row.applied_session_id).toBeNull();
  });
  it("marks only restored actions reversed and records errors on failed ones", async () => {
    const sidecar = makeSidecar({
      restored: 1,
      failed: 1,
      errors: [{ src: "/arc/b.jpg", error: "ENOENT" }],
      session_id: "s1",
    });

    await undoSession(db, sidecar, "s1");

    const rows = db.prepare("SELECT src_path, status, error FROM actions ORDER BY src_path").all() as Array<{ src_path: string; status: string; error: string | null }>;
    expect(rows).toEqual([
      { src_path: "/arc/a.jpg", status: "reversed", error: null },
      { src_path: "/arc/b.jpg", status: "applied",  error: "ENOENT" },
    ]);
  });

  it("leaves all actions untouched when the sidecar rejects", async () => {
    const sidecar: SidecarLike = { call: vi.fn(async () => { throw new Error("sidecar down"); }) };

    await expect(undoSession(db, sidecar, "s1")).rejects.toThrow(/sidecar down/);

    const rows = db.prepare("SELECT status, error FROM actions").all() as Array<{ status: string; error: string | null }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "applied" && r.error === null)).toBe(true);
  });

  it("rolls back the whole undo UPDATE if any per-action write fails", async () => {
    db.exec(`
      CREATE TRIGGER undo_test_poison
      BEFORE UPDATE ON actions
      WHEN NEW.src_path = 'FAIL'
      BEGIN
        SELECT RAISE(ABORT, 'poison-trigger');
      END;
    `);
    db.prepare("INSERT INTO actions (session_id, action, src_path, status) VALUES (?, ?, ?, ?)").run("s1", "quarantine", "FAIL", "applied");

    const sidecar = makeSidecar({ restored: 3, failed: 0, errors: [], session_id: "s1" });

    await expect(undoSession(db, sidecar, "s1")).rejects.toThrow(/poison-trigger/);

    const rows = db.prepare("SELECT src_path, status FROM actions ORDER BY src_path").all() as Array<{ src_path: string; status: string }>;
    expect(rows.find((r) => r.src_path === "/arc/a.jpg")?.status).toBe("applied");
    expect(rows.find((r) => r.src_path === "/arc/b.jpg")?.status).toBe("applied");
    expect(rows.find((r) => r.src_path === "FAIL")?.status).toBe("applied");
  });
});
