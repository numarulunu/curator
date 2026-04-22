from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from curator.db import connect
from curator.rpc import emit_event
from curator.walker import WalkedFile, walk


_INSERT_SQL = (
    "INSERT OR REPLACE INTO files (path, size, mtime_ns, scanned_at) "
    "VALUES (?, ?, ?, ?)"
)


def _flush(conn, batch: List[WalkedFile]) -> None:
    if not batch:
        return
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    rows = [(wf.path, wf.size, wf.mtime_ns, now) for wf in batch]
    conn.execute("BEGIN")
    try:
        conn.executemany(_INSERT_SQL, rows)
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
    """Walk root, insert/replace rows in `files` table in batched transactions.

    Returns {"scanned": int, "root": str} — total count of files inserted/updated.
    """
    if batch_size <= 0:
        batch_size = 500

    conn = connect()
    total = 0
    batch: List[WalkedFile] = []
    try:
        for wf in walk(root):
            batch.append(wf)
            if len(batch) >= batch_size:
                _flush(conn, batch)
                total += len(batch)
                batch = []
                emit_event("scan.progress", scanned=total, root=root)
        if batch:
            _flush(conn, batch)
            total += len(batch)
    finally:
        conn.close()

    emit_event("scan.progress", scanned=total, root=root)
    return {"scanned": total, "root": root}
