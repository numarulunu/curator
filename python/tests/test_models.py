import hashlib
from unittest.mock import patch

import pytest

from curator.features import models


def test_model_registry_has_required_entries():
    expected = {"clip_vit_b32", "yunet_face", "nima_mobilenet"}
    assert expected.issubset(models.REGISTRY.keys())
    for spec in models.REGISTRY.values():
        assert spec.url.startswith("https://")
        assert len(spec.sha256) == 64


def test_download_verifies_sha256(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    payload = b"not-a-real-model"
    digest = hashlib.sha256(payload).hexdigest()
    spec = models.ModelSpec(
        name="toy",
        url="https://example.test/toy.onnx",
        sha256=digest,
        size_bytes=len(payload),
    )

    class FakeResp:
        headers = {"Content-Length": str(len(payload))}

        def iter_content(self, chunk_size):
            yield payload

        def raise_for_status(self):
            pass

    with patch("curator.features.models.requests.get", return_value=FakeResp()):
        path = models.download(spec, progress=lambda done, total: None)
    assert path.exists()
    assert path.read_bytes() == payload


def test_download_rejects_mismatched_sha(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    spec = models.ModelSpec(
        name="bad",
        url="https://example.test/bad.onnx",
        sha256="0" * 64,
        size_bytes=4,
    )

    class FakeResp:
        headers = {"Content-Length": "4"}

        def iter_content(self, chunk_size):
            yield b"junk"

        def raise_for_status(self):
            pass

    with patch("curator.features.models.requests.get", return_value=FakeResp()):
        with pytest.raises(models.ModelHashMismatch):
            models.download(spec)


def test_ensure_all_returns_only_cached_when_present(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    for spec in models.REGISTRY.values():
        path = models.resolve_path(spec)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"cached")

    called = []

    def fake_download(spec, progress=None):
        called.append(spec.name)
        return models.resolve_path(spec)

    with patch("curator.features.models.download", side_effect=fake_download), patch(
        "curator.features.models._verify_sha256", return_value=True
    ):
        result = models.ensure_all()
    assert result["downloaded"] == []
    assert set(result["ready"]) == set(models.REGISTRY.keys())
    assert called == []
