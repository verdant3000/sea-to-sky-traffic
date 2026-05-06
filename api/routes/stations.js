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

module.exports = router;
