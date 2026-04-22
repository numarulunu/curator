from __future__ import annotations

import sqlite3
import time
from pathlib import Path

from curator import scan


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


def test_scan_emits_progress_events_per_batch(db: Path, tmp_path: Path, monkeypatch):
    archive = tmp_path / "archive"
    archive.mkdir()
    for i in range(1200):
        (archive / f"{i:04d}.jpg").write_bytes(b"x")

    captured: list[tuple[str, dict]] = []

    def fake_emit_event(kind: str, **payload) -> None:
        captured.append((kind, payload))

    monkeypatch.setattr(scan, "emit_event", fake_emit_event)

    result = scan.scan(str(archive), batch_size=500)
    assert result["scanned"] == 1200

    assert len(captured) >= 3
    assert all(kind == "scan.progress" for kind, _ in captured)
    assert captured[-1][1]["scanned"] == 1200

    scanned_values = [payload["scanned"] for _, payload in captured]
    assert scanned_values == sorted(scanned_values)
