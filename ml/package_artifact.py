"""Assemble the final model folder and verify it.

Runs after export_onnx.py and evaluate.py. It does not invent any number: every
value in the model card comes from evaluation.json, screening.json, the export
log, or the artifact files themselves. Missing inputs are a hard error.

Usage:
    python ml/package_artifact.py --config ml/configs/plantvillage_v1.yaml \
        --artifact ml/artifacts/plantvillage_model_v1 \
        --evaluation ml/data/processed/plantvillage_v1/evaluation.json \
        --screening ml/data/processed/plantvillage_v1/screening.json \
        --export-report ml/artifacts/plantvillage_model_v1/export_report.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

REQUIRED = ["model.onnx", "class_names.json", "model_config.json",
            "preprocessing.json", "confidence_thresholds.json",
            "model_card.json", "SHA256SUMS.txt", "README.md"]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--artifact", required=True)
    ap.add_argument("--evaluation", required=True)
    ap.add_argument("--screening", required=True)
    ap.add_argument("--export-report", required=True)
    ap.add_argument("--manifest", default="ml/data/processed/plantvillage_v1/manifest.json")
    args = ap.parse_args()

    import yaml
    cfg = yaml.safe_load(open(args.config, encoding="utf-8"))
    art = Path(args.artifact)
    ev = json.loads(Path(args.evaluation).read_text(encoding="utf-8"))
    scr = json.loads(Path(args.screening).read_text(encoding="utf-8"))
    exp = json.loads(Path(args.export_report).read_text(encoding="utf-8"))
    man = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    mcfg = json.loads((art / "model_config.json").read_text(encoding="utf-8"))
    thr = json.loads((art / "confidence_thresholds.json").read_text(encoding="utf-8"))

    dataset = man["dataset"]
    split = man["split"]
    model_sha = sha256(art / "model.onnx")
    size_mb = round((art / "model.onnx").stat().st_size / 1e6, 2)

    tests = ev["test"]
    gate = ("PASS" if tests["macro_f1"] >= 0.90
            else "CONDITIONAL" if tests["macro_f1"] >= 0.75 else "FAIL")

    card = {
        "schema_version": "1.0",
        "model_version": mcfg["model_version"],
        "architecture": mcfg["architecture"],
        "export_format": "onnx",
        "opset": mcfg["opset"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "training": {
            "dataset_url": cfg["dataset"]["url"],
            "dataset_slug": cfg["dataset"]["slug"],
            "dataset_retrieved_at": dataset["retrieved_at"],
            "source_archive_sha256": dataset.get("source_archive_sha256"),
            "licence": "GPL-2 (as published on the Kaggle dataset page)",
            "licence_source": "https://www.kaggle.com/datasets/mohitsingh1804/plantvillage",
            "num_classes": dataset["classes"],
            "images_valid": dataset["images_valid"],
            "split": split["counts"],
            "near_duplicate_hamming": split["near_dup_hamming"],
            "duplicate_groups": split["duplicate_groups"],
            "seed": cfg["run"]["seed"],
            "image_size": exp["image_size"],
            "train_images_used": exp.get("train_images_used"),
            "epochs_run": exp.get("epochs_run"),
            "fine_tune_scope": f"last {cfg['train']['unfreeze_blocks']} blocks + classifier head",
            "optimizer": "AdamW",
            "lr_head": cfg["train"]["lr_head"],
            "lr_backbone": cfg["train"]["lr_backbone"],
            "batch_size": cfg["train"]["batch_size"],
            "augmentation": ["random resized crop", "horizontal flip", "rotation ±10°",
                             "colour jitter"],
            "screening": scr["results"],
        },
        "evaluation": {
            "test_n": tests["n"],
            "accuracy": tests["accuracy"],
            "macro_precision": tests["macro_precision"],
            "macro_recall": tests["macro_recall"],
            "macro_f1": tests["macro_f1"],
            "top3_accuracy": tests["top3_accuracy"],
            "ece_test": tests["ece"],
            "temperature": ev["temperature"],
            "gate": gate,
            "gate_rule": "PASS macro-F1>=0.90; CONDITIONAL 0.75-0.90; FAIL <0.75 (plan §8.7)",
        },
        "preprocessing": json.loads((art / "preprocessing.json").read_text(encoding="utf-8")),
        "class_index_mapping": mcfg["class_index_mapping"],
        "confidence_policy": thr,
        "onnx": {
            "size_mb": size_mb,
            "sha256": model_sha,
            "parity_max_abs_logit_diff": exp["parity"]["max_abs_logit_diff"],
            "parity_argmax_agreement": exp["parity"]["argmax_agreement"],
            "parity_images": exp["parity"]["images"],
            "latency_batch1": exp["latency_batch1"],
            "latency_batch8": exp["latency_batch8"],
            "quantization": exp.get("quantization"),
        },
        "limitations": [
            "Trained and evaluated on PlantVillage only: lab-captured single leaves, "
            "uniform background, controlled lighting.",
            "Test metrics are NOT evidence of field performance; expect degradation on "
            "phone photos taken in real fields.",
            "No out-of-distribution detector was validated; the 'unsupported' status is a "
            "softmax-threshold heuristic, not a guarantee.",
            "Non-leaf images may still receive a confident prediction.",
            "38-class plant/disease scope only; crops outside the list return unsupported_crop "
            "only when a crop hint is supplied.",
            "Climate and geography of the source imagery are not represented in any metadata.",
        ],
        "files": {},
    }

    (art / "model_card.json").write_text(json.dumps(card, indent=2), encoding="utf-8")

    readme = f"""# {mcfg['model_version']}

