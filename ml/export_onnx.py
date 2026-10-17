"""ML-03: export B0 (frozen MobileNetV2 + logistic head) as one ONNX graph for the backend.

Also fits temperature scaling and the plan §9.7 thresholds on the val split, checks that the backend's own
preprocessing + ONNX session reproduce the sklearn predictions, benchmarks CPU latency, and copies two val
images into backend/tests/fixtures. The test split is not used.

Usage (from repo root, ML venv: has torch + onnx):
  ml/.venv/Scripts/python -I ml/export_onnx.py --run b0-mnv2-logreg-20261017-1934 --data ml/data/plantvillage \
      --manifest ml/splits/manifest.csv --cache ml/data/embeddings --backend backend
"""

import argparse
import csv
import hashlib
import io
import json
import shutil
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import torch
from PIL import Image
from scipy.optimize import minimize_scalar
from torchvision.models import MobileNet_V2_Weights, mobilenet_v2

WEIGHTS = MobileNet_V2_Weights.IMAGENET1K_V2
TARGET_ACCEPT_PRECISION = 0.95  # plan §9.7
TARGET_FLOOR_ACCURACY = 0.70
MIN_FLOOR = 0.30  # never name a class below this, whatever val says
PARITY_SAMPLE = 400


def nll(logits: np.ndarray, y: np.ndarray, t: float) -> float:
    z = logits / t
    z = z - z.max(1, keepdims=True)
    logp = z - np.log(np.exp(z).sum(1, keepdims=True))
    return float(-logp[np.arange(len(y)), y].mean())


def calibrated(logits: np.ndarray, t: float) -> np.ndarray:
    z = logits / t
    e = np.exp(z - z.max(1, keepdims=True))
    return e / e.sum(1, keepdims=True)


def ece(probs: np.ndarray, y: np.ndarray, bins: int = 15) -> float:
    conf, pred = probs.max(1), probs.argmax(1)
    edges = np.linspace(0, 1, bins + 1)
    return float(sum(((conf > lo) & (conf <= hi)).mean()
                     * abs((pred[m] == y[m]).mean() - conf[m].mean())
                     for lo, hi in zip(edges[:-1], edges[1:])
                     if (m := (conf > lo) & (conf <= hi)).any()))


def thresholds(probs: np.ndarray, y: np.ndarray) -> tuple[float, float, dict]:
    conf, correct = probs.max(1), probs.argmax(1) == y
    grid = np.round(np.arange(0.30, 1.0, 0.01), 2)
    accept = next((float(t) for t in grid if correct[conf >= t].mean() >= TARGET_ACCEPT_PRECISION), 0.99)
    floor = next((float(t) for t in grid if correct[conf >= t].mean() >= TARGET_FLOOR_ACCURACY), MIN_FLOOR)
    floor = max(MIN_FLOOR, min(floor, accept))
    stats = {
        "accepted_share_of_val": float((conf >= accept).mean()),
        "accepted_precision_on_val": float(correct[conf >= accept].mean()),
        "below_floor_share_of_val": float((conf < floor).mean()),
    }
    return accept, floor, stats


