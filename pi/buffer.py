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
