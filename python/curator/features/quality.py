from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Union

import cv2
import numpy as np


@dataclass(frozen=True)
class QualityMetrics:
    width: int
    height: int
    sharpness: float
    brightness_mean: float
    highlight_clip: float
    shadow_clip: float


def compute(path: Union[str, Path]) -> QualityMetrics:
    data = np.fromfile(str(path), dtype=np.uint8)
    bgr = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError(f"could not decode image: {path}")

    h, w = bgr.shape[:2]
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    sharpness = float(lap.var())
    brightness_mean = float(gray.mean()) / 255.0
    total = gray.size
    highlight_clip = float((gray >= 250).sum()) / total
    shadow_clip = float((gray <= 5).sum()) / total
    return QualityMetrics(
        width=w,
        height=h,
        sharpness=sharpness,
        brightness_mean=brightness_mean,
        highlight_clip=highlight_clip,
        shadow_clip=shadow_clip,
    )
