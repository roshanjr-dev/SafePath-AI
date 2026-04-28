import mysql.connector
import os
from dotenv import load_dotenv

load_dotenv()

conn = mysql.connector.connect(
    host=os.getenv("DB_HOST", "localhost"),
    user=os.getenv("DB_USER", "root"),
    password=os.getenv("DB_PASSWORD", ""),
    database=os.getenv("DB_NAME", "emergency_lifeline")
)
cursor = conn.cursor()

migrations = [
    "ALTER TABLE incidents ADD COLUMN disaster_type VARCHAR(50) DEFAULT 'Fire'",
    "ALTER TABLE locations ADD COLUMN location_type VARCHAR(30) DEFAULT 'room'",
    "ALTER TABLE locations ADD COLUMN is_empty TINYINT(1) DEFAULT 0",
    """CREATE TABLE IF NOT EXISTS live_users (
        session_id VARCHAR(64) PRIMARY KEY,
        x_coord FLOAT,
        y_coord FLOAT,
        floor_num INT DEFAULT 1,
        status VARCHAR(20) DEFAULT 'active',
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )""",
]

for sql in migrations:
    try:
        cursor.execute(sql)
        print("OK:", sql[:70])
    except mysql.connector.Error as e:
        print("SKIP (already exists?):", e)

conn.commit()
cursor.close()
conn.close()
print("Migration complete.")
