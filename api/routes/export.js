const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/export/csv
 * Download raw detections as CSV.
 * Query params:
 *   station_id  — filter by station (optional)
 *   direction   — northbound | southbound (optional)
 *   from        — ISO date string, inclusive (default: 7 days ago)
 *   to          — ISO date string, exclusive (default: now)
 *   limit       — max rows (default 50000, max 200000)
 *
 * No license plate or identity data — counts only (PIPEDA compliant).
 */
router.get('/csv', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50000, 200000);
  const from  = req.query.from || new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const to    = req.query.to   || new Date().toISOString();

  const conditions = ['d.timestamp >= $1', 'd.timestamp < $2'];
  const params     = [from, to];

  if (req.query.station_id) {
    params.push(parseInt(req.query.station_id));
    conditions.push(`d.station_id = $${params.length}`);
  }
  if (req.query.direction) {
    params.push(req.query.direction);
    conditions.push(`d.direction = $${params.length}`);
  }

  params.push(limit);
  const where = conditions.join(' AND ');

  const { rows } = await db.query(
    `SELECT
       d.detection_id,
       d.station_id,
       s.name        AS station_name,
       d.timestamp,
       d.vehicle_class,
       d.direction,
       d.confidence,
       d.speed_estimate
     FROM detections d
     JOIN stations s ON s.station_id = d.station_id
     WHERE ${where}
     ORDER BY d.timestamp
     LIMIT $${params.length}`,
    params
  );

  const filename = `seatosky-detections-${from.slice(0, 10)}-to-${to.slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const header = 'detection_id,station_id,station_name,timestamp,vehicle_class,direction,confidence,speed_estimate_kmh\n';
  res.write(header);

  for (const row of rows) {
    res.write(
      [
        row.detection_id,
        row.station_id,
        `"${row.station_name}"`,
        row.timestamp.toISOString(),
        row.vehicle_class,
        row.direction,
        row.confidence ?? '',
        row.speed_estimate ?? '',
      ].join(',') + '\n'
    );
  }

  res.end();
});

module.exports = router;
