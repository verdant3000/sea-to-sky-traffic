const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/correlation/:event_id
 * Compare traffic during an event window against the historical baseline
 * for the same day-of-week and hour slots.
 *
 * Returns:
 *   event         — the event row
 *   event_traffic — hourly counts on the event day (and ±1 day)
 *   baseline      — historical average for those same day/hour slots
 *   delta         — event_traffic minus baseline, per hour
 */
router.get('/:event_id', async (req, res) => {
  const eventId = parseInt(req.params.event_id);

  // Load event
  const { rows: eventRows } = await db.query(
    'SELECT * FROM events WHERE event_id = $1',
    [eventId]
  );
  if (eventRows.length === 0) {
    return res.status(404).json({ error: 'Event not found' });
  }
  const event = eventRows[0];

  // Window: event_date ±1 day
  const windowStart = new Date(event.event_date);
  windowStart.setDate(windowStart.getDate() - 1);
  const windowEnd = new Date(event.event_date);
  windowEnd.setDate(windowEnd.getDate() + 2);

  // Hourly traffic during event window
  const { rows: eventTraffic } = await db.query(
    `SELECT
       DATE_TRUNC('hour', timestamp AT TIME ZONE 'America/Vancouver') AS hour,
       direction,
       COUNT(*) AS count
     FROM detections
     WHERE timestamp >= $1 AND timestamp < $2
     GROUP BY hour, direction
     ORDER BY hour, direction`,
    [windowStart.toISOString(), windowEnd.toISOString()]
  );

  // Historical baseline: same day-of-week, same hours, excluding the event window
  const eventDow = new Date(event.event_date).getDay();
  const { rows: baseline } = await db.query(
    `SELECT
       EXTRACT(HOUR FROM timestamp AT TIME ZONE 'America/Vancouver')::int AS hour,
       direction,
       ROUND(AVG(hourly_count), 1) AS avg_count
     FROM (
       SELECT
         DATE_TRUNC('hour', timestamp AT TIME ZONE 'America/Vancouver') AS slot,
         EXTRACT(HOUR FROM timestamp AT TIME ZONE 'America/Vancouver')  AS hour,
         direction,
         COUNT(*) AS hourly_count
       FROM detections
       WHERE EXTRACT(DOW FROM timestamp AT TIME ZONE 'America/Vancouver') = $1
         AND (timestamp < $2 OR timestamp >= $3)
       GROUP BY slot, hour, direction
     ) sub
     GROUP BY hour, direction
     ORDER BY hour, direction`,
    [eventDow, windowStart.toISOString(), windowEnd.toISOString()]
  );

  res.json({ event, event_traffic: eventTraffic, baseline });
});

module.exports = router;
