#!/usr/bin/env python3
"""
Export YOLOv8 weights to CoreML (NMS baked in) for iOS.

Defaults to stock yolov8n.pt (COCO weights) — this is the working detector
the iOS app falls back to until the v2 custom model is trained. The Swift
side remaps COCO class names → v2 classes (passenger/truck/bus/...).

Usage:
    python export_coreml.py                       # exports yolov8n.pt
    python export_coreml.py runs/attg/v2/weights/best.pt
"""

import sys
from pathlib import Path

from ultralytics import YOLO

SCRIPT_DIR = Path(__file__).parent
DEFAULT_WEIGHTS = SCRIPT_DIR / "yolov8n.pt"


def main() -> None:
    weights = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_WEIGHTS
    if not weights.exists():
        print(f"ERROR: weights not found: {weights}", file=sys.stderr)
        sys.exit(1)

    print(f"Loading weights: {weights}")
    model = YOLO(str(weights))

    coreml_path = model.export(format="coreml", nms=True)
    print(f"CoreML: {coreml_path}")


if __name__ == "__main__":
    main()
