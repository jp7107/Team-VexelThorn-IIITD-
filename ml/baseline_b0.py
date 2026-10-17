"""ML-02: baseline B0 = frozen ImageNet MobileNetV2 embeddings + logistic regression (CPU-feasible, plan §9.3).

Trains on the `train` split and reports on `val`. The `test` split is never read here: plan §9.6 reserves it
for one evaluation of the final 1-2 candidates. Embeddings are cached for the SVM/RF/XGBoost candidates (16b-18b).

Usage (from repo root):
  python -I ml/baseline_b0.py --data ml/data/plantvillage --manifest ml/splits/manifest.csv --runs ml/runs \
      --cache ml/data/embeddings [--limit 500]   # --limit: timing sample only, writes no run
"""

import argparse
import csv
import hashlib
import json
import os
import platform
import time
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import sklearn
import torch
import torchvision
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from torch.utils.data import DataLoader, Dataset
from torchvision.models import MobileNet_V2_Weights, mobilenet_v2

WEIGHTS = MobileNet_V2_Weights.IMAGENET1K_V2
BACKBONE = "mobilenet_v2/IMAGENET1K_V2"


class Images(Dataset):
    def __init__(self, root: Path, paths: list[str]):
        self.root, self.paths, self.tf = root, paths, WEIGHTS.transforms()

    def __len__(self):
        return len(self.paths)

    def __getitem__(self, i):
        with Image.open(self.root / self.paths[i]) as img:
            return self.tf(img.convert("RGB"))


@torch.inference_mode()
def embed(root: Path, paths: list[str], batch: int, workers: int) -> tuple[np.ndarray, float]:
    model = mobilenet_v2(weights=WEIGHTS)
    model.classifier = torch.nn.Identity()  # keep the 1280-d pooled features
    model.eval()
    loader = DataLoader(Images(root, paths), batch_size=batch, num_workers=workers)
    start, out = time.perf_counter(), []
    for i, x in enumerate(loader):
        out.append(model(x).numpy())
        if i % 20 == 0:
            print(f"  embedded {min((i + 1) * batch, len(paths))}/{len(paths)}", flush=True)
    return np.concatenate(out).astype(np.float32), time.perf_counter() - start


