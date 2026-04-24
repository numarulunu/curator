from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, List, Optional

import requests

from curator.paths import resolve_models_dir


@dataclass(frozen=True)
class ModelSpec:
    name: str
    url: str
    sha256: str
    size_bytes: int


REGISTRY: Dict[str, ModelSpec] = {
    "clip_vit_b32": ModelSpec(
        name="clip_vit_b32",
        url="https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model.onnx",
        sha256="fd6e1402a588279d1723c7534d4bcba5bc0b14b47dfab0e46f8c47b8270d7d40",
        size_bytes=351_685_709,
    ),
    "yunet_face": ModelSpec(
        name="yunet_face",
        url="https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        sha256="8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
        size_bytes=232_589,
    ),
    "nima_mobilenet": ModelSpec(
        name="nima_mobilenet",
        url="https://huggingface.co/cromsc/nima-mobilenet-aesthetic/resolve/main/nima_mobilenet_aesthetic.onnx",
        sha256="c58b0c39b5b8f752b1b0ebf10e07e48406780ce3bf9d4647f8c43898748fe69c",
        size_bytes=12_867_270,
    ),
}


class ModelHashMismatch(RuntimeError):
    pass


class UnpinnedModel(RuntimeError):
    pass


def resolve_path(spec: ModelSpec) -> Path:
    return resolve_models_dir() / f"{spec.name}.onnx"


def _verify_sha256(path: Path, expected: str) -> bool:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest() == expected


def _validate_registry_pin(spec: ModelSpec) -> None:
    if len(spec.sha256) != 64 or spec.sha256 == "0" * 64:
        raise UnpinnedModel(f"model is not pinned with sha256: {spec.name}")


def download(spec: ModelSpec, progress: Optional[Callable[[int, int], None]] = None) -> Path:
    path = resolve_path(spec)
    tmp = path.with_suffix(".onnx.part")
    path.parent.mkdir(parents=True, exist_ok=True)
    if tmp.exists():
        tmp.unlink()

    resp = requests.get(spec.url, stream=True, timeout=60)
    resp.raise_for_status()
    total = int(resp.headers.get("Content-Length") or spec.size_bytes)
    h = hashlib.sha256()
    done = 0
    with tmp.open("wb") as f:
        for chunk in resp.iter_content(chunk_size=1 << 20):
            if not chunk:
                continue
            f.write(chunk)
            h.update(chunk)
            done += len(chunk)
            if progress:
                progress(done, total)

    if h.hexdigest() != spec.sha256:
        tmp.unlink(missing_ok=True)
        raise ModelHashMismatch(f"sha256 mismatch for {spec.name}")
    tmp.replace(path)
    return path


def ensure_all(progress: Optional[Callable[[str, int, int], None]] = None) -> Dict[str, List[str]]:
    downloaded: List[str] = []
    ready: List[str] = []
    for name, spec in REGISTRY.items():
        _validate_registry_pin(spec)
        path = resolve_path(spec)
        if path.exists() and _verify_sha256(path, spec.sha256):
            ready.append(name)
            continue
        cb = (lambda done, total, model=name: progress(model, done, total)) if progress else None
        download(spec, progress=cb)
        ready.append(name)
        downloaded.append(name)
    return {"ready": ready, "downloaded": downloaded}
