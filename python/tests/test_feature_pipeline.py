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

    extract_one(fid, str(img), ai_mode="lite")

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

    result_a = extract_batch(root=str(tmp_path), batch_size=10, ai_mode="lite")
    result_b = extract_batch(root=str(tmp_path), batch_size=10, ai_mode="lite")

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
    fid = con.execute("SELECT id FROM files WHERE path = ?", (str(bad),)).fetchone()[0]
    con.close()

    result = extract_batch(root=str(tmp_path), batch_size=10, ai_mode="lite")

    assert result["processed"] == 0
    assert len(result["errors"]) == 1
    con = _db.connect()
    row = con.execute("SELECT phash, width, height FROM image_features WHERE file_id = ?", (fid,)).fetchone()
    con.close()
    assert row == (None, None, None)


def test_extract_batch_decode_error_does_not_block_next_file(tmp_path, db_path):
    bad = tmp_path / "bad.jpg"
    bad.write_bytes(b"not-an-image")
    good = tmp_path / "good.jpg"
    scene(good)
    con = _db.connect()
    for path in (bad, good):
        con.execute(
            "INSERT INTO files (path, size, mtime_ns, scanned_at) VALUES (?, ?, ?, datetime('now'))",
            (str(path), path.stat().st_size, path.stat().st_mtime_ns),
        )
    con.close()

    first = extract_batch(root=str(tmp_path), batch_size=1, ai_mode="lite")
    second = extract_batch(root=str(tmp_path), batch_size=1, ai_mode="lite")

    assert first["processed"] == 0
    assert len(first["errors"]) == 1
    assert second["processed"] == 1
    assert second["errors"] == []


def test_feature_rpc_methods_are_registered():
    assert "downloadModels" in REGISTRY
    assert "extractFeatures" in REGISTRY


def test_ai_mode_off_skips_all_ai_and_phash_only(tmp_path, db_path):
    from tests.fixtures.gen import scene
    img = tmp_path / "off.jpg"; scene(img)
    from curator import db as _db
    con = _db.connect()
    con.execute(
        "INSERT INTO files (path, size, mtime_ns, scanned_at) VALUES (?, ?, ?, datetime('now'))",
        (str(img), img.stat().st_size, img.stat().st_mtime_ns),
    )
    con.close()
    r = extract_batch(root=str(tmp_path), batch_size=10, ai_mode="off")
    assert r["processed"] == 0
    assert r["skipped_mode_off"] == 1


def test_ai_mode_lite_runs_clip_but_not_face_or_nima(monkeypatch, tmp_path, db_path):
    from tests.fixtures.gen import scene
    img = tmp_path / "lite.jpg"; scene(img)
    from curator import db as _db
    con = _db.connect()
    con.execute(
        "INSERT INTO files (path, size, mtime_ns, scanned_at) VALUES (?, ?, ?, datetime('now'))",
        (str(img), img.stat().st_size, img.stat().st_mtime_ns),
    )
    fid = con.execute("SELECT id FROM files WHERE path = ?", (str(img),)).fetchone()[0]
    con.close()

    calls = []
    monkeypatch.setattr("curator.features.phash.compute", lambda p: b"\x00" * 8 if not calls.append("phash") else b"\x00" * 8)
    from curator.features import quality as _q
    monkeypatch.setattr(_q, "compute", lambda p: _q.QualityMetrics(1, 1, 1.0, 0.5, 0.0, 0.0) if not calls.append("quality") else None)
    monkeypatch.setattr("curator.features.clip.embed", lambda p: __import__("numpy").zeros(512, dtype="float32") if not calls.append("clip") else None)
    import curator.features as _ff
    monkeypatch.setattr(_ff, "_faces_compute", lambda *a: calls.append("face") or None, raising=False)
    monkeypatch.setattr(_ff, "_nima_score", lambda *a: calls.append("nima") or None, raising=False)

    extract_one(fid, str(img), ai_mode="lite")
    assert "phash" in calls
    assert "quality" in calls
    assert "clip" in calls
    assert "face" not in calls
    assert "nima" not in calls


def test_cancel_between_batches_returns_cancelled(tmp_path, db_path):
    from curator import pipeline
    pipeline.reset_cancel()
    pipeline.request_cancel()
    r = extract_batch(root=str(tmp_path), batch_size=10, ai_mode="lite")
    assert r.get("cancelled") is True
    pipeline.reset_cancel()
