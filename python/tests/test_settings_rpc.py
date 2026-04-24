import json

from curator import db as _db
from curator.rpc import dispatch
import curator.builtins  # noqa: F401


def _fresh(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "s.db"))
    con = _db.connect()
    _db.ensure_schema(con)
    con.execute("CREATE TABLE IF NOT EXISTS analysis_settings (id INTEGER PRIMARY KEY CHECK (id = 1), settings_json TEXT NOT NULL, updated_at TEXT NOT NULL)")
    con.close()


def test_get_returns_defaults_when_unset(tmp_path, monkeypatch):
    _fresh(tmp_path, monkeypatch)
    resp = dispatch({"jsonrpc": "2.0", "id": 1, "method": "getAnalysisSettings", "params": {}})
    s = resp["result"]
    assert s["similar_photo_review"] is False
    assert s["preset"] == "balanced"


def test_save_then_get_roundtrip(tmp_path, monkeypatch):
    _fresh(tmp_path, monkeypatch)
    payload = {
        "similar_photo_review": True, "ai_mode": "full",
        "preset": "aggressive", "preset_custom": {},
        "profile": "max", "profile_custom": {},
    }
    dispatch({"jsonrpc": "2.0", "id": 2, "method": "saveAnalysisSettings", "params": {"settings": payload}})
    resp = dispatch({"jsonrpc": "2.0", "id": 3, "method": "getAnalysisSettings", "params": {}})
    assert resp["result"] == payload


def test_cancel_sets_flag(tmp_path, monkeypatch):
    _fresh(tmp_path, monkeypatch)
    from curator import pipeline
    pipeline.reset_cancel()
    dispatch({"jsonrpc": "2.0", "id": 4, "method": "cancelAnalysis", "params": {}})
    assert pipeline.should_cancel() is True
    pipeline.reset_cancel()


def test_detect_hardware_returns_dict(tmp_path, monkeypatch):
    _fresh(tmp_path, monkeypatch)
    resp = dispatch({"jsonrpc": "2.0", "id": 5, "method": "detectHardware", "params": {}})
    h = resp["result"]
    assert "cpu_count" in h
    assert "memory_mb" in h
    assert "providers" in h
    assert "directml_available" in h
