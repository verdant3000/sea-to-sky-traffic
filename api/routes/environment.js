const express = require('express');
const router  = express.Router();
const db      = require('../db');
const auth    = require('../middleware/auth');

/** POST /api/environment — Pi ships batched env readings */
router.post('/', auth, async (req, res) => {
  const { station_id, readings } = req.body;

  if (!station_id || !Array.isArray(readings) || readings.length === 0) {
    return res.status(400).json({ error: 'station_id and readings[] required' });
  }

  let inserted = 0;
  for (const r of readings) {
    const { timestamp, sensor_location, temp_c, humidity_pct, pressure_hpa } = r;
    if (!timestamp || !sensor_location) continue;
    try {
      await db.query(
        `INSERT INTO env_readings
           (station_id, timestamp, sensor_location, temp_c, humidity_pct, pressure_hpa)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (station_id, timestamp, sensor_location) DO NOTHING`,
        [station_id, timestamp, sensor_location, temp_c ?? null, humidity_pct ?? null, pressure_hpa ?? null],
      );
      inserted++;
    } catch (err) {
      console.error('[env] insert error:', err.message);
    }
  }

  res.json({ ok: true, inserted });
});

module.exports = router;
