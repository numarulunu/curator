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
