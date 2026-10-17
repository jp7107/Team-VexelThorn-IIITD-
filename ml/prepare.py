"""ML-01: verify the PlantVillage MVP classes, group leakage-prone images, and write a group-level split.

Groups (images that must land in the same split) are the union of:
  1. the dataset's own leaf grouping (`leaf-map.json`, same logic as the official HF loader `plant_village.py`),
  2. byte-identical files (sha256),
  3. near-duplicates within a class (64-bit difference hash, Hamming distance <= --hash-threshold).
Byte-identical files filed under different classes are label conflicts and are excluded.

Usage (from repo root; data paths are arguments, the script never runs from inside the data folder):
  python -I ml/prepare.py --data ml/data/plantvillage --labels backend/app/ml/labels.json --out ml/splits
"""

import argparse
import csv
import hashlib
import io
import json
import random
import sys
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

SPLITS = ("train", "val", "test")
RATIOS = (0.70, 0.15, 0.15)
IMAGE_EXTS = {".jpg", ".jpeg", ".png"}


class UnionFind:
    def __init__(self, n: int):
        self.parent = list(range(n))

    def find(self, i: int) -> int:
        while self.parent[i] != i:
            self.parent[i] = self.parent[self.parent[i]]
            i = self.parent[i]
        return i

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[max(ra, rb)] = min(ra, rb)


def leaf_id(class_dir: str, file_name: str, leaf_map: dict) -> str | None:
    """Same normalisation as the official loader (plant_village.py, _generate_examples). None = not in the map."""
    ident = file_name.replace("_final_masked", "")
    if "___" in ident:
        ident = ident.split("___")[-1]
    ident = ident.split("copy")[0]
    for ext in (".jpg", ".JPG", ".png", ".PNG"):
        ident = ident.replace(ext, "")
    suggestions = leaf_map.get(ident.strip().lower())
    if not suggestions:
        return None
    if len(suggestions) == 1:
        return suggestions[0]
    return next((s for s in suggestions if class_dir in s), None)


def dhash(img: Image.Image) -> int:
    """64-bit difference hash: is each pixel brighter than its right neighbour on a 9x8 grayscale thumbnail."""
    px = np.asarray(img.convert("L").resize((9, 8), Image.Resampling.LANCZOS), dtype=np.int16)
    bits = (px[:, 1:] > px[:, :-1]).flatten()
    return int(np.packbits(bits).view(">u8")[0])


def inspect(path: Path) -> dict:
    raw = path.read_bytes()
    rec = {"sha256": hashlib.sha256(raw).hexdigest(), "ok": False}
    try:
        with Image.open(io.BytesIO(raw)) as img:
            img.load()
            rec.update(ok=True, size=img.size, mode=img.mode, dhash=dhash(img))
    except Exception as e:  # unreadable / truncated file: excluded and reported
        rec["error"] = type(e).__name__
    return rec


def near_duplicate_pairs(hashes: np.ndarray, threshold: int) -> list[tuple[int, int]]:
    """All index pairs with Hamming distance <= threshold. O(n^2) but vectorised; fine for a few thousand per class."""
    pairs = []
    for i in range(len(hashes) - 1):
        dist = np.bitwise_count(hashes[i] ^ hashes[i + 1:])
        pairs.extend((i, i + 1 + int(j)) for j in np.nonzero(dist <= threshold)[0])
    return pairs


