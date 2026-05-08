#!/usr/bin/env python3
"""
Triage vehicle crops before labeling.

Scans today's vehicle captures, reports quality stats, and copies the 200
lowest-quality images to data/test_holdout/ — held back from training forever.

Usage:
    python triage.py [--date YYYY-MM-DD]
"""

import argparse
import shutil
import sys
from datetime import date
from pathlib import Path

import cv2
from PIL import Image

SCRIPT_DIR = Path(__file__).parent
CAPTURES_BASE = SCRIPT_DIR / "../pi/captures"
HOLDOUT_DIR = SCRIPT_DIR / "data/test_holdout"
BLUR_THRESHOLD = 100
HOLDOUT_COUNT = 200

CLASSES = [
    "car", "suv", "pickup_truck", "box_truck", "delivery_van", "rv",
    "logging_truck", "overland_rig", "emergency_vehicle", "motorcycle", "bicycle",
]


def laplacian_variance(img_path: Path) -> float:
    img = cv2.imread(str(img_path), cv2.IMREAD_GRAYSCALE)
    if img is None:
        return 0.0
    return float(cv2.Laplacian(img, cv2.CV_64F).var())


def image_dims(img_path: Path) -> tuple[int, int]:
    try:
        with Image.open(img_path) as img:
            return img.size  # (width, height)
    except Exception:
        return (0, 0)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", default=date.today().isoformat(),
                        help="Date folder to scan (default: today)")
    args = parser.parse_args()

    vehicles_dir = CAPTURES_BASE / args.date / "vehicles"
    if not vehicles_dir.exists():
        print(f"ERROR: {vehicles_dir} does not exist", file=sys.stderr)
        sys.exit(1)

    images = sorted(
        p for p in vehicles_dir.iterdir()
        if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
    )
    total = len(images)
    if total == 0:
        print(f"No images found in {vehicles_dir}")
        sys.exit(0)

    print(f"Scanning {vehicles_dir} …")

    scores: list[tuple[float, Path]] = []
    blurry: set[Path] = set()
    dims_counter: dict[tuple[int, int], int] = {}

    for path in images:
        score = laplacian_variance(path)
        w, h = image_dims(path)
        dims_counter[(w, h)] = dims_counter.get((w, h), 0) + 1
        if score < BLUR_THRESHOLD:
            blurry.add(path)
        scores.append((score, path))

    scores.sort(key=lambda x: x[0])  # ascending — worst quality first

    HOLDOUT_DIR.mkdir(parents=True, exist_ok=True)
    holdout_set: set[Path] = set()
    for score, path in scores[:HOLDOUT_COUNT]:
        dest = HOLDOUT_DIR / path.name
        if not dest.exists():
            shutil.copy2(path, dest)
        holdout_set.add(path)

    moved = len(holdout_set)
    kept = total - moved
    blurry_in_holdout = len(blurry & holdout_set)
    blurry_kept = len(blurry) - blurry_in_holdout

    print("\n── Image dimensions ───────────────────────")
    for (w, h), count in sorted(dims_counter.items()):
        print(f"  {w}×{h}  ×{count}")

    print("\n── Summary ────────────────────────────────")
    print(f"  Total images:       {total}")
    print(f"  Kept for labeling:  {kept}")
    print(f"  Moved to holdout:   {moved}  →  {HOLDOUT_DIR.resolve()}")
    print(f"  Flagged blurry:     {len(blurry)} total  ({blurry_kept} remain in labeling pool)")


if __name__ == "__main__":
    main()
