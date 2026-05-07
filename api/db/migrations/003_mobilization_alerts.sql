-- Migration 003: Mobilization alerts
-- Fires when aggregate job detects a volume surge or speed drop worth acting on.
-- Run against Railway: psql $DATABASE_PUBLIC_URL < api/db/migrations/003_mobilization_alerts.sql

CREATE TABLE IF NOT EXISTS mobilization_alerts (
  alert_id       BIGSERIAL PRIMARY KEY,
  station_id     INTEGER REFERENCES stations(station_id),
  triggered_at   TIMESTAMPTZ NOT NULL,
  resolved_at    TIMESTAMPTZ,                 -- NULL = still active
  alert_type     TEXT NOT NULL CHECK (alert_type IN ('volume_surge', 'speed_drop', 'event_correlation')),
  severity       TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')) DEFAULT 'warning',
  direction      TEXT,                        -- northbound, southbound, or both
  vehicle_count  INTEGER,                     -- count in the trigger window
  threshold      INTEGER,                     -- threshold that was crossed
  window_minutes INTEGER,                     -- aggregation window that fired the alert
  avg_speed_kmh  REAL,                        -- avg speed at trigger time (speed_drop alerts)
  event_id       INTEGER REFERENCES events(event_id),
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_triggered   ON mobilization_alerts (triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_station     ON mobilization_alerts (station_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_active      ON mobilization_alerts (resolved_at) WHERE resolved_at IS NULL;
