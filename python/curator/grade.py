from __future__ import annotations

import json
import math
from typing import Dict, List, Optional, Tuple

from curator import db as _db


WEIGHTS = {
    "sharpness": 0.25,
    "resolution": 0.20,
    "face_quality": 0.20,
    "nima": 0.15,
    "exposure": 0.10,
    "bytes_per_pixel": 0.10,
}


def _norm(values: List[float]) -> List[float]:
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi - lo < 1e-9:
        return [0.5 for _ in values]
    return [(v - lo) / (hi - lo) for v in values]


def _score_cluster(members: List[Dict]) -> List[Tuple[float, Dict[str, float]]]:
    sharp = _norm([math.log1p(max(m["sharpness"] or 0.0, 0.0)) for m in members])
    res = _norm([float((m["width"] or 0) * (m["height"] or 0)) for m in members])
    face = _norm([(m["face_count"] or 0) * (m["face_quality"] or 0.0) for m in members])
    nima = _norm([m["nima_score"] or 0.0 for m in members])
    exposure = _norm([1.0 - ((m["highlight_clip"] or 0.0) + (m["shadow_clip"] or 0.0)) for m in members])
    bpp = _norm([(m["size"] or 0) / max(1, (m["width"] or 1) * (m["height"] or 1)) for m in members])

    out: List[Tuple[float, Dict[str, float]]] = []
    for i in range(len(members)):
        breakdown = {
            "sharpness": sharp[i],
            "resolution": res[i],
            "face_quality": face[i],
            "nima_score": nima[i],
            "exposure": exposure[i],
            "bytes_per_pixel": bpp[i],
        }
        total = (
            WEIGHTS["sharpness"] * breakdown["sharpness"]
            + WEIGHTS["resolution"] * breakdown["resolution"]
            + WEIGHTS["face_quality"] * breakdown["face_quality"]
            + WEIGHTS["nima"] * breakdown["nima_score"]
            + WEIGHTS["exposure"] * breakdown["exposure"]
            + WEIGHTS["bytes_per_pixel"] * breakdown["bytes_per_pixel"]
        )
        out.append((total, breakdown))
    return out


def run(root: Optional[str]) -> Dict[str, int]:
    con = _db.connect()
    try:
        if root:
            normalized = root.rstrip("/\\")
            cluster_ids = [
                r[0]
                for r in con.execute(
                    """
                    SELECT DISTINCT cm.cluster_id FROM cluster_members cm
                    JOIN files f ON f.id = cm.file_id
                    WHERE (f.path = ? OR f.path LIKE ? OR f.path LIKE ?)
                    """,
                    (normalized, f"{normalized}/%", f"{normalized}\\%"),
                ).fetchall()
            ]
        else:
            cluster_ids = [r[0] for r in con.execute("SELECT id FROM clusters").fetchall()]

        graded = 0
        for cid in cluster_ids:
            rows = con.execute(
                """
                SELECT cm.file_id, f.size, ift.sharpness, ift.highlight_clip, ift.shadow_clip,
                       ift.face_count, ift.face_quality, ift.nima_score, ift.width, ift.height
                  FROM cluster_members cm
                  JOIN files f ON f.id = cm.file_id
                  JOIN image_features ift ON ift.file_id = cm.file_id
                 WHERE cm.cluster_id = ?
                """,
                (cid,),
            ).fetchall()
            if not rows:
                continue
            members = [
                {
                    "file_id": r[0],
                    "size": r[1],
                    "sharpness": r[2],
                    "highlight_clip": r[3],
                    "shadow_clip": r[4],
                    "face_count": r[5],
                    "face_quality": r[6],
                    "nima_score": r[7],
                    "width": r[8],
                    "height": r[9],
                }
                for r in rows
            ]
            scored = _score_cluster(members)
            winner_idx = max(range(len(scored)), key=lambda i: scored[i][0])
            for i, (total, breakdown) in enumerate(scored):
                con.execute(
                    "UPDATE cluster_members SET score = ?, score_breakdown = ?, is_winner = ? WHERE cluster_id = ? AND file_id = ?",
                    (total, json.dumps(breakdown), 1 if i == winner_idx else 0, cid, members[i]["file_id"]),
                )
            graded += 1
        return {"clusters_graded": graded}
    finally:
        con.close()
