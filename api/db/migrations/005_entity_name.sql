ALTER TABLE detections ADD COLUMN IF NOT EXISTS
  entity_name TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_detections_entity_name
  ON detections(entity_name) WHERE entity_name IS NOT NULL;
