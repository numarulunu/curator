from __future__ import annotations

from typing import Optional

from curator import db as _db
from curator.features import phash as _phash
from curator.features import quality as _quality


def extract_one(file_id: int, path: str, skip_ai: bool = False) -> None:
    ph = _phash.compute(path)
    q = _quality.compute(path)
    face_count = 0
    face_quality = 0.0
    clip_blob: Optional[bytes] = None
    nima_val = 0.0

    if not skip_ai:
        try:
            from curator.features import faces as _faces

            f = _faces.compute(path)
            face_count, face_quality = f.count, f.quality
        except Exception:
            pass
        try:
            from curator.features import clip as _clip

            v = _clip.embed(path)
            clip_blob = v.tobytes()
        except Exception:
            pass
        try:
            from curator.features import nima as _nima

            nima_val = _nima.score(path)
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


def extract_batch(root: Optional[str], batch_size: int = 200, skip_ai: bool = False) -> dict:
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
                LIMIT ?
                """,
                (normalized, f"{normalized}/%", f"{normalized}\\%", batch_size),
            ).fetchall()
        else:
            rows = con.execute(
                """
                SELECT f.id, f.path FROM files f
                LEFT JOIN image_features ift ON ift.file_id = f.id
                WHERE ift.file_id IS NULL LIMIT ?
                """,
                (batch_size,),
            ).fetchall()
    finally:
        con.close()

    processed = 0
    errors = []
    for fid, path in rows:
        try:
            extract_one(fid, path, skip_ai=skip_ai)
            processed += 1
        except Exception as exc:
            errors.append({"file_id": fid, "error": str(exc)})

    skipped_count = 0
    if not rows:
        con = _db.connect()
        try:
            skipped_count = con.execute("SELECT COUNT(*) FROM image_features").fetchone()[0]
        finally:
            con.close()

    return {"processed": processed, "skipped": skipped_count, "errors": errors}
