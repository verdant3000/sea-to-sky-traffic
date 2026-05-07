# Sea to Sky Counter — iOS App

iPhone-based portable traffic counting station. Runs YOLOv8n on-device via Core ML, applies a virtual tripwire, and POSTs detection batches to the Railway API every 60 seconds.

**Use case:** Pop-up event coverage (Crankworx, long weekends, scout days). Not intended for unattended screen-off deployment — iOS requires the screen on and app in foreground to access the camera.

---

## What you need

- Mac with Xcode 15 or later
- Apple Developer account (free tier is fine for personal device testing)
- iPhone 12 or later (A14 Neural Engine minimum)
- USB-C power bank or charger (continuous inference + screen = ~4W drain)
- Python 3.10+ with `pip install ultralytics`

---

## Step 1 — Export the Core ML model

Run once on your Mac:

```bash
cd sea-to-sky-traffic/ios
pip install ultralytics
python export_coreml.py
```

Output: `yolov8n_int8.mlpackage` in the current directory.

---

## Step 2 — Create the Xcode project

1. Open Xcode → **File → New → Project**
2. Choose **iOS → App**
3. Product Name: `SeaToSkyCounter`
4. Bundle Identifier: `ca.fieldtrip.seatoskycounter` (or anything you own)
5. Interface: **SwiftUI** | Language: **Swift**
6. Uncheck "Include Tests"
7. Save inside `sea-to-sky-traffic/ios/`

---

## Step 3 — Add the source files

In Xcode's project navigator, **right-click the SeaToSkyCounter group → Add Files to "SeaToSkyCounter"**.

Select all `.swift` files from `ios/SeaToSkyCounter/`:
- `SeaToSkyApp.swift` (replaces the generated one — delete the generated file first)
- `Config.swift`
- `Detection.swift`
- `NMS.swift`
- `YOLODetector.swift`
- `DetectionBuffer.swift`
- `TripwireCounter.swift`
- `APIShipper.swift`
- `StationViewModel.swift`
- `ContentView.swift`

Check **"Copy items if needed"** and make sure the `SeaToSkyCounter` target is checked.

---

## Step 4 — Add the model

Drag `yolov8n_int8.mlpackage` from Finder into the Xcode project navigator.

- Check **"Copy items if needed"**
- Check target **SeaToSkyCounter**

Xcode will compile it to `yolov8n_int8.mlmodelc` automatically at build time. You'll see it appear as a compiled model resource.

---

## Step 5 — Configure Info.plist

In Xcode, select the project → **SeaToSkyCounter target → Info tab**.

Add these keys (click `+` on any row):

| Key | Type | Value |
|-----|------|-------|
| Privacy - Camera Usage Description | String | `Sea to Sky Counter uses the camera to detect and count vehicles on Highway 99.` |
| Requires full screen | Boolean | YES |
| Status bar is initially hidden | Boolean | YES |

---

## Step 6 — Configure the station

Edit `Config.swift` before building:

```swift
static let stationID  = 36           // which station this phone is
static let directionA = "northbound" // increasing-Y direction in the frame
static let directionB = "southbound"
static let tripwireY: Double = 0.55  // 0.0 = top, 1.0 = bottom
```

**Tripwire position:** run the app, watch where vehicles cross the frame, then adjust `tripwireY`. The yellow line shows the current position.

**Station geometry:**
- Mount phone in portrait orientation
- Camera looking down at ~11° angle (Station 35 spec)
- Lock rotation with a gorilla pod or phone clamp

---

## Step 7 — Build and install

Connect your iPhone via USB. In Xcode:

1. Select your iPhone as the destination (top bar)
2. **Product → Build** (⌘B) — watch for compile errors
3. **Product → Run** (⌘R) — installs and launches on device
4. Trust the developer certificate on the phone if prompted:
   **Settings → General → VPN & Device Management → Developer App → Trust**

---

## Guided Access setup (keeps screen on and app locked)

Guided Access prevents the phone from locking and keeps the user in the app. Do this once per phone:

1. **Settings → Accessibility → Guided Access** → turn ON
2. Set a passcode (remember it — needed to exit)
3. Optionally turn on **Touch** lock (prevents accidental taps)

**To start a session:**
1. Open the Sea to Sky Counter app
2. Triple-click the side button (power button)
3. Tap **Start**

**To end a session:**
Triple-click the side button → enter passcode → tap **End**.

---

## What you see on screen

```
┌─────────────────────────────────────────┐
│                                         │
│         Camera feed (full screen)       │
│                                         │
│  [green box] car 87%                    │
│                                         │
│ ──────────── yellow tripwire ────────── │  ← adjustable via Config.tripwireY
│                                         │
│         [orange box] truck 91%          │
│                                         │
├────────────────┬────────────────────────┤
│      NB        │         SB             │
│      247       │         183            │
├────────────────┴────────────────────────┤
│ ● Synced 2m ago · 12 sent   Station 36 ↺ ↩ │
└─────────────────────────────────────────┘
```

- **Yellow line** — virtual tripwire (counting line)
- **Green/orange/red boxes** — live vehicle detections
- **NB / SB** — cumulative counts since last reset
- **↺** — force sync now
- **↩** — reset counts (does not delete synced data)

---

## Deployment checklist

- [ ] `Config.stationID` set to correct station number
- [ ] `Config.tripwireY` calibrated for mounting height/angle
- [ ] Model exported and added to Xcode project
- [ ] App installed on phone
- [ ] Guided Access passcode set
- [ ] Phone plugged into power (USB-C power bank or wall)
- [ ] Guided Access session started
- [ ] Confirm detections appearing in Railway dashboard

---

## Troubleshooting

**"yolov8n_int8.mlmodelc not found in bundle"**
The model file wasn't added to the Xcode target. Select `yolov8n_int8.mlpackage` in the navigator → check "SeaToSkyCounter" in Target Membership on the right panel.

**Loading model… stays indefinitely**
The Neural Engine may be unavailable. Check `cfg.computeUnits` in `YOLODetector.swift` — try `.cpuOnly` temporarily to verify inference works at all.

**No detections / very low counts**
- Raise `Config.confidenceThreshold` if false positives are high
- Lower it (e.g. `0.30`) if misses are high
- Adjust `Config.tripwireY` if the line is above or below the lane

**App crashes on first launch**
The camera permission dialog should appear automatically. If it doesn't, go to **Settings → Privacy → Camera → SeaToSkyCounter** and enable it manually.

**Screen goes dark despite Guided Access**
Check **Settings → Display & Brightness → Auto-Lock** — set to **Never** as a backup, though Guided Access should override it.

---

## Architecture

```
CameraCapture (AVFoundation)
    ↓ CVPixelBuffer @ ~10fps (every 3rd frame)
YOLODetector (VNCoreMLRequest + yolov8n_int8.mlmodelc)
    ↓ [BoundingBox] (normalized rects)
TripwireCounter (centroid tracker → crossing logic)
    ↓ Detection (class, direction, confidence, timestamp)
DetectionBuffer (thread-safe in-memory queue)
    ↓ every 60s
APIShipper (URLSession POST → Railway /api/detections)

StationViewModel (@MainActor ObservableObject — orchestrates all of the above)
ContentView (SwiftUI — camera preview + Canvas overlay + stats panel)
```

No external Swift packages — everything uses Apple frameworks only.
