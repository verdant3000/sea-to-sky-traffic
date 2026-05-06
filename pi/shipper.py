"""
Batch-ships buffered detections to the central API.
Called on a timer from detect.py — safe to call even when offline (will retry next cycle).
"""
import logging
import requests
import buffer
import config

log = logging.getLogger(__name__)


def sync():
    rows = buffer.get_unsynced()
    if not rows:
        return True

    payload = {
        "station_id": config.STATION_ID,
        "detections": [
            {
                "timestamp":      row[1],
                "vehicle_class":  row[2],
                "direction":      row[3],
                "confidence":     row[4],
                "speed_estimate": row[5],
            }
            for row in rows
        ],
    }

    try:
        resp = requests.post(
            f"{config.API_ENDPOINT}/api/detections",
            json=payload,
            timeout=10,
        )
        resp.raise_for_status()
        buffer.mark_synced([row[0] for row in rows])
        log.info(f"Synced {len(rows)} detections to API")
        return True
    except requests.exceptions.ConnectionError:
        log.warning("API unreachable — detections buffered locally, will retry")
    except requests.exceptions.HTTPError as e:
        log.warning(f"API returned error {e.response.status_code} — will retry")
    except Exception as e:
        log.warning(f"Sync failed: {e}")
    return False
