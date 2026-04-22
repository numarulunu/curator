from __future__ import annotations

from curator.walker import INDEX_EXTS, WalkedFile, walk


def test_walks_nested_dirs_and_filters_by_extension(tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"jpeg-bytes")
    sub = tmp_path / "sub"
    sub.mkdir()
    (sub / "b.png").write_bytes(b"png-bytes")
    deeper = sub / "deeper"
    deeper.mkdir()
    (deeper / "c.mp4").write_bytes(b"mp4-bytes")
    (sub / "notes.txt").write_bytes(b"text-bytes")
    (sub / ".hidden.jpg").write_bytes(b"hidden-jpeg")

    results = list(walk(str(tmp_path)))

    assert len(results) == 4
    for wf in results:
        assert isinstance(wf, WalkedFile)
        ext = wf.path.lower().rsplit(".", 1)[-1]
        assert "." + ext in INDEX_EXTS
        assert wf.size > 0
        assert wf.mtime_ns > 0


def test_handles_non_ascii_paths(tmp_path):
    non_ascii_dir = tmp_path / "„OVIDIUS"
    non_ascii_dir.mkdir()
    (non_ascii_dir / "photo.jpg").write_bytes(b"jpeg-bytes")

    results = list(walk(str(tmp_path)))

    assert len(results) == 1
    assert "„OVIDIUS" in results[0].path
