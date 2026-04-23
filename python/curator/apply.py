from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _relpath_under(root: str, path: str) -> str:
    archive_root = Path(root).resolve()
    target = Path(path).resolve()
    try:
        return str(target.relative_to(archive_root))
    except ValueError:
        return target.name


def _ensure_unique(dst: Path, src: Path) -> Path:
    if not dst.exists():
        return dst

    import xxhash

    hasher = xxhash.xxh64()
    with src.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            hasher.update(chunk)

    suffix = hasher.hexdigest()[:8]
    return dst.with_name(f"{dst.stem}_{suffix}{dst.suffix}")


def apply_actions(actions: list[dict[str, Any]], archive_root: str, session_id: str, output_root: str | None = None) -> dict[str, Any]:
    ok = 0
    failed = 0
    errors: list[dict[str, str]] = []
    manifest: list[dict[str, str | None]] = []

    archive = Path(archive_root)
    quarantine_base = Path(output_root) if output_root else archive
    quarantine_root = quarantine_base / "_curator_quarantine" / session_id

    for action in actions:
        kind = action["action"]
        src = Path(action["src_path"])

        try:
            if kind == "quarantine":
                rel = _relpath_under(str(archive), str(src))
                destination = _ensure_unique(quarantine_root / "dup" / rel, src)
            elif kind == "move_to_year":
                raw_dst = action.get("dst_path")
                if not raw_dst:
                    raise ValueError("move_to_year requires dst_path")
                destination = _ensure_unique(Path(raw_dst), src)
            else:
                raise ValueError(f"unknown action: {kind}")

            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(destination))
            manifest.append(
                {
                    "action": str(kind),
                    "src": str(src),
                    "dst": str(destination),
                    "reason": action.get("reason"),
                }
            )
            ok += 1
        except Exception as exc:
            failed += 1
            errors.append({"src": str(src), "error": str(exc)})

    sessions_root = Path(os.environ.get("LOCALAPPDATA", str(archive))) / "Curator" / "sessions"
    sessions_root.mkdir(parents=True, exist_ok=True)
    session_path = sessions_root / f"{session_id}.json"
    session_path.write_text(
        json.dumps(
            {
                "session_id": session_id,
                "archive_root": archive_root,
                "output_root": output_root,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "actions": manifest,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    return {"ok": ok, "failed": failed, "errors": errors, "session_id": session_id}
