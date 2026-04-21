import os
import sqlite3


def connect() -> sqlite3.Connection:
    path = os.environ.get("DB_PATH")
    if not path:
        raise RuntimeError("DB_PATH env var not set")
    con = sqlite3.connect(path, isolation_level=None, check_same_thread=False)
    con.execute("PRAGMA journal_mode = WAL")
    con.execute("PRAGMA synchronous = NORMAL")
    con.execute("PRAGMA busy_timeout = 5000")
    con.execute("PRAGMA foreign_keys = ON")
    return con


def ensure_schema(con: sqlite3.Connection) -> None:
    # Node main is the owner of schema migrations. This is a no-op guard
    # used by tests and defensive callers.
    con.execute("""
        CREATE TABLE IF NOT EXISTS files (
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
        )
    """)
