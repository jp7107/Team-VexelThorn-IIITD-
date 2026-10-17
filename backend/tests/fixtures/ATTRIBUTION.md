# Test fixtures

`tomato__early_blight.jpg` and `maize__common_rust.jpg` are two images from the PlantVillage dataset
(Hughes & Salathé; https://github.com/spMohanty/PlantVillage-Dataset, commit 7f7ecc7e, `raw/color/`),
licensed CC BY-SA 3.0. They come from the validation split (see `ml/splits/manifest.csv`) and were picked by
`ml/export_onnx.py` as images the shipped model classifies correctly, so the tests check real inference.
