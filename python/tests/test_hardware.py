from unittest.mock import patch

from curator import hardware


def test_detect_reports_cpu_count():
    h = hardware.detect()
    assert h.cpu_count >= 1
    assert h.memory_mb >= 512


def test_detect_reports_gpu_fields():
    h = hardware.detect()
    assert isinstance(h.providers, list)
    assert isinstance(h.directml_available, bool)


def test_pick_provider_prefers_directml_when_available():
    with patch("curator.hardware._providers", return_value=["DmlExecutionProvider", "CPUExecutionProvider"]):
        assert hardware.pick_provider("auto") == "DmlExecutionProvider"
        assert hardware.pick_provider("on") == "DmlExecutionProvider"
        assert hardware.pick_provider("off") == "CPUExecutionProvider"


def test_pick_provider_falls_back_to_cpu_when_gpu_missing():
    with patch("curator.hardware._providers", return_value=["CPUExecutionProvider"]):
        assert hardware.pick_provider("auto") == "CPUExecutionProvider"
        assert hardware.pick_provider("on") == "CPUExecutionProvider"
