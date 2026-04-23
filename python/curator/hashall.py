from __future__ import annotations

from typing import List, Tuple

from curator.db import connect
from curator.hasher import hash_file
from curator.rpc import emit_event


_UPDATE_SQL = "UPDATE files SET xxhash = ? WHERE id = ?"


def _root_filter(root: str | None) -> tuple[str, tuple[object, ...]]:
    if not root:
        return "", ()
    normalized = root.rstrip("/\\")
    return " AND (path = ? OR path LIKE ? OR path LIKE ?)", (normalized, f"{normalized}/%", f"{normalized}\\%")


def _flush(conn, batch: List[Tuple[str, int]]) -> None:
    if not batch:
        return
    conn.execute("BEGIN")
    try:
        conn.executemany(_UPDATE_SQL, batch)
        conn.execute("COMMIT")
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            # A failed ROLLBACK must not mask the original exception.
            pass
        raise


def hash_all(batch_size: int = 200, root: str | None = None) -> dict:
    """Compute xxhash for all files where xxhash IS NULL.

    Commits updates in batches of ``batch_size`` and emits ``hash.progress``
    events after each batch. Files that cannot be read (e.g. missing) are
    counted as skipped and left with a NULL xxhash.

    Returns {"hashed": int, "skipped": int}.
    """
    if batch_size <= 0:
        batch_size = 200

    conn = connect()
    hashed = 0
    skipped = 0
    try:
        root_sql, root_params = _root_filter(root)
        rows = conn.execute(
            f"SELECT id, path FROM files WHERE xxhash IS NULL{root_sql} ORDER BY id",
            root_params,
        ).fetchall()
        total = len(rows)

        batch: List[Tuple[str, int]] = []
        for row_id, path in rows:
            try:
                digest = hash_file(path)
            except OSError:
                skipped += 1
                continue
            batch.append((digest, row_id))
            if len(batch) >= batch_size:
                _flush(conn, batch)
                hashed += len(batch)
                batch.clear()
                emit_event(
                    "hash.progress",
                    hashed=hashed,
                    skipped=skipped,
                    total=total,
                )

        if batch:
            _flush(conn, batch)
            hashed += len(batch)
            batch.clear()

        if total > 0:
            emit_event(
                "hash.progress",
                hashed=hashed,
                skipped=skipped,
                total=total,
            )
    finally:
        conn.close()

    return {"hashed": hashed, "skipped": skipped}
