import os
from pathlib import Path


def resolve_bin(name: str) -> str:
    bin_dir = os.environ.get("CURATOR_BIN_DIR")
    if not bin_dir:
        raise RuntimeError("CURATOR_BIN_DIR env var not set")
    p = Path(bin_dir) / name
    if not p.is_file():
        raise FileNotFoundError(f"binary not found: {p}")
    return str(p)