def ece(probs: np.ndarray, y: np.ndarray, bins: int = 15) -> float:
    """Expected calibration error of the top-1 probability (plan §9.6)."""
    conf, pred = probs.max(1), probs.argmax(1)
    edges = np.linspace(0, 1, bins + 1)
    total = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            total += m.mean() * abs((pred[m] == y[m]).mean() - conf[m].mean())
    return float(total)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--manifest", type=Path, required=True)
    ap.add_argument("--runs", type=Path, required=True)
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--batch", type=int, default=64)
    # Measured on a 28-thread i7: 0 workers + 14 threads = 70 img/s vs 15.6 with 6 workers (Windows spawn cost).
    ap.add_argument("--workers", type=int, default=0)
    ap.add_argument("--threads", type=int, default=max(1, (os.cpu_count() or 2) // 2))
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    torch.set_num_threads(args.threads)

    rows = [r for r in csv.DictReader(open(args.manifest, encoding="utf-8")) if r["split"] in ("train", "val")]
    if args.limit:
        sample = [rows[i] for i in np.random.default_rng(0).choice(len(rows), args.limit, replace=False)]
        _, secs = embed(args.data, [r["path"] for r in sample], args.batch, args.workers)
        print(f"timing sample: {args.limit} images in {secs:.1f}s = {args.limit / secs:.1f} img/s; "
              f"full train+val ({len(rows)}) ~ {len(rows) / (args.limit / secs) / 60:.1f} min")
        return

    manifest_sha = hashlib.sha256(args.manifest.read_bytes()).hexdigest()[:16]
    cache = args.cache / f"mobilenet_v2_IMAGENET1K_V2_{manifest_sha}.npz"
    if cache.exists():
        z = np.load(cache, allow_pickle=False)
        X, paths, embed_secs = z["X"], list(z["paths"]), float(z["seconds"])
        assert paths == [r["path"] for r in rows], "embedding cache does not match manifest"
        print(f"loaded cached embeddings {cache}")
    else:
        paths = [r["path"] for r in rows]
        X, embed_secs = embed(args.data, paths, args.batch, args.workers)
        args.cache.mkdir(parents=True, exist_ok=True)
        np.savez(cache, X=X, paths=np.array(paths), seconds=embed_secs)

    classes = sorted({r["class_code"] for r in rows})
    y = np.array([classes.index(r["class_code"]) for r in rows])
    split = np.array([r["split"] for r in rows])
    tr, va = split == "train", split == "val"

    clf = make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=3000, class_weight="balanced"))
    t0 = time.perf_counter()
    clf.fit(X[tr], y[tr])
    fit_secs = time.perf_counter() - t0

    probs = clf.predict_proba(X[va])
    pred = probs.argmax(1)
    p, r, f1, support = precision_recall_fscore_support(y[va], pred, labels=range(len(classes)), zero_division=0)
    mp, mr, mf1, _ = precision_recall_fscore_support(y[va], pred, average="macro", zero_division=0)

    run_id = f"b0-mnv2-logreg-{datetime.now():%Y%m%d-%H%M}"
    out = args.runs / run_id
    out.mkdir(parents=True)
    metrics = {
        "run_id": run_id,
        "candidate": "B0 (#1 MobileNetV2, frozen) + logistic regression",
        "evaluated_on": "val",
        "test_split_used": False,
        "n_train": int(tr.sum()), "n_val": int(va.sum()), "n_classes": len(classes),
        "accuracy": accuracy_score(y[va], pred),
        "macro_precision": mp, "macro_recall": mr, "macro_f1": mf1,
        "ece_15_bins": ece(probs, y[va]),
        "min_class_recall": float(r.min()), "min_recall_class": classes[int(r.argmin())],
        "embed_seconds_train_val": round(embed_secs, 1),
        "embed_images_per_second": round(len(rows) / embed_secs, 1),
        "fit_seconds": round(fit_secs, 1),
        "head_bytes": int(clf[-1].coef_.nbytes + clf[-1].intercept_.nbytes + clf[0].mean_.nbytes + clf[0].scale_.nbytes),
    }
    (out / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    (out / "config.json").write_text(json.dumps({
        "backbone": BACKBONE, "input": "WEIGHTS.transforms() (resize 232, center crop 224, ImageNet norm)",
        "features": "global-average-pooled 1280-d, frozen", "head": "StandardScaler + LogisticRegression(C=1.0, lbfgs, class_weight=balanced: class ratio ~35x, plan §9.1-6)",
        "manifest_sha256_16": manifest_sha, "batch": args.batch, "threads": args.threads}, indent=2), encoding="utf-8")
    with open(out / "per_class.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["class_code", "precision", "recall", "f1", "support"])
        for i, c in enumerate(classes):
            w.writerow([c, round(p[i], 4), round(r[i], 4), round(f1[i], 4), int(support[i])])
    with open(out / "confusion.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["true\\pred", *classes])
        for c, row in zip(classes, confusion_matrix(y[va], pred, labels=range(len(classes)))):
            w.writerow([c, *row])
    (out / "env.txt").write_text("\n".join([
        f"python {platform.python_version()}", f"torch {torch.__version__}", f"torchvision {torchvision.__version__}",
        f"sklearn {sklearn.__version__}", f"numpy {np.__version__}", f"cpu {platform.processor()}",
        f"threads {args.threads}", "device cpu (no GPU used)"]), encoding="utf-8")
    # The fitted head goes next to the cached embeddings (gitignored); ML-03 exports it with the backbone.
    joblib.dump({"pipeline": clf, "classes": classes, "backbone": BACKBONE}, args.cache / f"{run_id}_head.joblib")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
