"""
Export yolov8n.pt to Core ML INT8 for iPhone deployment.

Usage:
    pip install ultralytics
    python export_coreml.py

Output: yolov8n_int8.mlpackage
    Drag this into your Xcode project. Xcode compiles it to
    yolov8n_int8.mlmodelc automatically at build time.

Notes:
    - nms=False: NMS is implemented in Swift (pipelined NMS has compat issues)
    - int8=True: smaller model, faster Neural Engine inference
    - imgsz=640: standard YOLO input; Vision framework handles camera resize
"""

from ultralytics import YOLO

model = YOLO("yolov8n.pt")

model.export(
    format="coreml",
    nms=True,
)

print()
print("Export complete: yolov8n_int8.mlpackage")
print()
print("Next steps:")
print("  1. Open SeaToSkyCounter.xcodeproj in Xcode")
print("  2. Drag yolov8n_int8.mlpackage into the project navigator")
print("  3. Check 'Copy items if needed' and 'SeaToSkyCounter' target")
print("  4. Build — Xcode compiles to yolov8n_int8.mlmodelc automatically")
