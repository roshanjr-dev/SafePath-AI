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
            port=int(os.getenv("DB_PORT", 3306)),   #  IMPORTANT
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_NAME")
        )

        cursor = conn.cursor()
        print("Connected to DB ")

        #  CREATE TABLES
        print("Creating tables...")
        with open('../database/schema.sql', 'r') as f:
            schema = f.read()
            for statement in schema.split(';'):
                if statement.strip():
                    cursor.execute(statement)

        #  INSERT DATA
        print("Inserting data...")
        with open('../database/seeds.sql', 'r') as f:
            seeds = f.read()
            for statement in seeds.split(';'):
                if statement.strip():
                    cursor.execute(statement)

        conn.commit()
        print("Database successfully seeded!")

    except Exception as e:
        print(" ERROR:", e)

    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()
            print("DB connection closed")

if __name__ == "__main__":
    seed()