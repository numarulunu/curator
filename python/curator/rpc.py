from __future__ import annotations
import json
import sys
import traceback
from typing import Any, Callable, Dict

Handler = Callable[[Dict[str, Any]], Any]
REGISTRY: Dict[str, Handler] = {}


def register(name: str) -> Callable[[Handler], Handler]:
    def deco(fn: Handler) -> Handler:
        REGISTRY[name] = fn
        return fn
    return deco


def dispatch(req: Dict[str, Any]) -> Dict[str, Any]:
    rid = req.get("id")
    method = req.get("method")
    params = req.get("params", {}) or {}
    handler = REGISTRY.get(method or "")
    if handler is None:
        return {"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": f"Method not found: {method}"}}
    try:
        result = handler(params)
        return {"jsonrpc": "2.0", "id": rid, "result": result}
    except Exception as e:
        return {
            "jsonrpc": "2.0", "id": rid,
            "error": {"code": -32000, "message": str(e), "data": traceback.format_exc()},
        }


def emit_event(kind: str, **payload) -> None:
    """Write a JSON-RPC notification line (no id) to stdout and flush.

    Used for unsolicited one-way events from sidecar → client.
    """
    msg = {"jsonrpc": "2.0", "method": "event", "params": {"kind": kind, **payload}}
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def serve_stdio() -> None:
    # Line-delimited JSON. One request per line; one response per line.
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            resp = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": f"Parse error: {e}"}}
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()
            continue
        resp = dispatch(req)
        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()
