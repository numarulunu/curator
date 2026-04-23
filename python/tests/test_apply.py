from __future__ import annotations

import json
from pathlib import Path

from curator.apply import apply_actions


def test_quarantine_moves_to_quarantine_dir(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "localappdata"))
    archive = tmp_path / "arch"
    archive.mkdir()
    target = archive / "old.jpg"
    target.write_bytes(b"x")

    result = apply_actions(
        [{"action": "quarantine", "src_path": str(target), "dst_path": None, "reason": "dup"}],
        str(archive),
        "sess-1",
    )

    assert result["ok"] == 1
    assert result["failed"] == 0
    assert not target.exists()
    quarantined = list((archive / "_curator_quarantine" / "sess-1").rglob("old.jpg"))
    assert len(quarantined) == 1


def test_move_to_year_creates_target_and_moves(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "localappdata"))
    archive = tmp_path / "arch"
    archive.mkdir()
    src = archive / "2016" / "a.jpg"
    src.parent.mkdir()
    src.write_bytes(b"x")
    dst = archive / "2015" / "a.jpg"

    result = apply_actions(
        [{"action": "move_to_year", "src_path": str(src), "dst_path": str(dst), "reason": "x"}],
        str(archive),
        "sess-2",
    )

    assert result["ok"] == 1
    assert result["failed"] == 0
    assert not src.exists()
    assert dst.exists()


def test_collision_uses_hash_suffix(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "localappdata"))
    archive = tmp_path / "arch"
    archive.mkdir()
    src = archive / "2016" / "a.jpg"
    src.parent.mkdir()
    src.write_bytes(b"new")
    existing = archive / "2015" / "a.jpg"
    existing.parent.mkdir()
    existing.write_bytes(b"existing")

    result = apply_actions(
        [{"action": "move_to_year", "src_path": str(src), "dst_path": str(existing), "reason": "x"}],
        str(archive),
        "sess-3",
    )

    assert result["ok"] == 1
    assert result["failed"] == 0
    assert existing.read_bytes() == b"existing"
    suffixed = list(existing.parent.glob("a_*.jpg"))
    assert len(suffixed) == 1


def test_writes_session_manifest(tmp_path: Path, monkeypatch) -> None:
    localappdata = tmp_path / "localappdata"
    monkeypatch.setenv("LOCALAPPDATA", str(localappdata))
    archive = tmp_path / "arch"
    archive.mkdir()
    target = archive / "old.jpg"
    target.write_bytes(b"x")

    result = apply_actions(
        [{"action": "quarantine", "src_path": str(target), "dst_path": None, "reason": "dup"}],
        str(archive),
        "sess-4",
    )

    manifest_path = localappdata / "Curator" / "sessions" / "sess-4.json"
    assert result["session_id"] == "sess-4"
    assert manifest_path.exists()
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert payload["session_id"] == "sess-4"
    assert payload["archive_root"] == str(archive)
    assert len(payload["actions"]) == 1
    assert payload["actions"][0]["action"] == "quarantine"


def test_quarantine_uses_selected_output_root(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "localappdata"))
    archive = tmp_path / "arch"
    output = tmp_path / "out"
    archive.mkdir()
    output.mkdir()
    target = archive / "old.jpg"
    target.write_bytes(b"x")

    result = apply_actions(
        [{"action": "quarantine", "src_path": str(target), "dst_path": None, "reason": "dup"}],
        str(archive),
        "sess-output",
        str(output),
    )

    assert result["ok"] == 1
    assert result["failed"] == 0
    assert not target.exists()
    quarantined = list((output / "_curator_quarantine" / "sess-output").rglob("old.jpg"))
    assert len(quarantined) == 1
