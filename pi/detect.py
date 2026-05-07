#!/usr/bin/env python3
"""
Sea to Sky Traffic Monitor — edge detection script.

Mac testing:  python detect.py --show --no-sync
RTSP source:  CAMERA_SOURCE=rtsp://192.168.x.x:8554/live python detect.py --show --no-sync
List cameras: python detect.py --list-cameras
Pi production: runs as systemd service (see seatosky.service)
"""

import argparse
import logging
import math
import platform
import time
from datetime import datetime, timezone
from pathlib import Path

import cv2
from ultralytics import YOLO

import buffer
import config
import shipper

# ---------------------------------------------------------------------------
# Vehicle class taxonomy
# ---------------------------------------------------------------------------

# Detectable NOW with standard yolov8n.pt (COCO weights, no training needed)
VEHICLE_CLASSES = {
    1: "bicycle",
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
}

# Require custom YOLOv8 fine-tuning on BC highway imagery.
# Will be logged correctly if a fine-tuned model returns them; ignored with
# standard weights. See brief for training roadmap.
CUSTOM_TRAINING_REQUIRED = {
    "pickup_truck", "suv", "minivan",
    "semi_truck", "logging_truck", "box_truck",
    "overland_rig", "convertible", "tow_truck",
    "ambulance", "fire_truck", "police_vehicle",
}

FRAME_SAVE_INTERVAL = 30  # seconds between full-frame snapshots

log = logging.getLogger(__name__)


def _is_macos() -> bool:
    return platform.system() == "Darwin"


# ---------------------------------------------------------------------------
# Camera listing
# ---------------------------------------------------------------------------

def list_cameras():
    """Scan indices 0–9. Uses AVFoundation on macOS so Continuity Camera devices appear."""
    # AVFoundation on macOS enumerates virtual cameras (Continuity Camera, NDI, etc.)
    # that the default CAP_ANY / CAP_V4L2 path misses.
    backend      = cv2.CAP_AVFOUNDATION if _is_macos() else cv2.CAP_ANY
    backend_name = "AVFoundation" if _is_macos() else "default"
    print(f"Scanning camera indices 0–9 via {backend_name} backend…\n")
    found = []
    for idx in range(10):
        cap = cv2.VideoCapture(idx, backend)
        if cap.isOpened():
            w   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h   = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = cap.get(cv2.CAP_PROP_FPS)
            found.append((idx, w, h, fps))
            cap.release()
    if not found:
        print("  No cameras found.")
    else:
        for idx, w, h, fps in found:
            hint = " ← built-in webcam" if idx == 0 else ""
            print(f"  [{idx}]  {w}×{h}  {fps:.0f} fps{hint}")
    print()
    print("RTSP streams are not enumerated here — set directly, e.g.:")
    print("  CAMERA_SOURCE=rtsp://192.168.x.x:8554/live")
    print()
    print(f"Current CAMERA_SOURCE = {config.CAMERA_SOURCE}")
    print("Set CAMERA_SOURCE=<index or rtsp://…> in .env to switch.")


# ---------------------------------------------------------------------------
# Capture helpers
# ---------------------------------------------------------------------------

def make_capture_dirs(date_str, save_frames=False, save_video=False, captures_dir="captures"):
    base = Path(captures_dir) / date_str
    paths = {"base": base}
    if save_frames:
        (base / "frames").mkdir(parents=True, exist_ok=True)
        (base / "vehicles").mkdir(parents=True, exist_ok=True)
        paths["frames"]   = base / "frames"
        paths["vehicles"] = base / "vehicles"
    if save_video:
        base.mkdir(parents=True, exist_ok=True)
        paths["video_dir"] = base
    return paths


def save_full_frame(frame, frames_dir):
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    cv2.imwrite(str(frames_dir / f"{ts}.jpg"), frame, [cv2.IMWRITE_JPEG_QUALITY, 85])


