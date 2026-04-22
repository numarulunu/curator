from datetime import datetime, timezone
from curator.dater import resolve_canonical


def iso(y, m, d, h=0, mi=0, s=0) -> str:
    return datetime(y, m, d, h, mi, s, tzinfo=timezone.utc).isoformat()


def test_prefers_exif_datetime_original():
    meta = {"EXIF:DateTimeOriginal": "2015:07:14 10:30:00"}
    r = resolve_canonical("/a/b.jpg", 1_400_000_000 * 10**9, meta)
    assert r.source == "exif"
    assert r.date.startswith("2015-07-14")


def test_falls_back_to_filename_yymmddhhmmss():
    meta = {}
    r = resolve_canonical("/a/150714103000.jpg", 1_400_000_000 * 10**9, meta)
    assert r.source == "filename"
    assert r.date.startswith("2015-07-14")


def test_falls_back_to_filename_yyyymmdd():
    meta = {}
    r = resolve_canonical("/a/20150714.jpg", 1_400_000_000 * 10**9, meta)
    assert r.source == "filename"
    assert r.date.startswith("2015-07-14")


def test_falls_back_to_filename_img_whatsapp():
    meta = {}
    r = resolve_canonical("/a/IMG-20200325-WA0001.jpg", 1_400_000_000 * 10**9, meta)
    assert r.source == "filename"
    assert r.date.startswith("2020-03-25")


def test_final_fallback_to_mtime():
    meta = {}
    dt = datetime(2019, 6, 15, 12, 0, 0, tzinfo=timezone.utc)
    ns = int(dt.timestamp() * 1e9)
    r = resolve_canonical("/a/unknown-name.jpg", ns, meta)
    assert r.source == "mtime"
    assert r.date.startswith("2019-06-15")