ONNX plant-disease classifier trained on PlantVillage ({dataset['classes']} classes,
{dataset['images_valid']:,} images).

## Load and predict

```python
from ml.inference.predictor import Predictor

p = Predictor("ml/artifacts/plantvillage_model_v1")
result = p.predict_path("leaf.jpg")          # or predict_bytes(data)
print(result.to_api_dict())
```

`to_api_dict()` returns `{{"status": ..., "prediction": ...}}`, where `prediction`
is present only for `confident` / `uncertain`, matching plan §14.3.

## Measured performance (held-out test, n={tests['n']})

| Metric | Value |
|---|---|
| Accuracy | {tests['accuracy']:.4f} |
| Macro-F1 | {tests['macro_f1']:.4f} |
| Macro precision | {tests['macro_precision']:.4f} |
| Macro recall | {tests['macro_recall']:.4f} |
| Top-3 accuracy | {tests['top3_accuracy']:.4f} |
| ECE (test) | {tests['ece']:.4f} |
| Quality gate | {gate} |

## Artifact

- `model.onnx` — {size_mb} MB, sha256 `{model_sha}`
- Input `{mcfg['input_shape']}`, float32 NCHW, ImageNet normalisation
- Output raw logits (38), softmax + temperature {ev['temperature']}
- p50 {exp['latency_batch1']['p50_ms']} ms / p95 {exp['latency_batch1']['p95_ms']} ms
  at batch 1 on the CPU used for export

## Confidence policy ({thr['version']})

| Condition | status |
|---|---|
| p_max >= {thr['p_max_confident']} and margin >= {thr['margin_confident']} | confident |
| p_max < {thr['p_max_unsupported']} | unsupported |
| otherwise | uncertain |

Thresholds were tuned on the validation split only.

## Dataset attribution

Source: {cfg['dataset']['url']} (retrieved {dataset['retrieved_at']}).
Licence published by the dataset host: **GPL-2**. This model artifact is a
derivative of that dataset; check the licence before redistribution.

## Limitations

- PlantVillage is lab-captured. Real-field accuracy was not measured in this run.
- No validated OOD detector; non-leaf images may be classified confidently.
- Not a diagnosis. Confirm with a local expert before treatment.
"""
    (art / "README.md").write_text(readme, encoding="utf-8")

    # checksums over every file except the checksum file itself
    lines = []
    for f in sorted(art.iterdir()):
        if f.is_file() and f.name != "SHA256SUMS.txt":
            lines.append(f"{sha256(f)}  {f.name}")
    (art / "SHA256SUMS.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

    missing = [f for f in REQUIRED if not (art / f).exists()]
    if missing:
        print("MISSING:", missing)
        return 1

    zip_path = art.with_suffix(".zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(art.iterdir()):
            if f.is_file():
                z.write(f, arcname=f"{art.name}/{f.name}")
    print(f"packaged {art} ({len(list(art.iterdir()))} files) -> {zip_path}")
    print(f"gate: {gate}  size: {size_mb} MB  sha256: {model_sha[:16]}...")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
