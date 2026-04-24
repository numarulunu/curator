from __future__ import annotations

from pathlib import Path
from typing import Union

import imagehash
from PIL import Image


def compute(path: Union[str, Path]) -> bytes:
    with Image.open(path) as img:
        h = imagehash.phash(img, hash_size=8)
    return int(str(h), 16).to_bytes(8, "big")


def hamming(a: bytes, b: bytes) -> int:
    assert len(a) == len(b) == 8
    return bin(int.from_bytes(a, "big") ^ int.from_bytes(b, "big")).count("1")
