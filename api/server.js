require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const cron    = require('node-cron');
const db      = require('./db');
const { runAggregation, runSpeedSegments } = require('./jobs/aggregate');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Routes
app.use('/api/detections', require('./routes/detections'));
app.use('/api/stations',   require('./routes/stations'));
app.use('/api/flow',       require('./routes/flow'));
app.use('/api/speed',      require('./routes/speed'));
app.use('/api/patterns',   require('./routes/patterns'));
app.use('/api/events',     require('./routes/events'));
app.use('/api/correlation',require('./routes/correlation'));
app.use('/api/corridor',   require('./routes/corridor'));
app.use('/api/export',     require('./routes/export'));

// Health check
app.get('/health', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT COUNT(*) AS total FROM detections');
    res.json({ status: 'ok', total_detections: Number(rows[0].total) });
  } catch {
    res.status(503).json({ status: 'db_error' });
  }
});

app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Hourly summary aggregation — :00 every hour
cron.schedule('0 * * * *', () => {
  runAggregation().catch(err => console.error('[cron] Aggregation failed:', err.message));
});

// 10-minute speed segment aggregation — every 10 min
cron.schedule('*/10 * * * *', () => {
  runSpeedSegments().catch(err => console.error('[cron] Speed segments failed:', err.message));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sea to Sky API listening on port ${PORT}`));
