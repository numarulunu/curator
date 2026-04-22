from __future__ import annotations
import os
import sqlite3
from pathlib import Path
import pytest

_BIN_DIR = os.environ.get("CURATOR_BIN_DIR", r"D:\curator\resources\bin")
if not Path(_BIN_DIR + r"\exiftool.exe").exists():
    pytest.skip("exiftool.exe not present", allow_module_level=True)

os.environ["CURATOR_BIN_DIR"] = _BIN_DIR

from curator.scan import scan as scan_archive
from curator.builtins import _resolve_dates_handler


def test_resolves_dates_from_filename(tmp_path: Path, db):
    archive = tmp_path / "arch"
    (archive / "2015").mkdir(parents=True)
    (archive / "2015" / "150714103000.jpg").write_bytes(b"dummy-not-a-real-jpeg")
    scan_archive(str(archive))
    r = _resolve_dates_handler({})
    assert r["resolved"] == 1
    con = sqlite3.connect(str(db))
    row = con.execute("SELECT canonical_date, date_source FROM files").fetchone()
    con.close()
    assert row[1] == "filename"
    assert row[0].startswith("2015-07-14")


def test_resolves_dates_falls_back_to_mtime(tmp_path: Path, db):
    archive = tmp_path / "arch"; archive.mkdir()
    # Name has no parseable pattern; content not a real JPEG so EXIF fails too.
    (archive / "random-name.jpg").write_bytes(b"not-a-real-jpeg")
    scan_archive(str(archive))
    r = _resolve_dates_handler({})
    assert r["resolved"] == 1
    con = sqlite3.connect(str(db))
    row = con.execute("SELECT canonical_date, date_source FROM files").fetchone()
    con.close()
    # Dummy bytes have no valid EXIF and filename has no date pattern -> mtime.
    assert row[1] == "mtime"
    assert row[0] is not None  # some ISO timestamp


def test_resolve_dates_is_idempotent_on_rerun(tmp_path: Path, db):
    archive = tmp_path / "arch"; archive.mkdir()
    (archive / "20200101_120000.jpg").write_bytes(b"dummy")
    scan_archive(str(archive))
    r1 = _resolve_dates_handler({})
    assert r1["resolved"] == 1
    # Second call should skip the already-resolved row (NULL filter).
    r2 = _resolve_dates_handler({})
    assert r2["resolved"] == 0
