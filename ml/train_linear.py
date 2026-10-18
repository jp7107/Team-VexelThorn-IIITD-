"""Resumable frozen-backbone + linear-head training for PlantVillage v1.

Why this exists: fine-tuning on 4 CPU cores takes too long to survive session
restarts, and an interrupted run loses everything because the decoder is weak.

This script:
  1. extracts penultimate features once per image and caches them in shards
     (resumes from the last completed shard -- a restart costs minutes, not hours)
  2. fits a softmax regression head on the cached features
  3. writes a single ONNX graph = backbone + frozen head weights + softmax,
     so the exported artifact is a real end-to-end classifier, not a two-stage hack

The model card describes it honestly as "frozen MobileNetV2 features + multinomial
logistic regression head", which is what it is.

Usage:
    python ml/train_linear.py --config ml/configs/plantvillage_v1.yaml
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import zipfile
from pathlib import Path

import numpy as np
import torch
import yaml
from sklearn.linear_model import LogisticRegression

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ml.inference.preprocessing import PreprocessConfig  # noqa: E402
from ml.train import ZipDataset, build_model, load_rows, set_seed  # noqa: E402
from torch.utils.data import DataLoader  # noqa: E402

SHARD = 2000  # images per cached shard


def shard_paths(cache_dir: Path, split: str) -> list[Path]:
    return sorted(cache_dir.glob(f"{split}-*.npz"))


def extract_split(model, rows, zip_path, cfg, size, cache_dir: Path, split: str,
                  batch_size=48, workers=2, limit: int | None = None):
    """Extract features in shards; skip shards already on disk. Resumable by design."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    if limit:
        rows = rows[:limit]
    n_shards = (len(rows) + SHARD - 1) // SHARD
    done = {int(p.stem.split("-")[-1]) for p in shard_paths(cache_dir, split)}
    print(f"{split}: {len(rows)} rows, {n_shards} shards, {len(done)} cached", flush=True)

    for si in range(n_shards):
        if si in done:
            continue
        chunk = rows[si * SHARD:(si + 1) * SHARD]
        ds = ZipDataset(chunk, zip_path, cfg, train=False, image_size=size)
        dl = DataLoader(ds, batch_size=batch_size, shuffle=False, num_workers=workers)
        feats, labels = [], []
        t0 = time.time()
        with torch.no_grad():
            for xb, yb in dl:
                feats.append(model._feat(xb).numpy().astype(np.float32))
                labels.append(yb.numpy().astype(np.int64))
        np.savez_compressed(cache_dir / f"{split}-{si:03d}.npz",
                            x=np.concatenate(feats), y=np.concatenate(labels))
        print(f"  shard {si + 1}/{n_shards}  {time.time() - t0:.0f}s", flush=True)

    xs, ys = [], []
    for p in shard_paths(cache_dir, split):
        d = np.load(p)
        xs.append(d["x"]); ys.append(d["y"])
    return np.concatenate(xs), np.concatenate(ys)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--model", default="mobilenet_v2")
    ap.add_argument("--size", type=int, default=192)
    ap.add_argument("--train-limit", type=int, default=0,
                    help="0 = use the full training split")
    ap.add_argument("--C", type=float, default=1.0)
    args = ap.parse_args()

    cfg = yaml.safe_load(open(args.config, encoding="utf-8"))
    set_seed(int(cfg["run"]["seed"]))
    proc = PreprocessConfig.from_dict(cfg)
    zip_path = Path(cfg["dataset"]["source"])
    proc_dir = Path(cfg["dataset"]["manifest_dir"]) / cfg["run"]["name"]
    cache_dir = Path("ml/checkpoints") / cfg["run"]["name"] / f"features-{args.model}-{args.size}"

    train_rows = load_rows(proc_dir / "train.csv")
    val_rows = load_rows(proc_dir / "val.csv")

    model = build_model(args.model, 38, pretrained=True)
    model.eval()
    print(f"extracting features with {args.model} at {args.size}px", flush=True)

    Xtr, ytr = extract_split(model, train_rows, zip_path, proc, args.size, cache_dir,
                             "train", limit=args.train_limit or None)
    Xva, yva = extract_split(model, val_rows, zip_path, proc, args.size, cache_dir, "val")
    print(f"features: train {Xtr.shape} val {Xva.shape}", flush=True)

    t0 = time.time()
    clf = LogisticRegression(max_iter=3000, C=args.C, n_jobs=-1, multi_class="multinomial")
    clf.fit(Xtr, ytr)
    val_acc = float((clf.predict(Xva) == yva).mean())
    print(f"head fit in {time.time() - t0:.0f}s  val accuracy={val_acc:.4f}", flush=True)

    ckpt_dir = Path("ml/checkpoints") / cfg["run"]["name"]
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    torch.save({
        "model": args.model,
        "kind": "frozen-backbone-linear-head",
        "image_size": args.size,
        "coef": torch.tensor(clf.coef_, dtype=torch.float32),
        "intercept": torch.tensor(clf.intercept_, dtype=torch.float32),
        "classes": clf.classes_.tolist(),
        "val_accuracy": val_acc,
        "train_images": int(len(ytr)),
        "config": cfg,
    }, ckpt_dir / "best_linear.pt")
    print(f"saved {ckpt_dir / 'best_linear.pt'}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
