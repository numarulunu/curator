from __future__ import annotations
from typing import Dict, Iterable, List
import exiftool
from curator.paths import resolve_bin


def extract_many(paths: Iterable[str]) -> Dict[str, dict]:
    """Batch-extract EXIF metadata via bundled exiftool.

    Returns a dict keyed by SourceFile path, values are the raw metadata dict
    from exiftool (with group prefixes thanks to -G, numeric values via -n).
    Missing paths are omitted from the result, not raised.
    """
    plist: List[str] = list(paths)
    if not plist:
        return {}
    et_path = resolve_bin("exiftool.exe")
    out: Dict[str, dict] = {}
    with exiftool.ExifToolHelper(
        executable=et_path,
        common_args=["-G", "-n", "-charset", "filename=utf8"],
    ) as et:
        metadata = et.get_metadata(plist)
        for m in metadata:
            src = m.get("SourceFile") or m.get("File:FileName")
            if src:
                out[src] = m
    return out
