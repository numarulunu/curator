from __future__ import annotations
import os
from pathlib import Path
import pytest

_BIN_DIR = os.environ.get("CURATOR_BIN_DIR", r"D:\curator\resources\bin")
if not Path(_BIN_DIR + r"\exiftool.exe").exists():
    pytest.skip("exiftool.exe not present", allow_module_level=True)

# Ensure the env is set for paths.resolve_bin() even if the user hasn't exported it
os.environ["CURATOR_BIN_DIR"] = _BIN_DIR

from PIL import Image
from curator.exif import extract_many


def test_extract_returns_empty_for_empty_input():
    assert extract_many([]) == {}


def test_extract_real_jpeg_returns_metadata(tmp_path: Path):
    p = tmp_path / "x.jpg"
    Image.new("RGB", (10, 10), "red").save(str(p), "JPEG")
    r = extract_many([str(p)])
    # Normalize key comparison: exiftool returns forward-slash paths on Windows.
    key = str(p).replace("\\", "/")
    assert key in r or str(p) in r
    m = r.get(key) or r.get(str(p))
    assert isinstance(m, dict)
    # Sanity: should have at least the file group tags
    assert any(k.startswith("File:") for k in m.keys())


def test_extract_multiple_jpegs(tmp_path: Path):
    paths = []
    for i in range(3):
        p = tmp_path / f"img_{i}.jpg"
        Image.new("RGB", (10, 10), (i * 20, 0, 0)).save(str(p), "JPEG")
        paths.append(str(p))
    r = extract_many(paths)
    assert len(r) == 3
