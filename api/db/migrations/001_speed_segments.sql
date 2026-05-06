-- Migration 001: 10-minute speed segments table
-- Run against the live Railway database:
--   psql $DATABASE_URL < api/db/migrations/001_speed_segments.sql

CREATE TABLE IF NOT EXISTS speed_avg_10min (
  id            SERIAL PRIMARY KEY,
  window_start  TIMESTAMPTZ NOT NULL,
  station_id    INTEGER REFERENCES stations(station_id),
  direction     TEXT NOT NULL,
  avg_speed_kmh REAL,
  sample_count  INTEGER DEFAULT 0,
  -- Thresholds for Hwy 99 (90 km/h limit, mountain highway):
  -- free >= 80 km/h  |  degraded 40-79  |  congested < 40  |  no_data
  flow_status   TEXT NOT NULL CHECK (flow_status IN ('free', 'degraded', 'congested', 'no_data')),
  UNIQUE (window_start, station_id, direction)
);

CREATE INDEX IF NOT EXISTS idx_speed_window
  ON speed_avg_10min (window_start DESC, station_id);
