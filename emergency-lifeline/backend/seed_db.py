import os
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

def seed():
    conn = None
    cursor = None

    try:
        conn = mysql.connector.connect(
            host=os.getenv("DB_HOST"),
            port=int(os.getenv("DB_PORT", 3306)),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_NAME"),
            connect_timeout=60
        )

        cursor = conn.cursor()
        print("Connected to DB")

        # FIXED PATH (IMPORTANT)
        BASE_DIR = os.path.dirname(os.path.abspath(__file__))
        schema_path = os.path.join(BASE_DIR, 'database', 'schema.sql')
        seeds_path = os.path.join(BASE_DIR, 'database', 'seeds.sql')

        # CREATE TABLES
        print("Creating tables...")
        with open(schema_path, 'r') as f:
            # multi=True tells the database driver to safely process multiple queries at once
            for result in cursor.execute(f.read(), multi=True):
                pass # Just iterating through allows them all to execute

        # INSERT DATA
        print("Inserting data...")
        with open(seeds_path, 'r') as f:
            for result in cursor.execute(f.read(), multi=True):
                pass 
                
        conn.commit()
        print("Database successfully seeded!")

    except Exception as e:
        print("ERROR:", e)

    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()
            print("DB connection closed")


if __name__ == "__main__":
    seed()