const express = require('express');
const router = express.Router();
const db = require('../db');

/** GET /api/stations — list all active stations */
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM stations WHERE active = true ORDER BY station_id'
  );
  res.json(rows);
});

/** GET /api/stations/:id — single station detail */
router.get('/:id', async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM stations WHERE station_id = $1',
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Station not found' });
  res.json(rows[0]);
});

/** GET /api/stations/:id/environment — current env readings + pressure trend + alerts */
router.get('/:id/environment', async (req, res) => {
  const stationId = req.params.id;

  // Most recent reading per sensor location
  const { rows: latest } = await db.query(`
    SELECT DISTINCT ON (sensor_location)
      sensor_location, temp_c, humidity_pct, pressure_hpa, timestamp
    FROM env_readings
    WHERE station_id = $1
    ORDER BY sensor_location, timestamp DESC
  `, [stationId]);

  // 3-hour history for pressure trend calculation
  const { rows: history } = await db.query(`
    SELECT timestamp, sensor_location, temp_c, humidity_pct, pressure_hpa
    FROM env_readings
    WHERE station_id = $1
      AND timestamp > NOW() - INTERVAL '3 hours'
    ORDER BY timestamp ASC
  `, [stationId]);

  const inside  = latest.find(r => r.sensor_location === 'inside')  ?? null;
  const outside = latest.find(r => r.sensor_location === 'outside') ?? null;

  // Temperature delta: inside minus outside
  const temp_delta = (inside?.temp_c != null && outside?.temp_c != null)
    ? Math.round((inside.temp_c - outside.temp_c) * 10) / 10
    : null;

  // Pressure trend from 3-hour outside history
  const outsideHistory = history.filter(r => r.sensor_location === 'outside' && r.pressure_hpa != null);
  let pressure_trend = 'no_data';
  if (outsideHistory.length >= 2) {
    const oldest = outsideHistory[0];
    const newest = outsideHistory[outsideHistory.length - 1];
    const hours  = (new Date(newest.timestamp) - new Date(oldest.timestamp)) / 3_600_000;
    if (hours > 0) {
      const rate = (newest.pressure_hpa - oldest.pressure_hpa) / hours; // hPa/h
      if (rate > 0.5)       pressure_trend = 'rising';
      else if (rate < -0.5) pressure_trend = 'falling';
      else                  pressure_trend = 'stable';
    }
  }

  // Case health alerts
  const alerts = [];
  if (inside?.temp_c != null && inside.temp_c > 55) {
    alerts.push({ type: 'inside_temp', message: `Case temperature ${inside.temp_c}°C exceeds 55°C limit` });
  }
  if (inside?.humidity_pct != null && inside.humidity_pct > 80) {
    alerts.push({ type: 'inside_humidity', message: `Case humidity ${inside.humidity_pct}% exceeds 80% limit` });
  }

  res.json({ station_id: Number(stationId), inside, outside, temp_delta, pressure_trend, alerts, history });
});

module.exports = router;
