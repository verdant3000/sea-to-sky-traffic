const express = require('express');
const router = express.Router();
const db = require('../db');

/** GET /api/events — list events */
router.get('/', async (req, res) => {
  const conditions = [];
  const params = [];

  if (req.query.upcoming === 'true') {
    params.push(new Date().toISOString().slice(0, 10));
    conditions.push(`event_date >= $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);

  const { rows } = await db.query(
    `SELECT * FROM events ${where} ORDER BY event_date DESC LIMIT $${params.length + 1}`,
    [...params, limit]
  );

  res.json(rows);
});

/** POST /api/events — add an event (manual entry) */
router.post('/', async (req, res) => {
  const { name, event_date, event_type, expected_attendance, source_url, notes } = req.body;

  if (!name || !event_date) {
    return res.status(400).json({ error: 'name and event_date required' });
  }

  const { rows } = await db.query(
    `INSERT INTO events (name, event_date, event_type, expected_attendance, source_url, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name, event_date, event_type ?? null, expected_attendance ?? null, source_url ?? null, notes ?? null]
  );

  res.status(201).json(rows[0]);
});

module.exports = router;
