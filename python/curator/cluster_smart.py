from __future__ import annotations

import json
import math
from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np

from curator import db as _db
from curator.features.phash import hamming as _hamming


def _load_items(con, root: Optional[str]) -> List[Dict[str, Any]]:
    if root:
        normalized = root.rstrip("/\\")
        rows = con.execute(
            """
            SELECT f.id, ift.phash, ift.clip_embedding, f.canonical_date, f.exif_json
              FROM files f JOIN image_features ift ON ift.file_id = f.id
             WHERE (f.path = ? OR f.path LIKE ? OR f.path LIKE ?)
            """,
            (normalized, f"{normalized}/%", f"{normalized}\\%"),
        ).fetchall()
    else:
        rows = con.execute(
            """
            SELECT f.id, ift.phash, ift.clip_embedding, f.canonical_date, f.exif_json
              FROM files f JOIN image_features ift ON ift.file_id = f.id
            """
        ).fetchall()

    items: List[Dict[str, Any]] = []
    for fid, ph, emb, cdate, exif_json in rows:
        ts = None
        gps = None
        if cdate:
            try:
                ts = int(datetime.fromisoformat(cdate).timestamp())
            except Exception:
                ts = None
        if exif_json:
            try:
                meta = json.loads(exif_json)
                lat = meta.get("GPSLatitude")
                lon = meta.get("GPSLongitude")
                if lat is not None and lon is not None:
                    gps = (float(lat), float(lon))
            except Exception:
                gps = None
        clip = None
        if emb is not None:
            try:
                clip = np.frombuffer(emb, dtype=np.float32)
            except ValueError:
                clip = None
            if clip is not None and clip.size == 0:
                clip = None
        items.append({"file_id": fid, "phash": ph, "clip": clip, "ts": ts, "gps": gps})
    return items


def stage_phash(items: List[Dict[str, Any]], hamming_threshold: int = 8) -> List[Dict[str, Any]]:
    n = len(items)
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i in range(n):
        for j in range(i + 1, n):
            if items[i]["phash"] and items[j]["phash"]:
                if _hamming(items[i]["phash"], items[j]["phash"]) <= hamming_threshold:
                    union(i, j)

    buckets: Dict[int, List[int]] = {}
    for i in range(n):
        buckets.setdefault(find(i), []).append(i)

    clusters = []
    for members in buckets.values():
        if len(members) < 2:
            continue
        clusters.append(
            {
                "method": "phash",
                "confidence": 1.0,
                "file_ids": [items[i]["file_id"] for i in members],
            }
        )
    return clusters


def _haversine_m(a, b) -> float:
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def stage_clip(
    items: List[Dict[str, Any]],
    cosine_threshold: float = 0.90,
    time_window_s: int = 1800,
    gps_window_m: float = 150.0,
) -> List[Dict[str, Any]]:
    vecs = [it for it in items if it["clip"] is not None]
    n = len(vecs)
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i in range(n):
        for j in range(i + 1, n):
            left = vecs[i]["clip"]
            right = vecs[j]["clip"]
            if left.shape != right.shape:
                continue
            cos = float(np.dot(left, right))
            threshold = cosine_threshold
            if vecs[i]["ts"] is not None and vecs[j]["ts"] is not None:
                if abs(vecs[i]["ts"] - vecs[j]["ts"]) <= time_window_s:
                    threshold -= 0.03
            if vecs[i]["gps"] and vecs[j]["gps"]:
                if _haversine_m(vecs[i]["gps"], vecs[j]["gps"]) <= gps_window_m:
                    threshold -= 0.02
            if cos >= threshold:
                union(i, j)

    buckets: Dict[int, List[int]] = {}
    for i in range(n):
        buckets.setdefault(find(i), []).append(i)

    clusters = []
    for members in buckets.values():
        if len(members) < 2:
            continue
        confs = []
        for a in range(len(members)):
            for b in range(a + 1, len(members)):
                confs.append(float(np.dot(vecs[members[a]]["clip"], vecs[members[b]]["clip"])))
        clusters.append(
            {
                "method": "clip",
                "confidence": float(np.mean(confs)) if confs else 0.0,
                "file_ids": [vecs[i]["file_id"] for i in members],
            }
        )
    return clusters


def run(root: Optional[str], thresholds: Optional[Dict[str, Any]] = None) -> Dict[str, int]:
    t = thresholds or {
        "phash_hamming": 8, "clip_cosine": 0.90,
        "exif_time_s": 1800, "gps_m": 150, "min_confidence": 0.88,
    }
    con = _db.connect()
    try:
        items = _load_items(con, root)
        phash_clusters = stage_phash(items, hamming_threshold=int(t["phash_hamming"]))
        clustered_ids = {fid for c in phash_clusters for fid in c["file_ids"]}
        remainder = [it for it in items if it["file_id"] not in clustered_ids]
        clip_clusters = stage_clip(
            remainder,
            cosine_threshold=float(t["clip_cosine"]),
            time_window_s=int(t["exif_time_s"]),
            gps_window_m=float(t["gps_m"]),
        )
        all_clusters = [c for c in (phash_clusters + clip_clusters) if c["confidence"] >= float(t["min_confidence"])]

        if root:
            normalized = root.rstrip("/\\")
            con.execute(
                """
                DELETE FROM cluster_members WHERE cluster_id IN (
                  SELECT DISTINCT cm.cluster_id FROM cluster_members cm
                  JOIN files f ON f.id = cm.file_id
                  WHERE (f.path = ? OR f.path LIKE ? OR f.path LIKE ?)
                )
                """,
                (normalized, f"{normalized}/%", f"{normalized}\\%"),
            )
            con.execute("DELETE FROM clusters WHERE id NOT IN (SELECT DISTINCT cluster_id FROM cluster_members)")
        else:
            con.execute("DELETE FROM cluster_members")
            con.execute("DELETE FROM clusters")

        thresholds_json = json.dumps(t, sort_keys=True)
        files_clustered = 0
        for c in all_clusters:
            cur = con.execute(
                "INSERT INTO clusters (method, confidence, created_at, thresholds_json) VALUES (?, ?, datetime('now'), ?)",
                (c["method"], c["confidence"], thresholds_json),
            )
            cluster_id = cur.lastrowid
            for rank, fid in enumerate(c["file_ids"]):
                con.execute(
                    """
                    INSERT INTO cluster_members (cluster_id, file_id, rank, score, score_breakdown, is_winner)
                    VALUES (?, ?, ?, 0, '{}', 0)
                    """,
                    (cluster_id, fid, rank),
                )
                files_clustered += 1
        return {"clusters_created": len(all_clusters), "files_clustered": files_clustered}
    finally:
        con.close()
