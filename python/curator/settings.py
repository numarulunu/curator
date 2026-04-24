# python/curator/settings.py
from __future__ import annotations

from typing import Any, Dict, Literal, Optional


PresetName = Literal["safe", "balanced", "aggressive", "custom"]
ProfileName = Literal["eco", "balanced", "max", "custom"]
AiMode = Literal["off", "lite", "full"]


_PRESETS: Dict[str, Dict[str, float]] = {
    "safe":       {"phash_hamming":  5, "clip_cosine": 0.93, "exif_time_s":  900, "gps_m":  80, "min_confidence": 0.92},
    "balanced":   {"phash_hamming":  8, "clip_cosine": 0.90, "exif_time_s": 1800, "gps_m": 150, "min_confidence": 0.88},
    "aggressive": {"phash_hamming": 12, "clip_cosine": 0.85, "exif_time_s": 3600, "gps_m": 300, "min_confidence": 0.82},
}


def resolve_preset(name: str, custom: Optional[Dict[str, float]] = None) -> Dict[str, float]:
    if name == "custom":
        base = dict(_PRESETS["balanced"])
        if custom:
            base.update({k: v for k, v in custom.items() if k in base})
        return base
    if name not in _PRESETS:
        raise ValueError(f"unknown preset: {name}")
    return dict(_PRESETS[name])


def resolve_profile(name: str, cpu_count: int, custom: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if name == "eco":
        return {"workers": max(1, cpu_count // 4), "gpu": "off", "memory_mb": 512, "decode_queue": 16}
    if name == "balanced":
        return {"workers": max(2, cpu_count // 2), "gpu": "auto", "memory_mb": 2048, "decode_queue": 64}
    if name == "max":
        return {"workers": max(1, cpu_count - 1), "gpu": "on", "memory_mb": 4096, "decode_queue": 128}
    if name == "custom":
        base = resolve_profile("balanced", cpu_count)
        if custom:
            for k in ("workers", "gpu", "memory_mb", "decode_queue"):
                if k in custom:
                    base[k] = custom[k]
        return base
    raise ValueError(f"unknown profile: {name}")


def defaults() -> Dict[str, Any]:
    return {
        "similar_photo_review": False,
        "ai_mode": "off",
        "preset": "balanced",
        "preset_custom": {},
        "profile": "balanced",
        "profile_custom": {},
    }
