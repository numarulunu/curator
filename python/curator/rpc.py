from __future__ import annotations
import json
import queue
import sys
import threading
import traceback
from typing import Any, Callable, Dict

Handler = Callable[[Dict[str, Any]], Any]
REGISTRY: Dict[str, Handler] = {}

# Methods handled inline by the reader thread instead of going through the
# sequential dispatch queue. Used for signals that must reach the running
# work immediately (e.g. cancellation) without waiting for an in-flight
# extractFeatures call to drain.
IMMEDIATE_METHODS = {"cancelAnalysis"}


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


_write_lock = threading.Lock()


def _write_line(msg: Dict[str, Any]) -> None:
    line = json.dumps(msg) + "\n"
    with _write_lock:
        sys.stdout.write(line)
        sys.stdout.flush()


def emit_event(kind: str, **payload) -> None:
    """Write a JSON-RPC notification line (no id) to stdout and flush.

    Used for unsolicited one-way events from sidecar → client.
    """
    _write_line({"jsonrpc": "2.0", "method": "event", "params": {"kind": kind, **payload}})


def serve_stdio() -> None:
    """Read stdin in a background thread; dispatch in main thread.

    Immediate methods (e.g. cancelAnalysis) are handled inline by the reader
    so they take effect even while the dispatcher is busy with a long call.
    All other methods are queued and processed sequentially in arrival order.
    """
    pending: "queue.Queue[Dict[str, Any] | None]" = queue.Queue()

    def reader() -> None:
        for line in sys.stdin:
            stripped = line.strip()
            if not stripped:
                continue
            try:
                req = json.loads(stripped)
            except json.JSONDecodeError as e:
                _write_line({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": f"Parse error: {e}"}})
                continue
            if req.get("method") in IMMEDIATE_METHODS:
                _write_line(dispatch(req))
                continue
            pending.put(req)
        pending.put(None)

    threading.Thread(target=reader, name="rpc-reader", daemon=True).start()

    while True:
        req = pending.get()
        if req is None:
            return
        _write_line(dispatch(req))
