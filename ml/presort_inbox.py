#!/usr/bin/env python3
"""
Pre-sort frames in data/unsorted/_inbox/ into the 5 v2 class buckets using
the v1 fine-tuned YOLOv8 weights. Output is meant for human confirmation,
not labeling — saves the dragging-from-scratch step.

For each frame:
  - Run inference with v1 weights.
  - Pick the highest-confidence detection (drop low-confidence noise).
  - Roll v1 class name up to v2 broad class.
  - No detection → passenger (most common class).
  - Move frame from _inbox/ to data/unsorted/<v2_class>/.

Usage:
    python presort_inbox.py
    python presort_inbox.py --weights /path/to/best.pt --inbox /path/to/_inbox
"""

import argparse
import shutil
import sys
from collections import Counter
from pathlib import Path

from ultralytics import YOLO

SCRIPT_DIR = Path(__file__).parent

V1_TO_V2 = {
    "car":               "passenger",
    "motorcycle":        "passenger",
    "suv":               "passenger",
    "pickup_truck":      "passenger",
    "rv":                "passenger",
    "overland_rig":      "passenger",
    "cybertruck":        "passenger",
    "box_truck":         "truck",
    "flatbed_truck":     "truck",
    "dumptruck":         "truck",
    "tanker_truck":      "truck",
    "bus":               "bus",
    "delivery_van":      "delivery",
    "utility_van":       "delivery",
    "emergency_vehicle": "emergency",
}

V2_CLASSES = ("passenger", "truck", "bus", "delivery", "emergency")


def presort(weights: Path, inbox: Path, out_root: Path, conf: float, device: str) -> int:
    if not weights.exists():
        print(f"ERROR: weights not found: {weights}", file=sys.stderr)
        return 1
    if not inbox.exists():
        print(f"ERROR: inbox not found: {inbox}", file=sys.stderr)
        return 1

    for cls in V2_CLASSES:
        (out_root / cls).mkdir(parents=True, exist_ok=True)

    print(f"Loading v1 weights: {weights}")
    model = YOLO(str(weights))
    names = model.names  # {class_id: class_name}
    print(f"  Classes: {sorted(names.values())}")

    frames = sorted(p for p in inbox.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
    print(f"Pre-sorting {len(frames)} frames (device={device}, conf={conf})…")

    bucket_counts = Counter()
    v1_top_counts = Counter()  # how often each v1 class was the top pick
    no_detect = 0

    BATCH = 32
    moved = 0
    for i in range(0, len(frames), BATCH):
        batch = frames[i:i + BATCH]
        results = model.predict(
            source=[str(p) for p in batch],
            imgsz=640,
            conf=conf,
            device=device,
            verbose=False,
        )

        for path, r in zip(batch, results):
            top_v1 = None
            top_conf = -1.0
            if r.boxes is not None and len(r.boxes) > 0:
                confs = r.boxes.conf.tolist()
                clses = r.boxes.cls.tolist()
                for c, cls_id in zip(confs, clses):
                    if c > top_conf:
                        top_conf = c
                        top_v1 = names[int(cls_id)]

            if top_v1 is None:
                bucket = "passenger"
                no_detect += 1
            else:
                bucket = V1_TO_V2.get(top_v1, "passenger")
                v1_top_counts[top_v1] += 1

            shutil.move(str(path), str(out_root / bucket / path.name))
            bucket_counts[bucket] += 1
            moved += 1

        if (i // BATCH) % 5 == 0:
            print(f"  …{moved}/{len(frames)}")

    print()
    print(f"Done. Moved {moved} frames out of _inbox/.")
    print()
    print("Pre-sort by v2 bucket:")
    for cls in V2_CLASSES:
        print(f"  {cls:10s} {bucket_counts[cls]:5d}")
    print(f"  {'(no detect → passenger)':25s} {no_detect}")
    print()
    print("Top v1 class picked per frame (when something detected):")
    for v1_name, n in v1_top_counts.most_common():
        print(f"  {v1_name:20s} {n:5d}  → {V1_TO_V2.get(v1_name, 'passenger')}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--weights", type=Path,
        default=Path("/Users/claude/sea-to-sky-traffic/ml/runs/attg/v1/weights/best.pt"),
    )
    p.add_argument(
        "--inbox", type=Path,
        default=Path("/Users/claude/sea-to-sky-traffic/ml/data/unsorted/_inbox"),
    )
    p.add_argument(
        "--out", type=Path,
        default=Path("/Users/claude/sea-to-sky-traffic/ml/data/unsorted"),
    )
    p.add_argument("--conf",   type=float, default=0.25)
    p.add_argument("--device", default="mps")
    args = p.parse_args()

    return presort(args.weights, args.inbox, args.out, args.conf, args.device)


if __name__ == "__main__":
    sys.exit(main())
