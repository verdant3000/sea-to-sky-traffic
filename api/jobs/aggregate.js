/**
 * Aggregation jobs.
 *
 * runAggregation()  — hourly summaries, called by cron at :00
 * runSpeedSegments() — 10-min speed buckets, called by cron every 10 min
 *
 * Both can be run directly:
 *   node jobs/aggregate.js          → hourly
 *   node jobs/aggregate.js speed    → speed segments
 */
const db = require('../db');

// ---------------------------------------------------------------------------
// Hourly summaries
// ---------------------------------------------------------------------------

async function runAggregation(targetHour) {
  const now       = targetHour || new Date();
  const hourStart = new Date(now);
  hourStart.setMinutes(0, 0, 0);
  hourStart.setHours(hourStart.getHours() - 1);
  const hourEnd = new Date(hourStart);
  hourEnd.setHours(hourEnd.getHours() + 1);

  const label = hourStart.toISOString().slice(0, 16);
  console.log(`[aggregate] Computing hourly summaries for ${label}`);

  const { rowCount } = await db.query(
    `INSERT INTO hourly_summaries (hour, station_id, direction, vehicle_class, count, avg_speed)
     SELECT
       DATE_TRUNC('hour', timestamp) AS hour,
       station_id, direction, vehicle_class,
       COUNT(*) AS count, AVG(speed_estimate) AS avg_speed
     FROM detections
     WHERE timestamp >= $1 AND timestamp < $2
     GROUP BY hour, station_id, direction, vehicle_class
     ON CONFLICT (hour, station_id, direction, vehicle_class)
     DO UPDATE SET count = EXCLUDED.count, avg_speed = EXCLUDED.avg_speed`,
    [hourStart.toISOString(), hourEnd.toISOString()]
  );

  console.log(`[aggregate] Upserted ${rowCount} hourly rows for ${label}`);
  return rowCount;
}

// ---------------------------------------------------------------------------
// 10-minute speed segments
// ---------------------------------------------------------------------------

function flowStatus(avgSpeed, sampleCount) {
  if (!avgSpeed || sampleCount < 2) return 'no_data';
  if (avgSpeed >= 80) return 'free';
  if (avgSpeed >= 40) return 'degraded';
  return 'congested';
}

async function runSpeedSegments(targetWindow) {
  // Default: the most recently completed 10-minute window
  const now   = targetWindow || new Date();
  const mins  = now.getMinutes();
  const wMins = Math.floor(mins / 10) * 10;

  const windowEnd = new Date(now);
  windowEnd.setMinutes(wMins, 0, 0);
  const windowStart = new Date(windowEnd);
  windowStart.setMinutes(windowStart.getMinutes() - 10);

  const label = windowStart.toISOString().slice(0, 16);
  console.log(`[speed] Computing segments for ${label}`);

  const { rows } = await db.query(
    `SELECT
       station_id, direction,
       AVG(speed_estimate)  AS avg_speed,
       COUNT(*)             AS sample_count
     FROM detections
     WHERE timestamp >= $1 AND timestamp < $2
       AND speed_estimate IS NOT NULL
     GROUP BY station_id, direction`,
    [windowStart.toISOString(), windowEnd.toISOString()]
  );

  if (rows.length === 0) return 0;

  let upserted = 0;
  for (const row of rows) {
    const avg = row.avg_speed ? Number(row.avg_speed) : null;
    const cnt = Number(row.sample_count);
    await db.query(
      `INSERT INTO speed_avg_10min
         (window_start, station_id, direction, avg_speed_kmh, sample_count, flow_status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (window_start, station_id, direction)
       DO UPDATE SET
         avg_speed_kmh = EXCLUDED.avg_speed_kmh,
         sample_count  = EXCLUDED.sample_count,
         flow_status   = EXCLUDED.flow_status`,
      [windowStart.toISOString(), row.station_id, row.direction,
       avg ? parseFloat(avg.toFixed(1)) : null, cnt, flowStatus(avg, cnt)]
    );
    upserted++;
  }

  console.log(`[speed] Upserted ${upserted} segments for ${label}`);
  return upserted;
}

// ---------------------------------------------------------------------------
// Direct invocation
// ---------------------------------------------------------------------------

if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
  const mode = process.argv[2];
  const fn   = mode === 'speed' ? runSpeedSegments : runAggregation;
  fn()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}

module.exports = { runAggregation, runSpeedSegments };
