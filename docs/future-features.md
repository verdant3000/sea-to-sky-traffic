## Known Entity Tracking

Label specific recognizable corridor vehicles as named entities. When detected, log with entity name instead of (or in addition to) vehicle class.

**Candidates:** Backcountry Brewing Sprinter van (ideal first — distinctive livery, regular Hwy 99 presence), Steamworks delivery truck, specific rental fleet vehicles.

**Use cases:**
- Named vans as proxies for delivery activity patterns on corridor
- Known rental trucks as tourism vs. construction signals  
- Repeat sightings across stations = travel time estimation without full re-ID infrastructure

**Training:** 50–100 images per entity, multiple angles/lighting. Run as secondary classifier only when primary class matches expected vehicle type — keeps RPi5 inference overhead low.

**Schema:** `entity_name` field on detections table (null = generic, string = named entity match).
