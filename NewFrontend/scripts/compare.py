"""Visual comparison against the reference dashboard.

Writes side-by-side, 50% overlay and absolute-difference images, and prints the mean difference per region
(boxes are the reference's own layout landmarks, in px at 1586x992).
Usage: python scripts/compare.py <reference.png> <render.png> <outdir>
"""
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageOps, ImageStat

ref_path, out_path, out_dir = map(Path, sys.argv[1:4])
out_dir.mkdir(parents=True, exist_ok=True)
ref = Image.open(ref_path).convert("RGB")
cur = Image.open(out_path).convert("RGB").resize(ref.size)

side = Image.new("RGB", (ref.width * 2 + 16, ref.height), "white")
side.paste(ref, (0, 0))
side.paste(cur, (ref.width + 16, 0))
side.save(out_dir / "compare-side-by-side.png")
Image.blend(ref, cur, 0.5).save(out_dir / "compare-overlay.png")
diff = ImageChops.difference(ref, cur)
ImageOps.autocontrast(diff.convert("L")).save(out_dir / "compare-diff.png")

REGIONS = {
    "sidebar": (0, 0, 263, 992),
    "header": (263, 0, 1586, 80),
    "kpi row": (280, 88, 1570, 188),
    "crop health": (280, 203, 1063, 575),
    "farm today + mandi": (1075, 203, 1568, 575),
    "chart": (280, 588, 718, 876),
    "quick actions": (730, 588, 1063, 876),
    "schemes + marketplace": (1075, 588, 1568, 876),
    "system flow": (280, 886, 1568, 992),
}
print(f"{'region':24} mean |diff| (0-255)")
for name, box in REGIONS.items():
    m = ImageStat.Stat(diff.crop(box).convert("L")).mean[0]
    print(f"{name:24} {m:6.1f}")
print(f"{'whole frame':24} {ImageStat.Stat(diff.convert('L')).mean[0]:6.1f}")
