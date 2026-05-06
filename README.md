# Sea to Sky Traffic Monitor

Solar-powered roadside vehicle counting on Highway 99 (Squamish → Whistler → Pemberton).

## Repo structure

```
pi/             Edge detection script — runs on Raspberry Pi 5 (or Mac for testing)
api/            Central Express API — receives detections, stores in PostgreSQL
dashboard/      React dashboard — live counts, charts, corridor flow
```

## Step 1 — Test on Mac

### Install dependencies

```bash
cd pi
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Configure

```bash
cp .env.example .env
# Edit .env if needed — defaults work for Mac webcam testing
```

### Run

```bash
cd pi
source venv/bin/activate

# Show video window, skip API sync (API not built yet)
python detect.py --show --no-sync

# Adjust tripwire position on the fly
python detect.py --show --no-sync --tripwire 0.6

# Press Q in the video window, or Ctrl-C in terminal, to stop.
# Detections are saved to detections.db (SQLite) even with --no-sync.
```

### What you'll see

- Yellow horizontal line = tripwire
- Green boxes = vehicles being tracked, not yet counted
- Orange boxes = vehicles that already crossed the tripwire
- Top-left counter = total vehicles counted this session
- Terminal logs each crossing: class, direction, confidence, estimated speed

### Tune the tripwire

Set `TRIPWIRE_Y` in `.env` (or pass `--tripwire 0.4`) so the line sits across
the lane you want to count. Vehicles crossing it in either vertical direction
are logged with the correct northbound/southbound label.

---

## Step 2 — Migrate to Pi 5

1. Copy repo to Pi: `rsync -av sea-to-sky-traffic/ pi@seatosky-station-01:~/sea-to-sky-traffic/`
2. Install deps same as above (Pi runs Python 3.11+)
3. Set `CAMERA_SOURCE=0` in `.env` (Pi HQ Camera appears as `/dev/video0` via libcamera-v4l2)
4. Install systemd service:
   ```bash
   sudo cp pi/seatosky.service /etc/systemd/system/
   sudo systemctl enable seatosky
   sudo systemctl start seatosky
   sudo journalctl -fu seatosky   # follow logs
   ```

---

## Build order

- [x] Step 1: Pi detection script
- [ ] Step 2: Central API (Node/Express on Railway)
- [ ] Step 3: Hourly aggregation job
- [ ] Step 4: React dashboard
- [ ] Step 5: Pattern analysis (after 2–3 weeks of real data)
- [ ] Step 6: Event correlation
- [ ] Step 7: Corridor view (Squamish ↔ Whistler ↔ Pemberton)
