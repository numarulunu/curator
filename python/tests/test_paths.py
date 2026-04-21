import os
from pathlib import Path
from curator.paths import resolve_bin


def test_resolve_bin_uses_env(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("CURATOR_BIN_DIR", str(tmp_path))
    (tmp_path / "exiftool.exe").write_bytes(b"")
    p = resolve_bin("exiftool.exe")
    assert p == str(tmp_path / "exiftool.exe")


def test_resolve_bin_missing_raises(monkeypatch, tmp_path):
    monkeypatch.setenv("CURATOR_BIN_DIR", str(tmp_path))
    try:
        resolve_bin("nonexistent.exe")
    except FileNotFoundError:
        return
    raise AssertionError("expected FileNotFoundError")
