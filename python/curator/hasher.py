from __future__ import annotations

import xxhash

CHUNK_SIZE = 1024 * 1024  # 1 MiB


def hash_file(path: str) -> str:
    """Return the xxhash64 hex digest of a file, reading in 1 MiB chunks."""
    h = xxhash.xxh64()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()
