from __future__ import annotations

from pathlib import Path

from curator.hasher import hash_file


def test_hash_file_returns_stable_digest(tmp_path: Path):
    # ~2.1 MiB so we cross the 1 MiB chunk boundary more than once.
    payload = b"curator" * 300_000
    p = tmp_path / "blob.bin"
    p.write_bytes(payload)

    d1 = hash_file(str(p))
    d2 = hash_file(str(p))

    assert d1 == d2
    assert len(d1) == 16
    assert all(c in "0123456789abcdef" for c in d1)


def test_hash_file_differs_for_different_content(tmp_path: Path):
    a = tmp_path / "a.bin"
    b = tmp_path / "b.bin"
    a.write_bytes(b"alpha-content")
    b.write_bytes(b"beta-content")

    assert hash_file(str(a)) != hash_file(str(b))
