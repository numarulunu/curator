from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


def solid(path: Path, size=(128, 128), color=(200, 100, 50)):
    Image.new("RGB", size, color).save(path, "JPEG", quality=90)


def scene(path: Path, size=(512, 512), seed=7):
    img = Image.new("RGB", size, (40, 40, 80))
    d = ImageDraw.Draw(img)
    for i in range(5):
        x = 40 + i * 80 + seed
        d.rectangle((x, 100, x + 60, 300 + i * 10), fill=(255 - i * 20, 120 + i * 10, 80))
    img.save(path, "JPEG", quality=92)
    return img


def blurred(path: Path, source: Image.Image, radius=6):
    source.filter(ImageFilter.GaussianBlur(radius)).save(path, "JPEG", quality=92)


def resized(path: Path, source: Image.Image, factor=0.5):
    w, h = source.size
    source.resize((int(w * factor), int(h * factor))).save(path, "JPEG", quality=90)


def reencoded(path: Path, source: Image.Image, quality=60):
    source.save(path, "JPEG", quality=quality)
