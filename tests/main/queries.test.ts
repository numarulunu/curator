import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { openDb, runMigrations } from "@main/db";
import { listMisplacedByDate, listZeroByte } from "@main/queries";

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
