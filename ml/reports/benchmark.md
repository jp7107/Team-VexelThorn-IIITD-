# Benchmark — PlantVillage model v1

All numbers below were produced by `ml/train.py`, `ml/evaluate.py` and
`ml/export_onnx.py` in this repository. Nothing is copied from literature or
plans. Re-run the commands to reproduce them.

## Environment

| Item | Value |
|---|---|
| Device | CPU only (no CUDA device present) |
| Logical cores | 4 |
| RAM | 7.9 GB |
| Python | 3.13 |
| PyTorch | 2.12.0 (CPU build) |
| ONNX Runtime | 1.26.0 |
| OS | Windows 11 |

This is a deliberately modest environment; the plan's 5-hour ML box was sized for
a GPU workstation. Timings below reflect this machine, not the deployment target.

## Stage 1 — candidate screening (measured)

Frozen backbone → penultimate features → multinomial logistic regression.
Identical split, identical preprocessing, identical seeds across candidates.

| # | Candidate | Train feats | Val feats | Val accuracy | Val macro-F1 | Wall time |
|---|---|---|---|---|---|---|
| 1 | MobileNetV2 | 5,980 | 1,878 | 0.9494 | **0.9325** | 256 s |
| 2 | EfficientNet-B0 | 5,980 | 1,878 | 0.9494 | 0.9323 | 278 s |
| 3 | ResNet18 | 5,980 | 1,878 | 0.9105 | 0.8795 | 832 s |

Selection: **MobileNetV2** — statistically tied with EfficientNet-B0 on this
probe, materially faster to extract, and the smaller artifact at equal accuracy.
ResNet18 is rejected on both accuracy and cost.

Fifteen of the plan's eighteen candidates were **not run** in this window
(see §"What was not run"). The three above are the only ones with measured
results.

## Stage 2 — fine-tuning (measured)

<!-- FILLED FROM finetune_log.json -->

## Held-out test evaluation (measured)

<!-- FILLED FROM evaluation.json -->

## ONNX export (measured)

<!-- FILLED FROM export_report.json -->

## Quality gate

<!-- FILLED AFTER EVALUATION -->
