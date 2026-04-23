from __future__ import annotations

import sqlite3
import time

import pytest
from pathlib import Path

from curator import scan
from curator.walker import ScanRootError


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


def test_scan_returns_zero_for_accessible_root_with_only_unsupported_files(
    db: Path, tmp_path: Path
):
    archive = tmp_path / "archive"
    archive.mkdir()
    supported = archive / "keep.jpg"
    supported.write_bytes(b"jpeg")

    first = scan.scan(str(archive))
    assert first == {"scanned": 1, "root": str(archive)}

    supported.unlink()
    (archive / "notes.txt").write_text("plain text", encoding="utf-8")
    (archive / "manifest.json").write_text("{}", encoding="utf-8")

    result = scan.scan(str(archive))

    assert result == {"scanned": 0, "root": str(archive)}

    con = sqlite3.connect(str(db))
    try:
        rows = con.execute("SELECT path FROM files ORDER BY path").fetchall()
        assert rows == []
    finally:
        con.close()


def test_scan_stages_rows_in_batches_before_swapping(db: Path, tmp_path: Path, monkeypatch):
    archive = tmp_path / "archive"
    archive.mkdir()
    for i in range(1200):
        (archive / f"{i:04d}.jpg").write_bytes(b"x")

    real_connect = scan.connect
    batch_sizes: list[int] = []

    class RecordingConnection:
        def __init__(self, inner):
            self._inner = inner

        def execute(self, *args, **kwargs):
            return self._inner.execute(*args, **kwargs)

        def executemany(self, sql, seq_of_parameters):
            rows = list(seq_of_parameters)
            batch_sizes.append(len(rows))
            return self._inner.executemany(sql, rows)

        def close(self):
            return self._inner.close()

    def fake_connect():
        return RecordingConnection(real_connect())

    monkeypatch.setattr(scan, "connect", fake_connect)

    result = scan.scan(str(archive), batch_size=500)
    assert result["scanned"] == 1200
    assert batch_sizes == [500, 500, 200]



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


def test_scan_replaces_existing_rows_for_same_root(db: Path, tmp_path: Path):
    archive = tmp_path / "archive"
    archive.mkdir()
    keep = archive / "keep.jpg"
    remove = archive / "remove.jpg"
    keep.write_bytes(b"keep")
    remove.write_bytes(b"remove")

    first = scan.scan(str(archive))
    assert first["scanned"] == 2

    remove.unlink()

    second = scan.scan(str(archive))
    assert second["scanned"] == 1

    con = sqlite3.connect(str(db))
    try:
        rows = con.execute("SELECT path FROM files ORDER BY path").fetchall()
        assert rows == [(str(keep),)]
    finally:
        con.close()


def test_scan_keeps_prior_rows_when_replacement_walk_fails(
    db: Path, tmp_path: Path, monkeypatch
):
    archive = tmp_path / "archive"
    archive.mkdir()
    original = archive / "keep.jpg"
    original.write_bytes(b"jpeg")

    first = scan.scan(str(archive))
    assert first["scanned"] == 1

    def fake_walk(_root):
        raise ScanRootError("replacement walk failed")
        yield  # pragma: no cover

    monkeypatch.setattr(scan, "walk", fake_walk)

    with pytest.raises(ScanRootError, match="replacement walk failed"):
        scan.scan(str(archive))

    con = sqlite3.connect(str(db))
    try:
        rows = con.execute("SELECT path FROM files ORDER BY path").fetchall()
        assert rows == [(str(original),)]
    finally:
        con.close()


def test_scan_raises_when_root_cannot_be_opened(db: Path, monkeypatch):
    def fake_walk(_root):
        raise ScanRootError("Could not open scan root '/blocked': denied")

    monkeypatch.setattr(scan, "walk", fake_walk)

    with pytest.raises(ScanRootError, match="Could not open scan root"):
        scan.scan("/blocked")
