import pytest

from curator import db as _db
from curator import builtins  # noqa: F401
from curator.features import extract_batch, extract_one
from curator.rpc import REGISTRY
from tests.fixtures.gen import scene


@pytest.fixture
def db_path(tmp_path, monkeypatch):
    p = tmp_path / "curator.db"
    monkeypatch.setenv("DB_PATH", str(p))
    con = _db.connect()
    _db.ensure_schema(con)
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS image_features (
          file_id INTEGER PRIMARY KEY,
          phash BLOB,
          clip_embedding BLOB,
          sharpness REAL, brightness_mean REAL,
          highlight_clip REAL, shadow_clip REAL,
          face_count INTEGER, face_quality REAL,
          nima_score REAL, width INTEGER, height INTEGER,
          computed_at TEXT NOT NULL
        )
        """
    )
    con.close()
    return p


def test_extract_one_writes_row(tmp_path, db_path):
    img = tmp_path / "x.jpg"
    scene(img)
    con = _db.connect()
    con.execute(
        "INSERT INTO files (path, size, mtime_ns, scanned_at) VALUES (?, ?, ?, datetime('now'))",
        (str(img), img.stat().st_size, img.stat().st_mtime_ns),
    )
    fid = con.execute("SELECT id FROM files WHERE path = ?", (str(img),)).fetchone()[0]
    con.close()

    extract_one(fid, str(img), skip_ai=True)

    con = _db.connect()
    row = con.execute(
        "SELECT file_id, phash, sharpness, width, height FROM image_features WHERE file_id = ?",
        (fid,),
    ).fetchone()
    con.close()
    assert row is not None
    assert row[1] is not None
    assert row[2] > 0


def test_extract_batch_skips_already_computed(tmp_path, db_path):
    img = tmp_path / "y.jpg"
    scene(img)
    con = _db.connect()
    con.execute(
        "INSERT INTO files (path, size, mtime_ns, scanned_at) VALUES (?, ?, ?, datetime('now'))",
        (str(img), img.stat().st_size, img.stat().st_mtime_ns),
    )
    con.close()

    result_a = extract_batch(root=str(tmp_path), batch_size=10, skip_ai=True)
    result_b = extract_batch(root=str(tmp_path), batch_size=10, skip_ai=True)

    assert result_a["processed"] == 1
    assert result_b["processed"] == 0
    assert result_b["skipped"] == 1


def test_extract_batch_records_decode_errors(tmp_path, db_path):
    bad = tmp_path / "bad.jpg"
    bad.write_bytes(b"not-an-image")
    con = _db.connect()
    con.execute(
        "INSERT INTO files (path, size, mtime_ns, scanned_at) VALUES (?, ?, ?, datetime('now'))",
        (str(bad), bad.stat().st_size, bad.stat().st_mtime_ns),
    )
    con.close()

    result = extract_batch(root=str(tmp_path), batch_size=10, skip_ai=True)

    assert result["processed"] == 0
    assert len(result["errors"]) == 1


def test_feature_rpc_methods_are_registered():
    assert "downloadModels" in REGISTRY
    assert "extractFeatures" in REGISTRY
