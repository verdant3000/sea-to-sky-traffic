#!/usr/bin/env python3
"""
Export trained model for deployment targets.

  NCNN    — Raspberry Pi 5 (edge inference)
  CoreML  — iOS (with NMS baked in)

Usage:
    python export.py [path/to/best.pt]

Defaults to runs/attg/v1/weights/best.pt if no argument given.
"""

import sys
from pathlib import Path

from ultralytics import YOLO

SCRIPT_DIR = Path(__file__).parent
DEFAULT_WEIGHTS = SCRIPT_DIR / "runs/attg/v1/weights/best.pt"


def main() -> None:
    weights = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_WEIGHTS
    if not weights.exists():
        print(f"ERROR: weights not found: {weights}", file=sys.stderr)
        sys.exit(1)

    model = YOLO(str(weights))

    ncnn_path = model.export(format="ncnn")
    print(f"NCNN:   {ncnn_path}")

    coreml_path = model.export(format="coreml", nms=True)
    print(f"CoreML: {coreml_path}")


if __name__ == "__main__":
    main()
