import json
import sys
import uuid

from curator import __version__
from curator.apply import apply_actions
from curator.db import connect
from curator.dater import resolve_canonical
from curator.exif import extract_many
from curator.rpc import register
from curator.undo import undo_session


@register("ping")
def ping(_params):
    return {"pong": True}


@register("version")
def version(_params):
    return {"sidecar": __version__, "python": sys.version.split()[0]}


from curator.paths import resolve_bin


@register("binaries")
def binaries(_params):
    return {
        "exiftool": resolve_bin("exiftool.exe"),
        "ffprobe": resolve_bin("ffprobe.exe"),
        "ffmpeg": resolve_bin("ffmpeg.exe"),
    }


from curator import scan as _scan


@register("scan")
def _scan_handler(params: dict) -> dict:
    return _scan.scan(params["root"], params.get("batch_size", 500))


from curator import hashall as _hashall


@register("hashAll")
def _hashall_handler(params: dict) -> dict:
    return _hashall.hash_all(params.get("batch_size", 200), params.get("root"))


from curator import clusters as _clusters


@register("duplicatesExact")
def _duplicates_exact_handler(_params: dict) -> list:
    return _clusters.duplicates_exact(_params.get("root"))


from curator import features as _features
from curator.features import models as _models


@register("downloadModels")
def _download_models_handler(_params: dict) -> dict:
    return _models.ensure_all()


@register("extractFeatures")
def _extract_features_handler(params: dict) -> dict:
    return _features.extract_batch(
        root=params.get("root"),
        batch_size=int(params.get("batch_size", 200)),
        ai_mode=str(params.get("ai_mode", "full")),
    )


from curator import cluster_smart as _cluster_smart


@register("clusterSmart")
def _cluster_smart_handler(params: dict) -> dict:
    return _cluster_smart.run(root=params.get("root"))


from curator import grade as _grade


@register("gradeClusters")
def _grade_clusters_handler(params: dict) -> dict:
    return _grade.run(root=params.get("root"))


@register("resolveDates")
def _resolve_dates_handler(_params: dict) -> dict:
    con = connect()
    try:
        root = _params.get("root")
        if root:
            normalized = root.rstrip("/\\")
            rows = con.execute(
                "SELECT id, path, mtime_ns FROM files WHERE canonical_date IS NULL AND (path = ? OR path LIKE ? OR path LIKE ?)",
                (normalized, f"{normalized}/%", f"{normalized}\\%"),
            ).fetchall()
        else:
            rows = con.execute(
                "SELECT id, path, mtime_ns FROM files WHERE canonical_date IS NULL"
            ).fetchall()
        if not rows:
            return {"resolved": 0}
        paths = [r[1] for r in rows]
        meta_by_path: dict[str, dict] = {}
        try:
            meta_by_path = extract_many(paths)
        except Exception:
            meta_by_path = {}
        n = 0
        con.execute("BEGIN IMMEDIATE")
        try:
            for fid, path, mtime_ns in rows:
                meta = meta_by_path.get(path) or meta_by_path.get(path.replace("\\", "/")) or {}
                resolved = resolve_canonical(path, mtime_ns, meta)
                con.execute(
                    "UPDATE files SET canonical_date = ?, date_source = ?, exif_json = ? WHERE id = ?",
                    (resolved.date, resolved.source, json.dumps(meta) if meta else None, fid),
                )
                n += 1
            con.execute("COMMIT")
        except Exception:
            try:
                con.execute("ROLLBACK")
            except Exception:
                pass
            raise
        return {"resolved": n}
    finally:
        con.close()


@register("applyActions")
def _apply_actions_handler(params: dict) -> dict:
    return apply_actions(params["actions"], params["archive_root"], params["session_id"], params.get("output_root"))


