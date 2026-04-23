from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from curator import hashall


def _insert(con: sqlite3.Connection, path: str, xxhash_val: str | None = None) -> None:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    con.execute(
        "INSERT INTO files (path, size, mtime_ns, xxhash, scanned_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (path, 10, 1_000_000_000, xxhash_val, now),
    )


def test_hash_all_updates_xxhash_column(db: Path, tmp_path: Path):
    paths = []
    for i in range(3):
        p = tmp_path / f"f{i}.bin"
        p.write_bytes(f"content-{i}".encode())
        paths.append(str(p))

    con = sqlite3.connect(str(db))
    try:
        for p in paths:
            _insert(con, p)
        con.commit()
    finally:
        con.close()

    result = hashall.hash_all()
    assert result == {"hashed": 3, "skipped": 0}

    con = sqlite3.connect(str(db))
    try:
        rows = con.execute(
            "SELECT path, xxhash FROM files ORDER BY path"
        ).fetchall()
        assert len(rows) == 3
        for _p, digest in rows:
            assert digest is not None
            assert len(digest) == 16
            assert all(c in "0123456789abcdef" for c in digest)
    finally:
        con.close()


def test_hash_all_skips_files_with_existing_hash(db: Path, tmp_path: Path):
    a = tmp_path / "a.bin"
    b = tmp_path / "b.bin"
    a.write_bytes(b"alpha")
    b.write_bytes(b"beta")

    con = sqlite3.connect(str(db))
    try:
        _insert(con, str(a), xxhash_val="abc123")
        _insert(con, str(b), xxhash_val=None)
        con.commit()
    finally:
        con.close()

    result = hashall.hash_all()
    assert result == {"hashed": 1, "skipped": 0}

    con = sqlite3.connect(str(db))
    try:
        a_hash = con.execute(
            "SELECT xxhash FROM files WHERE path = ?", (str(a),)
        ).fetchone()[0]
        b_hash = con.execute(
            "SELECT xxhash FROM files WHERE path = ?", (str(b),)
        ).fetchone()[0]
        assert a_hash == "abc123"
        assert b_hash is not None
        assert len(b_hash) == 16
    finally:
        con.close()


def test_hash_all_skips_missing_files(db: Path, tmp_path: Path):
    ghost = tmp_path / "does-not-exist.bin"

    con = sqlite3.connect(str(db))
    try:
        _insert(con, str(ghost))
        con.commit()
    finally:
        con.close()

    result = hashall.hash_all()
    assert result == {"hashed": 0, "skipped": 1}

    con = sqlite3.connect(str(db))
    try:
        digest = con.execute(
            "SELECT xxhash FROM files WHERE path = ?", (str(ghost),)
        ).fetchone()[0]
        assert digest is None
    finally:
        con.close()


def test_hash_all_emits_progress_events(db: Path, tmp_path: Path, monkeypatch):
    con = sqlite3.connect(str(db))
    try:
        for i in range(400):
            p = tmp_path / f"f{i:04d}.bin"
            p.write_bytes(f"c{i}".encode())
            _insert(con, str(p))
        con.commit()
    finally:
        con.close()

    captured: list[tuple[str, dict]] = []

    def fake_emit_event(kind: str, **payload) -> None:
        captured.append((kind, payload))

    monkeypatch.setattr(hashall, "emit_event", fake_emit_event)

    result = hashall.hash_all(batch_size=100)
    assert result == {"hashed": 400, "skipped": 0}

    assert len(captured) >= 4
    assert all(kind == "hash.progress" for kind, _ in captured)
    assert captured[-1][1]["hashed"] == 400

    hashed_values = [payload["hashed"] for _, payload in captured]
    assert hashed_values == sorted(hashed_values)


def test_hash_all_can_scope_to_root(db: Path, tmp_path: Path):
    archive_a = tmp_path / "archive-a"
    archive_b = tmp_path / "archive-b"
    archive_a.mkdir()
    archive_b.mkdir()
    a_file = archive_a / "a.bin"
    b_file = archive_b / "b.bin"
    a_file.write_bytes(b"alpha")
    b_file.write_bytes(b"beta")

    con = sqlite3.connect(str(db))
    try:
        _insert(con, str(a_file))
        _insert(con, str(b_file))
        con.commit()
    finally:
        con.close()

    result = hashall.hash_all(root=str(archive_a))
    assert result == {"hashed": 1, "skipped": 0}

    con = sqlite3.connect(str(db))
    try:
        rows = con.execute("SELECT path, xxhash FROM files ORDER BY path").fetchall()
        assert rows[0][1] is not None
        assert rows[1][1] is None
    finally:
        con.close()
