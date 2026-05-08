CREATE TABLE detections (
    id              SERIAL PRIMARY KEY,
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    station_id      TEXT NOT NULL,          -- which overpass/camera
    class_name      TEXT NOT NULL,          -- e.g. "delivery_van"
    confidence      REAL NOT NULL,
    entity_name     TEXT,                   -- NULL unless known named entity
    bbox_x          REAL,
    bbox_y          REAL,
    bbox_w          REAL,
    bbox_h          REAL,
    image_path      TEXT
);

CREATE INDEX idx_detections_station ON detections(station_id);
CREATE INDEX idx_detections_entity  ON detections(entity_name) WHERE entity_name IS NOT NULL;
