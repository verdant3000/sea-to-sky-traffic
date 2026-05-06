/**
 * Hourly aggregation job.
 * Computes hourly_summaries from raw detections for the previous full hour.
 * Scheduled via node-cron in server.js (runs at :00 every hour).
 * Can also be called directly: node jobs/aggregate.js
 */
const db = require('../db');

async function runAggregation(targetHour) {
  // Default: aggregate the most recently completed full hour
  const now = targetHour || new Date();
  const hourStart = new Date(now);
  hourStart.setMinutes(0, 0, 0);
  hourStart.setHours(hourStart.getHours() - 1);
  const hourEnd = new Date(hourStart);
  hourEnd.setHours(hourEnd.getHours() + 1);

  const label = hourStart.toISOString().slice(0, 16);
  console.log(`[aggregate] Computing summaries for ${label}`);

  const { rowCount } = await db.query(
    `INSERT INTO hourly_summaries (hour, station_id, direction, vehicle_class, count, avg_speed)
     SELECT
       DATE_TRUNC('hour', timestamp) AS hour,
       station_id,
       direction,
       vehicle_class,
       COUNT(*)                      AS count,
       AVG(speed_estimate)           AS avg_speed
     FROM detections
     WHERE timestamp >= $1 AND timestamp < $2
     GROUP BY hour, station_id, direction, vehicle_class
     ON CONFLICT (hour, station_id, direction, vehicle_class)
     DO UPDATE SET
       count     = EXCLUDED.count,
       avg_speed = EXCLUDED.avg_speed`,
    [hourStart.toISOString(), hourEnd.toISOString()]
  );

  console.log(`[aggregate] Upserted ${rowCount} summary rows for ${label}`);
  return rowCount;
}

// Allow running directly: node jobs/aggregate.js [YYYY-MM-DDTHH]
if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
  const arg = process.argv[2];
  const target = arg ? new Date(arg) : null;
  runAggregation(target)
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { runAggregation };
