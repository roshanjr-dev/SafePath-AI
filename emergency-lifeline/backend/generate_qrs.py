import qrcode
import os
import mysql.connector
from dotenv import load_dotenv

def generate_qrs():
    load_dotenv()
    
    # Use the local HTTPS URL to satisfy mobile browser security requirements
    base_url = "https://safe-path-ai-lilac.vercel.app/"
    
    # Fetch locations from DB
    try:
        connection = mysql.connector.connect(
            host=os.getenv("DB_HOST", "localhost"),
            user=os.getenv("DB_USER", "root"),
            password=os.getenv("DB_PASSWORD", ""),
            database=os.getenv("DB_NAME", "emergency_lifeline")
        )
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT qr_id FROM locations")
        locations = [row['qr_id'] for row in cursor.fetchall()]
        cursor.close()
        connection.close()
    except Exception as e:
        print(f"Failed to fetch locations from DB: {e}")
        return

    # Save the QR codes to the frontend's public directory so they can be viewed
    output_dir = "../frontend/public/qrcodes"
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"Generating {len(locations)} QR Codes for {base_url}...")
    
    for loc in locations:
        url = f"{base_url}/?scan={loc}"
        
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=4,
        )
        qr.add_data(url)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")
        
        file_path = os.path.join(output_dir, f"{loc}.png")
        img.save(file_path)
        print(f"Generated {loc}.png -> {url}")

if __name__ == "__main__":
    generate_qrs()
