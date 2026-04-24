from curator.features import phash
from tests.fixtures.gen import reencoded, resized, scene, solid


def test_phash_is_64_bit_bytes(tmp_path):
    p = tmp_path / "s.jpg"
    scene(p)
    h = phash.compute(p)
    assert isinstance(h, bytes)
    assert len(h) == 8


def test_phash_stable_across_reencode(tmp_path):
    src = scene(tmp_path / "src.jpg")
    re = tmp_path / "re.jpg"
    reencoded(re, src, quality=60)
    h1 = phash.compute(tmp_path / "src.jpg")
    h2 = phash.compute(re)
    assert phash.hamming(h1, h2) <= 4


def test_phash_close_across_resize(tmp_path):
    src = scene(tmp_path / "src.jpg")
    rz = tmp_path / "rz.jpg"
    resized(rz, src, factor=0.5)
    h1 = phash.compute(tmp_path / "src.jpg")
    h2 = phash.compute(rz)
    assert phash.hamming(h1, h2) <= 8


def test_phash_diverges_for_different_scenes(tmp_path):
    a = tmp_path / "a.jpg"
    scene(a, seed=3)
    b = tmp_path / "b.jpg"
    solid(b, color=(240, 240, 240))
    h1 = phash.compute(a)
    h2 = phash.compute(b)
    assert phash.hamming(h1, h2) >= 16
