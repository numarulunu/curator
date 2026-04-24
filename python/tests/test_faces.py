import pytest
from PIL import Image

from curator.features import faces, models


MODELS_READY = models.resolve_path(models.REGISTRY["yunet_face"]).exists()


@pytest.mark.skipif(not MODELS_READY, reason="YuNet ONNX not downloaded")
def test_no_faces_in_solid_image(tmp_path):
    p = tmp_path / "solid.jpg"
    Image.new("RGB", (256, 256), (80, 80, 80)).save(p)
    m = faces.compute(p)
    assert m.count == 0
    assert m.quality == 0.0
