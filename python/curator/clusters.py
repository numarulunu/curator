from __future__ import annotations

from typing import Any, Dict, List

from curator import db as _db


def _root_filter(root: str | None) -> tuple[str, tuple[object, ...]]:
    if not root:
        return "", ()
    normalized = root.rstrip("/\\")
    return " AND (path = ? OR path LIKE ? OR path LIKE ?)", (normalized, f"{normalized}/%", f"{normalized}\\%")


def duplicates_exact(root: str | None = None) -> List[Dict[str, Any]]:
    """Return clusters of files sharing the same xxhash.

    Each cluster: {"xxhash": str, "size": int, "count": int,
                   "files": [{"id": int, "path": str, "size": int, "mtime_ns": int}, ...]}

    Only xxhash values with count >= 2 are returned. Clusters sorted by
    (size DESC, xxhash ASC) so the biggest wins show first. Files within a
    cluster sorted by path ASC (deterministic for UI).
    """
    con = _db.connect()
    try:
        root_sql, root_params = _root_filter(root)
        cur = con.execute(
            f"""
            SELECT xxhash, COUNT(*) AS n, MIN(size) AS size
              FROM files
             WHERE xxhash IS NOT NULL
               {root_sql}
             GROUP BY xxhash
            HAVING n >= 2
             ORDER BY size DESC, xxhash ASC
            """,
            root_params,
        )
        groups = cur.fetchall()

        clusters: List[Dict[str, Any]] = []
        for xxhash, count, size in groups:
            rows = con.execute(
                f"SELECT id, path, size, mtime_ns FROM files WHERE xxhash = ?{root_sql} ORDER BY path ASC",
                (xxhash, *root_params),
            ).fetchall()
            clusters.append({
                "xxhash": xxhash,
                "size": size,
                "count": count,
                "files": [
                    {"id": r[0], "path": r[1], "size": r[2], "mtime_ns": r[3]}
                    for r in rows
                ],
            })
        return clusters
    finally:
        con.close()
