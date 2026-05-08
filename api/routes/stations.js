const express      = require('express');
const router       = express.Router();
const db           = require('../db');
const requireApiKey = require('../middleware/auth');

/** GET /api/stations — list stations. ?all=true includes inactive. */
router.get('/', async (req, res) => {
  const all = req.query.all === 'true';
  const { rows } = await db.query(
    all
      ? 'SELECT * FROM stations ORDER BY station_id'
      : 'SELECT * FROM stations WHERE active = true ORDER BY station_id'
  );
  res.json(rows);
});

/** GET /api/stations/:id — single station */
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

  const { rows: latest } = await db.query(`
    SELECT DISTINCT ON (sensor_location)
      sensor_location, temp_c, humidity_pct, pressure_hpa, timestamp
    FROM env_readings
    WHERE station_id = $1
    ORDER BY sensor_location, timestamp DESC
  `, [stationId]);

  const { rows: history } = await db.query(`
    SELECT timestamp, sensor_location, temp_c, humidity_pct, pressure_hpa
    FROM env_readings
    WHERE station_id = $1
      AND timestamp > NOW() - INTERVAL '3 hours'
    ORDER BY timestamp ASC
  `, [stationId]);

  const inside  = latest.find(r => r.sensor_location === 'inside')  ?? null;
  const outside = latest.find(r => r.sensor_location === 'outside') ?? null;

  const temp_delta = (inside?.temp_c != null && outside?.temp_c != null)
    ? Math.round((inside.temp_c - outside.temp_c) * 10) / 10
    : null;

  const outsideHistory = history.filter(r => r.sensor_location === 'outside' && r.pressure_hpa != null);
  let pressure_trend = 'no_data';
  if (outsideHistory.length >= 2) {
    const oldest = outsideHistory[0];
    const newest = outsideHistory[outsideHistory.length - 1];
    const hours  = (new Date(newest.timestamp) - new Date(oldest.timestamp)) / 3_600_000;
    if (hours > 0) {
      const rate = (newest.pressure_hpa - oldest.pressure_hpa) / hours;
      if (rate > 0.5)       pressure_trend = 'rising';
      else if (rate < -0.5) pressure_trend = 'falling';
      else                  pressure_trend = 'stable';
    }
  }

  const alerts = [];
  if (inside?.temp_c != null && inside.temp_c > 55)
    alerts.push({ type: 'inside_temp', message: `Case temperature ${inside.temp_c}°C exceeds 55°C limit` });
  if (inside?.humidity_pct != null && inside.humidity_pct > 80)
    alerts.push({ type: 'inside_humidity', message: `Case humidity ${inside.humidity_pct}% exceeds 80% limit` });

  res.json({ station_id: Number(stationId), inside, outside, temp_delta, pressure_trend, alerts, history });
});

/** POST /api/stations — create a station */
router.post('/', requireApiKey, async (req, res) => {
  const { name, location, direction_a, direction_b, lat, lng } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const { rows } = await db.query(
    `INSERT INTO stations (name, location, direction_a, direction_b, lat, lng)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name, location ?? null, direction_a ?? 'northbound', direction_b ?? 'southbound', lat ?? null, lng ?? null]
  );
  res.status(201).json(rows[0]);
});

/** PATCH /api/stations/:id — update fields (name, location, lat, lng, active) */
router.patch('/:id', requireApiKey, async (req, res) => {
  const allowed = ['name', 'location', 'direction_a', 'direction_b', 'lat', 'lng', 'active'];
  const fields  = Object.keys(req.body).filter(k => allowed.includes(k));
  if (fields.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  const sets   = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const values = fields.map(f => req.body[f]);

  const { rows } = await db.query(
    `UPDATE stations SET ${sets} WHERE station_id = $${fields.length + 1} RETURNING *`,
    [...values, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Station not found' });
  res.json(rows[0]);
});

module.exports = router;
