const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/alerts — active mobilization alerts + resolved ones from last 24 h
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT ma.*, s.name AS station_name
     FROM mobilization_alerts ma
     LEFT JOIN stations s ON s.station_id = ma.station_id
     WHERE ma.resolved_at IS NULL
        OR ma.triggered_at > NOW() - INTERVAL '24 hours'
     ORDER BY ma.triggered_at DESC
     LIMIT 20`
  );
  res.json(rows);
});

module.exports = router;
