# Data sources (ML-01)

## PlantVillage (training data)

| Item | Value |
|---|---|
| Source | https://github.com/spMohanty/PlantVillage-Dataset, folder `raw/color/` |
| Pinned commit | `7f7ecc7e1eaca78107e3affe7cb5abd9427e139a` (master HEAD on 2026-10-17) |
| Downloaded | 2026-10-17, shallow sparse clone of the 17 MVP class folders plus `leaf-map.json` |
| Licence | **CC BY-SA 3.0**, as declared in the repo's dataset card (`README_HF.md`, `license: cc-by-sa-3.0`). The repo has no separate LICENSE file. Images are not redistributed here (`ml/data/` is gitignored); attribute the dataset in the demo and model card. |
| Paper | Mohanty, Hughes & Salathé (2016), *Using Deep Learning for Image-Based Plant Disease Detection*, Frontiers in Plant Science |
| Image type | Lab-style photos of single leaves on plain backgrounds. Expect a large accuracy drop on field photos (plan §9.1). |

### Leakage control

PlantVillage often has several photos of the same physical leaf. `ml/prepare.py` groups images before splitting, so a leaf never appears in two splits:

1. **Dataset leaf grouping:** `leaf-map.json`, matched to filenames with the same normalisation as the official loader (`plant_village.py`).
2. **Byte-identical files** (sha256). If identical bytes appear under two classes, that's a label conflict, and both copies are excluded.
3. **Near-duplicates within a class:** 64-bit difference hash, Hamming distance ≤ 4.

The split is 70/15/15 per class, assigned group by group with seed 42. The committed `ml/splits/manifest.csv` (path, sha256, class, split, group, leaf id) is the dataset version. `ml/splits/summary.json` has the counts.

### Counts (from `ml/splits/summary.json`)

- 24,164 images in 17 classes, all readable, all 256×256 RGB.
- 13,563 images (56%) matched a leaf ID in `leaf-map.json`; the rest are their own groups unless hashing merges them.
- 13,941 groups after merging. The largest group has 8 images, and 3,383 leaves have 4 photos each, so a random image-level split would have leaked.
- 14 byte-identical duplicate files and 53 near-duplicate pairs, merged into their groups. No cross-class conflicts.
- Split: 16,881 train / 3,642 val / 3,641 test (69.9 / 15.1 / 15.0%).
- Class imbalance: 5,357 yellow-leaf-curl images vs 152 healthy potato, about 35×. Use class weights in training (plan §9.1-6).

| Class | Train | Val | Test |
|---|---|---|---|
| tomato__bacterial_spot | 1488 | 319 | 320 |
| tomato__early_blight | 696 | 152 | 152 |
| tomato__late_blight | 1335 | 286 | 288 |
| tomato__leaf_mold | 664 | 144 | 144 |
| tomato__septoria_leaf_spot | 1235 | 268 | 268 |
| tomato__spider_mites | 1172 | 252 | 252 |
| tomato__target_spot | 982 | 211 | 211 |
| tomato__yellow_leaf_curl_virus | 3748 | 806 | 803 |
| tomato__mosaic_virus | 261 | 56 | 56 |
| tomato__healthy | 1109 | 241 | 241 |
| potato__early_blight | 696 | 152 | 152 |
| potato__late_blight | 696 | 152 | 152 |
| potato__healthy | 104 | 24 | 24 |
| maize__gray_leaf_spot | 359 | 77 | 77 |
| maize__common_rust | 834 | 179 | 179 |
| maize__northern_leaf_blight | 689 | 148 | 148 |
| maize__healthy | 813 | 175 | 174 |

### Reproduce

```bash
git clone --depth 1 --filter=blob:none --no-checkout https://github.com/spMohanty/PlantVillage-Dataset ml/data/plantvillage
```
```bash
MSYS_NO_PATHCONV=1 git -C ml/data/plantvillage sparse-checkout set --no-cone '/leaf-map.json' '/raw/color/Tomato___*/' '/raw/color/Potato___*/' '/raw/color/Corn_(maize)___*/'
```
```bash
git -C ml/data/plantvillage checkout
```
```bash
python -I ml/prepare.py --data ml/data/plantvillage --labels backend/app/ml/labels.json --out ml/splits
```

Check that `git -C ml/data/plantvillage rev-parse HEAD` prints the pinned commit. The class list comes from `backend/app/ml/labels.json`, the single source of truth for labels. Downloading about 420 MB took about 13 minutes on this connection.

## Not used yet

- **PlantDoc** (field images): reserved for field-image evaluation (Tier 2). Licence and class mapping not yet verified.
- **Indian rice/wheat/cotton datasets:** Tier 3. PlantVillage has no rice or wheat.
