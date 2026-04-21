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
    assert resp["result"]["sidecar"] == "0.1.0"
