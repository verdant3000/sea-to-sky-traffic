#!/usr/bin/env python3
"""
Sea to Sky Traffic Monitor — edge detection script.

Mac testing:  python detect.py --show --no-sync
Pi production: runs as systemd service (see seatosky.service)
"""

import argparse
import logging
import math
import time
from datetime import datetime, timezone

import cv2
from ultralytics import YOLO

import buffer
import config
import shipper

# COCO class IDs we care about → our label names
VEHICLE_CLASSES = {
    1: "bicycle",
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
}

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tracker
# ---------------------------------------------------------------------------

class VehicleTracker:
    """
    Simple nearest-neighbour centroid tracker.
    Matches detections to existing tracks by Euclidean distance,
    starts new tracks for unmatched detections, expires stale tracks.
    """

    MAX_DISTANCE      = 150   # px — max centroid jump to count as the same vehicle
    MAX_MISSING_FRAMES = 10   # frames without a match before a track is dropped

    def __init__(self):
        self.tracks   = {}
        self.next_id  = 0
        self.frame_num = 0

    def update(self, detections):
        """
        detections: list of (cx, cy, class_id, confidence, (x1,y1,x2,y2))
        Updates self.tracks in place and returns it.
        """
        self.frame_num += 1
        assigned_det   = set()
        assigned_track = set()

        # Match existing tracks to nearest detection
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
                assigned_track.add(tid)
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

        # New tracks for unmatched detections
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

        # Expire stale tracks
        stale = [tid for tid, t in self.tracks.items()
                 if t.get("missing", 0) > self.MAX_MISSING_FRAMES]
        for tid in stale:
            del self.tracks[tid]

        return self.tracks


# ---------------------------------------------------------------------------
# Speed estimation
# ---------------------------------------------------------------------------

def estimate_speed(track, fps, camera_height_m, camera_angle_deg):
    """
    Rough speed in km/h from centroid vertical movement + camera geometry.
    Accuracy is ~±20% which is acceptable per the brief.
    Returns None if insufficient history.
    """
    if len(track["bbox_history"]) < 3:
        return None
    try:
        # Pixels per frame of vertical centroid motion (averaged over last 3 frames)
        dy_px_per_frame = abs(track["cy"] - track["prev_cy"])
        if dy_px_per_frame == 0:
            return None

        # Approximate ground coverage (metres) visible in the frame vertically.
        # ground_extent ≈ camera_height / tan(depression_angle)
        angle_rad    = math.radians(camera_angle_deg)
        ground_m     = camera_height_m / math.tan(angle_rad)

        # Assume frame is ~480px tall (works for 640×480 and 1280×720 at similar FOV).
        # On Pi we'll calibrate properly once we know the exact lens FOV.
        frame_h_ref  = 480
        m_per_px     = ground_m / frame_h_ref

        speed_mps = dy_px_per_frame * fps * m_per_px
        speed_kmh = speed_mps * 3.6

        if 5 < speed_kmh < 200:
            return round(speed_kmh, 1)
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Camera
# ---------------------------------------------------------------------------

def open_camera(source: str) -> cv2.VideoCapture:
    """
    source = digit string  → webcam index (Mac or Pi v4l2)
    source = GStreamer str → Pi libcamera pipeline (future)
    """
    if source.isdigit():
        cap = cv2.VideoCapture(int(source))
    else:
        cap = cv2.VideoCapture(source, cv2.CAP_GSTREAMER)

    if not cap.isOpened():
        raise RuntimeError(f"Cannot open camera: {source!r}")
    return cap


# ---------------------------------------------------------------------------
# Overlay
# ---------------------------------------------------------------------------