def save_vehicle_crop(frame, bbox, cls_name, confidence, vehicles_dir):
    h, w = frame.shape[:2]
    x1 = max(0, int(bbox[0]))
    y1 = max(0, int(bbox[1]))
    x2 = min(int(bbox[2]), w)
    y2 = min(int(bbox[3]), h)
    if x2 <= x1 or y2 <= y1:
        return
    crop = frame[y1:y2, x1:x2]
    ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
    conf_str = f"{confidence:.2f}".replace(".", "")
    cv2.imwrite(
        str(vehicles_dir / f"{ts}_{cls_name}_{conf_str}.jpg"),
        crop,
        [cv2.IMWRITE_JPEG_QUALITY, 90],
    )


def init_video_writer(video_dir, frame_shape):
    ts   = datetime.now().strftime("%H%M%S")
    path = video_dir / f"session_{ts}.mp4"
    h, w = frame_shape[:2]
    writer = cv2.VideoWriter(
        str(path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        config.FRAME_RATE,
        (w, h),
    )
    log.info(f"Recording video → {path}")
    return writer


# ---------------------------------------------------------------------------
# Tracker
# ---------------------------------------------------------------------------

class VehicleTracker:
    """Nearest-neighbour centroid tracker."""

    MAX_DISTANCE       = 150
    MAX_MISSING_FRAMES = 10

    def __init__(self):
        self.tracks    = {}
        self.next_id   = 0
        self.frame_num = 0

    def update(self, detections):
        self.frame_num += 1
        assigned_det   = set()

        for tid, track in self.tracks.items():
            best_dist = self.MAX_DISTANCE
            best_idx  = None
            for i, det in enumerate(detections):
                if i in assigned_det:
                    continue
                dx = det[0] - track["cx"]
                dy = det[1] - track["cy"]
                dist = math.sqrt(dx * dx + dy * dy)
                if dist < best_dist:
                    best_dist = dist
                    best_idx  = i

            if best_idx is not None:
                assigned_det.add(best_idx)
                det = detections[best_idx]
                track["prev_cx"], track["prev_cy"] = track["cx"], track["cy"]
                track["cx"], track["cy"]           = det[0], det[1]
                track["class_id"]                  = det[2]
                track["confidence"]                = det[3]
                track["bbox"]                      = det[4]
                track["bbox_history"].append(det[4])
                track["last_seen"] = self.frame_num
                track["missing"]   = 0
            else:
                track["missing"] = track.get("missing", 0) + 1

        for i, det in enumerate(detections):
            if i not in assigned_det:
                self.tracks[self.next_id] = {
                    "id":           self.next_id,
                    "cx":           det[0], "cy":      det[1],
                    "prev_cx":      det[0], "prev_cy": det[1],
                    "class_id":     det[2],
                    "confidence":   det[3],
                    "bbox":         det[4],
                    "bbox_history": [det[4]],
                    "first_seen":   self.frame_num,
                    "last_seen":    self.frame_num,
                    "missing":      0,
                    "crossed":      False,
                }
                self.next_id += 1

        stale = [tid for tid, t in self.tracks.items()
                 if t.get("missing", 0) > self.MAX_MISSING_FRAMES]
        for tid in stale:
            del self.tracks[tid]

        return self.tracks


# ---------------------------------------------------------------------------
# Speed estimation
# ---------------------------------------------------------------------------

def estimate_speed(track, fps, camera_height_m, camera_angle_deg):
    if len(track["bbox_history"]) < 3:
        return None
    try:
        dy_px_per_frame = abs(track["cy"] - track["prev_cy"])
        if dy_px_per_frame == 0:
            return None
        angle_rad   = math.radians(camera_angle_deg)
        ground_m    = camera_height_m / math.tan(angle_rad)
        m_per_px    = ground_m / 480          # normalised to 480-px reference height
        speed_kmh   = dy_px_per_frame * fps * m_per_px * 3.6
        if 5 < speed_kmh < 200:
            return round(speed_kmh, 1)
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Camera
# ---------------------------------------------------------------------------

_RTSP_SCHEMES = ("rtsp://", "rtsps://", "rtmp://")


def open_camera(source: str) -> cv2.VideoCapture:
    if source.isdigit():
        # AVFoundation on macOS sees Continuity Camera virtual devices;
        # the default backend only finds physical USB/PCI cameras.
        backend = cv2.CAP_AVFOUNDATION if _is_macos() else cv2.CAP_ANY
        cap = cv2.VideoCapture(int(source), backend)
    elif source.lower().startswith(_RTSP_SCHEMES):
        cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # minimize latency, discard stale frames
    else:
        cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open camera: {source!r}")
    return cap


# ---------------------------------------------------------------------------
# Overlay
# ---------------------------------------------------------------------------

def draw_overlay(frame, tracks, tripwire_y_px, total_today):
    h, w = frame.shape[:2]
    cv2.line(frame, (0, tripwire_y_px), (w, tripwire_y_px), (0, 255, 255), 2)
    cv2.putText(frame, "tripwire", (5, tripwire_y_px - 6),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)

    for tid, track in tracks.items():
        x1, y1, x2, y2 = (int(v) for v in track["bbox"])
        cls_name = VEHICLE_CLASSES.get(track["class_id"], "?")
        color    = (0, 200, 0) if not track["crossed"] else (0, 100, 255)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        cv2.putText(frame, f"{cls_name} #{tid} {track['confidence']:.0%}",
                    (x1, max(y1 - 5, 12)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)
        cv2.circle(frame, (int(track["cx"]), int(track["cy"])), 4, (255, 80, 0), -1)

    cv2.rectangle(frame, (0, 0), (270, 75), (0, 0, 0), -1)
    cv2.putText(frame, f"Counted: {total_today}", (8, 24),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.putText(frame, f"Buffered (unsynced): {buffer.unsynced_count()}", (8, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 180, 180), 1)
    cv2.putText(frame, f"Total in DB: {buffer.total_count()}", (8, 68),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (140, 140, 140), 1)
    return frame


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Sea to Sky traffic detector")
    parser.add_argument("--show",         action="store_true",
                        help="Open a video window with detections overlaid")
    parser.add_argument("--no-sync",      action="store_true",
                        help="Skip API sync (use when API not running yet)")
    parser.add_argument("--tripwire",     type=float, default=None,
                        help="Override tripwire Y position (0.0–1.0)")
    parser.add_argument("--list-cameras", action="store_true",
                        help="Print all available camera sources and exit")
    parser.add_argument("--save-frames",  action="store_true",
                        help="Save full frames every 30 s + vehicle crops on each detection "
                             "→ captures/YYYY-MM-DD/frames/ and vehicles/")
    parser.add_argument("--save-video",    action="store_true",
                        help="Record full session → <captures-dir>/YYYY-MM-DD/session_HHMMSS.mp4")
    parser.add_argument("--captures-dir", default="captures", metavar="PATH",
                        help="Root directory for frame/video saves (default: captures/)")
    args = parser.parse_args()

    # Handle --list-cameras before loading model (fast exit)
    if args.list_cameras:
        list_cameras()
        return

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )

    if args.tripwire is not None:
        config.TRIPWIRE_Y = args.tripwire

    buffer.init_db()
    log.info(f"Station: {config.STATION_ID} ({config.STATION_NAME})")
    log.info(f"Tripwire: {config.TRIPWIRE_Y:.0%} down the frame  "
             f"| up={config.DIRECTION_UP}  down={config.DIRECTION_DOWN}")

    # Capture directory / video setup
    today    = datetime.now().strftime("%Y-%m-%d")
    cap_dirs = make_capture_dirs(today, save_frames=args.save_frames, save_video=args.save_video,
                                 captures_dir=args.captures_dir)
    video_writer    = None
    last_frame_save = 0.0

    if args.save_frames:
        log.info(f"Saving frames → {cap_dirs['frames']}  vehicles → {cap_dirs['vehicles']}")
    if args.save_video:
        log.info(f"Session video → {cap_dirs['video_dir']}/session_*.mp4")

    log.info(f"Loading YOLO model: {config.YOLO_MODEL}")
    model = YOLO(config.YOLO_MODEL)

    log.info(f"Opening camera: {config.CAMERA_SOURCE}")
    cap = open_camera(config.CAMERA_SOURCE)

    tracker         = VehicleTracker()
    last_sync       = time.time()
    last_frame_time = 0.0
    frame_interval  = 1.0 / config.FRAME_RATE
    total_today     = 0

    log.info("Running — Ctrl-C to stop" + (" · Q in window to quit" if args.show else ""))

    try:
        while True:
            now = time.time()
            if now - last_frame_time < frame_interval:
                time.sleep(frame_interval - (now - last_frame_time))
                continue
            last_frame_time = time.time()

            ret, frame = cap.read()
            if not ret:
                log.warning("Frame capture failed — reconnecting…")
                cap.release()
                time.sleep(2.0)
                try:
                    cap = open_camera(config.CAMERA_SOURCE)
                    log.info("Camera reconnected.")
                except RuntimeError as exc:
                    log.error(f"Reconnect failed: {exc} — retrying in 5 s…")
                    time.sleep(5.0)
                continue

            # Full-frame snapshot every 30 s
            if args.save_frames and (time.time() - last_frame_save) >= FRAME_SAVE_INTERVAL:
                save_full_frame(frame, cap_dirs["frames"])
                last_frame_save = time.time()

            # Lazy-init video writer (need frame dimensions)
            if args.save_video and video_writer is None:
                video_writer = init_video_writer(cap_dirs["video_dir"], frame.shape)
            if video_writer is not None:
                video_writer.write(frame)

            h, w = frame.shape[:2]
            tripwire_y_px = int(h * config.TRIPWIRE_Y)

            results = model(
                frame,
                verbose=False,
                conf=config.CONFIDENCE_THRESHOLD,
                classes=list(VEHICLE_CLASSES.keys()),
            )

            detections = []
            if results and results[0].boxes is not None:
                for box in results[0].boxes:
                    cls_id = int(box.cls[0])
                    conf   = float(box.conf[0])
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    detections.append(((x1 + x2) / 2, (y1 + y2) / 2, cls_id, conf, (x1, y1, x2, y2)))

            tracks = tracker.update(detections)

            for tid, track in tracks.items():
                if track["crossed"]:
                    continue
                prev_y, curr_y = track["prev_cy"], track["cy"]
                if prev_y < tripwire_y_px <= curr_y:
                    direction = config.DIRECTION_DOWN
                elif prev_y > tripwire_y_px >= curr_y:
                    direction = config.DIRECTION_UP
                else:
                    continue

                track["crossed"] = True
                total_today += 1
                ts       = datetime.now(timezone.utc).isoformat()
                cls_name = VEHICLE_CLASSES.get(track["class_id"], "unknown")
                speed    = estimate_speed(track, config.FRAME_RATE,
                                          config.CAMERA_HEIGHT_M, config.CAMERA_ANGLE_DEG)
                buffer.insert_detection(ts, cls_name, direction, track["confidence"], speed)
                log.info(
                    f"  COUNTED  {cls_name:12s} {direction:12s}  "
                    f"conf={track['confidence']:.0%}  speed={speed} km/h  total={total_today}"
                )

                if args.save_frames:
                    save_vehicle_crop(frame, track["bbox"], cls_name, track["confidence"],
                                      cap_dirs["vehicles"])

            if not args.no_sync and (time.time() - last_sync) >= config.SYNC_INTERVAL:
                shipper.sync()
                last_sync = time.time()

            if args.show:
                annotated = draw_overlay(frame.copy(), tracks, tripwire_y_px, total_today)
                cv2.imshow("Sea to Sky Traffic Monitor", annotated)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    except KeyboardInterrupt:
        log.info("Keyboard interrupt — shutting down")
    finally:
        cap.release()
        if video_writer is not None:
            video_writer.release()
            log.info("Video saved.")
        if args.show:
            cv2.destroyAllWindows()
        if not args.no_sync:
            log.info("Final sync…")
            shipper.sync()
        log.info(f"Done. Counted {total_today} vehicles this session.")


if __name__ == "__main__":
    main()
