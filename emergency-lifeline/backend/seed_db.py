import os
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

def seed():
    try:
        conn = mysql.connector.connect(
            host=os.getenv("DB_HOST", "localhost"),
            user=os.getenv("DB_USER", "root"),
            password=os.getenv("DB_PASSWORD", ""),
        )
        cursor = conn.cursor()
        
        print("Creating database and tables...")
        with open('../database/schema.sql', 'r') as f:
            schema = f.read()
            for statement in schema.split(';'):
                if statement.strip():
                    cursor.execute(statement)
        
        print("Inserting dummy locations...")
        with open('../database/seeds.sql', 'r') as f:
            seeds = f.read()
            for statement in seeds.split(';'):
                if statement.strip():
                    cursor.execute(statement)
                    
        conn.commit()
        print("Database successfully seeded!")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == "__main__":
    seed()
