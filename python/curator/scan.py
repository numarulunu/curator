from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from curator.db import connect
from curator.rpc import emit_event
from curator.walker import WalkedFile, walk


_INSERT_NEW_SQL = (
    "INSERT INTO files (path, size, mtime_ns, scanned_at) "
    "SELECT scan_stage.path, scan_stage.size, scan_stage.mtime_ns, scan_stage.scanned_at "
    "FROM scan_stage "
    "LEFT JOIN files ON files.path = scan_stage.path "
    "WHERE files.path IS NULL"
)
_UPDATE_UNCHANGED_SQL = (
    "UPDATE files "
    "SET scanned_at = ("
    "    SELECT scan_stage.scanned_at FROM scan_stage WHERE scan_stage.path = files.path"
    ") "
    "WHERE (path = ? OR path LIKE ? OR path LIKE ?) "
    "AND EXISTS ("
    "    SELECT 1 FROM scan_stage "
    "    WHERE scan_stage.path = files.path "
    "      AND scan_stage.size = files.size "
    "      AND scan_stage.mtime_ns = files.mtime_ns"
    ")"
)
_UPDATE_CHANGED_SQL = (
    "UPDATE files "
    "SET size = (SELECT scan_stage.size FROM scan_stage WHERE scan_stage.path = files.path), "
    "    mtime_ns = (SELECT scan_stage.mtime_ns FROM scan_stage WHERE scan_stage.path = files.path), "
    "    scanned_at = (SELECT scan_stage.scanned_at FROM scan_stage WHERE scan_stage.path = files.path), "
    "    xxhash = NULL, "
    "    canonical_date = NULL, "
    "    date_source = NULL, "
    "    exif_json = NULL, "
    "    kind = NULL "
    "WHERE (path = ? OR path LIKE ? OR path LIKE ?) "
    "AND EXISTS ("
    "    SELECT 1 FROM scan_stage "
    "    WHERE scan_stage.path = files.path "
    "      AND (scan_stage.size != files.size OR scan_stage.mtime_ns != files.mtime_ns)"
    ")"
)
_DELETE_MISSING_SQL = (
    "DELETE FROM files "
    "WHERE (path = ? OR path LIKE ? OR path LIKE ?) "
    "AND NOT EXISTS (SELECT 1 FROM scan_stage WHERE scan_stage.path = files.path)"
)
_STAGE_INSERT_SQL = (
    "INSERT OR REPLACE INTO scan_stage (path, size, mtime_ns, scanned_at) "
    "VALUES (?, ?, ?, ?)"
)


def _ensure_stage_table(conn) -> None:
    conn.execute("DROP TABLE IF EXISTS scan_stage")
    conn.execute(
        """
        CREATE TEMP TABLE scan_stage (
            path TEXT NOT NULL UNIQUE,
            size INTEGER NOT NULL,
            mtime_ns INTEGER NOT NULL,
            scanned_at TEXT NOT NULL
        )
        """
    )


def _flush_stage_batch(conn, batch: List[WalkedFile]) -> None:
    if not batch:
        return

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    rows = [(wf.path, wf.size, wf.mtime_ns, now) for wf in batch]
    conn.execute("BEGIN")
    try:
        conn.executemany(_STAGE_INSERT_SQL, rows)
        conn.execute("COMMIT")
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            pass
        raise


def _replace_rows_for_root(conn, root: str) -> None:
    normalized = root.rstrip("/\\")
    scope = (normalized, f"{normalized}/%", f"{normalized}\\%")
    conn.execute("BEGIN")
    try:
        conn.execute(_UPDATE_UNCHANGED_SQL, scope)
        conn.execute(_UPDATE_CHANGED_SQL, scope)
        conn.execute(_INSERT_NEW_SQL)
        conn.execute(_DELETE_MISSING_SQL, scope)
        conn.execute("COMMIT")
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            # A failed ROLLBACK (e.g. no active transaction) must not mask
            # the original exception being propagated below.
            pass
        raise


def scan(root: str, batch_size: int = 500) -> dict:
    """Walk root, stage rows in batches, then atomically replace `files` rows."""
    if batch_size <= 0:
        batch_size = 500

    conn = connect()
    total = 0
    batch: List[WalkedFile] = []
    try:
        _ensure_stage_table(conn)
        for wf in walk(root):
            batch.append(wf)
            if len(batch) >= batch_size:
                _flush_stage_batch(conn, batch)
                total += len(batch)
                batch = []
                emit_event("scan.progress", scanned=total, root=root)
        if batch:
            _flush_stage_batch(conn, batch)
            total += len(batch)
        _replace_rows_for_root(conn, root)
    finally:
        conn.close()

    emit_event("scan.progress", scanned=total, root=root)
    return {"scanned": total, "root": root}