@register("listClusters")
def _list_clusters_handler(params: dict) -> dict:
    root = params.get("root")
    con = connect()
    try:
        if root:
            normalized = root.rstrip("/\\")
            cluster_rows = con.execute(
                """
                SELECT DISTINCT c.id, c.method, c.confidence, c.applied_session_id
                  FROM clusters c
                  JOIN cluster_members cm ON cm.cluster_id = c.id
                  JOIN files f ON f.id = cm.file_id
                 WHERE (f.path = ? OR f.path LIKE ? OR f.path LIKE ?)
                 ORDER BY c.id ASC
                """,
                (normalized, f"{normalized}/%", f"{normalized}\\%"),
            ).fetchall()
        else:
            cluster_rows = con.execute(
                "SELECT id, method, confidence, applied_session_id FROM clusters ORDER BY id ASC"
            ).fetchall()

        clusters = []
        for cid, method, conf, applied in cluster_rows:
            members = con.execute(
                """
                SELECT cm.file_id, f.path, f.size, cm.score, cm.score_breakdown, cm.is_winner, ift.width, ift.height
                  FROM cluster_members cm
                  JOIN files f ON f.id = cm.file_id
                  LEFT JOIN image_features ift ON ift.file_id = cm.file_id
                 WHERE cm.cluster_id = ?
                 ORDER BY cm.is_winner DESC, cm.score DESC
                """,
                (cid,),
            ).fetchall()
            winner = None
            losers = []
            for fid, path, size, score, breakdown, is_winner, width, height in members:
                rec = {
                    "file_id": fid,
                    "path": path,
                    "size": size,
                    "score": score,
                    "breakdown": json.loads(breakdown or "{}"),
                    "width": width,
                    "height": height,
                }
                if is_winner:
                    winner = rec
                else:
                    losers.append(rec)
            clusters.append(
                {
                    "id": cid,
                    "method": method,
                    "confidence": conf,
                    "applied_session_id": applied,
                    "winner": winner,
                    "losers": losers,
                }
            )
        return {"clusters": clusters}
    finally:
        con.close()


@register("setClusterWinner")
def _set_winner_handler(params: dict) -> dict:
    cid = int(params["cluster_id"])
    fid = int(params["file_id"])
    con = connect()
    try:
        con.execute("BEGIN")
        try:
            con.execute("UPDATE cluster_members SET is_winner = 0 WHERE cluster_id = ?", (cid,))
            con.execute("UPDATE cluster_members SET is_winner = 1 WHERE cluster_id = ? AND file_id = ?", (cid, fid))
            con.execute("COMMIT")
        except Exception:
            con.execute("ROLLBACK")
            raise
        return {"ok": True}
    finally:
        con.close()


@register("applyCluster")
def _apply_cluster_handler(params: dict) -> dict:
    cid = int(params["cluster_id"])
    archive_root = params["archive_root"]
    session_id = uuid.uuid4().hex

    con = connect()
    try:
        rows = con.execute(
            "SELECT f.path FROM cluster_members cm JOIN files f ON f.id = cm.file_id WHERE cm.cluster_id = ? AND cm.is_winner = 0",
            (cid,),
        ).fetchall()
    finally:
        con.close()

    if not rows:
        return {"ok": 0, "failed": 0, "errors": [], "session_id": session_id, "skipped": True}

    actions = [
        {
            "action": "quarantine",
            "src_path": path,
            "dst_path": None,
            "reason": f"cluster:{cid}:loser",
        }
        for (path,) in rows
    ]

    con = connect()
    try:
        con.execute("BEGIN")
        try:
            con.execute(
                "INSERT INTO sessions (id, started_at, kind) VALUES (?, datetime('now'), 'apply')",
                (session_id,),
            )
            for action in actions:
                con.execute(
                    "INSERT INTO actions (session_id, action, src_path, dst_path, reason, status) VALUES (?, ?, ?, ?, ?, 'pending')",
                    (session_id, action["action"], action["src_path"], action["dst_path"], action["reason"]),
                )
            con.execute("COMMIT")
        except Exception:
            con.execute("ROLLBACK")
            raise
    finally:
        con.close()

    result = apply_actions(actions, archive_root, session_id, None)

    con = connect()
    try:
        failed_by_src = {e["src"]: e["error"] for e in (result.get("errors") or [])}
        con.execute("BEGIN")
        try:
            for action in actions:
                err = failed_by_src.get(action["src_path"])
                con.execute(
                    "UPDATE actions SET status = ?, error = ?, executed_at = datetime('now') WHERE session_id = ? AND src_path = ?",
                    ("failed" if err else "applied", err, session_id, action["src_path"]),
                )
            con.execute("UPDATE sessions SET completed_at = datetime('now') WHERE id = ?", (session_id,))
            if int(result.get("failed", 0)) == 0:
                con.execute("UPDATE clusters SET applied_session_id = ? WHERE id = ?", (session_id, cid))
            con.execute("COMMIT")
        except Exception:
            con.execute("ROLLBACK")
            raise
    finally:
        con.close()

    return {**result, "session_id": session_id}


@register("undoSession")
def _undo_session_handler(params: dict) -> dict:
    return undo_session(params["session_id"])
