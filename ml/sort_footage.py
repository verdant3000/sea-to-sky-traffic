#!/usr/bin/env python3
"""
Extract frames from a video at a fixed interval into per-class bucket folders
for manual sorting before Roboflow upload.

Usage:
    python sort_footage.py path/to/video.mp4
    python sort_footage.py path/to/video.mp4 --interval 0.5 --out data/unsorted

The script writes every frame into the `_inbox/` subfolder. Manually drag each
frame into the matching class bucket:

    data/unsorted/_inbox/
    data/unsorted/passenger/
    data/unsorted/truck/
    data/unsorted/bus/
    data/unsorted/delivery/
    data/unsorted/emergency/

Class label = broad category (5 classes). Specific subtype / brand is captured
as a Roboflow image tag, not the class label.
"""

import argparse
import sys
from pathlib import Path

import cv2

CLASSES = ["passenger", "truck", "bus", "delivery", "emergency"]
SCRIPT_DIR = Path(__file__).parent


def extract(video_path: Path, out_root: Path, interval_sec: float) -> int:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"ERROR: could not open {video_path}", file=sys.stderr)
        return 1

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(int(round(fps * interval_sec)), 1)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    inbox = out_root / "_inbox"
    inbox.mkdir(parents=True, exist_ok=True)
    for cls in CLASSES:
        (out_root / cls).mkdir(parents=True, exist_ok=True)

    stem = video_path.stem
    frame_idx = 0
    saved = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if frame_idx % step == 0:
            t_ms = int(cap.get(cv2.CAP_PROP_POS_MSEC))
            name = f"{stem}_{frame_idx:06d}_{t_ms:08d}.jpg"
            cv2.imwrite(str(inbox / name), frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
            saved += 1
        frame_idx += 1

    cap.release()
    print(
        f"Wrote {saved} frames to {inbox} "
        f"(every {interval_sec}s, fps={fps:.1f}, total_frames={total})."
    )
    print("Now drag each frame into the matching class bucket:")
    for cls in CLASSES:
        print(f"  {out_root / cls}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path, help="Input video file")
    parser.add_argument(
        "--interval", type=float, default=0.5,
        help="Seconds between extracted frames (default 0.5)",
    )
    parser.add_argument(
        "--out", type=Path, default=SCRIPT_DIR / "data/unsorted",
        help="Output root (default ml/data/unsorted)",
    )
    args = parser.parse_args()

    if not args.video.exists():
        print(f"ERROR: video not found: {args.video}", file=sys.stderr)
        return 1

    return extract(args.video, args.out, args.interval)


if __name__ == "__main__":
    sys.exit(main())
