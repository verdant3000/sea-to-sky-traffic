-- Migration 002: Environmental sensor readings
-- Run against Railway: psql $DATABASE_PUBLIC_URL < api/db/migrations/002_env_readings.sql

CREATE TABLE IF NOT EXISTS env_readings (
  id               BIGSERIAL PRIMARY KEY,
  station_id       INTEGER REFERENCES stations(station_id),
  timestamp        TIMESTAMPTZ NOT NULL,
  sensor_location  TEXT NOT NULL CHECK (sensor_location IN ('inside', 'outside')),
  temp_c           REAL,
  humidity_pct     REAL,
  pressure_hpa     REAL,       -- NULL for inside sensor (no barometer on case sensor)
  received_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (station_id, timestamp, sensor_location)
);

CREATE INDEX IF NOT EXISTS idx_env_station_time  ON env_readings (station_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_env_location_time ON env_readings (sensor_location, timestamp DESC);
