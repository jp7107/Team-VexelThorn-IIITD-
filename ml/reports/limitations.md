# Limitations — PlantVillage model v1

Read this before quoting any number from the deck or README.

## 1. The dataset is lab imagery, not farm imagery

PlantVillage images are single leaves photographed against a uniform background
under controlled lighting. The held-out test split shares those conditions with
the training split. The measured test metrics therefore answer "can the model
separate these 38 categories in this dataset?" — not "will it work on a farmer's
phone photo?"

The literature documents a sharp drop between PlantVillage-style evaluation and
field imagery (PlantDoc and similar). **This run did not measure that drop**, so
no field-accuracy figure can be quoted.

## 2. Scope

- 38 classes across 14 crop species, exactly as published in the dataset.
- No non-leaf, soil, stem or fruit classes. Non-leaf uploads are not guaranteed
  to be rejected.
- `unsupported_crop` only fires when the caller supplies a crop hint outside the
  supported list. Without a hint the model always returns one of the 38 labels.

## 3. Uncertainty handling is a heuristic, not an OOD detector

`confident` / `uncertain` / `unsupported` come from softmax probability and
top-2 margin, tuned on validation. Softmax scores on out-of-distribution inputs
are known to be overconfident. **No out-of-distribution detector was trained or
evaluated in this run.** Treat `unsupported` as a conservative guard, not proof
that the input is out of scope.

## 4. Class imbalance

Per-class counts range from 152 to 5,507 in the published dataset (36×). Macro
metrics are reported precisely because accuracy hides this. Low-support classes
will have noisier per-class metrics; see the per-class table in `error_analysis.md`.

## 5. Licence and attribution

The Kaggle dataset page lists **GPL 2** as the licence, which differs from the
CC BY-SA 3.0 the project plan assumed. The model artifact is a derivative of the
dataset. Verify redistribution terms before shipping the `.onnx` publicly.

## 6. Compute constraints

Training ran CPU-only on 4 logical cores. This forced:

- a fine-tuning subset rather than the full training split where time required it;
- a single selected candidate rather than fine-tuning all three;
- 192 px input instead of 224 px.

These are recorded as measured facts, not as claims about what would score best
on a GPU.

## 7. What this artifact is not

It is not a diagnosis, not a treatment recommendation, and not a substitute for an
agricultural extension officer. The UI text must say "the model's best match is X
with confidence Y", never "confirmed".
