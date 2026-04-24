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
        "CREATE TABLE IF NOT EXISTS clusters (id INTEGER PRIMARY KEY AUTOINCREMENT, method TEXT NOT NULL, confidence REAL NOT NULL, created_at TEXT NOT NULL, applied_session_id TEXT)"
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
        "CREATE TABLE IF NOT EXISTS clusters (id INTEGER PRIMARY KEY AUTOINCREMENT, method TEXT NOT NULL, confidence REAL NOT NULL, created_at TEXT NOT NULL, applied_session_id TEXT)"
    )
    con.execute(
        "CREATE TABLE IF NOT EXISTS cluster_members (cluster_id INTEGER NOT NULL, file_id INTEGER NOT NULL, rank INTEGER NOT NULL, score REAL NOT NULL, score_breakdown TEXT NOT NULL, is_winner INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (cluster_id, file_id))"
    )
    con.close()
    res = cluster_smart.run(root=None)
    assert res == {"clusters_created": 0, "files_clustered": 0}


def test_cluster_smart_rpc_method_is_registered():
    assert "clusterSmart" in REGISTRY
