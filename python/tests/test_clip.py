import numpy as np
import pytest
from PIL import Image

from curator.features import clip, models
from tests.fixtures.gen import scene


MODELS_READY = models.resolve_path(models.REGISTRY["clip_vit_b32"]).exists()


def test_preprocess_returns_nchw_float_tensor(tmp_path):
    p = tmp_path / "s.jpg"
    scene(p)
    x = clip._preprocess(p)
    assert x.shape == (1, 3, 224, 224)
    assert x.dtype == np.float32


@pytest.mark.skipif(not MODELS_READY, reason="CLIP ONNX not downloaded")
def test_embedding_shape_is_512(tmp_path):
    p = tmp_path / "s.jpg"
    scene(p)
    e = clip.embed(p)
    assert e.shape == (512,)
    assert e.dtype == np.float32
    assert abs(float(np.linalg.norm(e)) - 1.0) < 1e-3


@pytest.mark.skipif(not MODELS_READY, reason="CLIP ONNX not downloaded")
def test_same_scene_resized_has_high_cosine(tmp_path):
    src_path = tmp_path / "src.jpg"
    img = scene(src_path)
    rz_path = tmp_path / "rz.jpg"
    img.resize((256, 256)).save(rz_path, "JPEG", quality=90)
    e1 = clip.embed(src_path)
    e2 = clip.embed(rz_path)
    cos = float(np.dot(e1, e2))
    assert cos > 0.90


@pytest.mark.skipif(not MODELS_READY, reason="CLIP ONNX not downloaded")
def test_different_scenes_have_lower_cosine(tmp_path):
    a_path = tmp_path / "a.jpg"
    scene(a_path, seed=3)
    b_path = tmp_path / "b.jpg"
    Image.new("RGB", (512, 512), (250, 240, 230)).save(b_path, "JPEG")
    e1 = clip.embed(a_path)
    e2 = clip.embed(b_path)
    cos = float(np.dot(e1, e2))
    assert cos < 0.85
