import numpy as np

from curator import db as _db
from curator import builtins  # noqa: F401
from curator import cluster_smart
from curator.rpc import REGISTRY


def test_phash_buckets_group_near_twins():
    a = (0).to_bytes(8, "big")
    b = (1 << 2).to_bytes(8, "big")
    c = (0xFFFF_FFFF_FFFF_FFFF).to_bytes(8, "big")
    items = [
        {"file_id": 1, "phash": a, "clip": None, "ts": None, "gps": None},
        {"file_id": 2, "phash": b, "clip": None, "ts": None, "gps": None},
        {"file_id": 3, "phash": c, "clip": None, "ts": None, "gps": None},
    ]
    clusters = cluster_smart.stage_phash(items, hamming_threshold=4)
    grouped = [set(c["file_ids"]) for c in clusters]
    assert {1, 2} in grouped
    assert not any(3 in c["file_ids"] for c in clusters if len(c["file_ids"]) > 1)


def test_clip_stage_groups_by_cosine_with_time_prior():
    rng = np.random.default_rng(7)
    base = rng.normal(size=512).astype(np.float32)
    base /= np.linalg.norm(base)
    near = base + rng.normal(scale=0.02, size=512).astype(np.float32)
    near /= np.linalg.norm(near)
    far = rng.normal(size=512).astype(np.float32)
    far /= np.linalg.norm(far)

    items = [
        {"file_id": 10, "phash": (0).to_bytes(8, "big"), "clip": base, "ts": 1000, "gps": None},
        {"file_id": 11, "phash": (1 << 60).to_bytes(8, "big"), "clip": near, "ts": 1100, "gps": None},
        {"file_id": 12, "phash": (1 << 30).to_bytes(8, "big"), "clip": far, "ts": 9999, "gps": None},
    ]
    clusters = cluster_smart.stage_clip(items, cosine_threshold=0.90, time_window_s=1800)
    grouped = [set(c["file_ids"]) for c in clusters if len(c["file_ids"]) > 1]
    assert {10, 11} in grouped
    assert all(12 not in g for g in grouped)


def test_run_clusters_pooled_clip_embeddings(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "c.db"))
    con = _db.connect()
    _db.ensure_schema(con)
    con.execute(
        "CREATE TABLE IF NOT EXISTS image_features (file_id INTEGER PRIMARY KEY, phash BLOB, clip_embedding BLOB, width INTEGER, height INTEGER, computed_at TEXT)"
    )
    con.execute(
        "CREATE TABLE IF NOT EXISTS clusters (id INTEGER PRIMARY KEY AUTOINCREMENT, method TEXT NOT NULL, confidence REAL NOT NULL, created_at TEXT NOT NULL, applied_session_id TEXT, thresholds_json TEXT)"
    )
    con.execute(
        "CREATE TABLE IF NOT EXISTS cluster_members (cluster_id INTEGER NOT NULL, file_id INTEGER NOT NULL, rank INTEGER NOT NULL, score REAL NOT NULL, score_breakdown TEXT NOT NULL, is_winner INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (cluster_id, file_id))"
    )
    rng = np.random.default_rng(11)
    base = rng.normal(size=768).astype(np.float32)
    base /= np.linalg.norm(base)
    near = base + rng.normal(scale=0.01, size=768).astype(np.float32)
    near /= np.linalg.norm(near)
    con.execute("INSERT INTO files (id, path, size, mtime_ns, scanned_at) VALUES (1, 'a.jpg', 1, 0, datetime('now'))")
    con.execute("INSERT INTO files (id, path, size, mtime_ns, scanned_at) VALUES (2, 'b.jpg', 1, 0, datetime('now'))")
    con.execute(
        "INSERT INTO image_features (file_id, phash, clip_embedding, width, height, computed_at) VALUES (1, ?, ?, 1, 1, datetime('now'))",
        ((0).to_bytes(8, "big"), base.tobytes()),
    )
    con.execute(
        "INSERT INTO image_features (file_id, phash, clip_embedding, width, height, computed_at) VALUES (2, ?, ?, 1, 1, datetime('now'))",
        ((0xFFFF_FFFF_FFFF_FFFF).to_bytes(8, "big"), near.tobytes()),
    )
    con.close()

    res = cluster_smart.run(root=None)

    assert res == {"clusters_created": 1, "files_clustered": 2}
    con = _db.connect()
    row = con.execute("SELECT method FROM clusters").fetchone()
    con.close()
    assert row == ("clip",)

