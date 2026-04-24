import json
import sys

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
        skip_ai=bool(params.get("skip_ai", False)),
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


@register("undoSession")
def _undo_session_handler(params: dict) -> dict:
    return undo_session(params["session_id"])
