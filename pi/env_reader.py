"""
Environmental sensor reader — dual BME280 sensors via I2C.

Reads inside (case) and outside (ambient) conditions every ENV_READ_INTERVAL seconds.
Logs to the shared SQLite buffer and syncs to the central API every ENV_SYNC_INTERVAL seconds.

Usage:
  python env_reader.py             # normal Pi operation
  python env_reader.py --simulate  # fake readings for Mac testing
  python env_reader.py --no-sync   # skip API sync while API is not running
"""
import argparse
import logging
import random
import signal
import time
from datetime import datetime, timezone

import requests

import buffer
import config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [env] %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

_running = True


def _shutdown(sig, frame):
    global _running
    _running = False
    log.info("Shutdown signal — stopping after current cycle")


def read_bme280(addr, simulate=False):
    """Return (temp_c, humidity_pct, pressure_hpa). Raises on hardware error."""
    if simulate:
        base = 38.0 if addr == config.ENV_INSIDE_I2C_ADDR else 20.0
        return (
            round(base + random.uniform(-2.0, 2.0), 1),
            round(random.uniform(40.0, 75.0), 1),
            round(random.uniform(1008.0, 1022.0), 2),
        )
    import smbus2
    import bme280 as bme280lib
    bus = smbus2.SMBus(1)
    try:
        cal  = bme280lib.load_calibration_params(bus, addr)
        data = bme280lib.sample(bus, addr, cal)
        return round(data.temperature, 1), round(data.humidity, 1), round(data.pressure, 2)
    finally:
        bus.close()


def check_alerts(temp_c, humidity_pct):
    """Warn if inside-case thresholds are exceeded."""
    if temp_c is not None and temp_c > config.INSIDE_TEMP_MAX_C:
        log.warning(
            "ALERT case temp %.1f°C exceeds %.1f°C limit — check enclosure ventilation",
            temp_c, config.INSIDE_TEMP_MAX_C,
        )
    if humidity_pct is not None and humidity_pct > config.INSIDE_HUMIDITY_MAX:
        log.warning(
            "ALERT case humidity %.1f%% exceeds %.1f%% limit — check weatherproofing seals",
            humidity_pct, config.INSIDE_HUMIDITY_MAX,
        )


def sync_to_api():
    """POST unsynced env readings from SQLite buffer to central API."""
    unsynced = buffer.get_unsynced_env()
    if not unsynced:
        return

    payload = {
        "station_id": config.STATION_ID,
        "readings": [
            {
                "id":              row[0],
                "timestamp":       row[1],
                "sensor_location": row[2],
                "temp_c":          row[3],
                "humidity_pct":    row[4],
                "pressure_hpa":    row[5],
            }
            for row in unsynced
        ],
    }
    headers = {"X-Api-Key": config.API_KEY} if getattr(config, "API_KEY", None) else {}

    try:
        resp = requests.post(
            f"{config.API_ENDPOINT}/api/environment",
            json=payload,
            headers=headers,
            timeout=10,
        )
        resp.raise_for_status()
        buffer.mark_env_synced([row[0] for row in unsynced])
        log.info("Synced %d env readings to API", len(unsynced))
    except Exception as exc:
        log.warning("API env sync failed (will retry): %s", exc)


def main():
    parser = argparse.ArgumentParser(description="BME280 environmental sensor reader")
    parser.add_argument("--simulate", action="store_true",
                        help="Generate fake readings — no hardware required (Mac testing)")
    parser.add_argument("--no-sync", action="store_true",
                        help="Skip API sync — log to SQLite only")
    args = parser.parse_args()

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT,  _shutdown)

    buffer.init_db()
    buffer.init_env_table()

    log.info(
        "Env reader starting — simulate=%s  no-sync=%s",
        args.simulate, args.no_sync,
    )
    log.info(
        "Inside sensor @ 0x%02X | Outside sensor @ 0x%02X | read every %ds | sync every %ds",
        config.ENV_INSIDE_I2C_ADDR, config.ENV_OUTSIDE_I2C_ADDR,
        config.ENV_READ_INTERVAL, config.ENV_SYNC_INTERVAL,
    )

    last_sync = 0.0

    while _running:
        tick = time.time()
        now  = datetime.now(timezone.utc).isoformat()

        # Inside sensor — temp + humidity (pressure not needed inside case)
        try:
            t_in, h_in, _ = read_bme280(config.ENV_INSIDE_I2C_ADDR, simulate=args.simulate)
            buffer.insert_env_reading(now, "inside", t_in, h_in, None)
            check_alerts(t_in, h_in)
            log.info("Inside:  %.1f°C  %.1f%%RH", t_in, h_in)
        except Exception as exc:
            log.warning("Inside sensor unavailable (disconnected?): %s", exc)

        # Outside sensor — temp + humidity + barometric pressure
        try:
            t_out, h_out, p_out = read_bme280(config.ENV_OUTSIDE_I2C_ADDR, simulate=args.simulate)
            buffer.insert_env_reading(now, "outside", t_out, h_out, p_out)
            log.info("Outside: %.1f°C  %.1f%%RH  %.1f hPa", t_out, h_out, p_out)
        except Exception as exc:
            log.warning("Outside sensor unavailable (disconnected?): %s", exc)

        # Sync to API on schedule
        if not args.no_sync and time.time() - last_sync >= config.ENV_SYNC_INTERVAL:
            sync_to_api()
            last_sync = time.time()

        elapsed = time.time() - tick
        time.sleep(max(0.0, config.ENV_READ_INTERVAL - elapsed))

    log.info("Env reader stopped")


if __name__ == "__main__":
    main()
