from __future__ import annotations

import threading


class Cancelled(RuntimeError):
    pass


_LOCK = threading.Lock()
_FLAG = False


def request_cancel() -> None:
    global _FLAG
    with _LOCK:
        _FLAG = True


def reset_cancel() -> None:
    global _FLAG
    with _LOCK:
        _FLAG = False


def should_cancel() -> bool:
    with _LOCK:
        return _FLAG


def raise_if_cancelled() -> None:
    if should_cancel():
        raise Cancelled("analysis cancelled")
