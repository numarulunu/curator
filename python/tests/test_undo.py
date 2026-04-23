from __future__ import annotations

import json
from pathlib import Path

from curator.apply import apply_actions
from curator.undo import undo_session


def test_undo_reverses_quarantine(tmp_path: Path, monkeypatch) -> None:
    archive = tmp_path / "arch"
    archive.mkdir()
    target = archive / "old.jpg"
    target.write_bytes(b"x")
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))

    apply_actions(
        [{"action": "quarantine", "src_path": str(target), "dst_path": None, "reason": "dup"}],
        str(archive),
        "sess-a",
    )

    assert not target.exists()
    result = undo_session("sess-a")
    assert result["restored"] == 1
    assert result["failed"] == 0
    assert target.exists()


def test_undo_reverses_move(tmp_path: Path, monkeypatch) -> None:
    archive = tmp_path / "arch"
    archive.mkdir()
    src = archive / "2016" / "a.jpg"
    src.parent.mkdir()
    src.write_bytes(b"x")
    dst = archive / "2015" / "a.jpg"
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))

    apply_actions(
        [{"action": "move_to_year", "src_path": str(src), "dst_path": str(dst), "reason": "x"}],
        str(archive),
        "sess-b",
    )

    assert dst.exists() and not src.exists()
    result = undo_session("sess-b")
    assert result["restored"] == 1
    assert result["failed"] == 0
    assert src.exists() and not dst.exists()


def test_undo_does_not_flag_manifest_reversed_when_any_restore_fails(tmp_path: Path, monkeypatch) -> None:
    archive = tmp_path / "arch"
    archive.mkdir()
    target = archive / "keep.jpg"
    target.write_bytes(b"x")
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))

    apply_actions(
        [{"action": "quarantine", "src_path": str(target), "dst_path": None, "reason": "dup"}],
        str(archive),
        "sess-fail",
    )

    # Remove the quarantined file so undo's shutil.move cannot find the source.
    manifest_path = tmp_path / "Curator" / "sessions" / "sess-fail.json"
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    quarantined_dst = Path(payload["actions"][0]["dst"])
    quarantined_dst.unlink()

    result = undo_session("sess-fail")
    assert result["restored"] == 0
    assert result["failed"] == 1

    reloaded = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert reloaded.get("reversed") is not True, "manifest must not be flagged reversed when any action failed"
