CREATE TABLE vendors (
  id         SERIAL PRIMARY KEY,
  name       TEXT    NOT NULL,
  color      TEXT    NOT NULL DEFAULT '#6366f1',
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vendor_sightings (
  id         SERIAL PRIMARY KEY,
  vendor_id  INTEGER REFERENCES vendors(id) ON DELETE CASCADE,
  station_id INTEGER REFERENCES stations(station_id),
  timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  direction  TEXT        NOT NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vendor_sightings_vendor    ON vendor_sightings(vendor_id);
CREATE INDEX idx_vendor_sightings_station   ON vendor_sightings(station_id);
CREATE INDEX idx_vendor_sightings_timestamp ON vendor_sightings(timestamp);

INSERT INTO vendors (name, color) VALUES
  ('Amazon',              '#FF9900'),
  ('Sysco',               '#003087'),
  ('Driving Force',       '#E31837'),
  ('Steamworks',          '#2D5B8C'),
  ('Backcountry Brewing', '#6B8E23');
