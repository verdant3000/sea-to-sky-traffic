const express = require('express');
const router  = express.Router();
const db      = require('../db');

function flowStatus(avgSpeed, sampleCount) {
  if (!avgSpeed || sampleCount < 2) return 'no_data';
  if (avgSpeed >= 80) return 'free';
  if (avgSpeed >= 40) return 'degraded';
  return 'congested';
}

/**
 * GET /api/flow/live
 * Current in/out flow for the last 15 minutes.
 * Includes per-direction flow_status (from speed data in same window).
 */
router.get('/live', async (req, res) => {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const { rows } = await db.query(
    `WITH speed_window AS (
       SELECT
         direction,
         AVG(speed_estimate) FILTER (WHERE speed_estimate IS NOT NULL) AS avg_speed,
         COUNT(*)            FILTER (WHERE speed_estimate IS NOT NULL) AS speed_count
       FROM detections
       WHERE timestamp > $1
       GROUP BY direction
     )
     SELECT
       d.station_id,
       s.name                                   AS station_name,
       d.direction,
       COUNT(*)                                 AS count,
       ROUND(COUNT(*) * 4.0)                    AS vehicles_per_hour,
       ROUND(sw.avg_speed::numeric, 1)          AS avg_speed_kmh,
       COALESCE(sw.speed_count, 0)              AS speed_count
     FROM detections d
     JOIN stations s   ON s.station_id = d.station_id
     LEFT JOIN speed_window sw ON sw.direction = d.direction
     WHERE d.timestamp > $1
     GROUP BY d.station_id, s.name, d.direction, sw.avg_speed, sw.speed_count
     ORDER BY d.station_id, d.direction`,
    [cutoff]
  );

  const byStation = {};
  for (const row of rows) {
    if (!byStation[row.station_id]) {
      byStation[row.station_id] = {
        station_id:   row.station_id,
        station_name: row.station_name,
        directions:   [],
      };
    }
    const avgSpeed = row.avg_speed_kmh ? Number(row.avg_speed_kmh) : null;
    const speedCnt = Number(row.speed_count);
    byStation[row.station_id].directions.push({
      direction:        row.direction,
      count:            Number(row.count),
      vehicles_per_hour: Number(row.vehicles_per_hour),
      avg_speed_kmh:    avgSpeed,
      flow_status:      flowStatus(avgSpeed, speedCnt),
    });
  }

  res.json({ window_minutes: 15, stations: Object.values(byStation) });
});

/**
 * GET /api/flow/ratio
 * Northbound:southbound ratio — current (15-min) and hourly history.
 */
router.get('/ratio', async (req, res) => {
  const hours        = Math.min(parseInt(req.query.hours) || 24, 168);
  const liveCutoff   = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const hourlyCutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  const [liveRes, hourlyRes] = await Promise.all([
    db.query(
      `SELECT direction, COUNT(*) AS count
       FROM detections WHERE timestamp > $1 GROUP BY direction`,
      [liveCutoff]
    ),
    db.query(
      `SELECT DATE_TRUNC('hour', timestamp) AS hour, direction, COUNT(*) AS count
       FROM detections WHERE timestamp > $1
       GROUP BY hour, direction ORDER BY hour DESC, direction`,
      [hourlyCutoff]
    ),
  ]);

  const live  = Object.fromEntries(liveRes.rows.map(r => [r.direction, Number(r.count)]));
  const nb    = live.northbound || 0;
  const sb    = live.southbound || 0;
  const total = nb + sb;

  const current = {
    northbound:     nb,
    southbound:     sb,
    ratio:          sb > 0 ? Number((nb / sb).toFixed(2)) : null,
    northbound_pct: total > 0 ? Math.round((nb / total) * 100) : 50,
    southbound_pct: total > 0 ? Math.round((sb / total) * 100) : 50,
    dominant:       nb > sb ? 'northbound' : nb < sb ? 'southbound' : 'balanced',
    status:         nb > sb * 1.2 ? 'Corridor filling'
                  : sb > nb * 1.2 ? 'Corridor emptying'
                  : 'Balanced flow',
    window_minutes: 15,
  };

  const byHour = {};
  for (const r of hourlyRes.rows) {
    const key = new Date(r.hour).toISOString().slice(0, 13);
    if (!byHour[key]) byHour[key] = { hour: r.hour, northbound: 0, southbound: 0 };
    byHour[key][r.direction] = Number(r.count);
  }
  const hourly = Object.values(byHour)
    .sort((a, b) => new Date(b.hour) - new Date(a.hour))
    .map(h => {
      const t = h.northbound + h.southbound;
      return {
        hour:           h.hour,
        northbound:     h.northbound,
        southbound:     h.southbound,
        northbound_pct: t > 0 ? Math.round((h.northbound / t) * 100) : 50,
        southbound_pct: t > 0 ? Math.round((h.southbound / t) * 100) : 50,
      };
    });

  res.json({ current, hourly });
});

/**
 * GET /api/flow/hourly
 * Query params: station_id (optional), hours (default 24, max 168)
 */
router.get('/hourly', async (req, res) => {
  const hours  = Math.min(parseInt(req.query.hours) || 24, 168);
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  const conditions = ['d.timestamp > $1'];
  const params     = [cutoff];

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
 * Query params: station_id (optional), days (default 7, max 90)
 */
router.get('/daily', async (req, res) => {
  const days   = Math.min(parseInt(req.query.days) || 7, 90);
  const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();

  const conditions = ['d.timestamp > $1'];
  const params     = [cutoff];

  if (req.query.station_id) {
    params.push(parseInt(req.query.station_id));
    conditions.push(`d.station_id = $${params.length}`);
  }

  const where = conditions.join(' AND ');

  const { rows } = await db.query(
    `SELECT
       DATE_TRUNC('day', d.timestamp AT TIME ZONE 'America/Vancouver') AS day,
       d.station_id,
       s.name          AS station_name,
       d.direction,
       d.vehicle_class,
       COUNT(*)        AS count
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
