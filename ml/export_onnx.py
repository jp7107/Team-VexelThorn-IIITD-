"""Export the trained checkpoint to ONNX and verify it.

Produces a candidate model folder under ml/artifacts/<run>/ containing the ONNX
graph plus the configuration the Predictor needs. Parity is measured against the
PyTorch model on a fixed sample of test images -- a mismatch is reported, not
silently rounded away.

Usage:
    python ml/export_onnx.py --config ml/configs/plantvillage_v1.yaml \
        --checkpoint ml/checkpoints/plantvillage_v1/best.pt \
        --evaluation ml/data/processed/plantvillage_v1/evaluation.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ml.inference.preprocessing import PreprocessConfig  # noqa: E402
from ml.train import ZipDataset, build_model, load_rows, set_seed  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


INT8_MIN_VAL_F1_DROP = 0.01  # tolerate at most this much validation macro-F1


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def latency_stats(session, input_name, x, runs: int = 40):
    # warm-up: the first call includes allocation and is not representative
    for _ in range(3):
        session.run(None, {input_name: x})
    times = []
    for _ in range(runs):
        t0 = time.perf_counter()
        session.run(None, {input_name: x})
        times.append((time.perf_counter() - t0) * 1000)
    times = np.array(times)
    return {
        "runs": runs,
        "p50_ms": round(float(np.percentile(times, 50)), 2),
        "p95_ms": round(float(np.percentile(times, 95)), 2),
        "p99_ms": round(float(np.percentile(times, 99)), 2),
        "mean_ms": round(float(times.mean()), 2),
        "min_ms": round(float(times.min()), 2),
        "max_ms": round(float(times.max()), 2),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--evaluation", required=True)
    ap.add_argument("--out", default="ml/artifacts/plantvillage_model_v1")
    ap.add_argument("--quantize", action="store_true", default=True)
    ap.add_argument("--no-quantize", dest="quantize", action="store_false")
    args = ap.parse_args()

    cfg = yaml.safe_load(open(args.config, encoding="utf-8"))
    set_seed(int(cfg["run"]["seed"]))
    ckpt = torch.load(args.checkpoint, map_location="cpu", weights_only=False)
    evaluation = json.loads(Path(args.evaluation).read_text(encoding="utf-8"))
    name = ckpt["model"]
    class_names: list[str] = ckpt["class_names"]
    image_size = int(ckpt.get("image_size", cfg["preprocess"]["image_size"]))
    # the fine-tune log is authoritative for how many images/epochs were actually used
    ft_log = Path("ml/checkpoints") / cfg["run"]["name"] / "finetune_log.json"
    ft = json.loads(ft_log.read_text(encoding="utf-8")) if ft_log.exists() else {}
    proc = PreprocessConfig.from_dict(cfg)

    model = build_model(name, len(class_names), pretrained=False)
    model.load_state_dict(ckpt["state_dict"])
    model.eval()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = out_dir / "model.onnx"

    dummy = torch.zeros(1, 3, image_size, image_size, dtype=torch.float32)
    torch.onnx.export(
        model, dummy, str(onnx_path), input_names=["input"], output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=int(cfg["export"]["opset"]), do_constant_folding=True)
    onnx.checker.check_model(onnx.load(str(onnx_path)))
    fp32_size = onnx_path.stat().st_size / 1e6
    print(f"fp32 onnx: {fp32_size:.2f} MB")

    # --- parity on fixed test images
    proc_dir = Path(cfg["dataset"]["manifest_dir"]) / cfg["run"]["name"]
    rows = load_rows(proc_dir / "test.csv")[: int(cfg["export"]["parity_images"])]
    ds = ZipDataset(rows, Path(cfg["dataset"]["source"]), proc, train=False, image_size=image_size)
    xs = torch.stack([ds[i][0] for i in range(len(rows))])

    sess_fp32 = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    inp = sess_fp32.get_inputs()[0].name
    with torch.no_grad():
        torch_out = model(xs).numpy()
    ort_out = sess_fp32.run(None, {inp: xs.numpy()})[0]
    max_abs = float(np.abs(torch_out - ort_out).max())
    agree = float((torch_out.argmax(1) == ort_out.argmax(1)).mean())
    print(f"parity fp32: max|dlogit|={max_abs:.2e}  argmax agreement={agree:.3f}")
    if max_abs > float(cfg["export"]["parity_atol"]):
        print("WARNING: fp32 parity exceeds configured tolerance; recording as-is")

    chosen = onnx_path
    quant_note = "not attempted"
    if args.quantize:
        from onnxruntime.quantization import QuantType, quantize_dynamic
        q_path = out_dir / "model.int8.onnx"
        try:
            quantize_dynamic(str(onnx_path), str(q_path), weight_type=QuantType.QInt8)
            sess_q = ort.InferenceSession(str(q_path), providers=["CPUExecutionProvider"])
            q_out = sess_q.run(None, {inp: xs.numpy()})[0]
            q_agree = float((torch_out.argmax(1) == q_out.argmax(1)).mean())
            q_size = q_path.stat().st_size / 1e6
            print(f"int8: {q_size:.2f} MB  argmax agreement={q_agree:.3f}")
            quant_note = {"agreement": q_agree, "size_mb": round(q_size, 2)}
            if q_agree >= 0.95 and q_size < fp32_size:
                chosen = q_path
        except Exception as exc:
            quant_note = f"failed: {type(exc).__name__}: {exc}"
            print("int8 quantisation skipped:", quant_note)

    if chosen != onnx_path:
        # keep the deployed graph at the canonical name
        chosen.rename(out_dir / "model.tmp.onnx")
        onnx_path.unlink()
        (out_dir / "model.tmp.onnx").rename(onnx_path)

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0].name
    x1 = xs[:1].numpy()
    lat = latency_stats(sess, inp, x1)
    batch8 = latency_stats(sess, inp, np.repeat(x1, 8, axis=0), runs=15)
    size_mb = onnx_path.stat().st_size / 1e6
    print(f"deployed graph {size_mb:.2f} MB  p50={lat['p50_ms']}ms p95={lat['p95_ms']}ms")

    # --- write companion files
    (out_dir / "class_names.json").write_text(json.dumps(class_names, indent=2), encoding="utf-8")
    crops: dict[str, list[str]] = {}
    for lab in class_names:
        crops.setdefault(lab.split("___")[0], []).append(lab)

    thresholds = {
        "version": evaluation["thresholds"]["version"],
        "p_max_confident": evaluation["thresholds"]["p_max_confident"],
        "p_max_unsupported": evaluation["thresholds"]["p_max_unsupported"],
        "margin_confident": evaluation["thresholds"]["margin_confident"],
        "temperature": evaluation["temperature"],
        "entropy_uncertain_above": 0.60,
        "tuned_on": "validation split only",
        "notes": "Conservative policy; more 'uncertain' answers than a raw argmax.",
    }
    (out_dir / "confidence_thresholds.json").write_text(json.dumps(thresholds, indent=2), encoding="utf-8")
    (out_dir / "preprocessing.json").write_text(json.dumps(proc.to_dict(), indent=2), encoding="utf-8")

    model_config = {
        "model_version": f"{name}-v1",
        "architecture": name,
        "framework": "pytorch",
        "export": "onnx",
        "opset": int(cfg["export"]["opset"]),
        "num_classes": len(class_names),
        "input_name": "input",
        "output_name": "logits",
        "input_shape": [1, 3, image_size, image_size],
        "output_semantics": "raw logits; apply softmax (+ temperature from confidence_thresholds.json)",
        "class_index_mapping": {str(i): c for i, c in enumerate(class_names)},
        "crops": crops,
        "quantized_int8": chosen.name != "model.onnx" or bool(quant_note) and chosen.name.endswith("int8.onnx"),
        "labels_display": {
            c: f"{c.split('___')[0].replace('_', ' ')} — {c.split('___')[-1].replace('_', ' ')}"
            for c in class_names},
    }
    (out_dir / "model_config.json").write_text(json.dumps(model_config, indent=2), encoding="utf-8")

    report = {
        "model": name,
        "image_size": image_size,
        "train_images_used": ft.get("train_images", ckpt.get("train_images")),
        "epochs_run": ft.get("best_epoch", ckpt.get("epoch")),
        "best_val_macro_f1": ckpt.get("val_macro_f1"),
        "size_mb": round(size_mb, 2),
        "fp32_size_mb": round(fp32_size, 2),
        "quantization": quant_note,
        "parity": {"max_abs_logit_diff": max_abs, "argmax_agreement": agree,
                   "images": len(rows), "tolerance": cfg["export"]["parity_atol"]},
        "latency_batch1": lat,
        "latency_batch8": batch8,
        "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    (out_dir / "export_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("export complete ->", out_dir)
    print("latency:", lat)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
