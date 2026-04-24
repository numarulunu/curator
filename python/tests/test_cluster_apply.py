from curator import db as _db
from curator.builtins import _apply_cluster_handler, _list_clusters_handler, _set_winner_handler
from curator.rpc import REGISTRY


def _seed(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "ca.db"))
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    con = _db.connect()
    _db.ensure_schema(con)
    con.execute("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, completed_at TEXT, kind TEXT NOT NULL)")
    con.execute(
        "CREATE TABLE IF NOT EXISTS actions (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, action TEXT NOT NULL, src_path TEXT NOT NULL, dst_path TEXT, reason TEXT, status TEXT NOT NULL, error TEXT, executed_at TEXT)"
    )
    con.execute(
        "CREATE TABLE IF NOT EXISTS image_features (file_id INTEGER PRIMARY KEY, width INTEGER, height INTEGER, computed_at TEXT NOT NULL)"
    )
    con.execute(
        "CREATE TABLE IF NOT EXISTS clusters (id INTEGER PRIMARY KEY AUTOINCREMENT, method TEXT NOT NULL, confidence REAL NOT NULL, created_at TEXT NOT NULL, applied_session_id TEXT)"
    )
    con.execute(
        "CREATE TABLE IF NOT EXISTS cluster_members (cluster_id INTEGER NOT NULL, file_id INTEGER NOT NULL, rank INTEGER NOT NULL, score REAL NOT NULL, score_breakdown TEXT NOT NULL, is_winner INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (cluster_id, file_id))"
    )

    win = tmp_path / "winner.jpg"
    win.write_bytes(b"win")
    lose = tmp_path / "lose.jpg"
    lose.write_bytes(b"lose")
    con.execute("INSERT INTO files (id, path, size, mtime_ns, scanned_at) VALUES (1, ?, 3, 0, datetime('now'))", (str(win),))
    con.execute("INSERT INTO files (id, path, size, mtime_ns, scanned_at) VALUES (2, ?, 4, 0, datetime('now'))", (str(lose),))
    con.execute("INSERT INTO image_features (file_id, width, height, computed_at) VALUES (1, 100, 80, datetime('now'))")
    con.execute("INSERT INTO image_features (file_id, width, height, computed_at) VALUES (2, 50, 40, datetime('now'))")
    con.execute("INSERT INTO clusters (method, confidence, created_at) VALUES ('phash', 1.0, datetime('now'))")
    cid = con.execute("SELECT id FROM clusters").fetchone()[0]
    con.execute(
        "INSERT INTO cluster_members (cluster_id, file_id, rank, score, score_breakdown, is_winner) VALUES (?, 1, 0, 0.9, '{}', 1)",
        (cid,),
    )
    con.execute(
        "INSERT INTO cluster_members (cluster_id, file_id, rank, score, score_breakdown, is_winner) VALUES (?, 2, 1, 0.4, '{}', 0)",
        (cid,),
    )
    con.close()
    return cid, win, lose


def test_list_clusters_returns_winners_and_losers(tmp_path, monkeypatch):
    cid, _, _ = _seed(tmp_path, monkeypatch)
    result = _list_clusters_handler({"root": None})
    assert len(result["clusters"]) == 1
    c = result["clusters"][0]
    assert c["id"] == cid
    assert c["winner"]["file_id"] == 1
    assert len(c["losers"]) == 1
    assert c["losers"][0]["file_id"] == 2


def test_set_cluster_winner_promotes_member(tmp_path, monkeypatch):
    cid, _, _ = _seed(tmp_path, monkeypatch)
    assert _set_winner_handler({"cluster_id": cid, "file_id": 2}) == {"ok": True}
    result = _list_clusters_handler({"root": None})
    assert result["clusters"][0]["winner"]["file_id"] == 2


def test_apply_cluster_moves_losers_to_undoable_quarantine(tmp_path, monkeypatch):
    cid, win, lose = _seed(tmp_path, monkeypatch)
    result = _apply_cluster_handler({"cluster_id": cid, "archive_root": str(tmp_path)})

    assert result["ok"] == 1
    assert result["failed"] == 0
    assert win.exists()
    assert not lose.exists()
    q_root = tmp_path / "_curator_quarantine" / result["session_id"]
    assert any(q_root.rglob("*.jpg"))

    con = _db.connect()
    row = con.execute("SELECT applied_session_id FROM clusters WHERE id = ?", (cid,)).fetchone()
    con.close()
    assert row[0] == result["session_id"]


def test_cluster_rpc_methods_are_registered():
    assert "listClusters" in REGISTRY
    assert "setClusterWinner" in REGISTRY
    assert "applyCluster" in REGISTRY
