const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/vendor-sightings?vendor_id=&station_id=&days=7
router.get('/', async (req, res) => {
  const days   = Math.min(parseInt(req.query.days) || 7, 90);
  const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();

  const conditions = ['vs.timestamp > $1'];
  const params     = [cutoff];

  if (req.query.vendor_id) {
    params.push(parseInt(req.query.vendor_id));
    conditions.push(`vs.vendor_id = $${params.length}`);
  }
  if (req.query.station_id) {
    params.push(parseInt(req.query.station_id));
    conditions.push(`vs.station_id = $${params.length}`);
  }

  const [sightingsRes, summaryRes] = await Promise.all([
    db.query(
      `SELECT vs.*, v.name AS vendor_name, v.color, s.name AS station_name
       FROM vendor_sightings vs
       JOIN vendors v ON v.id = vs.vendor_id
       LEFT JOIN stations s ON s.station_id = vs.station_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY vs.timestamp DESC`,
      params
    ),
    db.query(
      `SELECT
         vs.vendor_id,
         COUNT(*) FILTER (WHERE vs.timestamp > NOW() - INTERVAL '1 day')  AS today,
         COUNT(*) FILTER (WHERE vs.timestamp > NOW() - INTERVAL '7 days') AS this_week
       FROM vendor_sightings vs
       GROUP BY vs.vendor_id`
    ),
  ]);

  res.json({ sightings: sightingsRes.rows, summary: summaryRes.rows });
});

// POST /api/vendor-sightings — no API key required (dashboard is password-gated)
router.post('/', async (req, res) => {
  const { vendor_id, station_id, direction, notes, timestamp } = req.body;
  if (!vendor_id || !direction) {
    return res.status(400).json({ error: 'vendor_id and direction required' });
  }

  const ts = timestamp ? new Date(timestamp) : new Date();
  const { rows } = await db.query(
    `INSERT INTO vendor_sightings (vendor_id, station_id, timestamp, direction, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [vendor_id, station_id || null, ts, direction, notes || null]
  );
  res.status(201).json(rows[0]);
});

module.exports = router;
