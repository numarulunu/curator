from PIL import Image

from curator.features import quality
from tests.fixtures.gen import blurred, scene


def test_resolution_reports_width_height(tmp_path):
    p = tmp_path / "r.jpg"
    Image.new("RGB", (640, 480), "white").save(p)
    m = quality.compute(p)
    assert m.width == 640
    assert m.height == 480


def test_sharp_scene_scores_above_blurred(tmp_path):
    sharp_path = tmp_path / "sharp.jpg"
    img = scene(sharp_path)
    blur_path = tmp_path / "blur.jpg"
    blurred(blur_path, img, radius=8)
    sharp = quality.compute(sharp_path)
    blur = quality.compute(blur_path)
    assert sharp.sharpness > blur.sharpness * 2


def test_exposure_detects_blown_highlights(tmp_path):
    p = tmp_path / "white.jpg"
    Image.new("RGB", (256, 256), (255, 255, 255)).save(p)
    m = quality.compute(p)
    assert m.highlight_clip > 0.95
    assert m.shadow_clip < 0.05


def test_exposure_detects_crushed_shadows(tmp_path):
    p = tmp_path / "black.jpg"
    Image.new("RGB", (256, 256), (0, 0, 0)).save(p)
    m = quality.compute(p)
    assert m.shadow_clip > 0.95
    assert m.highlight_clip < 0.05
