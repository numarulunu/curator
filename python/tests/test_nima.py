import numpy as np
import pytest
from PIL import Image

from curator.features import models, nima
from tests.fixtures.gen import scene


MODELS_READY = models.resolve_path(models.REGISTRY["nima_mobilenet"]).exists()


def test_preprocess_returns_nchw_float_tensor(tmp_path):
    p = tmp_path / "s.jpg"
    scene(p)
    x = nima._preprocess(p)
    assert x.shape == (1, 3, 224, 224)
    assert x.dtype == np.float32


def test_preprocess_can_return_nhwc_tensor(tmp_path):
    p = tmp_path / "s.jpg"
    scene(p)
    x = nima._preprocess(p, layout="nhwc")
    assert x.shape == (1, 224, 224, 3)
    assert x.dtype == np.float32


@pytest.mark.skipif(not MODELS_READY, reason="NIMA ONNX not downloaded")
def test_score_in_range(tmp_path):
    p = tmp_path / "s.jpg"
    scene(p)
    s = nima.score(p)
    assert 1.0 <= s <= 10.0


@pytest.mark.skipif(not MODELS_READY, reason="NIMA ONNX not downloaded")
def test_well_composed_scene_scores_above_noise(tmp_path):
    scene_path = tmp_path / "scene.jpg"
    scene(scene_path)
    noise_path = tmp_path / "noise.jpg"
    arr = np.random.randint(0, 255, (256, 256, 3), dtype=np.uint8)
    Image.fromarray(arr).save(noise_path, "JPEG", quality=85)
    assert nima.score(scene_path) >= nima.score(noise_path)
