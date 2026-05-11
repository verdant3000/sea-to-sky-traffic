const express    = require('express');
const router     = express.Router();
const db         = require('../db');
const requireApiKey = require('../middleware/auth');

// Detectable NOW with standard yolov8n.pt (COCO)
const COCO_CLASSES = new Set(['person', 'bicycle', 'car', 'motorcycle', 'bus', 'truck']);

// Require custom YOLOv8 fine-tuning — accepted for forward-compatibility
const CUSTOM_CLASSES = new Set([
  'pickup_truck', 'suv', 'minivan',
  'semi_truck', 'logging_truck', 'box_truck',
  'overland_rig', 'convertible', 'tow_truck',
  'ambulance', 'fire_truck', 'police_vehicle',
]);

const VALID_CLASSES = new Set([...COCO_CLASSES, ...CUSTOM_CLASSES, 'unknown']);

const EMERGENCY_CLASSES = ['ambulance', 'fire_truck', 'police_vehicle'];

/**
 * GET /api/detections/emergency?hours=24
 * Returns recent ambulance/fire/police detections with station name.
 */
router.get('/emergency', async (req, res) => {
  const hours = Math.min(Math.max(parseInt(req.query.hours, 10) || 24, 1), 168);
  const { rows } = await db.query(
    `SELECT d.detection_id, d.timestamp, d.vehicle_class, d.direction,
            s.station_id, s.name AS station_name
       FROM detections d
       LEFT JOIN stations s ON s.station_id = d.station_id
      WHERE d.vehicle_class = ANY($1)
        AND d.timestamp >= NOW() - ($2 || ' hours')::interval
      ORDER BY d.timestamp DESC
      LIMIT 100`,
    [EMERGENCY_CLASSES, String(hours)]
  );
  res.json({ hours, rows });
});

/**
 * POST /api/detections
 * Body: { station_id: number, detections: [{ timestamp, vehicle_class, direction, confidence?, speed_estimate? }] }
 * Pi stations call this every 60 seconds to ship their local buffer.
 */
router.post('/', requireApiKey, async (req, res) => {
  const { station_id, detections } = req.body;

  if (!station_id || !Array.isArray(detections) || detections.length === 0) {
    return res.status(400).json({ error: 'station_id and non-empty detections array required' });
  }
  if (detections.length > 2000) {
    return res.status(400).json({ error: 'Max 2000 detections per batch' });
  }

  // Validate and normalise each detection
  const invalid = detections.filter(d => !VALID_CLASSES.has(d.vehicle_class));
  if (invalid.length > 0) {
    return res.status(400).json({
      error:   `Unknown vehicle_class values`,
      classes: [...new Set(invalid.map(d => d.vehicle_class))],
      valid:   [...VALID_CLASSES].sort(),
    });
  }

  // Verify station exists
  const { rows: stations } = await db.query(
    'SELECT station_id FROM stations WHERE station_id = $1',
    [station_id]
  );
  if (stations.length === 0) {
    return res.status(404).json({ error: `Station ${station_id} not found` });
  }

  // Bulk insert — 6 params per row
  const placeholders = detections
    .map((_, i) => { const b = i * 6; return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6})`; })
    .join(',');

  const params = detections.flatMap(d => [
    station_id,
    d.timestamp,
    d.vehicle_class,
    d.direction,
    d.confidence    ?? null,
    d.speed_estimate ?? null,
  ]);

  await db.query(
    `INSERT INTO detections (station_id, timestamp, vehicle_class, direction, confidence, speed_estimate)
     VALUES ${placeholders}`,
    params
  );

  res.json({ inserted: detections.length });
});

module.exports = router;
