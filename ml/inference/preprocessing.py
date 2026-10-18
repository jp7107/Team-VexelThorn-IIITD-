"""Canonical preprocessing shared by training, evaluation, export parity and inference.

There is exactly one implementation of the image transform. train.py, evaluate.py
and the ONNX parity check all import this module so that the tensor the model was
trained on and the tensor it sees in production cannot drift apart.

Contract (plan §8.4):
  decode -> EXIF rotate -> RGB -> resize shorter side -> centre crop
         -> scale to [0,1] -> normalise with ImageNet mean/std -> CHW
Reject: unreadable, < 64 px on a side, > 8 MB, non-image magic bytes, or empties.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

# Magic-byte prefixes of formats we accept. Checked before handing bytes to PIL so
# that a renamed text file produces InvalidImageError rather than a decoder crash.
_MAGIC = {
    b"\xff\xd8\xff": "jpeg",
    b"\x89PNG\r\n\x1a\n": "png",
    b"BM": "bmp",
    b"RIFF": "webp",  # RIFF....WEBP, verified by PIL afterwards
}


class InvalidImageError(ValueError):
    """Raised for input that must map to API error IMAGE_INVALID / UNSUPPORTED_IMAGE_TYPE."""

    def __init__(self, code: str, detail: str):
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class PreprocessConfig:
    image_size: int = 192
    mean: tuple = (0.485, 0.456, 0.406)
    std: tuple = (0.229, 0.224, 0.225)
    min_side_px: int = 64
    max_bytes: int = 8 * 1024 * 1024

    @classmethod
    def from_dict(cls, d: dict) -> "PreprocessConfig":
        p = d.get("preprocess", d)
        return cls(
            image_size=int(p.get("image_size", 192)),
            mean=tuple(float(x) for x in p.get("mean", (0.485, 0.456, 0.406))),
            std=tuple(float(x) for x in p.get("std", (0.229, 0.224, 0.225))),
            min_side_px=int(p.get("min_side_px", 64)),
            max_bytes=int(p.get("max_bytes", 8 * 1024 * 1024)),
        )

    def to_dict(self) -> dict:
        return {
            "image_size": self.image_size,
            "resize_mode": "short_side_crop",
            "interpolation": "bilinear",
            "crop": "center",
            "mean": list(self.mean),
            "std": list(self.std),
            "channel_order": "RGB",
            "layout": "NCHW",
            "min_side_px": self.min_side_px,
            "max_bytes": self.max_bytes,
        }


def _check_magic(data: bytes) -> None:
    if not data:
        raise InvalidImageError("IMAGE_INVALID", "empty payload")
    for prefix in _MAGIC:
        if data.startswith(prefix):
            return
    raise InvalidImageError("UNSUPPORTED_IMAGE_TYPE", "unrecognised image signature")


def open_image(data: bytes, cfg: PreprocessConfig) -> Image.Image:
    """Validate bytes and return an EXIF-corrected RGB image."""
    if len(data) > cfg.max_bytes:
        raise InvalidImageError("IMAGE_TOO_LARGE", f"{len(data)} bytes exceeds {cfg.max_bytes}")
    _check_magic(data)
    try:
        im = Image.open(io.BytesIO(data))
        im = ImageOps.exif_transpose(im)
        im.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidImageError("IMAGE_INVALID", f"decode failed: {type(exc).__name__}") from exc

    # RGBA, palette and greyscale phone exports all collapse to RGB with white
    # matting for transparency, matching how a JPEG would have been stored.
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        bg = Image.new("RGB", im.size, (255, 255, 255))
        rgba = im.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[-1])
        im = bg
    elif im.mode != "RGB":
        im = im.convert("RGB")

    if min(im.size) < cfg.min_side_px:
        raise InvalidImageError(
            "IMAGE_INVALID", f"{im.size[0]}x{im.size[1]} smaller than {cfg.min_side_px}px minimum"
        )
    return im


def resize_and_crop(im: Image.Image, size: int) -> Image.Image:
    """Resize the shorter side to `size` then centre crop — the standard eval transform."""
    w, h = im.size
    scale = size / min(w, h)
    new_w, new_h = max(size, int(round(w * scale))), max(size, int(round(h * scale)))
    im = im.resize((new_w, new_h), Image.Resampling.BILINEAR)
    left, top = (new_w - size) // 2, (new_h - size) // 2
    return im.crop((left, top, left + size, top + size))


def to_numpy(im: Image.Image, cfg: PreprocessConfig) -> np.ndarray:
    """Return a float32 CHW normalised array for a single prepared image."""
    arr = np.asarray(im, dtype=np.float32) / 255.0
    arr = (arr - np.asarray(cfg.mean, dtype=np.float32)) / np.asarray(cfg.std, dtype=np.float32)
    return np.transpose(arr, (2, 0, 1)).astype(np.float32)


def preprocess_bytes(data: bytes, cfg: PreprocessConfig) -> np.ndarray:
    im = open_image(data, cfg)
    im = resize_and_crop(im, cfg.image_size)
    return to_numpy(im, cfg)[None, ...]  # add batch dimension
