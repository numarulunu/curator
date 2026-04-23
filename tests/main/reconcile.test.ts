// tests/main/reconcile.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { openDb, runMigrations } from "@main/db";
import { reconcileInterruptedSessions } from "@main/reconcile";

describe("reconcileInterruptedSessions", () => {
  let dir: string;
  let db: Database.Database;
  let sessionsDir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "reconcile-"));
    db = openDb(join(dir, "index.db"));
    runMigrations(db);
    sessionsDir = join(dir, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
  });

  afterEach(() => {
    db.close();
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows EBUSY */ }
  });

  function seedPendingSession(id: string, srcPaths: string[]): void {
    db.prepare("INSERT INTO sessions (id, started_at, kind) VALUES (?, datetime('now'), 'apply')").run(id);
    const insertAction = db.prepare(
      "INSERT INTO actions (session_id, action, src_path, dst_path, reason, status) VALUES (?, 'quarantine', ?, NULL, 'dup', 'pending')",
    );
    for (const src of srcPaths) insertAction.run(id, src);
  }

  function writeJson(id: string, body: object): void {
    writeFileSync(join(sessionsDir, `${id}.json`), JSON.stringify(body));
  }

  function writeJsonl(id: string, lines: object[]): void {
    writeFileSync(join(sessionsDir, `${id}.jsonl`), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  }

  it("auto-heals a session where .json is present (trusts .json)", () => {
    seedPendingSession("s-heal", ["/arc/a.jpg", "/arc/b.jpg"]);
    writeJsonl("s-heal", [
      { __header__: true, archive_root: "/arc", output_root: null },
      { action: "quarantine", src: "/arc/a.jpg", dst: "/arc/_q/a.jpg", reason: "dup" },
      { action: "quarantine", src: "/arc/b.jpg", dst: "/arc/_q/b.jpg", reason: "dup" },
    ]);
    writeJson("s-heal", {
      session_id: "s-heal",
      archive_root: "/arc",
      output_root: null,
      actions: [
        { action: "quarantine", src: "/arc/a.jpg", dst: "/arc/_q/a.jpg", reason: "dup" },
        { action: "quarantine", src: "/arc/b.jpg", dst: "/arc/_q/b.jpg", reason: "dup" },
      ],
    });

    const summary = reconcileInterruptedSessions(db, dir);

    expect(summary).toEqual({ autoHealed: 1, interrupted: 0, neverStarted: 0, total: 1 });
    const rows = db.prepare("SELECT src_path, status FROM actions ORDER BY src_path").all();
    expect(rows).toEqual([
      { src_path: "/arc/a.jpg", status: "applied" },
      { src_path: "/arc/b.jpg", status: "applied" },
    ]);
    const session = db.prepare("SELECT completed_at FROM sessions WHERE id = ?").get("s-heal") as { completed_at: string | null };
    expect(session.completed_at).not.toBeNull();
  });

  it("flags a session with only .jsonl as interrupted and pins moved rows to applied", () => {
    seedPendingSession("s-int", ["/arc/a.jpg", "/arc/b.jpg"]);
    writeJsonl("s-int", [
      { __header__: true, archive_root: "/arc", output_root: null },
      { action: "quarantine", src: "/arc/a.jpg", dst: "/arc/_q/a.jpg", reason: "dup" },
    ]);

    const summary = reconcileInterruptedSessions(db, dir);

    expect(summary).toEqual({ autoHealed: 0, interrupted: 1, neverStarted: 0, total: 1 });
    const rows = db.prepare("SELECT src_path, status, error FROM actions ORDER BY src_path").all();
    expect(rows).toEqual([
      { src_path: "/arc/a.jpg", status: "applied", error: null },
      { src_path: "/arc/b.jpg", status: "pending", error: "interrupted; action not logged before crash" },
    ]);
    const session = db.prepare("SELECT completed_at FROM sessions WHERE id = ?").get("s-int") as { completed_at: string | null };
    expect(session.completed_at).toBeNull();
  });

  it("closes out a session that never started when neither file exists", () => {
    seedPendingSession("s-none", ["/arc/a.jpg"]);

    const summary = reconcileInterruptedSessions(db, dir);

    expect(summary).toEqual({ autoHealed: 0, interrupted: 0, neverStarted: 1, total: 1 });
    const row = db.prepare("SELECT status, error FROM actions WHERE session_id = ?").get("s-none") as { status: string; error: string };
    expect(row).toEqual({ status: "failed", error: "apply never started" });
    const session = db.prepare("SELECT completed_at FROM sessions WHERE id = ?").get("s-none") as { completed_at: string | null };
    expect(session.completed_at).not.toBeNull();
  });

  it("marks a .json action row as failed when its src_path is not in the manifest", () => {
    seedPendingSession("s-mismatch", ["/arc/a.jpg", "/arc/b.jpg"]);
    writeJson("s-mismatch", {
      session_id: "s-mismatch",
      archive_root: "/arc",
      output_root: null,
      actions: [{ action: "quarantine", src: "/arc/a.jpg", dst: "/arc/_q/a.jpg", reason: "dup" }],
    });

    reconcileInterruptedSessions(db, dir);

    const rows = db.prepare("SELECT src_path, status, error FROM actions ORDER BY src_path").all();
    expect(rows).toEqual([
      { src_path: "/arc/a.jpg", status: "applied", error: null },
      { src_path: "/arc/b.jpg", status: "failed",  error: "manifest completed but action not logged" },
    ]);
  });

  it("skips a session with corrupt .json and leaves it pending; reconciles others", () => {
    seedPendingSession("s-bad", ["/arc/x.jpg"]);
    seedPendingSession("s-good", ["/arc/y.jpg"]);
    writeFileSync(join(sessionsDir, "s-bad.json"), "{ not valid json");

    const summary = reconcileInterruptedSessions(db, dir);

    expect(summary.total).toBe(2);
    expect(summary.neverStarted).toBe(1);
    const bad = db.prepare("SELECT status FROM actions WHERE session_id = ?").get("s-bad") as { status: string };
    expect(bad.status).toBe("pending");
    const good = db.prepare("SELECT status FROM actions WHERE session_id = ?").get("s-good") as { status: string };
    expect(good.status).toBe("failed");
  });

  it("ignores already-completed sessions", () => {
    db.prepare("INSERT INTO sessions (id, started_at, completed_at, kind) VALUES (?, datetime('now'), datetime('now'), 'apply')").run("done");
    db.prepare("INSERT INTO actions (session_id, action, src_path, status) VALUES (?, 'quarantine', '/arc/z.jpg', 'applied')").run("done");

    const summary = reconcileInterruptedSessions(db, dir);

    expect(summary).toEqual({ autoHealed: 0, interrupted: 0, neverStarted: 0, total: 0 });
    const row = db.prepare("SELECT status FROM actions WHERE session_id = ?").get("done") as { status: string };
    expect(row.status).toBe("applied");
  });
});
