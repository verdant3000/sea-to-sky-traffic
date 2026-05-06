const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/flow/live
 * Current in/out flow — counts and vehicles-per-hour for the last 15 minutes.
 * One row per station × direction combination that has seen traffic.
 */
router.get('/live', async (req, res) => {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const { rows } = await db.query(
    `SELECT
       d.station_id,
       s.name        AS station_name,
       d.direction,
       COUNT(*)      AS count,
       ROUND(COUNT(*) * 4.0) AS vehicles_per_hour
     FROM detections d
     JOIN stations s ON s.station_id = d.station_id
     WHERE d.timestamp > $1
     GROUP BY d.station_id, s.name, d.direction
     ORDER BY d.station_id, d.direction`,
    [cutoff]
  );

  // Net flow per station (positive = more northbound than southbound)
  const byStation = {};
  for (const row of rows) {
    if (!byStation[row.station_id]) {
      byStation[row.station_id] = { station_id: row.station_id, station_name: row.station_name, directions: [] };
    }
    byStation[row.station_id].directions.push({
      direction: row.direction,
      count: Number(row.count),
      vehicles_per_hour: Number(row.vehicles_per_hour),
    });
  }

  res.json({
    window_minutes: 15,
    stations: Object.values(byStation),
  });
});

/**
 * GET /api/flow/hourly
 * Query params:
 *   station_id  — filter to one station (optional)
 *   hours       — lookback window in hours (default 24, max 168)
 */
router.get('/hourly', async (req, res) => {
  const hours = Math.min(parseInt(req.query.hours) || 24, 168);
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  const conditions = ['d.timestamp > $1'];
  const params = [cutoff];

  if (req.query.station_id) {
    params.push(parseInt(req.query.station_id));
    conditions.push(`d.station_id = $${params.length}`);
  }

  const where = conditions.join(' AND ');

  const { rows } = await db.query(
    `SELECT
       DATE_TRUNC('hour', d.timestamp) AS hour,
       d.station_id,
       s.name                           AS station_name,
       d.direction,
       d.vehicle_class,
       COUNT(*)                         AS count,
       ROUND(AVG(d.speed_estimate)::numeric, 1) AS avg_speed
     FROM detections d
     JOIN stations s ON s.station_id = d.station_id
     WHERE ${where}
     GROUP BY hour, d.station_id, s.name, d.direction, d.vehicle_class
     ORDER BY hour DESC, d.station_id, d.direction`,
    params
  );

  res.json({ hours, rows });
});

/**
 * GET /api/flow/daily
 * Query params:
 *   station_id — filter to one station (optional)
 *   days       — lookback in days (default 7, max 90)
 */
router.get('/daily', async (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 7, 90);
  const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();

  const conditions = ['d.timestamp > $1'];
  const params = [cutoff];

  if (req.query.station_id) {
    params.push(parseInt(req.query.station_id));
    conditions.push(`d.station_id = $${params.length}`);
  }

  const where = conditions.join(' AND ');

  const { rows } = await db.query(
    `SELECT
       DATE_TRUNC('day', d.timestamp AT TIME ZONE 'America/Vancouver') AS day,
       d.station_id,
       s.name   AS station_name,
       d.direction,
       d.vehicle_class,
       COUNT(*) AS count
     FROM detections d
     JOIN stations s ON s.station_id = d.station_id
     WHERE ${where}
     GROUP BY day, d.station_id, s.name, d.direction, d.vehicle_class
     ORDER BY day DESC, d.station_id, d.direction`,
    params
  );

  res.json({ days, rows });
});

module.exports = router;
