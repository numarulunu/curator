from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Iterator

INDEX_EXTS = frozenset({
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".tif", ".webp",
    ".heic", ".heif", ".raw", ".cr2", ".nef", ".arw", ".dng",
    ".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".3gp",
    ".mpg", ".mpeg", ".wmv", ".flv",
})


@dataclass
class WalkedFile:
    path: str
    size: int
    mtime_ns: int


def walk(root: str) -> Iterator[WalkedFile]:
    """Recursively yield WalkedFile entries for indexable media under root."""
    try:
        it = os.scandir(root)
    except (PermissionError, FileNotFoundError, OSError):
        return
    with it:
        for entry in it:
            try:
                is_dir = entry.is_dir(follow_symlinks=False)
            except (PermissionError, OSError):
                continue
            if is_dir:
                yield from walk(entry.path)
                continue
            ext = os.path.splitext(entry.name)[1].lower()
            if ext not in INDEX_EXTS:
                continue
            try:
                st = entry.stat(follow_symlinks=False)
            except (PermissionError, OSError):
                continue
            yield WalkedFile(path=entry.path, size=st.st_size, mtime_ns=st.st_mtime_ns)
