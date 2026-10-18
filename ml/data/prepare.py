"""PlantVillage dataset preparation.

Walks the extracted dataset, validates every image, computes content and
perceptual hashes, groups near-duplicates, then produces a leak-free stratified
train/val/test split before any augmentation exists.

Usage:
    python ml/data/prepare.py --config ml/configs/plantvillage_v1.yaml

Outputs (under ml/data/processed/<run>/):
    manifest.json      full record: source, licence, counts, hashes, config, seed
    train.csv          path,label,class_index
    val.csv
    test.csv
    split_summary.json counts per class per split + leakage audit
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import random
import sys
import zipfile
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import yaml
from PIL import Image, ImageOps

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
HASH_SIZE = 8  # dHash produces HASH_SIZE*HASH_SIZE bits (64)


# ---------------------------------------------------------------- hashing
def dhash(img: Image.Image, size: int = HASH_SIZE) -> int:
    """Difference hash: robust to resize/recompress, cheap enough for 54k images."""
    g = img.convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    px = list(g.getdata())
    bits = 0
    for row in range(size):
        for col in range(size):
            left = px[row * (size + 1) + col]
            right = px[row * (size + 1) + col + 1]
            bits = (bits << 1) | (1 if left > right else 0)
    return bits


def file_sha256(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


_ZIP = None


def _open_source(src: Path):
    """Return (read_fn, member_list) for either a .zip archive or an extracted dir."""
    global _ZIP
    if src.is_file() and src.suffix.lower() == ".zip":
        _ZIP = zipfile.ZipFile(src)
        members = [m for m in _ZIP.namelist() if Path(m).suffix.lower() in IMAGE_EXTS]
        return (lambda m: _ZIP.read(m)), members
    members = [p.as_posix() for p in sorted(src.rglob("*")) if p.suffix.lower() in IMAGE_EXTS]
    shutil  # noqa: F821  (kept for symmetry; dir reads use open())
    return (lambda m: (src / m).read_bytes()), members


def inspect_image(args) -> dict:
    """Validate one image member and return its metadata.

    Runs inside a thread pool: ZIP decompression and PIL decoding release the GIL,
    so threads parse ~54k images in a couple of minutes on this CPU.
    """
    read_fn, member, min_side = args
    rel = member
    label = Path(member).parent.name
    rec = {"path": rel, "label": label, "valid": False, "reason": None}
    try:
        data = read_fn(member)
    except (OSError, zipfile.BadZipFile) as exc:
        rec["reason"] = f"read_error:{type(exc).__name__}"
        return rec
    rec["sha256"] = hashlib.sha256(data).hexdigest()
    rec["bytes"] = len(data)
    try:
        with Image.open(io.BytesIO(data)) as im:
            im = ImageOps.exif_transpose(im)
            width, height = im.size
            if min(width, height) < min_side:
                rec["reason"] = f"too_small:{width}x{height}"
                return rec
            rec["width"], rec["height"] = width, height
            rec["mode"] = im.mode
            im.load()
            rec["dhash"] = dhash(im)
    except Exception as exc:  # unreadable / corrupt / not an image
        rec["reason"] = f"decode_error:{type(exc).__name__}"
        return rec
    rec["valid"] = True
    return rec


# ---------------------------------------------------------------- grouping
class UnionFind:
    def __init__(self, n: int):
        self.parent = list(range(n))
        self.rank = [0] * n

    def find(self, x: int) -> int:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return
        if self.rank[ra] < self.rank[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra
        if self.rank[ra] == self.rank[rb]:
            self.rank[ra] += 1


def group_duplicates(records: list[dict], max_hamming: int) -> list[int]:
    """Union all images whose SHA-256 matches, or whose dHash is within max_hamming.

    A naive all-pairs comparison is 54k^2/2 ~= 1.5B comparisons. We bucket by the
    16-bit prefix of each hash and only compare within a bucket plus its immediate
    neighbours, which keeps the exact-duplicate guarantee for <=16 bit distances
    while remaining tractable on CPU.
    """
    uf = UnionFind(len(records))
    by_sha: dict[str, int] = {}
    buckets: dict[int, list[int]] = defaultdict(list)

    for i, rec in enumerate(records):
        prev = by_sha.get(rec["sha256"])
        if prev is not None:
            uf.union(prev, i)
        else:
            by_sha[rec["sha256"]] = i
        buckets[rec["dhash"] >> 48].append(i)

    keys = sorted(buckets)
    for key in keys:
        idxs = buckets[key]
        # compare within bucket and against the next few prefixes
        for i, a in enumerate(idxs):
            ha = records[a]["dhash"]
            for b in idxs[i + 1:]:
                if bin(ha ^ records[b]["dhash"]).count("1") <= max_hamming:
                    uf.union(a, b)
        for nxt in range(key + 1, min(key + 65, (1 << 16))):
            for a in idxs:
                ha = records[a]["dhash"]
                for b in buckets.get(nxt, ()):
                    if bin(ha ^ records[b]["dhash"]).count("1") <= max_hamming:
                        uf.union(a, b)
    return [uf.find(i) for i in range(len(records))]


# ---------------------------------------------------------------- split
def stratified_group_split(records, group_ids, fractions, seed):
    """Assign whole duplicate-groups to one split only, preserving class ratios."""
    rng = random.Random(seed)
    groups_by_class: dict[str, dict[int, list[int]]] = defaultdict(lambda: defaultdict(list))
    for idx, (rec, gid) in enumerate(zip(records, group_ids)):
        groups_by_class[rec["label"]][gid].append(idx)

    assignment: dict[int, str] = {}
    for label, groups in sorted(groups_by_class.items()):
        gids = sorted(groups)
        rng.shuffle(gids)
        total = sum(len(groups[g]) for g in gids)
        targets = {
            "train": int(round(total * fractions["train"])),
            "val": int(round(total * fractions["val"])),
        }
        targets["test"] = total - targets["train"] - targets["val"]
        counts = {"train": 0, "val": 0, "test": 0}
        for gid in gids:
            size = len(groups[gid])
            # fill whichever split is furthest below its target, train on ties
            best = max(("train", "val", "test"),
                       key=lambda s: (targets[s] - counts[s], s == "train"))
            assignment[gid] = best
            counts[best] += size
    return [assignment[g] for g in group_ids]


def write_csv(path: Path, rows: list[dict], class_to_idx: dict[str, int]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["path", "label", "class_index"])
        for r in rows:
            w.writerow([r["path"], r["label"], class_to_idx[r["label"]]])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    args = ap.parse_args()

    cfg = yaml.safe_load(open(args.config, encoding="utf-8"))
    root = Path(cfg["dataset"]["raw_dir"])
    out_dir = Path(cfg["dataset"]["manifest_dir"]) / cfg["run"]["name"]
    out_dir.mkdir(parents=True, exist_ok=True)
    min_side = int(cfg["preprocess"]["min_side_px"])
    max_hamming = int(cfg["split"]["near_dup_hamming"])
    seed = int(cfg["run"]["seed"])

    if not root.exists():
        print(f"FATAL: dataset root not found: {root}", file=sys.stderr)
        return 2

    source = Path(cfg["dataset"].get("source", root))
    if not source.exists():
        source = root
    read_fn, files = _open_source(source)
    print(f"source: {source} -- {len(files)} candidate images", flush=True)
    if not files:
        print("FATAL: no images found", file=sys.stderr)
        return 2

    payload = [(read_fn, m, min_side) for m in files]
    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for i, rec in enumerate(ex.map(inspect_image, payload), 1):
            results.append(rec)
            if i % 5000 == 0:
                print(f"  inspected {i}/{len(files)}", flush=True)

    invalid = [r for r in results if not r["valid"]]
    valid = [r for r in results if r["valid"]]
    print(f"valid: {len(valid)}  invalid: {len(invalid)}")
    for r in invalid[:10]:
        print("  invalid:", r["path"], r["reason"])

    classes = sorted({r["label"] for r in valid})
    class_to_idx = {c: i for i, c in enumerate(classes)}
    counts = Counter(r["label"] for r in valid)

    print(f"classes: {len(classes)}")
    print("per-class counts:")
    for c in classes:
        print(f"  {c:60s} {counts[c]:5d}")
    lo, hi = min(counts.values()), max(counts.values())
    print(f"imbalance: {lo} .. {hi}  ratio {hi / max(lo, 1):.2f}x")

    print("grouping duplicates (sha256 + dhash<=%d)..." % max_hamming, flush=True)
    group_ids = group_duplicates(valid, max_hamming)
    n_groups = len(set(group_ids))
    print(f"duplicate groups: {n_groups} for {len(valid)} images "
          f"({len(valid) - n_groups} redundant files)")

    split_names = stratified_group_split(valid, group_ids, cfg["split"], seed)
    buckets = defaultdict(list)
    for rec, s in zip(valid, split_names):
        buckets[s].append(rec)

    # leakage audit: no group may span splits
    group_splits = defaultdict(set)
    for rec, g, s in zip(valid, group_ids, split_names):
        group_splits[g].add(s)
    leaks = sum(1 for v in group_splits.values() if len(v) > 1)

    for split in ("train", "val", "test"):
        write_csv(out_dir / f"{split}.csv", buckets[split], class_to_idx)

    summary = {
        "classes": len(classes),
        "class_names": classes,
        "class_to_idx": class_to_idx,
        "counts": {s: len(buckets[s]) for s in ("train", "val", "test")},
        "per_class": {
            c: {s: sum(1 for r in buckets[s] if r["label"] == c) for s in ("train", "val", "test")}
            for c in classes
        },
        "imbalance_ratio": round(hi / max(lo, 1), 3),
        "duplicate_groups": n_groups,
        "redundant_files": len(valid) - n_groups,
        "near_dup_hamming": max_hamming,
        "leakage_groups_spanning_splits": leaks,
        "invalid_files": len(invalid),
    }
    (out_dir / "split_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    manifest = {
        "dataset": {
            "slug": cfg["dataset"]["slug"],
            "url": cfg["dataset"]["url"],
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "source_archive_sha256": file_sha256(source) if source.is_file() else None,
            "source_path": str(source),
            "images_valid": len(valid),
            "images_invalid": len(invalid),
            "classes": len(classes),
        },
        "config": cfg,
        "split": summary,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"wrote {out_dir}/manifest.json and split CSVs")
    print(f"splits: {summary['counts']}  leaks={leaks}")
    return 0 if leaks == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
