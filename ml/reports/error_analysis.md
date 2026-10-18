# Error analysis — PlantVillage model v1

Values below are generated from the held-out test split by `ml/evaluate.py`.
Nothing here is illustrative; if a section is empty it is because the run has not
produced it.

## Headline

<!-- FILLED: accuracy / macro-F1 / coverage -->

## Top confusions

<!-- FILLED: top-10 confusion pairs with counts -->

The pattern to watch for is confusion within a crop between visually similar
diseases (for example tomato early vs late blight, or corn rust vs northern leaf
blight), which is expected — those lesions differ by colour and texture detail
that a 192 px image may not carry.

## Per-class behaviour

<!-- FILLED: per-class precision/recall/F1 with support -->

Classes with very low support (potato healthy: 152 images, peach healthy: 360,
strawberry healthy: 456) will have wider metric intervals than the heavily
populated classes (orange HLB: 5,507, soybean healthy: 5,090). Do not read a
single class's recall as a stable estimate.

## Calibration

<!-- FILLED: temperature, ECE before/after, reliability bins -->

## What is deliberately absent

- **No field-image evaluation.** PlantDoc was named as a secondary stress set in
  the plan but was not downloaded in this run, so no OOD number is reported.
  Reporting zero here would be a fabrication; this section therefore states that
  the measurement was not performed.
- **No hand-collected phone photos.** The plan's tertiary set (§8.3) was not
  captured during this run.
- **No qualitative failure gallery** until real field images exist.

## How to extend this report

When PlantDoc (or a hand-collected set) is available, add a separate section with
its own coverage count — how many images could be mapped to PlantVillage classes
at all — and keep it clearly separated from the lab metrics. Never blend the two
into a single headline accuracy.
