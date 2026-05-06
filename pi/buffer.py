"""
SQLite local buffer — stores detections when the API is unreachable,
flushes them when connectivity returns.
"""
import sqlite3
import config


def init_db():
    conn = sqlite3.connect(config.DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS detections (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp      TEXT    NOT NULL,
            vehicle_class  TEXT    NOT NULL,
            direction      TEXT    NOT NULL,
            confidence     REAL,
            speed_estimate REAL,
            synced         INTEGER DEFAULT 0
        )
    """)
    conn.commit()
    conn.close()


def init_env_table():
    conn = sqlite3.connect(config.DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS env_readings (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp        TEXT NOT NULL,
            sensor_location  TEXT NOT NULL,
            temp_c           REAL,
            humidity_pct     REAL,
            pressure_hpa     REAL,
            synced           INTEGER DEFAULT 0
        )
    """)
    conn.commit()
    conn.close()


def insert_detection(timestamp, vehicle_class, direction, confidence, speed_estimate=None):
    conn = sqlite3.connect(config.DB_PATH)
    conn.execute(
        """INSERT INTO detections
           (timestamp, vehicle_class, direction, confidence, speed_estimate)
           VALUES (?, ?, ?, ?, ?)""",
        (timestamp, vehicle_class, direction, confidence, speed_estimate),
    )
    conn.commit()
    conn.close()


def get_unsynced(limit=500):
    conn = sqlite3.connect(config.DB_PATH)
    rows = conn.execute(
        """SELECT id, timestamp, vehicle_class, direction, confidence, speed_estimate
           FROM detections WHERE synced = 0
           ORDER BY timestamp
           LIMIT ?""",
        (limit,),
    ).fetchall()
    conn.close()
    return rows


def mark_synced(ids):
    if not ids:
        return
    conn = sqlite3.connect(config.DB_PATH)
    placeholders = ",".join("?" * len(ids))
    conn.execute(f"UPDATE detections SET synced = 1 WHERE id IN ({placeholders})", ids)
    conn.commit()
    conn.close()


def unsynced_count():
    conn = sqlite3.connect(config.DB_PATH)
    count = conn.execute("SELECT COUNT(*) FROM detections WHERE synced = 0").fetchone()[0]
    conn.close()
    return count


def total_count():
    conn = sqlite3.connect(config.DB_PATH)
    count = conn.execute("SELECT COUNT(*) FROM detections").fetchone()[0]
    conn.close()
    return count


# --- Environmental sensor buffer ---

def insert_env_reading(timestamp, sensor_location, temp_c, humidity_pct, pressure_hpa):
    conn = sqlite3.connect(config.DB_PATH)
    conn.execute(
        """INSERT INTO env_readings
           (timestamp, sensor_location, temp_c, humidity_pct, pressure_hpa)
           VALUES (?, ?, ?, ?, ?)""",
        (timestamp, sensor_location, temp_c, humidity_pct, pressure_hpa),
    )
    conn.commit()
    conn.close()


def get_unsynced_env(limit=200):
    conn = sqlite3.connect(config.DB_PATH)
    rows = conn.execute(
        """SELECT id, timestamp, sensor_location, temp_c, humidity_pct, pressure_hpa
           FROM env_readings WHERE synced = 0
           ORDER BY timestamp
           LIMIT ?""",
        (limit,),
    ).fetchall()
    conn.close()
    return rows


def mark_env_synced(ids):
    if not ids:
        return
    conn = sqlite3.connect(config.DB_PATH)
    placeholders = ",".join("?" * len(ids))
    conn.execute(f"UPDATE env_readings SET synced = 1 WHERE id IN ({placeholders})", ids)
    conn.commit()
    conn.close()
