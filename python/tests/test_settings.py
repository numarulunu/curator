# python/tests/test_settings.py
import pytest

from curator import settings


def test_preset_safe_is_strictest():
    t = settings.resolve_preset("safe")
    assert t["phash_hamming"] == 5
    assert t["clip_cosine"] == 0.93
    assert t["exif_time_s"] == 900
    assert t["gps_m"] == 80
    assert t["min_confidence"] == 0.92


def test_preset_balanced():
    t = settings.resolve_preset("balanced")
    assert t == {
        "phash_hamming": 8,
        "clip_cosine": 0.90,
        "exif_time_s": 1800,
        "gps_m": 150,
        "min_confidence": 0.88,
    }


def test_preset_aggressive_loosest():
    t = settings.resolve_preset("aggressive")
    assert t["phash_hamming"] == 12
    assert t["clip_cosine"] == 0.85


def test_custom_merges_over_balanced_defaults():
    t = settings.resolve_preset("custom", custom={"phash_hamming": 3, "clip_cosine": 0.99})
    assert t["phash_hamming"] == 3
    assert t["clip_cosine"] == 0.99
    assert t["exif_time_s"] == 1800  # inherited from balanced


def test_unknown_preset_raises():
    with pytest.raises(ValueError):
        settings.resolve_preset("crispy")


def test_profile_eco_cpu_only():
    p = settings.resolve_profile("eco", cpu_count=8)
    assert p["workers"] == 2
    assert p["gpu"] == "off"
    assert p["memory_mb"] == 512


def test_profile_max_prefers_directml():
    p = settings.resolve_profile("max", cpu_count=8)
    assert p["workers"] == 7
    assert p["gpu"] == "on"
    assert p["memory_mb"] == 4096


def test_profile_balanced_auto_gpu():
    p = settings.resolve_profile("balanced", cpu_count=8)
    assert p["workers"] == 4
    assert p["gpu"] == "auto"


def test_defaults_returns_balanced_off():
    d = settings.defaults()
    assert d["similar_photo_review"] is False
    assert d["ai_mode"] == "off"
    assert d["preset"] == "balanced"
    assert d["profile"] == "balanced"
