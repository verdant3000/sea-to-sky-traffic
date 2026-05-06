const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/corridor
 * Aggregate flow across the full Squamish ↔ Whistler ↔ Pemberton corridor.
 * Query params:
 *   window — minutes of lookback for live flow (default 60)
 *   hours  — hours of hourly history (default 24)
 *
 * Returns:
 *   live       — per-station, per-direction counts in the window
 *   net_flow   — corridor net flow: positive = more northbound overall
 *   hourly     — hourly totals across all stations for the last N hours
 */
router.get('/', async (req, res) => {
  const windowMin = Math.min(parseInt(req.query.window) || 60, 1440);
  const hours     = Math.min(parseInt(req.query.hours)  || 24,  168);

  const liveCutoff   = new Date(Date.now() - windowMin * 60 * 1000).toISOString();
  const hourlyCutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  const [liveRes, hourlyRes] = await Promise.all([
    db.query(
      `SELECT
         d.station_id,
         s.name      AS station_name,
         s.location,
         s.lat,
         s.lng,
         d.direction,
         COUNT(*)    AS count,
         ROUND(COUNT(*) * (60.0 / $2)) AS vehicles_per_hour
       FROM detections d
       JOIN stations s ON s.station_id = d.station_id
       WHERE d.timestamp > $1 AND s.active = true
       GROUP BY d.station_id, s.name, s.location, s.lat, s.lng, d.direction
       ORDER BY d.station_id, d.direction`,
      [liveCutoff, windowMin]
    ),
    db.query(
      `SELECT
         DATE_TRUNC('hour', timestamp) AS hour,
         direction,
         COUNT(*)                      AS count
       FROM detections d
       JOIN stations s ON s.station_id = d.station_id
       WHERE d.timestamp > $1 AND s.active = true
       GROUP BY hour, direction
       ORDER BY hour DESC, direction`,
      [hourlyCutoff]
    ),
  ]);

  // Net flow across corridor in the live window
  let northbound = 0;
  let southbound = 0;
  for (const row of liveRes.rows) {
    if (row.direction === 'northbound') northbound += Number(row.count);
    if (row.direction === 'southbound') southbound += Number(row.count);
  }

  res.json({
    window_minutes: windowMin,
    live: liveRes.rows,
    net_flow: northbound - southbound,
    northbound_total: northbound,
    southbound_total: southbound,
    hourly: hourlyRes.rows,
  });
});

module.exports = router;
