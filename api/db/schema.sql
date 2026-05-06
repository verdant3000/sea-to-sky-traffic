-- Sea to Sky Traffic Monitor — PostgreSQL schema
-- Run once against a fresh database, or via psql < schema.sql

-- Each physical Pi deployment
CREATE TABLE IF NOT EXISTS stations (
  station_id  SERIAL PRIMARY KEY,
  name        TEXT    NOT NULL,
  location    TEXT,
  direction_a TEXT,             -- e.g. 'northbound'
  direction_b TEXT,             -- e.g. 'southbound'
  lat         DECIMAL,
  lng         DECIMAL,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Raw detection events from Pi stations
-- vehicle_class: COCO-detectable now: car, truck, bus, motorcycle, bicycle
-- Custom-training classes (future): pickup_truck, suv, minivan, semi_truck,
--   logging_truck, box_truck, overland_rig, convertible, tow_truck,
--   ambulance, fire_truck, police_vehicle
CREATE TABLE IF NOT EXISTS detections (
  detection_id  BIGSERIAL PRIMARY KEY,
  station_id    INTEGER REFERENCES stations(station_id),
  timestamp     TIMESTAMPTZ NOT NULL,
  vehicle_class TEXT NOT NULL,
  direction     TEXT NOT NULL,   -- northbound, southbound
  confidence    REAL,
  speed_estimate REAL,           -- km/h, estimated
  synced_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_detections_timestamp   ON detections (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_detections_station     ON detections (station_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_detections_direction   ON detections (direction, timestamp DESC);

-- Pre-aggregated hourly summaries (fast dashboard queries)
CREATE TABLE IF NOT EXISTS hourly_summaries (
  id            SERIAL PRIMARY KEY,
  hour          TIMESTAMPTZ NOT NULL,
  station_id    INTEGER REFERENCES stations(station_id),
  direction     TEXT NOT NULL,
  vehicle_class TEXT NOT NULL,
  count         INTEGER DEFAULT 0,
  avg_speed     REAL,
  UNIQUE (hour, station_id, direction, vehicle_class)
);

CREATE INDEX IF NOT EXISTS idx_hourly_hour ON hourly_summaries (hour DESC, station_id);

-- Whistler/corridor events for traffic correlation
CREATE TABLE IF NOT EXISTS events (
  event_id            SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  event_date          DATE NOT NULL,
  event_type          TEXT,        -- festival, ski, holiday, race, concert
  expected_attendance INTEGER,
  source_url          TEXT,
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_date ON events (event_date DESC);

-- 10-minute speed segments (populated by aggregate job every 10 min)
-- Thresholds for Hwy 99 (90 km/h limit, mountain highway):
--   free >= 80 km/h  |  degraded 40-79  |  congested < 40  |  no_data
CREATE TABLE IF NOT EXISTS speed_avg_10min (
  id            SERIAL PRIMARY KEY,
  window_start  TIMESTAMPTZ NOT NULL,
  station_id    INTEGER REFERENCES stations(station_id),
  direction     TEXT NOT NULL,
  avg_speed_kmh REAL,
  sample_count  INTEGER DEFAULT 0,
  flow_status   TEXT NOT NULL CHECK (flow_status IN ('free', 'degraded', 'congested', 'no_data')),
  UNIQUE (window_start, station_id, direction)
);

CREATE INDEX IF NOT EXISTS idx_speed_window ON speed_avg_10min (window_start DESC, station_id);

-- Seed a test station so the Pi can start shipping immediately
INSERT INTO stations (name, location, direction_a, direction_b)
VALUES ('test-station', 'Local test', 'northbound', 'southbound')
ON CONFLICT DO NOTHING;
