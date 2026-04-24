from __future__ import annotations

from typing import Optional

from curator import db as _db
from curator import pipeline as _pipeline
from curator.features import phash as _phash
from curator.features import quality as _quality


def _face_metrics(path: str):
    from curator.features import faces as _faces
    return _faces.compute(path)


def _clip_vec(path: str):
    from curator.features import clip as _clip
    return _clip.embed(path)


def _nima_val(path: str):
    from curator.features import nima as _nima
    return _nima.score(path)


# injection points for tests
_faces_compute = _face_metrics
_clip_embed = _clip_vec
_nima_score = _nima_val


def _record_failed_feature(file_id: int) -> None:
    con = _db.connect()
    try:
        con.execute(
            """
            INSERT OR REPLACE INTO image_features
            (file_id, phash, clip_embedding, sharpness, brightness_mean,
             highlight_clip, shadow_clip, face_count, face_quality, nima_score,
             width, height, computed_at)
            VALUES (?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, datetime('now'))
            """,
            (file_id,),
        )
    finally:
        con.close()


def extract_one(file_id: int, path: str, ai_mode: str = "full") -> None:
    if ai_mode == "off":
        raise ValueError("extract_one should not be called with ai_mode=off")

    ph = _phash.compute(path)
    q = _quality.compute(path)
    face_count = 0
    face_quality = 0.0
    clip_blob: Optional[bytes] = None
    nima_val = 0.0

    if ai_mode in ("lite", "full"):
        try:
            import curator.features as _ff
            v = _ff._clip_embed(path)
            if v is not None:
                clip_blob = v.tobytes()
        except Exception:
            pass

    if ai_mode == "full":
        try:
            import curator.features as _ff
            f = _ff._faces_compute(path)
            if f is not None:
                face_count, face_quality = f.count, f.quality
        except Exception:
            pass
        try:
            import curator.features as _ff
            val = _ff._nima_score(path)
            if val is not None:
                nima_val = float(val)
        except Exception:
            pass

    con = _db.connect()
    try:
        con.execute(
            """
            INSERT OR REPLACE INTO image_features
            (file_id, phash, clip_embedding, sharpness, brightness_mean,
             highlight_clip, shadow_clip, face_count, face_quality, nima_score,
             width, height, computed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            """,
            (
                file_id,
                ph,
                clip_blob,
                q.sharpness,
                q.brightness_mean,
                q.highlight_clip,
                q.shadow_clip,
                face_count,
                face_quality,
                nima_val,
                q.width,
                q.height,
            ),
        )
    finally:
        con.close()


def extract_batch(root: Optional[str], batch_size: int = 200, ai_mode: str = "full") -> dict:
    if ai_mode == "off":
        con = _db.connect()
        try:
            if root:
                normalized = root.rstrip("/\\")
                total = con.execute(
                    "SELECT COUNT(*) FROM files WHERE (path = ? OR path LIKE ? OR path LIKE ?)",
                    (normalized, f"{normalized}/%", f"{normalized}\\%"),
                ).fetchone()[0]
            else:
                total = con.execute("SELECT COUNT(*) FROM files").fetchone()[0]
        finally:
            con.close()
        return {"processed": 0, "skipped": 0, "skipped_mode_off": total, "errors": []}

    if _pipeline.should_cancel():
        return {"processed": 0, "skipped": 0, "errors": [], "cancelled": True}

    con = _db.connect()
    try:
        if root:
            normalized = root.rstrip("/\\")
            rows = con.execute(
                """
                SELECT f.id, f.path FROM files f
                LEFT JOIN image_features ift ON ift.file_id = f.id
                WHERE ift.file_id IS NULL
                  AND (f.path = ? OR f.path LIKE ? OR f.path LIKE ?)
                ORDER BY f.id
                LIMIT ?
                """,
                (normalized, f"{normalized}/%", f"{normalized}\\%", batch_size),
            ).fetchall()
        else:
            rows = con.execute(
                """
                SELECT f.id, f.path FROM files f
                LEFT JOIN image_features ift ON ift.file_id = f.id
                WHERE ift.file_id IS NULL
                ORDER BY f.id
                LIMIT ?
                """,
                (batch_size,),
            ).fetchall()
    finally:
        con.close()

    processed = 0
    errors = []
    for fid, path in rows:
        if _pipeline.should_cancel():
            return {"processed": processed, "skipped": 0, "errors": errors, "cancelled": True}
        try:
            extract_one(fid, path, ai_mode=ai_mode)
            processed += 1
        except Exception as exc:
            message = str(exc)
            try:
                _record_failed_feature(fid)
            except Exception as mark_exc:
                message = f"{message}; failed to record skip: {mark_exc}"
            errors.append({"file_id": fid, "error": message})

    skipped_count = 0
    if not rows:
        con = _db.connect()
        try:
            skipped_count = con.execute("SELECT COUNT(*) FROM image_features").fetchone()[0]
        finally:
            con.close()

    return {"processed": processed, "skipped": skipped_count, "errors": errors}
