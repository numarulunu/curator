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

  it("creates smart distillation feature tables", () => {
    const featureCols = db.prepare("PRAGMA table_info(image_features)").all() as Array<{ name: string }>;
    const featureNames = featureCols.map((c) => c.name).sort();

    expect(featureNames).toEqual(
      [
        "file_id",
        "phash",
        "clip_embedding",
        "sharpness",
        "brightness_mean",
        "highlight_clip",
        "shadow_clip",
        "face_count",
        "face_quality",
        "nima_score",
        "width",
        "height",
        "computed_at",
      ].sort(),
    );

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'image_features'")
      .all() as Array<{ name: string }>;

    expect(indexes.map((r) => r.name)).toContain("idx_image_features_phash");
  });

  it("creates smart distillation cluster tables", () => {
    const clusterCols = db.prepare("PRAGMA table_info(clusters)").all() as Array<{ name: string }>;
    expect(clusterCols.map((c) => c.name)).toEqual(
      expect.arrayContaining(["id", "method", "confidence", "created_at", "applied_session_id"]),
    );

    const memberCols = db.prepare("PRAGMA table_info(cluster_members)").all() as Array<{ name: string }>;
    expect(memberCols.map((c) => c.name)).toEqual(
      expect.arrayContaining(["cluster_id", "file_id", "rank", "score", "score_breakdown", "is_winner"]),
    );
  });
});