def split_groups(groups_by_class: dict[str, dict[int, int]], seed: int) -> dict[int, str]:
    """Assigns whole groups to splits per class, greedily filling whichever split is furthest below its target."""
    rng = random.Random(seed)
    assignment = {}
    for cls in sorted(groups_by_class):
        sizes = groups_by_class[cls]  # group_id -> image count
        total = sum(sizes.values())
        targets = [r * total for r in RATIOS]
        filled = [0, 0, 0]
        order = sorted(sizes)
        rng.shuffle(order)
        for gid in order:
            k = max(range(3), key=lambda s: (targets[s] - filled[s]) / targets[s])
            assignment[gid] = SPLITS[k]
            filled[k] += sizes[gid]
    return assignment


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--labels", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--hash-threshold", type=int, default=4)
    args = ap.parse_args()

    labels = json.loads(args.labels.read_text(encoding="utf-8"))["classes"]
    leaf_map = json.loads((args.data / "leaf-map.json").read_text(encoding="utf-8"))
    color = args.data / "raw" / "color"

    files: list[tuple[str, str, Path]] = []  # (class_code, class_dir, path)
    missing_dirs = []
    for c in labels:
        d = color / c["plantvillage_dir"]
        if not d.is_dir():
            missing_dirs.append(c["plantvillage_dir"])
            continue
        files += [(c["code"], c["plantvillage_dir"], p) for p in sorted(d.iterdir()) if p.suffix.lower() in IMAGE_EXTS]
    if missing_dirs:
        sys.exit(f"Class folders missing from the download: {missing_dirs}")

    with ThreadPoolExecutor(max_workers=8) as pool:
        recs = list(pool.map(inspect, (p for _, _, p in files)))

    bad = [(str(p.relative_to(args.data)), r["error"]) for (_, _, p), r in zip(files, recs) if not r["ok"]]
    keep = [i for i, r in enumerate(recs) if r["ok"]]
    uf = UnionFind(len(files))

    # 1. Dataset leaf grouping.
    leaf_ids = {i: leaf_id(files[i][1], files[i][2].name, leaf_map) for i in keep}
    first_by_leaf: dict[str, int] = {}
    for i in keep:
        if leaf_ids[i] is not None:
            uf.union(first_by_leaf.setdefault(leaf_ids[i], i), i)

    # 2. Byte-identical files; the same bytes under two classes is a label conflict.
    by_sha = defaultdict(list)
    for i in keep:
        by_sha[recs[i]["sha256"]].append(i)
    conflicts = set()
    exact_dupes = 0
    for idx in by_sha.values():
        if len(idx) > 1:
            exact_dupes += len(idx) - 1
            if len({files[i][0] for i in idx}) > 1:
                conflicts.update(idx)
            for i in idx[1:]:
                uf.union(idx[0], i)

    # 3. Near-duplicates within each class.
    by_class = defaultdict(list)
    for i in keep:
        by_class[files[i][0]].append(i)
    near_pairs = 0
    for idx in by_class.values():
        hashes = np.array([recs[i]["dhash"] for i in idx], dtype=np.uint64)
        for a, b in near_duplicate_pairs(hashes, args.hash_threshold):
            uf.union(idx[a], idx[b])
            near_pairs += 1

    usable = [i for i in keep if i not in conflicts]
    group_of = {i: uf.find(i) for i in usable}
    groups_by_class: dict[str, Counter] = defaultdict(Counter)
    for i in usable:
        groups_by_class[files[i][0]][group_of[i]] += 1
    split_of_group = split_groups(groups_by_class, args.seed)

    # Invariants: every group in exactly one split and one class, every class present in every split.
    classes_per_group = defaultdict(set)
    for i in usable:
        classes_per_group[group_of[i]].add(files[i][0])
    assert all(len(s) == 1 for s in classes_per_group.values()), "a group spans classes"
    counts = Counter((files[i][0], split_of_group[group_of[i]]) for i in usable)
    for c in labels:
        for s in SPLITS:
            assert counts[(c["code"], s)] > 0, f"{c['code']} has no {s} images"

    args.out.mkdir(parents=True, exist_ok=True)
    with open(args.out / "manifest.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["path", "sha256", "class_code", "split", "group", "leaf_id"])
        for i in usable:
            w.writerow([files[i][2].relative_to(args.data).as_posix(), recs[i]["sha256"], files[i][0],
                        split_of_group[group_of[i]], group_of[i], leaf_ids[i] or ""])

    head = (args.data / ".git" / "HEAD")
    group_sizes = Counter(Counter(group_of.values()).values())
    summary = {
        "source": "https://github.com/spMohanty/PlantVillage-Dataset (raw/color)",
        "source_commit": head.read_text().strip() if head.exists() else "unknown",
        "seed": args.seed,
        "ratios": dict(zip(SPLITS, RATIOS)),
        "hash_threshold": args.hash_threshold,
        "files_found": len(files),
        "unreadable": bad,
        "image_sizes": {f"{w}x{h}": n for (w, h), n in Counter(recs[i]["size"] for i in keep).most_common()},
        "image_modes": dict(Counter(recs[i]["mode"] for i in keep)),
        "with_leaf_id": sum(1 for i in keep if leaf_ids[i] is not None),
        "without_leaf_id": sum(1 for i in keep if leaf_ids[i] is None),
        "exact_duplicate_files": exact_dupes,
        "cross_class_conflicts_excluded": len(conflicts),
        "near_duplicate_pairs": near_pairs,
        "images_used": len(usable),
        "groups": len(set(group_of.values())),
        "largest_group": max(Counter(group_of.values()).values()),
        "group_size_histogram": {str(k): v for k, v in sorted(group_sizes.items())},
        "per_class": {c["code"]: {s: counts[(c["code"], s)] for s in SPLITS} for c in labels},
        "per_split": {s: sum(counts[(c["code"], s)] for c in labels) for s in SPLITS},
    }
    (args.out / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps({k: summary[k] for k in ("files_found", "images_used", "groups", "largest_group",
                                               "with_leaf_id", "exact_duplicate_files", "near_duplicate_pairs",
                                               "cross_class_conflicts_excluded", "per_split")}, indent=2))
    if bad:
        print(f"{len(bad)} unreadable files excluded, see summary.json")


if __name__ == "__main__":
    main()
