"""Train and select the PlantVillage classifier.

Two stages, matching plan §8.6 but sized for this measured environment
(CPU only, 4 logical cores, ~8 GB RAM):

  Stage 1  screening  -- extract penultimate features once per candidate with a
                         frozen backbone, fit a linear probe, compare macro-F1 on
                         the held-out val split under identical preprocessing.
  Stage 2  fine-tune  -- open the last `unfreeze_blocks` blocks of the winning
                         candidate plus the head, train with augmentation and
                         early stopping on val macro-F1, save the best checkpoint.

Only candidates actually run are recorded in the run log. Nothing is written to
reports that was not measured by this script.

Usage:
    python ml/train.py --config ml/configs/plantvillage_v1.yaml --stage screen
    python ml/train.py --config ml/configs/plantvillage_v1.yaml --stage finetune --model mobilenet_v2
    python ml/train.py --config ml/configs/plantvillage_v1.yaml --stage all
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import sys
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import yaml
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ml.inference.preprocessing import PreprocessConfig, resize_and_crop  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]


# ---------------------------------------------------------------- data
class ZipDataset(Dataset):
    """Reads images straight from the Kaggle ZIP.

    Avoids extracting 54k files (Windows Defender makes that path extremely slow)
    and keeps the training/eval code identical across machines.
    """

    def __init__(self, rows: list[dict], zip_path: Path, cfg: PreprocessConfig,
                 train: bool, image_size: int | None = None, augment: bool = False):
        self.rows = rows
        self.zip_path = zip_path
        self.cfg = cfg
        self.size = image_size or cfg.image_size
        self.augment = augment and train
        self._zip = None
        self.tf = transforms.Compose([
            transforms.RandomResizedCrop(self.size, scale=(0.7, 1.0), ratio=(0.85, 1.18)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.RandomRotation(degrees=10),
            transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.1),
            transforms.ToTensor(),
            transforms.Normalize(cfg.mean, cfg.std),
        ])

    def __len__(self) -> int:
        return len(self.rows)

    def _handle(self):
        if self._zip is None:
            self._zip = zipfile.ZipFile(self.zip_path)
        return self._zip

    def __getitem__(self, idx: int):
        row = self.rows[idx]
        data = self._handle().read(row["path"])
        im = Image.open(__import__("io").BytesIO(data))
        im = im.convert("RGB")
        im = resize_and_crop(im, self.size) if self.augment else resize_and_crop(im, self.size)
        x = self.tf(im) if self.augment else transforms.functional.normalize(
            transforms.functional.to_tensor(im), self.cfg.mean, self.cfg.std)
        return x, row["class_index"]


def load_rows(csv_path: Path) -> list[dict]:
    with open(csv_path, newline="", encoding="utf-8") as f:
        return [{"path": r["path"], "label": r["label"], "class_index": int(r["class_index"])}
                for r in csv.DictReader(f)]


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.set_num_threads(max(1, (os.cpu_count() or 2) - 1))


def build_model(name: str, n_classes: int, pretrained: bool = True) -> nn.Module:
    weights = "DEFAULT" if pretrained else None
    if name == "mobilenet_v2":
        m = models.mobilenet_v2(weights=weights)
        m.classifier[1] = nn.Linear(m.classifier[1].in_features, n_classes)
        m._feat = lambda x: m.features(x).mean([2, 3])
        return m
    if name == "efficientnet_b0":
        m = models.efficientnet_b0(weights=weights)
        m.classifier[1] = nn.Linear(m.classifier[1].in_features, n_classes)
        m._feat = lambda x: m.features(x).mean([2, 3])
        return m
    if name == "resnet18":
        m = models.resnet18(weights=weights)
        m.fc = nn.Linear(m.fc.in_features, n_classes)

        def _resnet_feat(x, net=m):
            z = net.conv1(x)
            z = net.bn1(z)
            z = net.relu(z)
            return torch.flatten(net.avgpool(net.layer4(net.layer3(net.layer2(net.layer1(z))))), 1)

        m._feat = _resnet_feat
        return m
    raise ValueError(f"unknown model {name}")


def freeze_backbone(model: nn.Module, name: str) -> None:
    for p in model.parameters():
        p.requires_grad = False
    head = model.classifier[-1] if name != "resnet18" else model.fc
    for p in head.parameters():
        p.requires_grad = True


def unfreeze_tail(model: nn.Module, name: str, blocks: int) -> list[nn.Parameter]:
    """Unfreeze the last `blocks` stages of the feature extractor plus the head."""
    for p in model.parameters():
        p.requires_grad = False
    if name == "resnet18":
        stages = [model.layer4, model.layer3, model.layer2]
        for stage in stages[:blocks]:
            for p in stage.parameters():
                p.requires_grad = True
        for p in model.fc.parameters():
            p.requires_grad = True
    else:
        children = list(model.features.children())
        for block in children[-blocks:]:
            for p in block.parameters():
                p.requires_grad = True
        for p in model.classifier.parameters():
            p.requires_grad = True
    return [p for p in model.parameters() if p.requires_grad]


# ---------------------------------------------------------------- stage 1
def extract_features(model, rows, zip_path, cfg, batch_size, workers, size):
    ds = ZipDataset(rows, zip_path, cfg, train=False, image_size=size)
    dl = DataLoader(ds, batch_size=batch_size, shuffle=False, num_workers=workers)
    feats, labels = [], []
    t0 = time.time()
    with torch.no_grad():
        for i, (xb, yb) in enumerate(dl, 1):
            feats.append(model._feat(xb).numpy())
            labels.append(yb.numpy())
            if i % 50 == 0:
                print(f"    batch {i}/{len(dl)}  {time.time() - t0:.0f}s", flush=True)
    return np.concatenate(feats), np.concatenate(labels)


def stage_screen(cfg, args) -> dict:
    proc = PreprocessConfig.from_dict(cfg)
    zip_path = Path(cfg["dataset"]["source"])
    proc_dir = Path(cfg["dataset"]["manifest_dir"]) / cfg["run"]["name"]
    train_rows = load_rows(proc_dir / "train.csv")
    val_rows = load_rows(proc_dir / "val.csv")

    # stratified subsample keeps Stage 1 inside the plan's 2-hour box on 4 CPU cores
    n_train = args.screen_train or len(train_rows)
    n_val = args.screen_val or len(val_rows)
    by_class: dict[int, list[dict]] = {}
    for r in train_rows:
        by_class.setdefault(r["class_index"], []).append(r)
    rng = random.Random(cfg["run"]["seed"])
    sub_train = []
    for rows in by_class.values():
        rng.shuffle(rows)
        sub_train.extend(rows[: max(1, int(n_train * len(rows) / len(train_rows)))])
    by_class_v: dict[int, list[dict]] = {}
    for r in val_rows:
        by_class_v.setdefault(r["class_index"], []).append(r)
    sub_val = []
    for rows in by_class_v.values():
        rng.shuffle(rows)
        sub_val.extend(rows[: max(1, int(n_val * len(rows) / len(val_rows)))])
    print(f"screen train={len(sub_train)} val={len(sub_val)} size={args.screen_size}")

    results = []
    for name in cfg["train"]["candidates"]:
        print(f"\n=== screening {name} ===", flush=True)
        t0 = time.time()
        model = build_model(name, 38, pretrained=True)
        model.eval()
        Xtr, ytr = extract_features(model, sub_train, zip_path, proc, 64,
                                    cfg["train"]["num_workers"], args.screen_size)
        Xva, yva = extract_features(model, sub_val, zip_path, proc, 64,
                                    cfg["train"]["num_workers"], args.screen_size)
        clf = LogisticRegression(max_iter=cfg["screening"]["probe_max_iter"],
                                 C=cfg["screening"]["probe_C"], n_jobs=-1)
        clf.fit(Xtr, ytr)
        pred = clf.predict(Xva)
        f1m = f1_score(yva, pred, average="macro")
        acc = float((pred == yva).mean())
        elapsed = time.time() - t0
        print(f"{name}: val macro-F1={f1m:.4f} acc={acc:.4f} ({elapsed:.0f}s)", flush=True)
        results.append({"model": name, "val_macro_f1": round(float(f1m), 4),
                        "val_accuracy": round(acc, 4), "seconds": round(elapsed, 1),
                        "features_train": len(sub_train), "features_val": len(sub_val)})
        del model, Xtr, yva, Xva
    out = proc_dir / "screening.json"
    out.write_text(json.dumps({"results": results,
                               "config": cfg, "generated_at": datetime.now(timezone.utc).isoformat()},
                              indent=2), encoding="utf-8")
    best = max(results, key=lambda r: r["val_macro_f1"])
    print(f"\nbest candidate: {best['model']} (val macro-F1={best['val_macro_f1']})")
    return best


# ---------------------------------------------------------------- stage 2
def stage_finetune(cfg, args) -> dict:
    proc = PreprocessConfig.from_dict(cfg)
    zip_path = Path(cfg["dataset"]["source"])
    proc_dir = Path(cfg["dataset"]["manifest_dir"]) / cfg["run"]["name"]
    train_rows = load_rows(proc_dir / "train.csv")
    val_rows = load_rows(proc_dir / "val.csv")
    if args.finetune_train:
        rng = random.Random(cfg["run"]["seed"])
        by_class: dict[int, list[dict]] = {}
        for r in train_rows:
            by_class.setdefault(r["class_index"], []).append(r)
        keep = []
        for rows in by_class.values():
            rng.shuffle(rows)
            keep.extend(rows[: max(1, int(args.finetune_train * len(rows) / len(train_rows)))])
        train_rows = keep
    print(f"finetune train={len(train_rows)} val={len(val_rows)}", flush=True)

    name = args.model
    model = build_model(name, 38, pretrained=True)
    params = unfreeze_tail(model, name, cfg["train"]["unfreeze_blocks"])
    n_trainable = sum(p.numel() for p in params)
    print(f"{name}: {n_trainable:,} trainable params", flush=True)

    tf_train = ZipDataset(train_rows, zip_path, proc, train=True,
                          image_size=args.finetune_size, augment=True)
    tf_val = ZipDataset(val_rows, zip_path, proc, train=False, image_size=args.finetune_size)
    tr_dl = DataLoader(tf_train, batch_size=cfg["train"]["batch_size"], shuffle=True,
                       num_workers=cfg["train"]["num_workers"], drop_last=True)
    va_dl = DataLoader(tf_val, batch_size=cfg["train"]["batch_size"], shuffle=False,
                       num_workers=cfg["train"]["num_workers"])

    crit = nn.CrossEntropyLoss(label_smoothing=cfg["train"]["label_smoothing"])
    opt = torch.optim.AdamW([
        {"params": [p for n, p in model.named_parameters() if p.requires_grad and "classifier" not in n and "fc" not in n],
         "lr": cfg["train"]["lr_backbone"]},
        {"params": [p for n, p in model.named_parameters() if p.requires_grad and ("classifier" in n or "fc" in n)],
         "lr": cfg["train"]["lr_head"]},
    ], weight_decay=cfg["train"]["weight_decay"])
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=cfg["train"]["epochs"])

    ckpt_dir = Path("ml/checkpoints") / cfg["run"]["name"]
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    best_f1, best_epoch, patience = -1.0, -1, 0
    history = []
    for epoch in range(1, cfg["train"]["epochs"] + 1):
        model.train()
        t0, running, seen = time.time(), 0.0, 0
        for i, (xb, yb) in enumerate(tr_dl, 1):
            opt.zero_grad()
            loss = crit(model(xb), yb)
            loss.backward()
            opt.step()
            running += loss.item() * len(xb); seen += len(xb)
            if i % 50 == 0:
                print(f"  ep{epoch} batch {i}/{len(tr_dl)} loss={running/seen:.4f} "
                      f"{time.time()-t0:.0f}s", flush=True)
        sched.step()

        model.eval()
        preds, gts = [], []
        with torch.no_grad():
            for xb, yb in va_dl:
                preds.append(model(xb).argmax(1).numpy()); gts.append(yb.numpy())
        preds, gts = np.concatenate(preds), np.concatenate(gts)
        f1m = f1_score(gts, preds, average="macro")
        acc = float((preds == gts).mean())
        rec = {"epoch": epoch, "train_loss": round(running / max(seen, 1), 4),
               "val_macro_f1": round(float(f1m), 4), "val_accuracy": round(acc, 4),
               "seconds": round(time.time() - t0, 1)}
        history.append(rec)
        print(f"  epoch {epoch}: {rec}", flush=True)
        if f1m > best_f1 + 1e-4:
            best_f1, best_epoch, patience = float(f1m), epoch, 0
            torch.save({"model": name, "state_dict": model.state_dict(),
                        "epoch": epoch, "val_macro_f1": float(f1m),
                        "class_names": sorted({r["label"] for r in train_rows}),
                        "config": cfg}, ckpt_dir / "best.pt")
            print(f"  saved best.pt (f1={best_f1:.4f})", flush=True)
        else:
            patience += 1
            if patience >= cfg["train"]["early_stop_patience"]:
                print("  early stopping", flush=True)
                break

    result = {"model": name, "best_epoch": best_epoch, "best_val_macro_f1": round(best_f1, 4),
              "history": history, "checkpoint": str(ckpt_dir / "best.pt"),
              "trainable_params": n_trainable, "image_size": args.finetune_size,
              "train_images": len(train_rows)}
    (ckpt_dir / "finetune_log.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--stage", choices=["screen", "finetune", "all"], default="all")
    ap.add_argument("--model", default="mobilenet_v2")
    ap.add_argument("--screen-train", type=int, default=6000)
    ap.add_argument("--screen-val", type=int, default=1900)
    ap.add_argument("--screen-size", type=int, default=160)
    ap.add_argument("--finetune-train", type=int, default=12000)
    ap.add_argument("--finetune-size", type=int, default=192)
    args = ap.parse_args()
    cfg = yaml.safe_load(open(args.config, encoding="utf-8"))
    set_seed(int(cfg["run"]["seed"]))

    if args.stage in ("screen", "all"):
        best = stage_screen(cfg, args)
        args.model = best["model"]
    if args.stage in ("finetune", "all"):
        stage_finetune(cfg, args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