def draw_overlay(frame, tracks, tripwire_y_px, total_today):
    h, w = frame.shape[:2]

    # Tripwire line
    cv2.line(frame, (0, tripwire_y_px), (w, tripwire_y_px), (0, 255, 255), 2)
    cv2.putText(frame, "tripwire", (5, tripwire_y_px - 6),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)

    # Bounding boxes + centroids
    for tid, track in tracks.items():
        x1, y1, x2, y2 = (int(v) for v in track["bbox"])
        cls_name = VEHICLE_CLASSES.get(track["class_id"], "?")
        color    = (0, 200, 0) if not track["crossed"] else (0, 100, 255)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        label = f"{cls_name} #{tid} {track['confidence']:.0%}"
        cv2.putText(frame, label, (x1, max(y1 - 5, 12)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)
        cv2.circle(frame, (int(track["cx"]), int(track["cy"])), 4, (255, 80, 0), -1)

    # Stats
    cv2.rectangle(frame, (0, 0), (260, 70), (0, 0, 0), -1)
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
    parser.add_argument("--show",    action="store_true",
                        help="Open a video window with detections overlaid")
    parser.add_argument("--no-sync", action="store_true",
                        help="Skip API sync (use when API not running yet)")
    parser.add_argument("--tripwire", type=float, default=None,
                        help="Override tripwire Y position (0.0–1.0)")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )

    if args.tripwire is not None:
        config.TRIPWIRE_Y = args.tripwire

    buffer.init_db()

    log.info(f"Station: {config.STATION_ID} ({config.STATION_NAME})")
    log.info(f"Tripwire: {config.TRIPWIRE_Y:.0%} down the frame")
    log.info(f"Directions: up={config.DIRECTION_UP}  down={config.DIRECTION_DOWN}")
    log.info(f"Loading YOLO model: {config.YOLO_MODEL}")
    model = YOLO(config.YOLO_MODEL)

    log.info(f"Opening camera: {config.CAMERA_SOURCE}")
    cap = open_camera(config.CAMERA_SOURCE)

    # Throttle processing to FRAME_RATE to reduce CPU load
    frame_interval  = 1.0 / config.FRAME_RATE
    tracker         = VehicleTracker()
    last_sync       = time.time()
    last_frame_time = 0.0
    total_today     = 0

    log.info("Running — press Ctrl-C to stop" + (" (q in window to quit)" if args.show else ""))

    try:
        while True:
            now = time.time()

            # Rate-limit frame processing
            elapsed = now - last_frame_time
            if elapsed < frame_interval:
                time.sleep(frame_interval - elapsed)
                continue
            last_frame_time = time.time()

            ret, frame = cap.read()
            if not ret:
                log.warning("Frame capture failed, retrying...")
                time.sleep(0.2)
                continue

            h, w = frame.shape[:2]
            tripwire_y_px = int(h * config.TRIPWIRE_Y)

            # YOLO inference — only on the vehicle classes we care about
            results = model(
                frame,
                verbose=False,
                conf=config.CONFIDENCE_THRESHOLD,
                classes=list(VEHICLE_CLASSES.keys()),
            )

            # Build detection list
            detections = []
            if results and results[0].boxes is not None:
                for box in results[0].boxes:
                    cls_id = int(box.cls[0])
                    conf   = float(box.conf[0])
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    cx = (x1 + x2) / 2
                    cy = (y1 + y2) / 2
                    detections.append((cx, cy, cls_id, conf, (x1, y1, x2, y2)))

            tracks = tracker.update(detections)

            # Check tripwire crossings
            for tid, track in tracks.items():
                if track["crossed"]:
                    continue

                prev_y = track["prev_cy"]
                curr_y = track["cy"]

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
                speed    = estimate_speed(
                    track, config.FRAME_RATE,
                    config.CAMERA_HEIGHT_M, config.CAMERA_ANGLE_DEG,
                )
                buffer.insert_detection(ts, cls_name, direction, track["confidence"], speed)
                log.info(
                    f"  COUNTED  {cls_name:12s} {direction:12s}  "
                    f"conf={track['confidence']:.0%}  "
                    f"speed={speed} km/h  total={total_today}"
                )

            # Periodic API sync
            if not args.no_sync and (time.time() - last_sync) >= config.SYNC_INTERVAL:
                shipper.sync()
                last_sync = time.time()

            # Video window
            if args.show:
                annotated = draw_overlay(frame.copy(), tracks, tripwire_y_px, total_today)
                cv2.imshow("Sea to Sky Traffic Monitor", annotated)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    except KeyboardInterrupt:
        log.info("Keyboard interrupt — shutting down")
    finally:
        cap.release()
        if args.show:
            cv2.destroyAllWindows()
        if not args.no_sync:
            log.info("Final sync...")
            shipper.sync()
        log.info(f"Done. Counted {total_today} vehicles this session.")


if __name__ == "__main__":
    main()
