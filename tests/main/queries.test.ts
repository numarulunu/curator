import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { openDb, runMigrations } from "@main/db";
import { listMisplacedByDate, listSessions, listZeroByte } from "@main/queries";

describe("queries", () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "qry-"));
    db = openDb(join(dir, "index.db"));
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows EBUSY */ }
  });

  it("limits misplaced rows to the selected archive", () => {
    const ins = db.prepare(
      "INSERT INTO files (path, size, mtime_ns, canonical_date, date_source, scanned_at) VALUES (?, 1, 1, ?, 'filename', datetime('now'))",
    );
    ins.run("/archive/2016/in.jpg", "2015-07-14T10:00:00+00:00");
    ins.run("/other/2016/out.jpg", "2015-07-14T10:00:00+00:00");

    expect(listMisplacedByDate(db, "/archive").map((row) => row.path)).toEqual(["/archive/2016/in.jpg"]);
  });

  it("limits zero-byte rows to the selected archive", () => {
    const ins = db.prepare(
      "INSERT INTO files (path, size, mtime_ns, scanned_at) VALUES (?, ?, 1, datetime('now'))",
    );
    ins.run("/archive/in.jpg", 0);
    ins.run("/other/out.jpg", 0);

    expect(listZeroByte(db, "/archive").map((row) => row.path)).toEqual(["/archive/in.jpg"]);
  });
});

describe("listSessions pending_count", () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sessions-"));
    db = openDb(join(dir, "index.db"));
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows EBUSY */ }
  });

  it("counts pending rows only for apply sessions", () => {
    db.prepare("INSERT INTO sessions (id, started_at, kind) VALUES (?, datetime('now'), 'apply')").run("s-apply");
    db.prepare("INSERT INTO sessions (id, started_at, kind) VALUES (?, datetime('now'), 'undo')").run("s-undo");
    const ins = db.prepare("INSERT INTO actions (session_id, action, src_path, status) VALUES (?, 'quarantine', ?, ?)");
    ins.run("s-apply", "/arc/a.jpg", "applied");
    ins.run("s-apply", "/arc/b.jpg", "pending");
    ins.run("s-apply", "/arc/c.jpg", "pending");
    // Action rows shouldn't exist for undo sessions in practice, but the SQL must
    // refuse to count them even if they ever do.
    ins.run("s-undo", "/arc/d.jpg", "pending");

    const rows = listSessions(db);
    const apply = rows.find((r) => r.id === "s-apply");
    const undoRow = rows.find((r) => r.id === "s-undo");
    expect(apply).toBeDefined();
    expect(apply!.pending_count).toBe(2);
    expect(apply!.action_count).toBe(3);
    expect(undoRow).toBeDefined();
    expect(undoRow!.pending_count).toBe(0);
    expect(undoRow!.action_count).toBe(1);
  });
});
