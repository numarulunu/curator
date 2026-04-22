from __future__ import annotations

import sqlite3
import time
from pathlib import Path

import pytest

from curator import scan
from curator.db import connect, ensure_schema


@pytest.fixture
def db(tmp_path: Path, monkeypatch) -> Path:
    """Set DB_PATH, initialize schema, and return the db file path."""
    dbp = tmp_path / "test.db"
    monkeypatch.setenv("DB_PATH", str(dbp))
    con = connect()
    try:
        ensure_schema(con)
    finally:
        con.close()
    return dbp


def test_scan_inserts_rows_into_files_table(db: Path, tmp_path: Path):
    archive = tmp_path / "archive"
    (archive / "sub").mkdir(parents=True)
    (archive / "a.jpg").write_bytes(b"jpeg-bytes")
    (archive / "sub" / "b.png").write_bytes(b"png-bytes")
    (archive / "sub" / "c.mp4").write_bytes(b"mp4-bytes")

    result = scan.scan(str(archive))

    assert result == {"scanned": 3, "root": str(archive)}

    con = sqlite3.connect(str(db))
    try:
        count = con.execute("SELECT COUNT(*) FROM files").fetchone()[0]
        assert count == 3
        rows = con.execute(
            "SELECT path, size, mtime_ns FROM files ORDER BY path"
        ).fetchall()
        paths = {r[0] for r in rows}
        assert str(archive / "a.jpg") in paths
        assert str(archive / "sub" / "b.png") in paths
        assert str(archive / "sub" / "c.mp4") in paths
        for _path, size, mtime_ns in rows:
            assert size > 0
            assert mtime_ns > 0
    finally:
        con.close()


def test_scan_is_idempotent_on_rerun(db: Path, tmp_path: Path):
    archive = tmp_path / "archive"
    archive.mkdir()
    target = archive / "a.jpg"
    target.write_bytes(b"jpeg-bytes")
    (archive / "b.png").write_bytes(b"png-bytes")
    (archive / "c.mp4").write_bytes(b"mp4-bytes")

    r1 = scan.scan(str(archive))
    assert r1["scanned"] == 3

    con = sqlite3.connect(str(db))
    try:
        mtime_before = con.execute(
            "SELECT mtime_ns FROM files WHERE path = ?", (str(target),)
        ).fetchone()[0]
    finally:
        con.close()

    # Ensure the OS mtime clock advances past the prior value.
    time.sleep(0.05)
    target.write_bytes(b"jpeg-bytes-modified-longer")

    r2 = scan.scan(str(archive))
    assert r2["scanned"] == 3

    con = sqlite3.connect(str(db))
    try:
        count = con.execute("SELECT COUNT(*) FROM files").fetchone()[0]
        assert count == 3
        mtime_after = con.execute(
            "SELECT mtime_ns FROM files WHERE path = ?", (str(target),)
        ).fetchone()[0]
        assert mtime_after > mtime_before
    finally:
        con.close()


def test_scan_batches_commits(db: Path, tmp_path: Path):
    archive = tmp_path / "archive"
    archive.mkdir()
    for i in range(1200):
        (archive / f"{i:04d}.jpg").write_bytes(b"x")

    result = scan.scan(str(archive), batch_size=500)
    assert result["scanned"] == 1200

    con = sqlite3.connect(str(db))
    try:
        count = con.execute("SELECT COUNT(*) FROM files").fetchone()[0]
        assert count == 1200
    finally:
        con.close()
