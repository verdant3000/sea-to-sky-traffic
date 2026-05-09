const express      = require('express');
const router       = express.Router();
const db           = require('../db');
const requireApiKey = require('../middleware/auth');

// GET /api/vendors
router.get('/', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM vendors WHERE active = true ORDER BY name');
  res.json(rows);
});

// POST /api/vendors
router.post('/', requireApiKey, async (req, res) => {
  const { name, color = '#6366f1' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const { rows } = await db.query(
    'INSERT INTO vendors (name, color) VALUES ($1, $2) RETURNING *',
    [name.trim(), color]
  );
  res.status(201).json(rows[0]);
});

module.exports = router;
