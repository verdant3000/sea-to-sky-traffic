const express = require('express');
const router  = express.Router();
const db      = require('../db');

// Flow status thresholds — Hwy 99 (90 km/h posted limit, mountain terrain)
function flowStatus(avgSpeed, sampleCount) {
  if (!avgSpeed || sampleCount < 2) return 'no_data';
  if (avgSpeed >= 80) return 'free';
  if (avgSpeed >= 40) return 'degraded';
  return 'congested';
}

/**
 * GET /api/speed/segments
 * 10-minute average speed buckets, computed on-the-fly from raw detections.
 * Returns only windows that have at least one speed reading.
 *
 * Query params:
 *   hours      — lookback (default 24, max 168)
 *   station_id — filter by station (optional)
 *   direction  — northbound | southbound (optional)
 */
router.get('/segments', async (req, res) => {
  const hours  = Math.min(parseInt(req.query.hours) || 24, 168);
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  const conditions = ['d.timestamp > $1', 'd.speed_estimate IS NOT NULL'];
  const params     = [cutoff];

  if (req.query.station_id) {
    params.push(parseInt(req.query.station_id));
    conditions.push(`d.station_id = $${params.length}`);
  }
  if (req.query.direction) {
    params.push(req.query.direction);
    conditions.push(`d.direction = $${params.length}`);
  }

  const where = conditions.join(' AND ');

  const { rows } = await db.query(
    `SELECT
       DATE_TRUNC('minute', d.timestamp)
         - (EXTRACT(MINUTE FROM d.timestamp)::int % 10) * INTERVAL '1 minute' AS window_start,
       d.station_id,
       s.name                                   AS station_name,
       d.direction,
       ROUND(AVG(d.speed_estimate)::numeric, 1) AS avg_speed_kmh,
       COUNT(*)                                 AS sample_count
     FROM detections d
     JOIN stations s ON s.station_id = d.station_id
     WHERE ${where}
     GROUP BY window_start, d.station_id, s.name, d.direction
     ORDER BY window_start DESC, d.station_id, d.direction`,
    params
  );

  const segments = rows.map(r => {
    const avg = r.avg_speed_kmh ? Number(r.avg_speed_kmh) : null;
    const cnt = Number(r.sample_count);
    return {
      window_start:  r.window_start,
      station_id:    r.station_id,
      station_name:  r.station_name,
      direction:     r.direction,
      avg_speed_kmh: avg,
      sample_count:  cnt,
      flow_status:   flowStatus(avg, cnt),
    };
  });

  res.json({ hours, segments });
});

module.exports = router;
