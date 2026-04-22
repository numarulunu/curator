import sys
from curator import __version__
from curator.rpc import register


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
        "ffprobe":  resolve_bin("ffprobe.exe"),
        "ffmpeg":   resolve_bin("ffmpeg.exe"),
    }


from curator import scan as _scan


@register("scan")
def _scan_handler(params: dict) -> dict:
    return _scan.scan(params["root"], params.get("batch_size", 500))


from curator import hashall as _hashall


@register("hashAll")
def _hashall_handler(params: dict) -> dict:
    return _hashall.hash_all(params.get("batch_size", 200))


from curator import clusters as _clusters


@register("duplicatesExact")
def _duplicates_exact_handler(_params: dict) -> list:
    return _clusters.duplicates_exact()


import json
from curator.dater import resolve_canonical
from curator.exif import extract_many
from curator.db import connect


@register("resolveDates")
def _resolve_dates_handler(_params: dict) -> dict:
    con = connect()
    try:
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
                # ExifTool returns SourceFile with forward slashes on Windows;
                # try both forms when looking up metadata for this path.
                meta = meta_by_path.get(path) or meta_by_path.get(path.replace("\\", "/")) or {}
                r = resolve_canonical(path, mtime_ns, meta)
                con.execute(
                    "UPDATE files SET canonical_date = ?, date_source = ?, exif_json = ? WHERE id = ?",
                    (r.date, r.source, json.dumps(meta) if meta else None, fid),
                )
                n += 1
            con.execute("COMMIT")
        except Exception:
            try: con.execute("ROLLBACK")
            except Exception: pass
            raise
        return {"resolved": n}
    finally:
        con.close()
