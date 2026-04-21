import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDb, runMigrations } from "@main/db";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

describe("db", () => {
  let dir: string;
  let db: Database.Database;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "curator-db-"));
    db = openDb(join(dir, "index.db"));
    runMigrations(db);
  });
  afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

  it("creates files table with expected columns", () => {
    const cols = db.prepare(`PRAGMA table_info(files)`).all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    for (const n of ["id", "path", "size", "mtime_ns", "xxhash", "canonical_date", "date_source", "exif_json"]) {
      expect(names).toContain(n);
    }
  });

  it("uses WAL mode and NORMAL sync", () => {
    const jm = db.prepare("PRAGMA journal_mode").pluck().get();
    const sy = db.prepare("PRAGMA synchronous").pluck().get();
    expect(jm).toBe("wal");
    expect(sy).toBe(1); // NORMAL = 1
  });

  it("is idempotent on re-run", () => {
    runMigrations(db); // second run should not throw
    const n = (db.prepare("SELECT COUNT(*) FROM migrations").pluck().get() as number);
    expect(n).toBeGreaterThanOrEqual(1);
  });
});
