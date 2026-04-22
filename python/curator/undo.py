from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any


def _manifest_path(session_id: str) -> Path:
    base = os.environ.get("LOCALAPPDATA") or str(Path.home())
    return Path(base) / "Curator" / "sessions" / f"{session_id}.json"


def undo_session(session_id: str) -> dict[str, Any]:
    manifest_path = _manifest_path(session_id)
    if not manifest_path.is_file():
        raise FileNotFoundError(f"session manifest not found: {manifest_path}")

    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    restored = 0
    failed = 0
    errors: list[dict[str, str | None]] = []

    for action in reversed(payload["actions"]):
        try:
            src = Path(action["dst"])
            dst = Path(action["src"])
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dst))
            restored += 1
        except Exception as exc:
            failed += 1
            errors.append({"src": action.get("src"), "error": str(exc)})

    payload["reversed"] = True
    manifest_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return {"restored": restored, "failed": failed, "errors": errors, "session_id": session_id}
