from __future__ import annotations

from pathlib import Path
from typing import Union

import numpy as np
import onnxruntime as ort
from PIL import Image

from curator.features import models


_SESSION: "ort.InferenceSession | None" = None
_INPUT_NAME: "str | None" = None

_MEAN = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
_STD = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)
_SIZE = 224


def _session() -> ort.InferenceSession:
    global _SESSION, _INPUT_NAME
    if _SESSION is None:
        path = models.resolve_path(models.REGISTRY["clip_vit_b32"])
        _SESSION = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        _INPUT_NAME = _SESSION.get_inputs()[0].name
    return _SESSION


def _preprocess(path: Path) -> np.ndarray:
    with Image.open(path) as img:
        img = img.convert("RGB")
        w, h = img.size
        scale = _SIZE / min(w, h)
        nw, nh = round(w * scale), round(h * scale)
        img = img.resize((nw, nh), Image.BICUBIC)
        left = (nw - _SIZE) // 2
        top = (nh - _SIZE) // 2
        img = img.crop((left, top, left + _SIZE, top + _SIZE))
        arr = np.asarray(img, dtype=np.float32) / 255.0
    arr = (arr - _MEAN) / _STD
    arr = arr.transpose(2, 0, 1)[None, :, :, :]
    return arr.astype(np.float32)


def _select_embedding(outputs: list[np.ndarray]) -> np.ndarray:
    arrays = [np.asarray(out) for out in outputs]
    for arr in arrays:
        if arr.ndim == 2 and arr.shape[0] == 1 and arr.shape[1] > 0:
            return arr[0]
    for arr in arrays:
        if arr.ndim == 1 and arr.shape[0] > 0:
            return arr
    for arr in arrays:
        if arr.ndim == 3 and arr.shape[0] == 1 and arr.shape[1] > 0 and arr.shape[2] > 0:
            return arr[0, 0]
    raise RuntimeError("CLIP model did not return a usable image embedding")


def embed(path: Union[str, Path]) -> np.ndarray:
    sess = _session()
    x = _preprocess(Path(path))
    out = _select_embedding(sess.run(None, {_INPUT_NAME: x})).astype(np.float32)
    norm = float(np.linalg.norm(out))
    if norm > 0:
        out = out / norm
    return out