class B0(torch.nn.Module):
    """MobileNetV2 features -> global average pool -> logistic head with the StandardScaler folded in."""

    def __init__(self, coef: np.ndarray, intercept: np.ndarray, mean: np.ndarray, scale: np.ndarray):
        super().__init__()
        backbone = mobilenet_v2(weights=WEIGHTS)
        self.features = backbone.features
        self.head = torch.nn.Linear(coef.shape[1], coef.shape[0])
        w = coef / scale  # (x - mean) / scale @ coef.T + b  ==  x @ (coef / scale).T + (b - coef @ (mean / scale))
        b = intercept - coef @ (mean / scale)
        self.head.weight.data = torch.tensor(w, dtype=torch.float32)
        self.head.bias.data = torch.tensor(b, dtype=torch.float32)

    def forward(self, x):
        x = torch.nn.functional.adaptive_avg_pool2d(self.features(x), 1).flatten(1)
        return self.head(x)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--manifest", type=Path, required=True)
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--backend", type=Path, required=True)
    args = ap.parse_args()
    run_dir = Path("ml/runs") / args.run

    head = joblib.load(args.cache / f"{args.run}_head.joblib")
    pipe, classes = head["pipeline"], head["classes"]
    scaler, clf = pipe[0], pipe[-1]

    rows = [r for r in csv.DictReader(open(args.manifest, encoding="utf-8")) if r["split"] in ("train", "val")]
    cache = next(args.cache.glob("mobilenet_v2_IMAGENET1K_V2_*.npz"))
    z = np.load(cache, allow_pickle=False)
    assert list(z["paths"]) == [r["path"] for r in rows], "embedding cache does not match manifest"
    val = np.array([r["split"] == "val" for r in rows])
    X_val = z["X"][val]
    y_val = np.array([classes.index(r["class_code"]) for r in rows])[val]
    val_rows = [r for r in rows if r["split"] == "val"]

    # 1. Temperature scaling + thresholds on val logits.
    logits = clf.decision_function(scaler.transform(X_val))
    t = float(minimize_scalar(lambda t: nll(logits, y_val, t), bounds=(0.05, 10), method="bounded").x)
    probs = calibrated(logits, t)
    accept, floor, policy_stats = thresholds(probs, y_val)

    # 2. Build the single graph and check it against the sklearn head on real val images.
    model = B0(clf.coef_, clf.intercept_, scaler.mean_, scaler.scale_).eval()
    tf = WEIGHTS.transforms()
    idx = np.random.default_rng(0).choice(len(val_rows), 16, replace=False)
    batch = torch.stack([tf(Image.open(args.data / val_rows[i]["path"]).convert("RGB")) for i in idx])
    with torch.inference_mode():
        torch_logits = model(batch).numpy()
    graph_gap = float(np.abs(torch_logits - logits[idx]).max())
    assert graph_gap < 1e-2, f"folded head disagrees with sklearn head by {graph_gap}"

    # 3. Export.
    version = args.run
    out_dir = args.backend / "app" / "ml" / "model"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    buf = io.BytesIO()
    torch.onnx.export(model, torch.zeros(1, 3, 224, 224), buf, dynamo=False, opset_version=17,
                      input_names=["image"], output_names=["logits"],
                      dynamic_axes={"image": {0: "batch"}, "logits": {0: "batch"}})
    onnx_bytes = buf.getvalue()
    onnx_file = f"{version}.onnx"
    (out_dir / onnx_file).write_bytes(onnx_bytes)
    meta = {
        "version": version,
        "file": onnx_file,
        "sha256": hashlib.sha256(onnx_bytes).hexdigest(),
        "arch": "MobileNetV2 (ImageNet IMAGENET1K_V2, frozen) + logistic regression head",
        "provenance": "trained_in_house",
        "classes": classes,
        "temperature": round(t, 4),
        "conf_accept": accept,
        "conf_floor": floor,
        "preprocess": {"resize": 232, "crop": 224, "mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225]},
        "trained_on": "PlantVillage raw/color, 17 classes, ml/splits/manifest.csv train split",
        "metrics_run": f"ml/runs/{version}/metrics.json",
    }
    (out_dir / "model.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    # 4. Parity through the backend's own code path (preprocess + ONNX session + softmax).
    sys.path.insert(0, str(args.backend.resolve()))
    from app.ml import inference  # noqa: E402

    inference._model.cache_clear()
    session, _ = inference._model()
    sample = np.random.default_rng(1).choice(len(val_rows), PARITY_SAMPLE, replace=False)
    agree, max_gap, latencies = 0, 0.0, []
    for i in sample:
        with Image.open(args.data / val_rows[i]["path"]) as img:
            x = inference.preprocess(img, meta["preprocess"])
        start = time.perf_counter()
        out = session.run(None, {"image": x})[0][0]
        latencies.append((time.perf_counter() - start) * 1000)
        p = inference.softmax(out, meta["temperature"])
        agree += int(p.argmax() == probs[i].argmax())
        max_gap = max(max_gap, float(np.abs(p - probs[i]).max()))
    agreement = agree / len(sample)
    assert agreement >= 0.99, f"backend path agrees with sklearn on only {agreement:.3f} of val images"

    report = {
        "onnx_file": f"backend/app/ml/model/{onnx_file}",
        "onnx_mb": round(len(onnx_bytes) / 1e6, 2),
        "temperature": round(t, 4),
        "val_nll_before": round(nll(logits, y_val, 1.0), 4),
        "val_nll_after": round(nll(logits, y_val, t), 4),
        "val_ece_before": round(ece(calibrated(logits, 1.0), y_val), 4),
        "val_ece_after": round(ece(probs, y_val), 4),
        "conf_accept": accept,
        "conf_floor": floor,
        **{k: round(v, 4) for k, v in policy_stats.items()},
        "note": "temperature and thresholds were fitted on val and are reported on val, so these numbers "
                "are optimistic; the test split is reserved for the final candidate (plan §9.6)",
        "folded_head_max_logit_gap": round(graph_gap, 6),
        "backend_parity_sample": PARITY_SAMPLE,
        "backend_parity_argmax_agreement": agreement,
        "backend_parity_max_prob_gap": round(max_gap, 5),
        "cpu_latency_ms_p50": round(float(np.percentile(latencies, 50)), 1),
        "cpu_latency_ms_p95": round(float(np.percentile(latencies, 95)), 1),
        "latency_note": "onnxruntime CPU, intra_op_num_threads=2, batch 1, model forward only",
        "eligibility_gate": {
            "onnx_le_50mb": len(onnx_bytes) <= 50e6,
            "p95_le_300ms": float(np.percentile(latencies, 95)) <= 300,
        },
    }
    (run_dir / "onnx_export.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    # 5. Two confidently-correct val images as backend test fixtures (CC BY-SA 3.0, attributed there).
    fixtures = args.backend / "tests" / "fixtures"
    fixtures.mkdir(parents=True, exist_ok=True)
    for code in ("tomato__early_blight", "maize__common_rust"):
        k = classes.index(code)
        hits = [i for i in range(len(val_rows)) if y_val[i] == k and probs[i].argmax() == k]
        best = max(hits, key=lambda i: probs[i, k])
        shutil.copyfile(args.data / val_rows[best]["path"], fixtures / f"{code}.jpg")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
