import Database from "better-sqlite3";

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("cache_size = -262144");
  db.pragma("mmap_size = 1073741824");
  db.pragma("temp_store = MEMORY");
  db.pragma("busy_timeout = 5000");
  return db;
}

const MIGRATIONS: Array<{ id: number; sql: string }> = [
  {
    id: 1,
    sql: `
      CREATE TABLE files (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        path            TEXT    NOT NULL UNIQUE,
        size            INTEGER NOT NULL,
        mtime_ns        INTEGER NOT NULL,
        xxhash          TEXT,
        canonical_date  TEXT,
        date_source     TEXT,
        exif_json       TEXT,
        kind            TEXT,
        scanned_at      TEXT    NOT NULL
      );
      CREATE INDEX idx_files_xxhash         ON files(xxhash);
      CREATE INDEX idx_files_canonical_date ON files(canonical_date);
      CREATE INDEX idx_files_kind           ON files(kind);

      CREATE TABLE sessions (
        id           TEXT PRIMARY KEY,
        started_at   TEXT NOT NULL,
        completed_at TEXT,
        kind         TEXT NOT NULL
      );
      CREATE TABLE actions (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id   TEXT NOT NULL REFERENCES sessions(id),
        action       TEXT NOT NULL,
        src_path     TEXT NOT NULL,
        dst_path     TEXT,
        reason       TEXT,
        status       TEXT NOT NULL,
        error        TEXT,
        executed_at  TEXT
      );
      CREATE INDEX idx_actions_session ON actions(session_id);
    `,
  },
  {
    id: 2,
    sql: `
      CREATE TABLE image_features (
        file_id          INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
        phash            BLOB,
        clip_embedding   BLOB,
        sharpness        REAL,
        brightness_mean  REAL,
        highlight_clip   REAL,
        shadow_clip      REAL,
        face_count       INTEGER,
        face_quality     REAL,
        nima_score       REAL,
        width            INTEGER,
        height           INTEGER,
        computed_at      TEXT NOT NULL
      );
      CREATE INDEX idx_image_features_phash ON image_features(phash);

      CREATE TABLE clusters (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        method              TEXT NOT NULL,
        confidence          REAL NOT NULL,
        created_at          TEXT NOT NULL,
        applied_session_id  TEXT REFERENCES sessions(id)
      );

      CREATE TABLE cluster_members (
        cluster_id       INTEGER NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
        file_id          INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        rank             INTEGER NOT NULL,
        score            REAL NOT NULL,
        score_breakdown  TEXT NOT NULL,
        is_winner        INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (cluster_id, file_id)
      );
      CREATE INDEX idx_cluster_members_file ON cluster_members(file_id);
      CREATE INDEX idx_cluster_members_winner ON cluster_members(cluster_id, is_winner);
    `,
  },
  {
    id: 3,
    sql: `
      CREATE TABLE analysis_settings (
        id             INTEGER PRIMARY KEY CHECK (id = 1),
        settings_json  TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );
      ALTER TABLE clusters ADD COLUMN thresholds_json TEXT;
    `,
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const applied = new Set(
    (db.prepare("SELECT id FROM migrations").all() as Array<{ id: number }>).map((r) => r.id),
  );
  const tx = db.transaction(() => {
    for (const m of MIGRATIONS) {
      if (applied.has(m.id)) continue;
      db.exec(m.sql);
      db.prepare("INSERT OR IGNORE INTO migrations (id, applied_at) VALUES (?, datetime('now'))").run(m.id);
    }
  });
  tx();
}
