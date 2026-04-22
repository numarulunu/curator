from __future__ import annotations
import re
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(slots=True, frozen=True)
class CanonicalDate:
    date: str        # ISO 8601 UTC
    source: str      # "exif" | "filename" | "mtime"


EXIF_KEYS = [
    "EXIF:DateTimeOriginal",
    "QuickTime:CreateDate",
    "QuickTime:MediaCreateDate",
    "EXIF:CreateDate",
    "EXIF:DateTimeDigitized",
]

EXIF_FMT = "%Y:%m:%d %H:%M:%S"


FILENAME_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"IMG-(\d{8})-WA\d+", re.I), "%Y%m%d"),
    (re.compile(r"PXL_(\d{8})_\d+", re.I), "%Y%m%d"),
    (re.compile(r"^(\d{8})_(\d{6})"), "%Y%m%d_%H%M%S"),
    (re.compile(r"^(20\d{6})\b"), "%Y%m%d"),
    (re.compile(r"^(\d{12})\b"), "%y%m%d%H%M%S"),
    (re.compile(r"Screen Shot (\d{4}-\d{2}-\d{2})", re.I), "%Y-%m-%d"),
]


def _try_exif(meta: dict) -> str | None:
    for key in EXIF_KEYS:
        v = meta.get(key)
        if not v or not isinstance(v, str): continue
        try:
            dt = datetime.strptime(v.strip(), EXIF_FMT).replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except ValueError:
            continue
    return None


def _try_filename(path: str) -> str | None:
    name = path.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    for pat, fmt in FILENAME_PATTERNS:
        m = pat.search(name)
        if not m: continue
        combined = "_".join(m.groups()) if len(m.groups()) > 1 else m.group(1)
        try:
            dt = datetime.strptime(combined, fmt).replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except ValueError:
            continue
    return None


def resolve_canonical(path: str, mtime_ns: int, meta: dict) -> CanonicalDate:
    exif = _try_exif(meta)
    if exif: return CanonicalDate(date=exif, source="exif")
    fn = _try_filename(path)
    if fn: return CanonicalDate(date=fn, source="filename")
    dt = datetime.fromtimestamp(mtime_ns / 1e9, tz=timezone.utc)
    return CanonicalDate(date=dt.isoformat(), source="mtime")
