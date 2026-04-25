from curator.rpc import dispatch, REGISTRY
import curator.builtins  # registers handlers


def test_ping():
    req = {"jsonrpc": "2.0", "id": 1, "method": "ping", "params": {}}
    resp = dispatch(req)
    assert resp["result"] == {"pong": True}


def test_version():
    req = {"jsonrpc": "2.0", "id": 2, "method": "version", "params": {}}
    resp = dispatch(req)
    assert "python" in resp["result"]
    assert resp["result"]["sidecar"] == "0.1.20"


def test_binaries_reports_paths(tmp_path, monkeypatch):
    monkeypatch.setenv("CURATOR_BIN_DIR", str(tmp_path))
    (tmp_path / "exiftool.exe").write_bytes(b"")
    (tmp_path / "ffprobe.exe").write_bytes(b"")
    (tmp_path / "ffmpeg.exe").write_bytes(b"")
    from curator.rpc import dispatch, REGISTRY
    REGISTRY.clear()
    import importlib, curator.builtins
    importlib.reload(curator.builtins)
    resp = dispatch({"jsonrpc": "2.0", "id": 1, "method": "binaries", "params": {}})
    r = resp["result"]
    assert r["exiftool"].endswith("exiftool.exe")
    assert r["ffprobe"].endswith("ffprobe.exe")
    assert r["ffmpeg"].endswith("ffmpeg.exe")
