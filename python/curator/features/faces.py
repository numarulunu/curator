from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Union

import cv2
import numpy as np

from curator.features import models


_DETECTOR: "cv2.FaceDetectorYN | None" = None


@dataclass(frozen=True)
class FaceMetrics:
    count: int
    quality: float


def _detector() -> "cv2.FaceDetectorYN":
    global _DETECTOR
    if _DETECTOR is None:
        path = models.resolve_path(models.REGISTRY["yunet_face"])
        _DETECTOR = cv2.FaceDetectorYN.create(str(path), "", (320, 320), score_threshold=0.6)
    return _DETECTOR


def _eye_openness(row: np.ndarray) -> float:
    x_re, y_re = row[4], row[5]
    x_le, y_le = row[6], row[7]
    eye_dist = float(np.hypot(x_re - x_le, y_re - y_le))
    face_w = float(row[2])
    if face_w <= 0:
        return 0.0
    ratio = eye_dist / face_w
    return max(0.0, min(1.0, (ratio - 0.15) / 0.25))


def compute(path: Union[str, Path]) -> FaceMetrics:
    data = np.fromfile(str(path), dtype=np.uint8)
    bgr = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if bgr is None:
        return FaceMetrics(count=0, quality=0.0)

    h, w = bgr.shape[:2]
    det = _detector()
    det.setInputSize((w, h))
    _, faces_arr = det.detect(bgr)
    if faces_arr is None:
        return FaceMetrics(count=0, quality=0.0)

    rows = np.asarray(faces_arr)
    count = int(rows.shape[0])
    if count == 0:
        return FaceMetrics(count=0, quality=0.0)

    scores = rows[:, -1].astype(float)
    openness = np.array([_eye_openness(r) for r in rows], dtype=float)
    quality = float(np.clip(scores * openness, 0.0, 1.0).max())
    return FaceMetrics(count=count, quality=quality)
