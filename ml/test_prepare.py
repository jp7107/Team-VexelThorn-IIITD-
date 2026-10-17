"""Checks for the leakage-sensitive parts of prepare.py. Run: python -I -m pytest ml/test_prepare.py -q"""

import numpy as np
from PIL import Image

from prepare import UnionFind, dhash, leaf_id, near_duplicate_pairs, split_groups

LEAF_MAP = {
    "rs_early.b 7557": ["Potato___Early_blight:::115.0"],
    "shared 1": ["Tomato___Leaf_Mold:::3.0", "Tomato___Target_Spot:::9.0"],
}


def test_leaf_id_matches_official_loader_normalisation():
    assert leaf_id("Potato___Early_blight", "0a07-uuid___RS_Early.B 7557.JPG", LEAF_MAP) == "Potato___Early_blight:::115.0"
    assert leaf_id("Potato___Early_blight", "uuid___RS_Early.B 7557 copy 2.jpg", LEAF_MAP) == "Potato___Early_blight:::115.0"
    assert leaf_id("Tomato___Target_Spot", "uuid___Shared 1.JPG", LEAF_MAP) == "Tomato___Target_Spot:::9.0"
    assert leaf_id("Potato___healthy", "uuid___Unknown 1.JPG", LEAF_MAP) is None


def test_dhash_is_stable_and_separates_different_images():
    gradient = Image.fromarray(np.tile(np.arange(256, dtype=np.uint8), (256, 1)))
    flipped = gradient.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    assert dhash(gradient) == dhash(gradient.resize((200, 200)))
    assert bin(dhash(gradient) ^ dhash(flipped)).count("1") > 32


def test_near_duplicate_pairs_threshold():
    hashes = np.array([0b0000, 0b0011, 0b1111_1111], dtype=np.uint64)
    assert near_duplicate_pairs(hashes, 2) == [(0, 1)]
    assert near_duplicate_pairs(hashes, 8) == [(0, 1), (0, 2), (1, 2)]


def test_union_find_merges_transitively():
    uf = UnionFind(4)
    uf.union(0, 1)
    uf.union(1, 3)
    assert uf.find(3) == uf.find(0) != uf.find(2)


def test_split_keeps_groups_whole_and_hits_ratios():
    rng = np.random.default_rng(0)
    sizes = {gid: int(rng.integers(1, 6)) for gid in range(600)}
    assignment = split_groups({"cls": sizes}, seed=42)
    assert set(assignment) == set(sizes)  # every group assigned exactly once
    totals = {s: sum(n for g, n in sizes.items() if assignment[g] == s) for s in ("train", "val", "test")}
    total = sum(sizes.values())
    assert abs(totals["train"] / total - 0.70) < 0.02
    assert abs(totals["val"] / total - 0.15) < 0.02
    assert split_groups({"cls": sizes}, seed=42) == assignment  # deterministic
