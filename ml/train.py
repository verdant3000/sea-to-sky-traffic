#!/usr/bin/env python3
"""
Fine-tune YOLOv8n on labeled vehicle crops.

Requires data/labeled/data.yaml — export from Roboflow or build manually.
Trains on Apple Silicon (MPS). Outputs to runs/attg/v2/.

v2 classes (5): passenger, truck, bus, delivery, emergency.
Subtypes (cybertruck, logging_full, sprinter, amazon, ...) live as
image tags in Roboflow, not class labels.
"""

import sys
from pathlib import Path

from ultralytics import YOLO

SCRIPT_DIR = Path(__file__).parent
DATA_YAML = SCRIPT_DIR / "data/labeled/data.yaml"


def main() -> None:
    if not DATA_YAML.exists():
        print(
            f"ERROR: {DATA_YAML} not found.\n"
            "Label images first, then export dataset from Roboflow (YOLOv8 format).",
            file=sys.stderr,
        )
        sys.exit(1)

    model = YOLO("yolov8n.pt")
    model.train(
        data=str(DATA_YAML),
        epochs=100,
        imgsz=640,
        batch=16,
        device="mps",
        project=str(SCRIPT_DIR / "runs/attg"),
        name="v2",
        freeze=10,          # freeze backbone, fine-tune head only
        lr0=0.001,
        warmup_epochs=3,
        patience=20,
        mosaic=1.0,
        mixup=0.1,
        degrees=15.0,
        flipud=0.0,         # no vertical flip — road orientation is fixed
    )


if __name__ == "__main__":
    main()
