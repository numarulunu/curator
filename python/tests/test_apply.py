from __future__ import annotations

import json
import os
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


def test_apply_records_error_when_src_no_longer_exists(tmp_path: Path, monkeypatch) -> None:
    archive = tmp_path / "arch"
    archive.mkdir()
    target = archive / "gone.jpg"
    target.write_bytes(b"x")
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))

    target.unlink()

    result = apply_actions(
        [{"action": "quarantine", "src_path": str(target), "dst_path": None, "reason": "dup"}],
        str(archive),
        "sess-gone",
    )

    assert result["ok"] == 0
    assert result["failed"] == 1
    assert "src no longer exists" in result["errors"][0]["error"]


def test_apply_writes_jsonl_header_and_body_lines_per_move(tmp_path: Path, monkeypatch) -> None:
    archive = tmp_path / "arch"
    archive.mkdir()
    a = archive / "a.jpg"
    b = archive / "b.jpg"
    a.write_bytes(b"aa")
    b.write_bytes(b"bb")
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))

    result = apply_actions(
        [
            {"action": "quarantine", "src_path": str(a), "dst_path": None, "reason": "dup"},
            {"action": "quarantine", "src_path": str(b), "dst_path": None, "reason": "dup"},
        ],
        str(archive),
        "sess-jsonl",
    )

    assert result["ok"] == 2

    jsonl_path = tmp_path / "Curator" / "sessions" / "sess-jsonl.jsonl"
    json_path  = tmp_path / "Curator" / "sessions" / "sess-jsonl.json"
    assert jsonl_path.is_file()
    assert json_path.is_file()

    lines = [json.loads(line) for line in jsonl_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(lines) == 3  # 1 header + 2 body lines
    assert lines[0] == {"__header__": True, "archive_root": str(archive), "output_root": None}
    assert lines[1]["src"] == str(a)
    assert lines[2]["src"] == str(b)


def test_apply_jsonl_captures_partial_progress_when_shutil_move_raises(tmp_path: Path, monkeypatch) -> None:
    archive = tmp_path / "arch"
    archive.mkdir()
    a = archive / "a.jpg"
    b = archive / "b.jpg"
    a.write_bytes(b"aa")
    b.write_bytes(b"bb")
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))

    import curator.apply as apply_mod
    real_move = apply_mod.shutil.move
    calls = {"n": 0}

    def flaky_move(src, dst):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("simulated mid-loop crash")
        return real_move(src, dst)

    monkeypatch.setattr(apply_mod.shutil, "move", flaky_move)

    result = apply_actions(
        [
            {"action": "quarantine", "src_path": str(a), "dst_path": None, "reason": "dup"},
            {"action": "quarantine", "src_path": str(b), "dst_path": None, "reason": "dup"},
        ],
        str(archive),
        "sess-crash",
    )

    assert result["ok"] == 1
    assert result["failed"] == 1

    jsonl_path = tmp_path / "Curator" / "sessions" / "sess-crash.jsonl"
    json_path  = tmp_path / "Curator" / "sessions" / "sess-crash.json"
    assert jsonl_path.is_file()
    assert json_path.is_file()

    lines = [json.loads(line) for line in jsonl_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(lines) == 2  # header + 1 body line
    assert lines[0]["__header__"] is True
    assert lines[1]["src"] == str(a)


def test_apply_appends_to_existing_jsonl_on_retry(tmp_path: Path, monkeypatch) -> None:
    archive = tmp_path / "arch"
    archive.mkdir()
    a = archive / "a.jpg"
    b = archive / "b.jpg"
    a.write_bytes(b"aa")
    b.write_bytes(b"bb")
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))

    import curator.apply as apply_mod
    real_move = apply_mod.shutil.move
    calls = {"n": 0}

    def flaky_move(src, dst):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("first pass boom")
        return real_move(src, dst)

    monkeypatch.setattr(apply_mod.shutil, "move", flaky_move)

    apply_actions(
        [
            {"action": "quarantine", "src_path": str(a), "dst_path": None, "reason": "dup"},
            {"action": "quarantine", "src_path": str(b), "dst_path": None, "reason": "dup"},
        ],
        str(archive),
        "sess-retry",
    )

    monkeypatch.setattr(apply_mod.shutil, "move", real_move)
    result2 = apply_actions(
        [{"action": "quarantine", "src_path": str(b), "dst_path": None, "reason": "dup"}],
        str(archive),
        "sess-retry",
    )
    assert result2["ok"] == 1
    assert result2["failed"] == 0

    jsonl_path = tmp_path / "Curator" / "sessions" / "sess-retry.jsonl"
    lines = [json.loads(line) for line in jsonl_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    # First pass: 1 header + 1 body (a.jpg)
    # Second pass: 1 header + 1 body (b.jpg)
    # Total 4 lines.
    assert len(lines) == 4
    body = [line for line in lines if not line.get("__header__")]
    srcs = sorted(entry["src"] for entry in body)
    assert srcs == sorted([str(a), str(b)])
