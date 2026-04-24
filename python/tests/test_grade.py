import json

from curator import builtins  # noqa: F401
from curator import db as _db
from curator import grade
from curator.rpc import REGISTRY


def _seed_two_member_cluster(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "g.db"))
    con = _db.connect()
    _db.ensure_schema(con)
    con.execute(
        "CREATE TABLE IF NOT EXISTS image_features (file_id INTEGER PRIMARY KEY, phash BLOB, clip_embedding BLOB, sharpness REAL, brightness_mean REAL, highlight_clip REAL, shadow_clip REAL, face_count INTEGER, face_quality REAL, nima_score REAL, width INTEGER, height INTEGER, computed_at TEXT NOT NULL)"
    )
    con.execute(
        "CREATE TABLE IF NOT EXISTS clusters (id INTEGER PRIMARY KEY AUTOINCREMENT, method TEXT NOT NULL, confidence REAL NOT NULL, created_at TEXT NOT NULL, applied_session_id TEXT)"
    )
    con.execute(
        "CREATE TABLE IF NOT EXISTS cluster_members (cluster_id INTEGER NOT NULL, file_id INTEGER NOT NULL, rank INTEGER NOT NULL, score REAL NOT NULL, score_breakdown TEXT NOT NULL, is_winner INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (cluster_id, file_id))"
    )
    for fid, size, w, h, sharp, nima in [
        (1, 5_000_000, 4032, 3024, 850.0, 6.5),
        (2, 500_000, 1024, 768, 120.0, 5.0),
    ]:
        con.execute(
            "INSERT INTO files (id, path, size, mtime_ns, scanned_at) VALUES (?, ?, ?, 0, datetime('now'))",
            (fid, f"/fake/{fid}.jpg", size),
        )
        con.execute(
            """
            INSERT INTO image_features (file_id, phash, clip_embedding, sharpness, brightness_mean,
              highlight_clip, shadow_clip, face_count, face_quality, nima_score, width, height, computed_at)
            VALUES (?, NULL, NULL, ?, 0.5, 0.01, 0.01, 1, 0.8, ?, ?, ?, datetime('now'))
            """,
            (fid, sharp, nima, w, h),
        )
    con.execute("INSERT INTO clusters (method, confidence, created_at) VALUES ('phash', 1.0, datetime('now'))")
    cluster_id = con.execute("SELECT id FROM clusters").fetchone()[0]
    con.execute(
        "INSERT INTO cluster_members (cluster_id, file_id, rank, score, score_breakdown) VALUES (?, 1, 0, 0, '{}')",
        (cluster_id,),
    )
    con.execute(
        "INSERT INTO cluster_members (cluster_id, file_id, rank, score, score_breakdown) VALUES (?, 2, 1, 0, '{}')",
        (cluster_id,),
    )
    con.close()
    return cluster_id


def test_grade_picks_higher_quality_winner(tmp_path, monkeypatch):
    cluster_id = _seed_two_member_cluster(tmp_path, monkeypatch)
    grade.run(root=None)
    con = _db.connect()
    try:
        rows = con.execute(
            "SELECT file_id, score, is_winner, score_breakdown FROM cluster_members WHERE cluster_id = ?",
            (cluster_id,),
        ).fetchall()
    finally:
        con.close()
    by_fid = {r[0]: r for r in rows}
    assert by_fid[1][2] == 1
    assert by_fid[2][2] == 0
    assert by_fid[1][1] > by_fid[2][1]
    breakdown = json.loads(by_fid[1][3])
    assert "sharpness" in breakdown
    assert "nima_score" in breakdown


def test_grade_clusters_rpc_method_is_registered():
    assert "gradeClusters" in REGISTRY
