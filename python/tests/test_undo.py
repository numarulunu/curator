from __future__ import annotations

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
