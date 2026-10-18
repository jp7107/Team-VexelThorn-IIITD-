"""Evaluate the trained checkpoint on the held-out test split.

This script is the only source of reported metrics. It refuses to run if the test
split is missing. Threshold calibration (temperature + confidence policy) is fit
on the *validation* split and frozen before the test set is touched.

Usage:
    python ml/evaluate.py --config ml/configs/plantvillage_v1.yaml \
        --checkpoint ml/checkpoints/plantvillage_v1/best.pt
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import torch
import yaml
from sklearn.metrics import (accuracy_score, confusion_matrix,
                             precision_recall_fscore_support)
from torch.utils.data import DataLoader

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ml.inference.preprocessing import PreprocessConfig  # noqa: E402
from ml.train import ZipDataset, build_model, load_rows, set_seed  # noqa: E402


def logits_for(model, rows, zip_path, cfg, image_size, batch_size, workers):
    ds = ZipDataset(rows, zip_path, cfg, train=False, image_size=image_size)
    dl = DataLoader(ds, batch_size=batch_size, shuffle=False, num_workers=workers)
    out, ys = [], []
    with torch.no_grad():
        for xb, yb in dl:
            out.append(model(xb).numpy())
            ys.append(yb.numpy())
    return np.concatenate(out), np.concatenate(ys)


def softmax(z: np.ndarray) -> np.ndarray:
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def fit_temperature(logits: np.ndarray, y: np.ndarray) -> float:
    """Fit a single temperature on validation NLL. Guards against overfitting by bisection."""
    import torch.nn.functional as F

    z = torch.tensor(logits, dtype=torch.float32)
    t = torch.tensor(y, dtype=torch.long)

    def nll(temp: float) -> float:
        return float(F.cross_entropy(z / temp, t).item())

    lo, hi = 0.5, 5.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if nll(mid) < nll(mid + 1e-3):
            hi = mid
        else:
            lo = mid
    return round((lo + hi) / 2, 4)


def expected_calibration_error(probs: np.ndarray, correct: np.ndarray, bins: int = 15):
    conf = probs.max(axis=1)
    edges = np.linspace(0, 1, bins + 1)
    ece, rows = 0.0, []
    for i in range(bins):
        m = (conf > edges[i]) & (conf <= edges[i + 1])
        if not m.any():
            continue
        acc = float(correct[m].mean())
        avg_conf = float(conf[m].mean())
        ece += abs(acc - avg_conf) * m.mean()
        rows.append({"bin": f"{edges[i]:.2f}-{edges[i+1]:.2f}", "n": int(m.sum()),
                     "accuracy": round(acc, 4), "confidence": round(avg_conf, 4)})
    return round(float(ece), 4), rows


def tune_thresholds(val_probs, val_correct, grid_high, grid_margin):
    """Pick (p_high, margin) on validation only.

    Objective: maximise agreement with 'a correct confident call or an honest
    uncertain call' -- we weight a confident-wrong call as the worst outcome,
    matching plan §8.8's conservative stance.
    """
    best = None
    for high in grid_high:
        for margin in grid_margin:
            conf = (val_probs.max(1) >= high)
            # the top-2 margin is computed from the top two probabilities
            srt = np.sort(val_probs, axis=1)
            m_ok = (srt[:, -1] - srt[:, -2]) >= margin
            call_confident = conf & m_ok
            correct_conf = (call_confident & val_correct).sum()
            wrong_conf = (call_confident & ~val_correct).sum()
            score = correct_conf - 3 * wrong_conf
            if best is None or score > best[0]:
                best = (score, high, margin, int(call_confident.sum()))
    _, high, margin, n_conf = best
    return round(float(high), 2), round(float(margin), 2), n_conf


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    cfg = yaml.safe_load(open(args.config, encoding="utf-8"))
    set_seed(int(cfg["run"]["seed"]))
    proc_dir = Path(cfg["dataset"]["manifest_dir"]) / cfg["run"]["name"]
    test_csv = proc_dir / "test.csv"
    if not test_csv.exists():
        print(f"FATAL: {test_csv} missing; refusing to evaluate", file=sys.stderr)
        return 2

    ckpt = torch.load(args.checkpoint, map_location="cpu", weights_only=False)
    name = ckpt["model"]
    image_size = int(ckpt.get("image_size", cfg["preprocess"]["image_size"]))

    model = build_model(name, len(ckpt["class_names"]), pretrained=False)
    model.load_state_dict(ckpt["state_dict"])
    model.eval()

    zip_path = Path(cfg["dataset"]["source"])
    proc = PreprocessConfig.from_dict(cfg)
    val_rows = load_rows(proc_dir / "val.csv")
    test_rows = load_rows(test_csv)

    print(f"evaluating {name} on {len(test_rows)} test images at {image_size}px")
    v_logits, v_y = logits_for(model, val_rows, zip_path, proc, image_size,
                               cfg["train"]["batch_size"], cfg["train"]["num_workers"])
    t_logits, t_y = logits_for(model, test_rows, zip_path, proc, image_size,
                               cfg["train"]["batch_size"], cfg["train"]["num_workers"])

    temperature = fit_temperature(v_logits, v_y)
    v_probs = softmax(v_logits / temperature)
    v_correct = v_probs.argmax(1) == v_y
    high, margin, n_conf = tune_thresholds(
        v_probs, v_correct, [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9],
        [0.05, 0.1, 0.15, 0.2, 0.25, 0.3])
    ece_val, rel_val = expected_calibration_error(v_probs, v_correct)

    probs = softmax(t_logits / temperature)
    pred = probs.argmax(1)
    correct = pred == t_y
    labels = list(range(len(ckpt["class_names"])))
    p, r, f1, support = precision_recall_fscore_support(
        t_y, pred, labels=labels, zero_division=0, average=None)
    macro = precision_recall_fscore_support(t_y, pred, average="macro", zero_division=0)
    acc = float(accuracy_score(t_y, pred))
    top3 = float(np.mean([t_y[i] in np.argsort(probs[i])[::-1][:3] for i in range(len(t_y))]))
    ece, rel = expected_calibration_error(probs, correct)

    cm = confusion_matrix(t_y, pred, labels=labels)
    confusions = []
    for i in range(len(labels)):
        for j in range(len(labels)):
            if i != j and cm[i, j] > 0:
                confusions.append({"true": ckpt["class_names"][i],
                                   "predicted": ckpt["class_names"][j],
                                   "count": int(cm[i, j])})
    confusions.sort(key=lambda x: -x["count"])

    result = {
        "model": name,
        "checkpoint": args.checkpoint,
        "temperature": temperature,
        "thresholds": {"p_max_confident": high, "margin_confident": margin,
                       "p_max_unsupported": 0.35, "version": "policy-v1-valset"},
        "val_confident_coverage": round(n_conf / len(v_y), 4),
        "test": {
            "n": int(len(t_y)),
            "accuracy": round(acc, 4),
            "macro_precision": round(float(macro[0]), 4),
            "macro_recall": round(float(macro[1]), 4),
            "macro_f1": round(float(macro[2]), 4),
            "top3_accuracy": round(top3, 4),
            "ece": ece,
            "per_class": [
                {"class": ckpt["class_names"][i], "precision": round(float(p[i]), 4),
                 "recall": round(float(r[i]), 4), "f1": round(float(f1[i]), 4),
                 "support": int(support[i])}
                for i in labels],
            "top_confusions": confusions[:10],
            "confusion_matrix": cm.tolist(),
        },
        "calibration": {"ece_val": ece_val, "reliability_val": rel_val,
                        "reliability_test": rel},
    }
    out = Path(args.out or (proc_dir / "evaluation.json"))
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")

    print(f"\nTEST  n={len(t_y)}")
    print(f"  accuracy      {acc:.4f}")
    print(f"  macro-F1      {macro[2]:.4f}")
    print(f"  macro-P/R     {macro[0]:.4f} / {macro[1]:.4f}")
    print(f"  top-3         {top3:.4f}")
    print(f"  ECE (test)    {ece:.4f}   temperature={temperature}")
    print(f"  thresholds    p_max>={high}, margin>={margin}")
    worst = sorted(result["test"]["per_class"], key=lambda x: x["recall"])[:5]
    print("  lowest-recall classes:",
          ", ".join(f"{w['class']}={w['recall']}" for w in worst))
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