def test_run_end_to_end_returns_empty_summary(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "c.db"))
    con = _db.connect()
    _db.ensure_schema(con)
    con.execute(
        "CREATE TABLE IF NOT EXISTS image_features (file_id INTEGER PRIMARY KEY, phash BLOB, clip_embedding BLOB, width INTEGER, height INTEGER, computed_at TEXT)"
    )
    con.execute(
        "CREATE TABLE IF NOT EXISTS clusters (id INTEGER PRIMARY KEY AUTOINCREMENT, method TEXT NOT NULL, confidence REAL NOT NULL, created_at TEXT NOT NULL, applied_session_id TEXT, thresholds_json TEXT)"
    )
    con.execute(
        "CREATE TABLE IF NOT EXISTS cluster_members (cluster_id INTEGER NOT NULL, file_id INTEGER NOT NULL, rank INTEGER NOT NULL, score REAL NOT NULL, score_breakdown TEXT NOT NULL, is_winner INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (cluster_id, file_id))"
    )
    con.close()
    res = cluster_smart.run(root=None)
    assert res == {"clusters_created": 0, "files_clustered": 0}


def test_cluster_smart_rpc_method_is_registered():
    assert "clusterSmart" in REGISTRY


def test_run_accepts_thresholds_bundle_and_stores_on_cluster(tmp_path, monkeypatch):
    from curator import db as _db
    from curator import cluster_smart
    monkeypatch.setenv("DB_PATH", str(tmp_path / "th.db"))
    con = _db.connect()
    _db.ensure_schema(con)
    con.execute("CREATE TABLE IF NOT EXISTS image_features (file_id INTEGER PRIMARY KEY, phash BLOB, clip_embedding BLOB, width INTEGER, height INTEGER, computed_at TEXT)")
    con.execute("CREATE TABLE IF NOT EXISTS clusters (id INTEGER PRIMARY KEY AUTOINCREMENT, method TEXT NOT NULL, confidence REAL NOT NULL, created_at TEXT NOT NULL, applied_session_id TEXT, thresholds_json TEXT)")
    con.execute("CREATE TABLE IF NOT EXISTS cluster_members (cluster_id INTEGER NOT NULL, file_id INTEGER NOT NULL, rank INTEGER NOT NULL, score REAL NOT NULL, score_breakdown TEXT NOT NULL, is_winner INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (cluster_id, file_id))")
    # 2 identical phash rows
    for fid in (1, 2):
        con.execute("INSERT INTO files (id, path, size, mtime_ns, scanned_at) VALUES (?, ?, 1, 0, datetime('now'))", (fid, f"/p/{fid}.jpg"))
        con.execute("INSERT INTO image_features (file_id, phash, width, height, computed_at) VALUES (?, ?, 100, 100, datetime('now'))", (fid, (0).to_bytes(8, "big")))
    con.close()

    thresholds = {"phash_hamming": 3, "clip_cosine": 0.95, "exif_time_s": 600, "gps_m": 50, "min_confidence": 0.9}
    res = cluster_smart.run(root=None, thresholds=thresholds)
    assert res["clusters_created"] == 1

    con = _db.connect()
    import json
    row = con.execute("SELECT thresholds_json FROM clusters").fetchone()
    con.close()
    assert json.loads(row[0]) == thresholds


def test_run_reclusters_when_thresholds_change(tmp_path, monkeypatch):
    # Prior cluster with loose thresholds, re-run with strict → old cluster cleared
    from curator import db as _db
    from curator import cluster_smart
    monkeypatch.setenv("DB_PATH", str(tmp_path / "rc.db"))
    con = _db.connect()
    _db.ensure_schema(con)
    con.execute("CREATE TABLE IF NOT EXISTS image_features (file_id INTEGER PRIMARY KEY, phash BLOB, clip_embedding BLOB, width INTEGER, height INTEGER, computed_at TEXT)")
    con.execute("CREATE TABLE IF NOT EXISTS clusters (id INTEGER PRIMARY KEY AUTOINCREMENT, method TEXT NOT NULL, confidence REAL NOT NULL, created_at TEXT NOT NULL, applied_session_id TEXT, thresholds_json TEXT)")
    con.execute("CREATE TABLE IF NOT EXISTS cluster_members (cluster_id INTEGER NOT NULL, file_id INTEGER NOT NULL, rank INTEGER NOT NULL, score REAL NOT NULL, score_breakdown TEXT NOT NULL, is_winner INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (cluster_id, file_id))")
    for fid, phb in ((1, 0), (2, 0b11)):  # hamming 2
        con.execute("INSERT INTO files (id, path, size, mtime_ns, scanned_at) VALUES (?, ?, 1, 0, datetime('now'))", (fid, f"/q/{fid}.jpg"))
        con.execute("INSERT INTO image_features (file_id, phash, width, height, computed_at) VALUES (?, ?, 100, 100, datetime('now'))", (fid, phb.to_bytes(8, "big")))
    con.close()

    loose = {"phash_hamming": 8, "clip_cosine": 0.90, "exif_time_s": 1800, "gps_m": 150, "min_confidence": 0.88}
    strict = {"phash_hamming": 1, "clip_cosine": 0.99, "exif_time_s": 60, "gps_m": 10, "min_confidence": 0.99}

    r1 = cluster_smart.run(root=None, thresholds=loose)
    assert r1["clusters_created"] == 1

    r2 = cluster_smart.run(root=None, thresholds=strict)
    assert r2["clusters_created"] == 0  # stricter phash cutoff splits them
