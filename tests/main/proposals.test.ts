import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { openDb, runMigrations } from "@main/db";
import { buildProposals, type Proposal } from "@main/proposals";

describe("buildProposals", () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "prop-"));
    db = openDb(join(dir, "index.db"));
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows EBUSY */ }
  });

  it("proposes quarantine for duplicates keeping oldest mtime", () => {
    const ins = db.prepare(
      "INSERT INTO files (path, size, mtime_ns, xxhash, scanned_at) VALUES (?, ?, ?, ?, datetime('now'))",
    );
    ins.run("/a/newer.jpg", 100, 200, "hhhhhhhhhhhhhhhh");
    ins.run("/a/older.jpg", 100, 100, "hhhhhhhhhhhhhhhh");

    const proposals: Proposal[] = buildProposals(db, "/archive");
    const quarantines = proposals.filter((p) => p.action === "quarantine");

    expect(quarantines).toHaveLength(1);
    expect(quarantines[0].src_path).toBe("/a/newer.jpg");
    expect(quarantines[0].dst_path).toBeNull();
    expect(quarantines[0].reason).toContain("/a/older.jpg");
  });

  it("proposes move for files in wrong year folder", () => {
    db.prepare(
      "INSERT INTO files (path, size, mtime_ns, canonical_date, date_source, scanned_at) VALUES (?, 1, 1, ?, 'filename', datetime('now'))",
    ).run("/archive/2016/x.jpg", "2015-07-14T10:00:00+00:00");

    const proposals = buildProposals(db, "/archive");
    const moves = proposals.filter((p) => p.action === "move_to_year");

    expect(moves).toHaveLength(1);
    expect(moves[0].src_path).toBe("/archive/2016/x.jpg");
    expect(moves[0].dst_path).toBe("/archive/2015/x.jpg");
    expect(moves[0].reason).toContain("2015");
  });

  it("keeps oldest mtime as keeper across 3-way cluster", () => {
    const ins = db.prepare(
      "INSERT INTO files (path, size, mtime_ns, xxhash, scanned_at) VALUES (?, ?, ?, ?, datetime('now'))",
    );
    ins.run("/a/mid.jpg", 100, 200, "aaaaaaaaaaaaaaaa");
    ins.run("/a/oldest.jpg", 100, 100, "aaaaaaaaaaaaaaaa");
    ins.run("/a/newest.jpg", 100, 300, "aaaaaaaaaaaaaaaa");

    const proposals = buildProposals(db, "/archive");
    const quarantines = proposals
      .filter((p) => p.action === "quarantine")
      .map((p) => p.src_path)
      .sort();

    expect(quarantines).toEqual(["/a/mid.jpg", "/a/newest.jpg"]);
    expect(proposals.every((p) => p.reason.includes("/a/oldest.jpg") || p.action !== "quarantine")).toBe(true);
  });

  it("ignores singletons and files already in the correct year folder", () => {
    const ins = db.prepare(
      "INSERT INTO files (path, size, mtime_ns, xxhash, canonical_date, date_source, scanned_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
    );
    ins.run("/archive/alone.jpg", 10, 1, "unique-hash-abcd", null, null);
    ins.run("/archive/2020/good.jpg", 10, 2, null, "2020-05-01T00:00:00+00:00", "filename");

    const proposals = buildProposals(db, "/archive");
    expect(proposals).toHaveLength(0);
  });
});
