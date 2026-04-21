import os
import sqlite3
from pathlib import Path
from curator.db import connect, ensure_schema


def test_connect_returns_valid_sqlite(tmp_path: Path, monkeypatch):
    dbp = tmp_path / "index.db"
    monkeypatch.setenv("DB_PATH", str(dbp))
    con = connect()
    ensure_schema(con)
    cur = con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='files'")
    assert cur.fetchone() is not None
    con.close()


def test_wal_and_sync_normal(tmp_path: Path, monkeypatch):
    dbp = tmp_path / "index.db"
    monkeypatch.setenv("DB_PATH", str(dbp))
    # simulate that Node side already created the DB and ran migrations
    seed = sqlite3.connect(str(dbp))
    seed.execute("CREATE TABLE files (id INTEGER PRIMARY KEY)")
    seed.commit(); seed.close()

    con = connect()
    assert con.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
    assert con.execute("PRAGMA synchronous").fetchone()[0] == 1
    con.close()
