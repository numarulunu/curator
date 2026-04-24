import json
import io
import pytest
from curator.rpc import dispatch, register, REGISTRY


@pytest.fixture(autouse=True)
def _restore_registry():
    original = dict(REGISTRY)
    yield
    REGISTRY.clear()
    REGISTRY.update(original)


def test_dispatch_registered_method():
    REGISTRY.clear()

    @register("echo")
    def echo(payload):
        return {"you_said": payload["msg"]}

    req = {"jsonrpc": "2.0", "id": 1, "method": "echo", "params": {"msg": "hi"}}
    resp = dispatch(req)
    assert resp == {"jsonrpc": "2.0", "id": 1, "result": {"you_said": "hi"}}


def test_dispatch_unknown_method_returns_error():
    REGISTRY.clear()
    req = {"jsonrpc": "2.0", "id": 2, "method": "does_not_exist", "params": {}}
    resp = dispatch(req)
    assert resp["error"]["code"] == -32601
    assert resp["id"] == 2


def test_dispatch_handler_exception_returns_error():
    REGISTRY.clear()

    @register("boom")
    def boom(_payload):
        raise ValueError("kaboom")

    req = {"jsonrpc": "2.0", "id": 3, "method": "boom", "params": {}}
    resp = dispatch(req)
    assert resp["error"]["code"] == -32000
    assert "kaboom" in resp["error"]["message"]
