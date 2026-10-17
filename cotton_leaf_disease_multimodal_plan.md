# AI + Voice + Image Based Cotton Leaf Disease, Pest & Condition Diagnosis System
## Final End-to-End Engineering + ML Research Plan

> **Status:** Final project plan adapted from the original multimodal leaf-disease architecture and the attached system diagram.  
> **Primary dataset:** [Customized Cotton Disease Dataset](https://www.kaggle.com/datasets/saeedazfar/customized-cotton-disease-dataset)  
> **Scope:** Cotton-specific image + voice/text + weather context + multimodal fusion + prototype learning + few-shot learning + React frontend + FastAPI backend.
>
> **Important dataset note:** The linked dataset contains 8 classes, but not all are diseases. It includes two pests (`Aphids`, `Army worm`), one cotton-boll condition (`Green Cotton Boll`), four disease classes, and `Healthy`. Therefore the technically correct product description is **cotton disease, pest and condition diagnosis** unless the project deliberately filters to a disease/health subset.

---

## 0. Project Decision Summary

This document replaces the previous PlantVillage-centered design.

### Final primary dataset

**Customized Cotton Disease Dataset — Kaggle**

Dataset classes:

1. Aphids
2. Army worm
3. Bacterial blight
4. Cotton Boll Rot
5. Green Cotton Boll
6. Healthy
7. Powdery mildew
8. Target spot

A published implementation using the same Kaggle dataset reports **800 training images per class** and approximately **40–60 validation images per class**. The extracted Kaggle archive has a nested directory structure containing training and validation folders. The exact counts should still be printed by the project ingestion script after download rather than hard-coded.  
Reference: `https://www.kaggle.com/datasets/saeedazfar/customized-cotton-disease-dataset`  
Supporting source: https://debuggercafe.com/cotton-disease-classification-using-vision-transformer/

### What is actually trained?

The project does **not** train ViT, Whisper, or MiniLM from scratch.

The initial system uses pretrained models and trains the task-specific layers:

- ViT-B/16: pretrained image encoder; MVP freezes it.
- Whisper Small: pretrained ASR; no disease-training required.
- MiniLM: pretrained text encoder; MVP freezes it.
- Weather MLP: trainable.
- Projection heads: trainable.
- Fusion network: trainable.
- Prototype memory: generated from learned embeddings.
- Prototypical Network / episodic metric-learning stage: trainable research component.
- Optional final fine-tuning: last ViT blocks + fusion/projection layers.

### Core research question

> **Does adding leakage-controlled symptom text, weather context, token-level multimodal fusion, and prototype/few-shot learning improve cotton diagnosis over a strong image-only ViT baseline?**

The project must answer this experimentally. It must not assume that every added modality improves accuracy.

---

# Table of Contents

1. Executive Summary
2. Scope and Problem Definition
3. Final Architecture
4. Component-by-Component Design
5. Dataset Research and Final Dataset
6. Dataset Preparation
7. Image Pipeline
8. ViT Pipeline
9. Voice + Whisper Pipeline
10. Text Encoder Pipeline
11. Weather Pipeline
12. Multimodal Fusion / Cross-Attention
13. Prototype Memory
14. Few-Shot / Meta-Learning
15. Training Strategy
16. Loss Functions
17. Experiment Plan
18. Evaluation Metrics
19. Backend Architecture
20. Database Schema
21. Frontend Architecture
22. Project Folder Structure
23. API Design
24. Exact Implementation Phases
25. MVP Version
26. Research-Grade Version
27. Testing
28. Deployment
29. Research / Literature Review Positioning
30. Risks, Limitations and Scientific Constraints
31. Final End-to-End Inference Pipeline
32. Final Implementation Order
33. START HERE

---

# 1. Executive Summary

## 1.1 What the system does

A farmer opens a web/mobile-friendly application and can:

- capture or upload a cotton leaf image;
- optionally speak a description of symptoms;
- optionally type symptoms instead of speaking;
- optionally provide location for weather context;
- request a diagnosis.

The backend then runs:

```text
Image
  ↓
Image validation
  ↓
Leaf/background preprocessing
  ↓
ViT image encoder
  ↓
Image embedding

Voice
  ↓
Whisper
  ↓
Symptom text
  ↓
Text encoder
  ↓
Text embedding

Location
  ↓
Weather API
  ↓
Weather features
  ↓
Weather MLP
  ↓
Weather embedding

All embeddings
  ↓
Multimodal fusion / cross-attention
  ↓
Fused 256-d representation
  ↓
Prototype similarity
  ↓
Prediction
  ↓
Confidence / uncertainty
  ↓
Curated recommendation
```

## 1.2 Application output

The UI should return:

- predicted cotton class;
- confidence;
- top-k alternatives;
- symptom text/transcription if supplied;
- weather context if supplied;
- curated recommendations;
- low-confidence warning when the model is uncertain;
- diagnosis history for authenticated users.

Example:

```text
Prediction:
Target Spot

Confidence:
91%

Input:
Leaf image + "brown circular spots"

Weather:
31 °C
82% humidity
3.2 mm precipitation

Recommendations:
- Remove severely affected leaves.
- Improve air circulation.
- Follow locally approved crop-protection guidance.

Status:
AI-assisted result; confirm with a local agronomist when treatment decisions are consequential.
```

## 1.3 What the ML research actually consists of

The model-development ladder is:

```text
B1. Image-only CNN baseline
        ↓
B2. Image-only ViT baseline
        ↓
B3. Image + symptom text
        ↓
B4. Image + weather
        ↓
B5. Image + text + weather with concat fusion
        ↓
B6. Multimodal token-level cross-attention
        ↓
B7. Prototype / metric learning
        ↓
B8. Episodic Prototypical Network / few-shot learning
```

The first goal is to make **B2** work and establish a reliable image-only baseline. Every later component is compared against it.

---

# 2. Scope and Problem Definition

## 2.1 Final problem statement

> Design and evaluate a cotton-specific multimodal AI system that combines leaf images, optional spoken/text symptom descriptions, and optional weather context to classify cotton health/disease/pest conditions, while investigating prototype-based and few-shot learning for data-efficient adaptation.

## 2.2 Classification modes

Because the Kaggle dataset has mixed semantic categories, define two possible modes.

### Mode A — Full dataset classifier

Use all 8 labels:

```text
Aphids
Army worm
Bacterial blight
Cotton Boll Rot
Green Cotton Boll
Healthy
Powdery mildew
Target spot
```

This is the **exact-dataset reproduction mode**.

### Mode B — Disease/health-focused classifier

Filter the dataset to:

```text
Bacterial blight
Cotton Boll Rot
Healthy
Powdery mildew
Target spot
```

This is the **disease/health mode**.

Do not silently mix the two modes in reported metrics. State which mode is being evaluated.

## 2.3 Recommended project naming

For the complete 8-class project:

> **AI + Voice + Image Based Cotton Disease, Pest & Condition Diagnosis System**

For the filtered 5-class version:

> **AI + Voice + Image Based Cotton Leaf Disease Diagnosis System**

## 2.4 What is not being claimed

The project does **not** claim that:

- weather always improves diagnosis;
- voice is a separate learned modality after Whisper converts it to text;
- meta-learning automatically makes known diseases robust to every new image;
- synthetic symptoms are equivalent to real farmer descriptions;
- live weather at inference can replace missing historical weather during training;
- high lab/test accuracy alone proves field robustness.

---

# 3. Final Architecture

## 3.1 Architecture aligned to the attached diagram

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                 COTTON MULTIMODAL DIAGNOSIS SYSTEM                     │
└─────────────────────────────────────────────────────────────────────────┘

1. USER / FARMER
   │
   ├── Capture / upload cotton leaf image
   ├── Speak symptoms
   ├── Type symptoms
   └── Optional location
   │
   ▼
2. INPUT + VALIDATION
   │
   ▼
3. IMAGE PREPROCESSING
   │
   ├── image validation
   ├── RGB conversion
   ├── background removal / segmentation
   ├── leaf crop
   ├── resize 224×224
   └── normalization
   │
   ▼
4. IMAGE FEATURE EXTRACTION
   │
   └── ViT-B/16
           ↓
       patch tokens
           ↓
       image embedding
           │
           ├─────────────────────────┐
           │                         │
           ▼                         │
5. TEXT PIPELINE                    │
   Voice → Whisper → symptom text   │
          ↓                         │
       MiniLM / BERT                │
          ↓                         │
      text tokens                   │
          │                         │
          └──────────────┐          │
                         │          │
6. WEATHER CONTEXT       │          │
   Location → Open-Meteo │          │
            ↓            │          │
      weather features  │          │
            ↓            │          │
       Weather MLP       │          │
            ↓            │          │
      weather token      │          │
            │            │          │
            └──────┬─────┴──────────┘
                   ▼
7. MULTIMODAL FUSION
   Image tokens + text tokens + weather token
                   ↓
        Multimodal Transformer
                   ↓
          Fused 256-d embedding
                   ↓
8. PROTOTYPE MEMORY
   Disease / condition prototypes
                   ↓
9. SIMILARITY PREDICTION
   cosine similarity + temperature
                   ↓
10. RESULT
   class + confidence + top-k + recommendations
                   ↓
11. FASTAPI BACKEND
                   ↓
12. REACT FRONTEND
```

## 3.2 Attached diagram changes

The supplied architecture diagram is retained conceptually, but these details must be updated:

| Original diagram element | Final cotton version |
|---|---|
| Generic Rust / Blight / Mildew examples | Cotton-specific labels |
| Generic "Disease Prediction" | "Cotton Condition Prediction" in 8-class mode |
| Rust 92% example | Example should use `Target Spot` or `Bacterial Blight` |
| Generic prototype labels | `Healthy`, `Bacterial Blight`, `Powdery Mildew`, `Target Spot`, etc. |
| New disease wording | "Novel cotton class" under a held-out-class protocol |
| "Robust even with low dataset" | "Data-efficient adaptation under the evaluated protocol" |
| Weather as automatically useful | Weather is optional and ablated |
| Voice as direct model modality | Voice is ASR → text; measure WER separately |

---

# 4. Component-by-Component Design

## 4.1 Farmer web/mobile interface

**Purpose:** collect multimodal inputs.

### MVP

React + Vite + Tailwind.

Features:

- image upload;
- camera capture where browser permits;
- typed symptoms;
- voice recording;
- optional location;
- diagnosis button;
- result page;
- history.

### Research-grade

- PWA;
- offline queue;
- camera framing guide;
- image quality checks;
- multilingual speech;
- retry when connectivity returns.

---

## 4.2 Image preprocessing

### MVP

Use:

```text
RGB conversion
→ resize
→ optional rembg background removal
→ crop
→ 224×224
→ ImageNet normalization
```

### Research option

Compare:

```text
No segmentation
vs
rembg
vs
SAM2
```

Report this as an ablation.

---

## 4.3 Image encoder

Model:

```text
google/vit-base-patch16-224
```

Contract:

```text
Input:
[B, 3, 224, 224]

ViT:
[B, 197, 768]

Pooled:
[B, 768]

Projection:
Linear(768 → 256)

Output:
[B, 256]
```

For research-grade token fusion:

```text
[B, 197, 768]
    ↓
Linear(768 → 256)
    ↓
[B, 197, 256]
```

---

## 4.4 Voice branch

```text
Browser audio
     ↓
16 kHz mono
     ↓
Whisper Small
     ↓
text
```

Important:

**Whisper is not a disease classifier.**

It converts speech to text.

The disease model consumes the resulting text.

Therefore:

```text
Typed symptom
and
Voice-transcribed symptom
```

should enter the same text encoder.

---

## 4.5 Text encoder

MVP:

```text
sentence-transformers/all-MiniLM-L6-v2
```

Output:

```text
384-d
```

Project into:

```text
384 → 256
```

Research alternatives:

```text
bert-base-uncased
BioBERT
BiomedBERT
```

Do not assume BioBERT is superior for cotton pathology; benchmark it.

---

## 4.6 Weather branch

Features can include:

```text
temperature
relative humidity
precipitation
wind speed
```

Optional:

```text
cloud cover
surface pressure
soil moisture
evapotranspiration
```

Then:

```text
raw features
   ↓
standardization
   ↓
missing-value mask
   ↓
MLP
   ↓
256-d weather embedding
```

### Critical restriction

The Kaggle cotton dataset does not provide per-image weather metadata.

Therefore:

- **live weather may be displayed in the application as context**;
- it should **not automatically be treated as a scientifically valid training feature** for old dataset images;
- weather can enter model training only when linked to images using independent, valid location/date metadata, or when a clearly labeled synthetic/demo protocol is being evaluated.

For the initial research result:

> **Run image-only and image+text experiments first. Keep weather as an inference-context feature until real image-time-location joins are available.**

---

# 5. Dataset Research and Final Dataset

## 5.1 Primary dataset

**Customized Cotton Disease Dataset**

Kaggle:

```text
https://www.kaggle.com/datasets/saeedazfar/customized-cotton-disease-dataset
```

The linked dataset is documented as containing these eight categories:

```text
Aphids
Army worm
Bacterial blight
Cotton Boll Rot
Green Cotton Boll
Healthy
Powdery mildew
Target spot
```

A published tutorial using this exact dataset reports:

```text
800 training images/class
~40–60 validation images/class
```

and shows the nested structure:

```text
Customized Cotton Dataset-Complete/
└── content/
    ├── trainning/
    │   └── Cotton leaves - Training/
    │       └── 800 Images/
    │           ├── Aphids/
    │           ├── Army worm/
    │           ├── Bacterial blight/
    │           ├── Cotton Boll Rot/
    │           ├── Green Cotton Boll/
    │           ├── Healthy/
    │           ├── Powdery mildew/
    │           └── Target spot/
    └── validation/
        └── Cotton plant disease-Validation/
            └── Cotton plant disease-Validation/
                ├── Aphids edited/
                ├── Army worm edited/
                ├── Bacterial Blight edited/
                ├── Cotton Boll rot/
                ├── Green Cotton Boll/
                ├── Healthy leaf edited/
                ├── Powdery Mildew Edited/
                └── Target spot edited/
```

Reference:
https://debuggercafe.com/cotton-disease-classification-using-vision-transformer/

## 5.2 Dataset roles

| Resource | Role |
|---|---|
| Customized Cotton Disease Dataset | Main supervised training/validation/test source |
| Same dataset, held-out test split | Primary in-domain evaluation |
| Optional independent cotton dataset | Cross-dataset robustness evaluation |
| External weather API | Context feature; training use only with valid metadata |
| Symptom knowledge base | Source for derived symptom text |
| TTS | Synthetic voice generation for pipeline testing |
| PlantSeg / SAM2 | Optional segmentation support, not required for baseline |

## 5.3 Do not use the old PlantVillage protocol

Remove these statements from the project:

```text
PlantVillage = primary dataset
PlantDoc = mandatory cross-dataset test
PlantWild = mandatory few-shot dataset
14 crops / 38 classes
lab → field based on PlantVillage
```

Those were appropriate for a multi-crop research plan, not for this cotton-specific dataset.

## 5.4 Optional cross-dataset test

A separate cotton dataset may be used for robustness only if its label semantics can be reconciled.

Do not force incompatible labels together.

For an external dataset with different cotton disease names:

1. build a class mapping table;
2. evaluate only overlapping semantic categories;
3. report unmapped classes separately;
4. never pretend two differently defined labels are identical.

---

# 6. Dataset Preparation

## 6.1 Provenance table

```text
Image                = REAL
Class label          = REAL
Segmentation         = REAL if supplied, otherwise DERIVED
Symptom text         = DERIVED / SYNTHETIC
Voice                = SYNTHETIC if TTS
Weather              = REAL only when independently attached by location/time
```

## 6.2 Metadata schema

```csv
sample_id,
image_path,
mask_path,
class_name,
mode,
split,
group_id,
symptoms_text,
text_source,
voice_path,
voice_source,
temperature,
humidity,
rainfall,
wind_speed,
latitude,
longitude,
capture_date,
weather_source,
image_source_dataset,
is_novel_class
```

## 6.3 Label normalization

Create canonical labels:

```python
LABEL_MAP = {
    "Aphids": "aphids",
    "Army worm": "army_worm",
    "Bacterial blight": "bacterial_blight",
    "Bacterial Blight": "bacterial_blight",
    "Cotton Boll Rot": "cotton_boll_rot",
    "Cotton Boll rot": "cotton_boll_rot",
    "Green Cotton Boll": "green_cotton_boll",
    "Healthy": "healthy",
    "Healthy leaf edited": "healthy",
    "Powdery mildew": "powdery_mildew",
    "Powdery Mildew Edited": "powdery_mildew",
    "Target spot": "target_spot",
}
```

Never infer labels from filename text after preprocessing. Use the class directory as the source of truth.

## 6.4 Remove duplicates

Run perceptual hashing before splitting:

```text
image
 ↓
pHash
 ↓
near-duplicate detection
 ↓
remove / record duplicate
 ↓
split
```

## 6.5 Train / validation / test

The downloaded dataset already contains train and validation directories.

For a rigorous research evaluation:

```text
Existing train
Existing validation
        +
held-out test
```

The best procedure is to create the final test split only from images that have not been used for tuning.

Recommended:

```text
Train      70–80%
Validation 10–15%
Test       10–15%
```

or preserve the official train/validation split and create a test subset only after verifying no leakage.

## 6.6 Class imbalance

If class counts are uneven:

- weighted Cross Entropy;
- WeightedRandomSampler;
- macro-F1;
- per-class confusion matrix.

Do not report accuracy alone.

---

# 7. Image Pipeline

```text
Raw cotton image
    ↓
File validation
    ↓
EXIF orientation
    ↓
RGB conversion
    ↓
Image quality check
    ↓
Background removal / segmentation
    ↓
Leaf / object crop
    ↓
Resize to 224×224
    ↓
ImageNet normalization
    ↓
Training augmentation
    ↓
Tensor [3,224,224]
```

## 7.1 Augmentation

Use disease-safe augmentation:

```text
horizontal flip
small rotation
small translation
mild scale
mild brightness/contrast
mild blur/noise
```

Avoid aggressive hue manipulation because color may be diagnostically meaningful.

---

# 8. ViT Pipeline

## 8.1 Model

```text
google/vit-base-patch16-224
```

Pretrained weights are used.

## 8.2 MVP

```text
ViT backbone = frozen
Projection head = trainable
Classifier = trainable
```

## 8.3 Research-grade

```text
ViT backbone
 ↓
unfreeze last 2–4 transformer blocks
 ↓
small learning rate
```

Suggested starting point:

```text
backbone LR = 1e-5
head LR      = 1e-3
```

These are starting values, not guaranteed optimal values.

## 8.4 Image-only baseline

First model:

```text
Image
 ↓
ViT
 ↓
768-d
 ↓
classifier
 ↓
8-class prediction
```

This produces the project's first meaningful ML result.

---

# 9. Voice + Whisper Pipeline

```text
Audio
 ↓
resample 16 kHz mono
 ↓
silence trimming
 ↓
Whisper Small
 ↓
raw transcription
 ↓
text cleanup
 ↓
symptom text
```

## 9.1 Typed-text fallback

The frontend must allow:

```text
🎤 Speak
or
⌨️ Type
```

Both result in:

```text
symptoms_text
```

The disease model then sees the same text pipeline.

## 9.2 Evaluation

Measure:

```text
WER = Word Error Rate
```

separately from disease accuracy.

Report:

```text
typed text disease accuracy
vs
voice-transcribed text disease accuracy
```

This distinguishes:

```text
ASR error
from
disease-model error
```

---

# 10. Text Encoder Pipeline

```text
symptoms_text
      ↓
tokenizer
      ↓
MiniLM / BERT
      ↓
sentence/token embeddings
      ↓
pooling
      ↓
384-d or 768-d
      ↓
projection
      ↓
256-d
```

## 10.1 MVP text model

```text
sentence-transformers/all-MiniLM-L6-v2
```

## 10.2 Text leakage control

This is critical because the cotton dataset does not contain real per-image symptom descriptions.

Do **not** generate:

```text
"Bacterial blight symptoms..."
```

or:

```text
"This is target spot..."
```

Instead generate symptom descriptions without naming the class:

```text
"small brown circular lesions"
"yellowing around damaged tissue"
"powdery pale coating"
"small insects clustered on the leaf"
```

## 10.3 Template diversity

Use:

```text
many-to-one:
many descriptions → same class

one-to-many:
same class → many possible descriptions
```

Use paraphrasing and symptom dropping/reordering.

## 10.4 Text-only leakage test

Train a text-only classifier.

If:

```text
text-only accuracy ≈ 100%
```

the synthetic text is probably leaking the label.

Fix it before reporting multimodal gains.

---

# 11. Weather Pipeline

## 11.1 API

Use:

```text
Open-Meteo
```

Current context:

```text
temperature
humidity
rainfall/precipitation
wind speed
```

## 11.2 Training rule

For each training image:

### Valid scientific path

```text
image location
+
image capture date
        ↓
historical weather API
        ↓
weather features
```

### Invalid scientific shortcut

```text
disease label
 ↓
choose "favorable" weather for that disease
```

Never do this.

## 11.3 Weather MLP

```text
weather features
     ↓
standardize using TRAIN statistics
     ↓
missing-value mask
     ↓
Linear
 ↓
LayerNorm
 ↓
ReLU
 ↓
Dropout
 ↓
Linear
 ↓
256-d
```

## 11.4 Initial recommendation

For the Kaggle dataset:

> **Do not make weather part of the headline ML result until valid location/time joins exist.**

You can still implement:

```text
GET /api/weather
```

and show weather in the UI.

---

# 12. Multimodal Fusion / Cross-Attention

## 12.1 MVP fusion

```text
image [256]
text  [256]
weather [256]
        ↓
concatenate
        ↓
[768]
        ↓
LayerNorm
        ↓
MLP
        ↓
256-d fused vector
```

This is the first multimodal fusion baseline.

## 12.2 Research-grade fusion

Use token sequences.

### Image tokens

```text
[B,197,768]
 ↓
Linear
 ↓
[B,197,256]
```

### Text tokens

```text
[B,L,H]
 ↓
Linear
 ↓
[B,L,256]
```

### Weather token

```text
[B,256]
 ↓
[B,1,256]
```

### Fusion token

```text
[B,1,256]
```

Combined:

```text
[FUSION ; IMAGE TOKENS ; TEXT TOKENS ; WEATHER]
```

Then:

```text
Transformer Encoder
    × 2–4 layers
    8 heads
    d_model = 256
    FFN = 1024
```

Fused representation:

```text
z_f = H[:,0,:]
```

## 12.3 Missing modalities

The model must work when:

```text
image only
image + text
image + weather
image + text + weather
```

Use modality masks / learned missing-modality representation.

---

# 13. Prototype Memory

## 13.1 Why prototypes?

The fused embedding should have a metric structure.

For each class:

```text
support embeddings
      ↓
mean
      ↓
L2 normalization
      ↓
prototype
```

## 13.2 Prototype example

```text
healthy
    ↓
[256-dimensional vector]

target_spot
    ↓
[256-dimensional vector]

powdery_mildew
    ↓
[256-dimensional vector]
```

Stored as:

```text
data/prototypes/prototypes.pt
data/prototypes/labels.json
```

## 13.3 Prediction

```text
query embedding
      ↓
cosine similarity with all prototypes
      ↓
temperature-scaled probabilities
      ↓
highest probability
```

Example:

```text
Target Spot        0.91
Bacterial Blight   0.06
Powdery Mildew     0.02
Healthy            0.01
...
```

## 13.4 Low-confidence path

If maximum similarity/probability is below the validation-selected threshold:

```text
Prediction:
Uncertain

Message:
Retake a clear close-up image and provide symptoms if available.
```

Do not give highly specific treatment advice when confidence is poor.

---

# 14. Few-Shot / Meta-Learning

## 14.1 Main algorithm

Use:

> **Prototypical Networks**

not MAML as the default.

## 14.2 Why

ProtoNet directly matches the prototype-based classifier already used in the architecture.

## 14.3 Cotton-specific episodic experiment

Because the new dataset has only 8 classes, split classes at the class level for the research track.

Example:

```text
Meta-train base classes:
5 classes

Novel classes:
3 classes
```

The exact class split must be fixed before training and reported.

Example protocol:

```text
Episode:
5-way / K-shot

For each episode:
1. sample classes
2. sample K support examples
3. sample query examples
4. embed support + query
5. build support prototypes
6. classify queries by cosine similarity
7. compute episodic loss
8. update the encoder
```

## 14.4 Important interpretation

This experiment asks:

> Can the learned embedding classify a class from a few support examples under a held-out-class protocol?

It does **not** prove that the model automatically handles arbitrary unseen images from known classes.

## 14.5 1-shot / 5-shot / 10-shot

Report:

```text
1-shot accuracy
5-shot accuracy
10-shot accuracy
```

with:

```text
mean
standard deviation
95% confidence interval
```

## 14.6 Novel-class requirement

Novel classes must be:

```text
excluded from meta-training
```

Otherwise it is not a valid novel-class experiment.

---

# 15. Training Strategy

## 15.1 What is frozen?

### MVP

```text
ViT backbone      frozen
Whisper            frozen
MiniLM             frozen
```

### Trainable

```text
image projection
text projection
weather MLP
fusion network
classifier/prototype space
```

### Research-grade

```text
last ViT blocks
optional text fine-tuning
fusion
projection heads
```

## 15.2 Stage 1 — Image baseline

```text
Cotton dataset
 ↓
preprocessing
 ↓
ViT
 ↓
projection/head
 ↓
Cross Entropy
```

Output:

```text
cotton_vit_baseline.pt
```

## 15.3 Stage 2 — Add text

```text
image embedding
+
text embedding
 ↓
concat fusion
 ↓
classifier
```

Question:

> Does symptom text add information beyond the image?

## 15.4 Stage 3 — Weather

Only after valid weather joins exist.

```text
image + text + weather
```

Run with/without weather.

## 15.5 Stage 4 — Cross-attention

Replace concat with token-level fusion.

## 15.6 Stage 5 — Prototype learning

Train the fused embedding space for cosine-prototype classification.

## 15.7 Stage 6 — Episodic ProtoNet

Train with N-way K-shot episodes.

## 15.8 Stage 7 — Optional final fine-tuning

Only after the pipeline works.

---

# 16. Loss Functions

## 16.1 Baseline

```text
L = CrossEntropy
```

## 16.2 Prototype training

```text
L = Prototypical Episodic NLL
```

## 16.3 Research-grade combined objective

```text
L_total =
    λ1 * L_CE
  + λ2 * L_metric
  + λ3 * L_proto
```

Starting values:

```text
λ1 = 1.0
λ2 = 0.5
λ3 = 1.0
```

These are initial values only.

Tune on validation data.

Do not describe them as universally optimal.

---

# 17. Experiment Plan

## 17.1 Baseline ladder

| ID | Model | Purpose |
|---|---|---|
| B1 | CNN baseline | non-transformer reference |
| B2 | ViT image-only | primary image baseline |
| B3 | image + text concat | measure symptom contribution |
| B4 | image + weather concat | measure weather contribution |
| B5 | image + text + weather concat | multimodal baseline |
| B6 | multimodal cross-attention | token-level fusion |
| B7 | B6 + prototype/metric learning | metric-space effect |
| B8 | B7 + ProtoNet episodic training | few-shot effect |

## 17.2 Ablation table

Fill after experiments:

| Experiment | Image | Text | Weather | Cross-Attn | Proto | Few-Shot | Accuracy | Macro-F1 | ECE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| B2 | ✓ |  |  |  |  |  |  |  |  |
| B3 | ✓ | ✓ |  |  |  |  |  |  |  |
| B4 | ✓ |  | ✓ |  |  |  |  |  |  |
| B5 | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| B6 | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |
| B7 | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |  |
| B8 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |

## 17.3 Segmentation ablation

```text
B6 with segmentation
vs
B6 without segmentation
```

## 17.4 Text leakage ablation

```text
image-only
text-only
image + text
```

If text-only is suspiciously high, redesign the synthetic symptom generation.

## 17.5 Weather ablation

```text
without weather
with weather
```

If the difference is approximately zero, report zero.

That is a scientific result.

---

# 18. Evaluation Metrics

Always report:

```text
Accuracy
Macro Precision
Macro Recall
Macro F1
Weighted F1
Confusion Matrix
```

For probability quality:

```text
ECE
Reliability diagram
```

For ranking:

```text
Top-3 accuracy
```

For few-shot:

```text
1-shot
5-shot
10-shot
mean ± 95% CI
```

For voice:

```text
WER
```

For segmentation if masks are available:

```text
IoU
Dice
```

## 18.1 Primary model-selection metric

Use:

> **Macro-F1**

because the classes can be imbalanced.

## 18.2 Confidence calibration

Do not display:

```text
92% confidence
```

without validation/calibration.

Use temperature scaling after model selection.

---

# 19. Backend Architecture

## 19.1 Technology

```text
FastAPI
Uvicorn
PostgreSQL
SQLAlchemy
Alembic
```

## 19.2 Backend flow

```text
POST /api/diagnose
        ↓
validate image/audio
        ↓
load singleton model objects
        ↓
preprocess image
        ↓
ViT
        ↓
optional Whisper
        ↓
optional text encoder
        ↓
optional weather
        ↓
fusion
        ↓
prototype similarity
        ↓
recommendation lookup
        ↓
save diagnosis
        ↓
JSON response
```

## 19.3 Important performance rule

Load models once at startup.

Do not reload ViT / Whisper / MiniLM for every request.

---

# 20. Database Schema

## 20.1 users

```sql
id
name
email
password_hash
created_at
```

## 20.2 diagnoses

```sql
id
user_id
image_path
predicted_class
confidence
topk_json
symptoms_text
transcription_language
temperature
humidity
rainfall
wind_speed
weather_source
model_version
created_at
```

## 20.3 optional feedback

```sql
id
diagnosis_id
correct_class
user_feedback
created_at
```

## 20.4 prototype metadata

Prototypes may remain in files:

```text
prototypes.pt
labels.json
```

The database does not need a vector table for a small 8-class prototype set.

Use pgvector only when scaling requires it.

---

# 21. Frontend Architecture

## 21.1 Technology

```text
React
Vite
Tailwind CSS
```

## 21.2 Pages

```text
/
  landing

/login
/register

/diagnose
  upload image
  record voice
  type symptoms
  optional location

/result
  prediction
  confidence
  image
  symptoms
  weather
  recommendations

/history
  previous diagnoses

/settings
```

## 21.3 Diagnosis screen

```text
┌─────────────────────────────┐
│ Cotton Diagnosis            │
│                             │
│ [ Capture Leaf ]            │
│ [ Upload Image ]            │
│                             │
│ 🎤 Speak Symptoms           │
│ "brown spots are appearing" │
│                             │
│ 📍 Use Location             │
│                             │
│ [ Diagnose ]                │
└─────────────────────────────┘
```

## 21.4 Result screen

```text
┌─────────────────────────────┐
│ Diagnosis Result            │
│                             │
│ [leaf image]                │
│                             │
│ Target Spot                 │
│ Confidence: 91%             │
│                             │
│ Symptoms                    │
│ • brown circular spots      │
│ • yellowing                 │
│                             │
│ Weather                     │
│ 31°C / 82% humidity         │
│                             │
│ Recommendations             │
│ • remove severely affected  │
│   tissue                    │
│ • improve field sanitation  │
│                             │
│ [ View History ]            │
└─────────────────────────────┘
```

---

# 22. Project Folder Structure

```text
cotton-diagnosis/
│
├── data/
│   ├── raw/
│   │   └── customized-cotton/
│   ├── interim/
│   ├── processed/
│   ├── prototypes/
│   └── metadata.csv
│
├── ml/
│   ├── data/
│   │   ├── dataset.py
│   │   ├── metadata.py
│   │   ├── splits.py
│   │   └── labels.py
│   │
│   ├── preprocessing/
│   │   ├── image_preprocessor.py
│   │   ├── segmentation.py
│   │   └── augmentation.py
│   │
│   ├── models/
│   │   ├── vit_encoder.py
│   │   ├── text_encoder.py
│   │   ├── whisper_asr.py
│   │   ├── weather_encoder.py
│   │   ├── fusion.py
│   │   ├── prototype_classifier.py
│   │   └── protonet.py
│   │
│   ├── training/
│   │   ├── train_image.py
│   │   ├── train_multimodal.py
│   │   ├── train_protonet.py
│   │   ├── losses.py
│   │   └── trainer.py
│   │
│   ├── inference/
│   │   ├── predict.py
│   │   ├── confidence.py
│   │   └── pipeline.py
│   │
│   └── evaluation/
│       ├── metrics.py
│       ├── confusion_matrix.py
│       ├── calibration.py
│       └── fewshot_eval.py
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── dependencies.py
│   │   └── routes/
│   │       ├── auth.py
│   │       ├── diagnose.py
│   │       ├── weather.py
│   │       ├── transcribe.py
│   │       └── history.py
│   │
│   ├── db/
│   │   ├── models.py
│   │   ├── session.py
│   │   └── migrations/
│   │
│   └── kb/
│       ├── cotton_conditions.json
│       └── recommendations.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── utils/
│   └── ...
│
├── configs/
│   ├── base.yaml
│   ├── image.yaml
│   ├── multimodal.yaml
│   └── fewshot.yaml
│
├── notebooks/
├── scripts/
│   ├── download_data.py
│   ├── build_metadata.py
│   ├── clean_dataset.py
│   ├── build_symptoms.py
│   └── build_prototypes.py
│
├── tests/
│
├── docs/
│
├── requirements.txt
├── docker-compose.yml
└── README.md
```

---

# 23. API Design

## 23.1 Health

```http
GET /api/health
```

Response:

```json
{
  "status": "ok",
  "model_version": "cotton-mm-v1"
}
```

## 23.2 Diagnose

```http
POST /api/diagnose
```

Multipart:

```text
image
audio (optional)
symptoms_text (optional)
latitude (optional)
longitude (optional)
```

Response:

```json
{
  "prediction": "target_spot",
  "confidence": 0.91,
  "topk": [
    {
      "class": "target_spot",
      "score": 0.91
    },
    {
      "class": "bacterial_blight",
      "score": 0.06
    }
  ],
  "symptoms_text": "brown circular spots",
  "weather": {
    "temperature": 31.0,
    "humidity": 82.0,
    "rainfall": 3.2,
    "wind_speed": 2.1
  },
  "recommendations": [],
  "low_confidence": false,
  "model_version": "cotton-mm-v1"
}
```

## 23.3 Transcribe

```http
POST /api/transcribe
```

Response:

```json
{
  "text": "there are brown spots on the leaf",
  "language": "en",
  "duration_s": 5.8
}
```

## 23.4 Weather

```http
GET /api/weather?lat=...&lon=...
```

## 23.5 History

```http
GET /api/history
```

## 23.6 Authentication

```http
POST /api/auth/register
POST /api/auth/login
```

---

# 24. Exact Implementation Phases

## Phase 0 — Environment

Install:

```text
python
torch
torchvision
transformers
timm
sentence-transformers
faster-whisper
rembg
opencv-python
pillow
albumentations
scikit-learn
pandas
imagehash
fastapi
uvicorn
python-multipart
httpx
pytest
sqlalchemy
alembic
psycopg
```

Check:

```python
import torch

print("CUDA:", torch.cuda.is_available())
print("MPS:", torch.backends.mps.is_available())
```

---

## Phase 1 — Dataset ingestion

Download the exact Kaggle dataset.

Requirements:

- preserve raw data;
- print actual class names;
- print train/validation counts;
- detect nested folders;
- normalize label names;
- create metadata.csv.

Output:

```text
data/raw/customized-cotton/
data/metadata.csv
```

---

## Phase 2 — Data quality

Implement:

```text
corrupt-image check
duplicate detection
class histogram
image dimension analysis
visual sample grid
```

Output:

```text
reports/data_quality.json
reports/class_distribution.png
```

---

## Phase 3 — Image preprocessing

Implement:

```text
RGB
resize
rembg
crop
normalize
augmentation
```

Validate 30–50 randomly selected images manually.

---

## Phase 4 — ViT baseline

Train:

```text
pretrained ViT-B/16
+
task-specific head
```

Use Cross Entropy.

Save:

```text
artifacts/models/cotton_vit_best.pt
```

Track:

```text
train loss
val loss
train accuracy
val accuracy
macro-F1
```

---

## Phase 5 — Proper held-out test

Create a test set that is not used for model selection.

Generate:

```text
accuracy
macro-F1
confusion matrix
classification report
```

This becomes the baseline to beat.

---

## Phase 6 — Prototype classifier

Remove dependence on a normal linear classifier for the prototype experiment.

Create:

```text
fused/image embedding
        ↓
class prototype
        ↓
cosine similarity
```

Save:

```text
data/prototypes/prototypes.pt
data/prototypes/labels.json
```

---

## Phase 7 — Symptom text branch

Create a cotton symptom knowledge base.

Example structure:

```json
{
  "target_spot": {
    "symptoms": [
      "brown circular lesions",
      "dark centers with surrounding discoloration",
      "spots on leaf surface"
    ]
  }
}
```

Do not include disease names inside the generated text.

Generate multiple descriptions.

Run a text-only leakage test.

---

## Phase 8 — Multimodal concat model

Implement:

```text
ViT
+
MiniLM
+
concat MLP
```

Train only the new projections/fusion/head initially.

Compare to B2.

---

## Phase 9 — Weather context

Only enable model training with weather if valid image/date/location data exists.

Otherwise:

```text
Weather = UI context
```

not a claimed training modality.

---

## Phase 10 — Cross-attention

Implement:

```text
image patch tokens
+
text tokens
+
weather token
+
fusion token
```

Then Transformer encoder.

Compare:

```text
concat
vs
cross-attention
```

---

## Phase 11 — Prototype/metric training

Add:

```text
prototypical loss
```

Optionally:

```text
supervised contrastive loss
```

Analyze embedding space.

---

## Phase 12 — Few-shot ProtoNet

Define base/novel classes before training.

Run:

```text
1-shot
5-shot
10-shot
```

Use many episodes.

Store confidence intervals.

---

## Phase 13 — Backend

Implement:

```text
POST /api/diagnose
POST /api/transcribe
GET /api/weather
GET /api/history
POST /api/auth/register
POST /api/auth/login
```

Integrate the trained model.

---

## Phase 14 — Frontend

Implement:

```text
capture
upload
voice
typing
location
loading state
result
history
```

---

## Phase 15 — Integration testing

Test:

```text
image only
image + typed text
image + voice
image + location
image + text + location
invalid image
missing audio
weather API failure
low confidence
```

---

## Phase 16 — Deployment

Start with:

```text
Docker
FastAPI
PostgreSQL
Nginx
React
```

Run inference on CPU first.

---

# 25. MVP Version

The MVP should **not** attempt every research feature immediately.

## Required MVP

```text
Customized Cotton Dataset
        ↓
image preprocessing
        ↓
ViT-B/16
        ↓
trained cotton classifier
        ↓
prototype classifier
        ↓
FastAPI
        ↓
React
```

Also include:

```text
typed symptoms
```

before adding Whisper.

## MVP result

A user should be able to:

1. upload a cotton image;
2. enter optional symptoms;
3. click Diagnose;
4. receive a cotton class and confidence;
5. view history.

## MVP should not depend on

```text
SAM2
large Whisper
MAML
vector database
Kubernetes
cloud GPU at inference
live weather training
```

---

# 26. Research-Grade Version

Add:

```text
Whisper voice input
+
MiniLM / BERT benchmark
+
valid weather joins
+
token-level cross-attention
+
prototype/metric learning
+
ProtoNet
+
novel-class evaluation
+
calibration
+
segmentation ablation
+
cross-dataset robustness
```

The thesis/report should focus on the measured deltas:

```text
B2 → B3
B3 → B5
B5 → B6
B6 → B7
B7 → B8
```

---

# 27. Testing

## 27.1 Unit tests

Test:

```text
label normalization
metadata parser
image preprocessing
weather parser
prototype calculation
similarity calculation
confidence threshold
```

## 27.2 ML tests

Check:

```text
no NaN embeddings
no empty batches
no label outside class mapping
no train/test duplicates
class count consistency
checkpoint loads successfully
```

## 27.3 API tests

Use `pytest + httpx`.

Cases:

```text
200 valid diagnosis
400 invalid file
413 oversized file
422 invalid coordinates
500 model failure handled safely
```

## 27.4 Frontend tests

Test:

```text
image upload
camera permission handling
microphone permission handling
diagnose button
loading
result display
history rendering
```

---

# 28. Deployment

## 28.1 Local development

```text
React
localhost:5173

FastAPI
localhost:8000

PostgreSQL
localhost:5432
```

## 28.2 Docker Compose

Services:

```text
frontend
api
db
nginx
```

## 28.3 ML artifact packaging

Do not retrain the model on every server start.

Package:

```text
models/
    cotton_vit_best.pt
    multimodal_best.pt
    protonet_best.pt
    prototypes.pt
    labels.json
```

## 28.4 Model versioning

Use:

```text
cotton-image-v1
cotton-mm-v1
cotton-protonet-v1
```

Record model version in every diagnosis.

---

# 29. Research / Literature Review Positioning

## 29.1 What is established

Vision Transformers have been applied to cotton disease classification, including the exact Customized Cotton Disease Dataset. A published tutorial demonstrates fine-tuning ViT-B/16 at 224×224 on this dataset.

The linked Kaggle dataset has also been used in other cotton pest/disease studies.

References to retain in the literature review:

- Kaggle Customized Cotton Disease Dataset.
- ViT for cotton disease classification.
- Cotton pest/disease detection studies using Kaggle cotton datasets.
- Few-shot plant-disease classification literature.
- Prototype Networks / metric learning.
- Multimodal image-text fusion literature.
- Weather-aware crop disease literature.

## 29.2 What this project adds

The research claim should be framed around the **combination and evaluation protocol**, not "inventing ViT."

Possible contribution areas:

1. Cotton-specific multimodal diagnosis using image + symptom text.
2. Explicit voice → text input path for farmer UX.
3. Optional weather context with leakage controls.
4. Token-level cross-modal fusion.
5. Prototype-based classification.
6. Few-shot novel-class evaluation.
7. Ablation of each modality and component.

## 29.3 Avoid exaggerated novelty

Do not write:

> "First AI system ever to combine image, voice, weather and meta-learning."

Instead write:

> "This work investigates a cotton-specific multimodal architecture that integrates image, symptom text, optional weather context, prototype-based classification, and few-shot evaluation under controlled ablation protocols."

---

# 30. Risks, Limitations and Scientific Constraints

## 30.1 Dataset size

The exact Kaggle dataset is much smaller than broad plant datasets.

This is why:

```text
pretrained ViT
+
strong augmentation
+
frozen backbone initially
```

is preferred over training a Transformer from scratch.

## 30.2 Dataset semantics

The 8 classes are heterogeneous:

```text
disease
pest
healthy
boll condition
```

Therefore class semantics must be documented.

## 30.3 Synthetic text

Synthetic symptom text is not equivalent to actual farmer language.

Treat it as:

```text
engineering augmentation
+
controlled experiment
```

not as field-collected language data.

## 30.4 Synthetic voice

TTS is useful to verify the pipeline but cannot substitute for real farmer speech.

Measure real/synthetic ASR separately if real recordings become available.

## 30.5 Weather

Weather is only scientifically meaningful when attached independently to image acquisition context.

Do not generate weather from disease labels.

## 30.6 Few-shot limitations

Eight classes provide a limited basis for novel-class experiments.

Therefore the few-shot study is an **experimental demonstration of the method**, not evidence that the system can generalize to every possible future cotton disease.

## 30.7 Treatment recommendations

The model should not generate pesticide doses or chemical schedules autonomously.

Use a curated knowledge base.

The ML diagnosis and recommendation engine should remain separate.

## 30.8 Confidence

Softmax probability is not automatically calibrated.

Use:

```text
temperature scaling
ECE
validation-set threshold
```

before showing confidence percentages.

## 30.9 Cross-dataset limitations

If an independent dataset has different class definitions, only compare overlapping semantic labels.

---

# 31. Final End-to-End Inference Pipeline

This is the final production path.

```text
                 FARMER
                    │
                    ▼
          ┌──────────────────┐
          │ Cotton Leaf Image│
          └────────┬─────────┘
                   │
                   ▼
          Image Preprocessing
                   │
          rembg / crop / resize
                   │
                   ▼
              ViT-B/16
                   │
          image representation
                   │
          ┌────────┴───────────┐
          │                    │
          ▼                    ▼
     Voice / Text           Location
          │                    │
          ▼                    ▼
       Whisper             Weather API
          │                    │
          ▼                    ▼
       Text                  MLP
          │                    │
          ▼                    ▼
      MiniLM              Weather token
          │                    │
          └─────────┬──────────┘
                    ▼
       Multimodal Transformer
          / Cross-Attention
                    │
                    ▼
             Fused 256-d
                    │
                    ▼
            Prototype Memory
                    │
                    ▼
          Cosine Similarity
                    │
                    ▼
       Cotton class + confidence
                    │
                    ▼
          Recommendation KB
                    │
                    ▼
              FastAPI
                    │
                    ▼
              React UI
                    │
                    ▼
                  FARMER
```

---

# 32. Final Implementation Order

Do **not** start with cross-attention or meta-learning.

Use this exact order:

```text
1. Download Customized Cotton Disease Dataset
        ↓
2. Verify class folders and counts
        ↓
3. Build metadata.csv
        ↓
4. Deduplicate
        ↓
5. Preprocess images
        ↓
6. Train ViT image baseline
        ↓
7. Evaluate on held-out test
        ↓
8. Build prototype classifier
        ↓
9. Add typed symptom text
        ↓
10. Test image + text
        ↓
11. Add Whisper
        ↓
12. Add valid weather context if metadata permits
        ↓
13. Build concat fusion
        ↓
14. Build cross-attention fusion
        ↓
15. Metric/prototype training
        ↓
16. Few-shot ProtoNet
        ↓
17. Calibration and ablations
        ↓
18. FastAPI integration
        ↓
19. React integration
        ↓
20. PostgreSQL history
        ↓
21. Docker deployment
```

## The most important checkpoint

Do not proceed beyond step 6 until you have:

```text
trained ViT model
validation metrics
held-out test metrics
confusion matrix
saved checkpoint
```

That is your **core ML baseline**.

---

# 33. START HERE

## 33.1 Create project

```bash
mkdir -p cotton-diagnosis
cd cotton-diagnosis

mkdir -p data/{raw,interim,processed,prototypes} \
         ml/{data,preprocessing,models,training,inference,evaluation} \
         backend/{app,db,kb} \
         frontend \
         configs notebooks scripts tests docs
```

## 33.2 Create environment

```bash
python3 -m venv .venv
source .venv/bin/activate

python -m pip install --upgrade pip

pip install \
  torch torchvision \
  transformers timm \
  sentence-transformers \
  faster-whisper \
  rembg \
  albumentations \
  opencv-python pillow \
  scikit-learn pandas imagehash \
  fastapi "uvicorn[standard]" \
  python-multipart httpx \
  sqlalchemy alembic psycopg \
  pytest
```

## 33.3 Check Apple Silicon / GPU

```bash
python -c "import torch; print('CUDA:', torch.cuda.is_available()); print('MPS:', torch.backends.mps.is_available())"
```

## 33.4 Download the exact Kaggle dataset

Install/configure Kaggle CLI first.

Then:

```bash
kaggle datasets download \
  -d saeedazfar/customized-cotton-disease-dataset \
  -p data/raw \
  --unzip
```

Do not assume the extracted directory name.

Inspect:

```bash
find data/raw -maxdepth 6 -type d | head -n 100
```

## 33.5 Verify the classes

Create a script that prints:

```text
class_name
train_count
validation_count
```

Expected canonical classes:

```text
Aphids
Army worm
Bacterial blight
Cotton Boll Rot
Green Cotton Boll
Healthy
Powdery mildew
Target spot
```

Normalize aliases such as:

```text
Bacterial Blight -> bacterial_blight
Cotton Boll rot -> cotton_boll_rot
Healthy leaf edited -> healthy
Powdery Mildew Edited -> powdery_mildew
```

## 33.6 Build the first model

Start only with:

```text
image
 ↓
ViT-B/16
 ↓
classifier
```

Do not start with:

```text
Whisper
weather
cross-attention
ProtoNet
```

Your first success condition is:

```text
TRAINED MODEL EXISTS
+
HELD-OUT TEST METRICS EXIST
+
CONFUSION MATRIX EXISTS
```

## 33.7 First artifacts to produce

```text
artifacts/
├── models/
│   └── cotton_vit_best.pt
├── metrics/
│   ├── test_metrics.json
│   ├── classification_report.json
│   └── confusion_matrix.png
└── logs/
    └── training.csv
```

## 33.8 Then add research components

After the baseline works:

```text
ViT
 ↓
Image + text
 ↓
Image + text + valid weather
 ↓
Cross-attention
 ↓
Prototype memory
 ↓
ProtoNet
```

## 33.9 Final deliverable

The finished repository should contain:

```text
✅ Trained ML model
✅ Prototype memory
✅ Few-shot training/evaluation code
✅ Dataset preprocessing pipeline
✅ Voice-to-text pipeline
✅ Weather API integration
✅ FastAPI backend
✅ PostgreSQL database
✅ React frontend
✅ Evaluation and ablation reports
✅ Docker deployment
✅ Thesis/report documentation
```

---

# Final One-Line Definition

> **Train a cotton-specific ViT-based image model on the Customized Cotton Disease Dataset, extend it with leakage-controlled symptom text and optional valid weather context, fuse the modalities with a multimodal transformer, classify using learned prototypes, investigate few-shot ProtoNet adaptation, and expose the complete trained pipeline through FastAPI and a React application.**

## Primary References

1. Kaggle — Customized Cotton Disease Dataset  
   https://www.kaggle.com/datasets/saeedazfar/customized-cotton-disease-dataset

2. Cotton Disease Classification Using Vision Transformers  
   https://debuggercafe.com/cotton-disease-classification-using-vision-transformer/

3. Cotton pest/disease research using the same Kaggle dataset  
   https://pmc.ncbi.nlm.nih.gov/articles/PMC10913016/

4. Further cotton dataset cross-dataset research reference  
   https://www.nature.com/articles/s41598-025-34713-w

---

## Final project status checklist

```text
[ ] Dataset downloaded
[ ] Class mapping verified
[ ] Metadata generated
[ ] Duplicate scan complete
[ ] Image preprocessing complete
[ ] ViT baseline trained
[ ] Held-out test evaluated
[ ] Prototype classifier working
[ ] Symptom text branch working
[ ] Text leakage test passed
[ ] Whisper branch working
[ ] Weather context integrated safely
[ ] Concat fusion evaluated
[ ] Cross-attention evaluated
[ ] Prototype/metric learning evaluated
[ ] Few-shot ProtoNet evaluated
[ ] Calibration complete
[ ] FastAPI integrated
[ ] PostgreSQL integrated
[ ] React frontend integrated
[ ] End-to-end test passed
[ ] Docker deployment working
[ ] Research tables/ablations completed
```
