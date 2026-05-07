"""
Station configuration — all values overridable via environment variables or .env file.
Copy ../.env.example to ../.env and edit before running.
"""
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

# Station identity
STATION_ID   = int(os.environ.get("STATION_ID", "1"))
STATION_NAME = os.environ.get("STATION_NAME", "test-station")

# Central API
API_ENDPOINT  = os.environ.get("API_ENDPOINT", "http://localhost:3000")
API_KEY       = os.environ.get("API_KEY", "")       # shared secret, must match API server
SYNC_INTERVAL = int(os.environ.get("SYNC_INTERVAL", "60"))  # seconds between batch POSTs

# Camera source
#   Mac webcam  : "0"        → index 0 via AVFoundation (also finds Continuity Camera)
#   Pi (v4l2)   : "0"        → /dev/video0 (libcamera-v4l2 compat layer)
#   RTSP stream : "rtsp://host:port/path"  → uses FFmpeg backend
CAMERA_SOURCE = os.environ.get("CAMERA_SOURCE", "0")

# YOLO
YOLO_MODEL            = os.environ.get("YOLO_MODEL", "yolov8n.pt")
CONFIDENCE_THRESHOLD  = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.4"))

# Tripwire — Y position as fraction of frame height (0.0 = top, 1.0 = bottom)
# Set to where vehicles cross the centre of the lane you're watching.
TRIPWIRE_Y = float(os.environ.get("TRIPWIRE_Y", "0.5"))

# Road direction labels — which way is "up" vs "down" in the camera frame
# A centroid moving down in the frame (prev_y < curr_y) = DIRECTION_DOWN
DIRECTION_UP   = os.environ.get("DIRECTION_UP",   "northbound")
DIRECTION_DOWN = os.environ.get("DIRECTION_DOWN", "southbound")

# SQLite buffer path (relative to pi/ directory when running directly)
DB_PATH = os.environ.get("DB_PATH", "detections.db")

# Camera geometry — used for rough speed estimation
# HEIGHT: metres above the road surface the camera is mounted
# ANGLE:  depression angle in degrees (how far below horizontal the camera points)
CAMERA_HEIGHT_M   = float(os.environ.get("CAMERA_HEIGHT_M",  "4.0"))
CAMERA_ANGLE_DEG  = float(os.environ.get("CAMERA_ANGLE_DEG", "30.0"))
FRAME_RATE        = int(os.environ.get("FRAME_RATE", "10"))  # target processing FPS

# BME280 environmental sensors via I2C
# Default addresses: inside case = 0x77 (SDO pulled high), outside = 0x76 (SDO to GND)
ENV_INSIDE_I2C_ADDR  = int(os.environ.get("ENV_INSIDE_I2C_ADDR",  "0x77"), 16)
ENV_OUTSIDE_I2C_ADDR = int(os.environ.get("ENV_OUTSIDE_I2C_ADDR", "0x76"), 16)
ENV_READ_INTERVAL    = int(os.environ.get("ENV_READ_INTERVAL",    "60"))   # seconds between reads
ENV_SYNC_INTERVAL    = int(os.environ.get("ENV_SYNC_INTERVAL",    "300"))  # seconds between API syncs

# Alert thresholds for inside-case sensor
INSIDE_TEMP_MAX_C   = float(os.environ.get("INSIDE_TEMP_MAX_C",   "55.0"))
INSIDE_HUMIDITY_MAX = float(os.environ.get("INSIDE_HUMIDITY_MAX", "80.0"))
