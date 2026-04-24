from __future__ import annotations

from pathlib import Path
from typing import Union

import numpy as np
import onnxruntime as ort
from PIL import Image

from curator.features import models


_SESSION: "ort.InferenceSession | None" = None
_INPUT_NAME: "str | None" = None
_INPUT_LAYOUT: "str | None" = None

_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
_SIZE = 224


def _session() -> ort.InferenceSession:
    global _SESSION, _INPUT_NAME, _INPUT_LAYOUT
    if _SESSION is None:
        path = models.resolve_path(models.REGISTRY["nima_mobilenet"])
        _SESSION = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        inp = _SESSION.get_inputs()[0]
        _INPUT_NAME = inp.name
        _INPUT_LAYOUT = "nhwc" if len(inp.shape) == 4 and inp.shape[-1] == 3 else "nchw"
    return _SESSION


def _preprocess(path: Path, layout: str = "nchw") -> np.ndarray:
    with Image.open(path) as img:
        img = img.convert("RGB").resize((_SIZE, _SIZE), Image.BICUBIC)
        arr = np.asarray(img, dtype=np.float32) / 255.0
    arr = (arr - _MEAN) / _STD
    if layout == "nhwc":
        arr = arr[None, :, :, :]
    else:
        arr = arr.transpose(2, 0, 1)[None, :, :, :]
    return arr.astype(np.float32)


def score(path: Union[str, Path]) -> float:
    sess = _session()
    x = _preprocess(Path(path), _INPUT_LAYOUT or "nchw")
    probs = sess.run(None, {_INPUT_NAME: x})[0][0]
    probs = probs / max(float(probs.sum()), 1e-9)
    weights = np.arange(1, 11, dtype=np.float32)
    return float((probs * weights).sum())
