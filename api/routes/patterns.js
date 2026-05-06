const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/patterns
 * Day-of-week × hour heatmap — average vehicle count per slot.
 * Query params:
 *   station_id  — filter to one station (optional)
 *   direction   — northbound | southbound (optional)
 *   weeks       — how many weeks of history to use (default: all)
 *
 * Returns a 7×24 grid. day_of_week: 0=Sunday … 6=Saturday.
 * Requires at least a few days of real data to be useful.
 */
router.get('/', async (req, res) => {
  const conditions = [];
  const params = [];

  if (req.query.station_id) {
    params.push(parseInt(req.query.station_id));
    conditions.push(`station_id = $${params.length}`);
  }
  if (req.query.direction) {
    params.push(req.query.direction);
    conditions.push(`direction = $${params.length}`);
  }
  if (req.query.weeks) {
    const weeks = Math.min(parseInt(req.query.weeks) || 52, 104);
    const cutoff = new Date(Date.now() - weeks * 7 * 86400 * 1000).toISOString();
    params.push(cutoff);
    conditions.push(`timestamp > $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Average hourly count per (day_of_week, hour) slot.
  // We count distinct dates per slot, then divide, to avoid over-counting
  // when multiple vehicle classes or directions share a slot.
  const { rows } = await db.query(
    `WITH slot_counts AS (
       SELECT
         EXTRACT(DOW  FROM timestamp AT TIME ZONE 'America/Vancouver')::int AS day_of_week,
         EXTRACT(HOUR FROM timestamp AT TIME ZONE 'America/Vancouver')::int AS hour,
         DATE_TRUNC('day', timestamp AT TIME ZONE 'America/Vancouver')      AS day,
         COUNT(*) AS count
       FROM detections
       ${where}
       GROUP BY day_of_week, hour, day
     )
     SELECT
       day_of_week,
       hour,
       ROUND(AVG(count), 1)  AS avg_count,
       SUM(count)            AS total_count,
       COUNT(DISTINCT day)   AS sample_days
     FROM slot_counts
     GROUP BY day_of_week, hour
     ORDER BY day_of_week, hour`,
    params
  );

  res.json({ heatmap: rows });
});

module.exports = router;
