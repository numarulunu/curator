from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from curator.db import connect
from curator.rpc import emit_event
from curator.walker import WalkedFile, walk


_INSERT_SQL = (
    "INSERT OR REPLACE INTO files (path, size, mtime_ns, scanned_at) "
    "SELECT path, size, mtime_ns, scanned_at FROM scan_stage"
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
    conn.execute("BEGIN")
    try:
        conn.execute(
            "DELETE FROM files WHERE path = ? OR path LIKE ? OR path LIKE ?",
            (normalized, f"{normalized}/%", f"{normalized}\\%"),
        )
        conn.execute(_INSERT_SQL)
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
