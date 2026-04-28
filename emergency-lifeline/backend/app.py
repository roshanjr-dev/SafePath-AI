import os
import json
import math
import base64
import uuid
from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
app = Flask(__name__)
CORS(app)

# Configure Gemini API
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
# Using gemini-2.5-flash as the default standard model
model = genai.GenerativeModel('gemini-2.5-flash')

def get_db_connection():
    try:
        connection = mysql.connector.connect(
            host=os.getenv("DB_HOST", "localhost"),
            user=os.getenv("DB_USER", "root"),
            password=os.getenv("DB_PASSWORD", ""),
            database=os.getenv("DB_NAME", "emergency_lifeline")
        )
        return connection
    except Error as e:
        print(f"Error connecting to MySQL: {e}")
        return None

@app.route('/api/scan', methods=['POST'])
def scan_qr():
    data = request.json
    qr_id = data.get('qr_id')
    
    if not qr_id:
        return jsonify({"error": "Missing qr_id"}), 400
        
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
        
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM locations WHERE qr_id = %s", (qr_id,))
        location = cursor.fetchone()
        
        if location:
            return jsonify(location), 200
        else:
            return jsonify({"error": "Location not found"}), 404
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/report-sos', methods=['POST'])
def report_sos():
    data = request.json
    qr_id = data.get('qr_id')
    disaster_type = data.get('disaster_type', 'Fire')
    
    if not qr_id:
        return jsonify({"error": "Missing qr_id"}), 400
        
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
        
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO incidents (qr_id, disaster_type) VALUES (%s, %s)", (qr_id, disaster_type))
        conn.commit()
        return jsonify({"message": "SOS reported successfully"}), 201
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


def is_stair_blocked(stair_x, stair_y, fire_zones, current_floor):
    for fz in fire_zones:
        if fz['floor_num'] != current_floor:
            continue
        dist = math.hypot(stair_x - fz['x_coord'], stair_y - fz['y_coord'])
        if dist < 10:
            return True
    return False

@app.route('/api/get-safe-path', methods=['POST'])

def get_safe_path():
    data = request.json
    current_x = data.get('x')
    current_y = data.get('y')
    # Safe parse: JS may send null/undefined which maps to None in Python
    try:
        current_floor = int(data.get('floor_num') or 1)
    except (TypeError, ValueError):
        current_floor = 1
    
    if current_x is None or current_y is None:
        return jsonify({"error": "Missing user coordinates"}), 400
        
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
        
    try:
        cursor = conn.cursor(dictionary=True)
        
        # 1. Consensus Logic: Find Disaster Zones (3+ reports in last 10 minutes)
        cursor.execute("""
            SELECT l.x_coord, l.y_coord, l.room_name, l.floor_num, i.disaster_type, COUNT(i.id) as report_count
            FROM locations l
            JOIN incidents i ON l.qr_id = i.qr_id
            WHERE i.timestamp >= NOW() - INTERVAL 10 MINUTE
            GROUP BY l.qr_id, l.x_coord, l.y_coord, l.room_name, l.floor_num, i.disaster_type
            HAVING COUNT(i.id) >= 3
        """)
        fire_zones = cursor.fetchall()

        
        # 2. Calculate Warning Zones (At-Risk Rooms)
        warning_zones = []
        if fire_zones:
            cursor.execute("SELECT * FROM locations WHERE location_type = 'room'")
            all_rooms = cursor.fetchall()
            hazard_room_names = set(fz['room_name'] for fz in fire_zones)

            for room in all_rooms:
                if room['room_name'] in hazard_room_names:
                    continue
                min_dist = float('inf')
                for fz in fire_zones:
                    if fz['floor_num'] == room['floor_num']:
                        dist = math.hypot(room['x_coord'] - fz['x_coord'], room['y_coord'] - fz['y_coord'])
                        if dist < min_dist:
                            min_dist = dist
                if min_dist < 45:
                    spread_time = "1m" if min_dist < 25 else "3m"
                    warning_zones.append({
                        "room_name": room['room_name'],
                        "floor_num": room['floor_num'],
                        "x_coord": room['x_coord'],
                        "y_coord": room['y_coord'],
                        "spread_time": spread_time
                    })
        
        # 3. Get Exits
        # GET STAIRS FROM DB (ADD HERE)
        cursor.execute("""
           SELECT x_coord, y_coord, room_name 
           FROM locations 
          WHERE location_type = 'exit' OR location_type = 'emergency_exit'
        """)
        exits = cursor.fetchall()

        cursor.execute("""
            SELECT x_coord, y_coord, room_name 
            FROM locations 
            WHERE location_type = 'stairs'
            AND room_name IN ('Stairs A (Left)', 'Stairs B (Right)')
        """)
        stairs = cursor.fetchall()
        # Format disaster zones string
        fire_str = ", ".join([f"({fz['x_coord']}, {fz['y_coord']}) [{fz['disaster_type']}]" for fz in fire_zones])
        
        
        # 4. Pathfinding — only when there are confirmed fire zones AND valid user coords
        path_coords = []
        ai_instructions = "All clear. No active emergencies detected." if not fire_zones else "Stay calm and proceed to the nearest exit."
        estimated_time = "N/A"
        
        # Skip AI routing entirely if there are no fire zones (no emergency = no path needed)
        if not fire_zones:
            return jsonify({
                "path": [],
                "instructions": "All clear. No active emergencies detected.",
                "estimated_time": "N/A",
                "fire_zones": [],
                "warning_zones": []
            }), 200
        
        if current_x is not None and current_y is not None:

            if current_floor > 1:
                safe_stairs = []

                for stair in stairs:
                    blocked = is_stair_blocked(
                        stair['x_coord'], 
                        stair['y_coord'], 
                        fire_zones,
                        current_floor
                    )
                    if not blocked:
                        dist = math.hypot(current_x - stair['x_coord'], current_y - stair['y_coord'])
                        safe_stairs.append((dist, stair))

                if safe_stairs:
                    safe_stairs.sort(key=lambda x: x[0])
                    best_stair = safe_stairs[0][1]
                    dest_x, dest_y = best_stair['x_coord'], best_stair['y_coord']
                    dest_label = best_stair['room_name']
                    floor_instruction = (
                        f"Proceed to {best_stair['room_name']} and descend to Floor 1."
                    )

                    last_must_be = f"Last point MUST be {best_stair['room_name']}."

                else:
                    dest_x, dest_y = current_x, 35
                    dest_label = "SAFE CORRIDOR (ALL STAIRS BLOCKED)"

                    floor_instruction = (
                        "CRITICAL: All stairs are blocked due to fire. "
                        "Stay in corridor and move away from fire."
                    )       

                    last_must_be = "End path in safe corridor away from fire zones."
            else:
                nearest_exit = exits[0] if exits else {
                  "x_coord": 91,
                  "y_coord": 66,
                  "room_name": "Main Exit"
                }

                dest_x, dest_y = nearest_exit['x_coord'], nearest_exit['y_coord']
                dest_label = nearest_exit['room_name']

                floor_instruction = "Proceed directly to the exit."

                last_must_be = f"Last point MUST be near exit ({dest_x}, {dest_y})."
            
            # Build compact example path for the prompt
            example_path = (
                '[{"x": ' + str(current_x) + ', "y": ' + str(current_y) + '}, '
                '{"x": ' + str(current_x) + ', "y": 35}, '
                '{"x": ' + str(dest_x) + ', "y": 35}, '
                '{"x": ' + str(dest_x) + ', "y": ' + str(dest_y) + '}]'
            )

            prompt = (
                "You are an emergency building evacuation AI.\n\n"
                "MAP LAYOUT (SVG space, width=100, height=70):\n"
                "- CORRIDOR: horizontal band y=28 to y=42, runs full width x=2 to x=98.\n"
                "- TOP ROOMS: y=2 to y=28 (above corridor).\n"
                "- BOTTOM ROOMS: y=42 to y=68 (below corridor).\n"
                "- Stair A: far left (evacuation stair, go DOWN to exit).\n"
                "- Stair B: far right (evacuation stair, go DOWN to exit).\n"
                "- Users MUST travel through the corridor. Cannot cut through walls.\n\n"
                f"USER POSITION: ({current_x}, {current_y}) on FLOOR {current_floor}\n"
                f"DISASTER ZONES (avoid, 10+ unit clearance): {fire_str if fire_str else 'None'}\n"
                f"DESTINATION: {dest_label}\n"
                f"{floor_instruction}\n\n"
                "TASK: Return the safest evacuation path as a JSON object.\n"
                "RULES:\n"
                f"1. First point MUST be user position ({current_x}, {current_y}) exactly.\n"
                "2. Path MUST pass through the corridor band (y=28-42) as a waypoint.\n"
                f"3. {last_must_be}\n"
                "4. 3-6 waypoints total. No diagonal cuts through walls.\n"
                "5. Avoid disaster zones by at least 10 units.\n"
                "6. If floor > 1, route to the SAFEST available stair (left or right). "
                "If all stairs are blocked, stay in a safe corridor."
                "Do NOT route to stairs if they are blocked."
                "Return ONLY raw JSON, no markdown, no code fences:\n"
                '{"path": ' + example_path + ', "estimated_time": "2 mins", "instructions": "Move to corridor, then proceed to the safest available stair, descend to Floor 1, then exit"}'
            )
            
            try:
                response = model.generate_content(prompt)
                raw = response.text.strip()
                # Strip accidental markdown fences
                if "```" in raw:
                    parts = raw.split("```")
                    raw = parts[1].lstrip("json").strip() if len(parts) > 1 else raw
                result = json.loads(raw)
                path_coords = result.get('path', [])
                ai_instructions = result.get('instructions', ai_instructions)
                estimated_time = result.get('estimated_time', estimated_time)
                
                # Safety check: force last waypoint to destination if AI strayed
                if path_coords:
                    last = path_coords[-1]
                    if math.hypot(last['x'] - dest_x, last['y'] - dest_y) > 12:
                        path_coords.append({"x": dest_x, "y": 35})
                        path_coords.append({"x": dest_x, "y": dest_y})
                        
            except Exception as e:
                print(f"Gemini API routing failed: {e}. Using corridor-aware fallback.")
                path_coords = []
                path_coords.append({"x": current_x, "y": current_y})
                if current_y != 35:
                    path_coords.append({"x": current_x, "y": 35})
                if current_x != dest_x:
                    path_coords.append({"x": dest_x, "y": 35})
                if dest_y != 35:
                    path_coords.append({"x": dest_x, "y": dest_y})
                path_coords[-1] = {"x": dest_x, "y": dest_y}

                ai_instructions = (
                    f"Move to corridor (y=35), then go straight to ({dest_x}, 35), "
                    f"then proceed to final point ({dest_x}, {dest_y})."
                )
                estimated_time = "~1-2 mins"

            
        return jsonify({
            "path": path_coords,
            "instructions": ai_instructions,
            "estimated_time": estimated_time,
            "fire_zones": fire_zones,
            "warning_zones": warning_zones
        }), 200
            
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# Fetch all available locations
@app.route('/api/locations', methods=['GET'])
def get_locations():
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM locations ORDER BY floor_num ASC, room_name ASC")
        locations = cursor.fetchall()
        return jsonify(locations), 200
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# For local development testing
@app.route('/api/simulation/fire', methods=['POST'])
def force_trigger_fire():
    """Admin endpoint to force trigger a fire (add 3 incidents to a room)"""
    data = request.json or {}
    target_qr = data.get('qr_id', 'qr_f1_101')
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    try:
        cursor = conn.cursor()
        for _ in range(3):
            cursor.execute("INSERT INTO incidents (qr_id, disaster_type) VALUES (%s, %s)", (target_qr, 'Fire'))
        conn.commit()
        return jsonify({"message": f"Fire triggered at {target_qr}"}), 200
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()
            
@app.route('/api/simulation/clear', methods=['POST'])
def clear_incidents():
    """Admin endpoint to clear all incidents"""
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM incidents")
        conn.commit()
        return jsonify({"message": "All incidents cleared"}), 200
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ─────────────────────────────────────────────────────────────────────────────
# ADMIN DASHBOARD ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/admin/live-users', methods=['GET'])
def admin_live_users():
    """Return all active user sessions seen in the last 30 seconds."""
    conn = get_db_connection()
    if not conn:
        return jsonify([]), 500
    try:
        cursor = conn.cursor(dictionary=True)
        # Ensure table exists (non-destructive)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS live_users (
                session_id VARCHAR(64) PRIMARY KEY,
                x_coord FLOAT,
                y_coord FLOAT,
                floor_num INT DEFAULT 1,
                status VARCHAR(20) DEFAULT 'active',
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("""
            SELECT session_id, x_coord, y_coord, floor_num, status, last_seen
            FROM live_users
            WHERE last_seen >= NOW() - INTERVAL 30 SECOND
            ORDER BY last_seen DESC
        """)
        users = cursor.fetchall()
        return jsonify(users), 200
    except Error as e:
        return jsonify([]), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/admin/update-position', methods=['POST'])
def admin_update_position():
    data = request.json or {}

    session_id = data.get('session_id') or str(uuid.uuid4())
    x = data.get('x')
    y = data.get('y')
    floor_num = data.get('floor_num', 1)
    status = data.get('status', 'active')

    if x is None or y is None:
        return jsonify({"error": "Missing coordinates"}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "DB error"}), 500

    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO live_users (session_id, x_coord, y_coord, floor_num, status)
            VALUES (%s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                x_coord=%s,
                y_coord=%s,
                floor_num=%s,
                status=%s,
                last_seen=NOW()
        """, (session_id, x, y, floor_num, status, x, y, floor_num, status))

        conn.commit()
        return jsonify({"session_id": session_id}), 200

    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()
            
@app.route('/api/admin/reports', methods=['GET'])
def admin_reports():
    """Return paginated incident reports joined with location info."""
    per_page = int(request.args.get('per_page', 50))
    conn = get_db_connection()
    if not conn:
        return jsonify({"reports": []}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT i.id, i.qr_id, i.disaster_type, i.timestamp,
                   l.room_name, l.floor_num, l.x_coord, l.y_coord
            FROM incidents i
            LEFT JOIN locations l ON i.qr_id = l.qr_id
            ORDER BY i.timestamp DESC
            LIMIT %s
        """, (per_page,))
        reports = cursor.fetchall()
        # Make timestamps JSON-serialisable
        for r in reports:
            if r.get('timestamp'):
                r['timestamp'] = r['timestamp'].strftime('%Y-%m-%d %H:%M:%S')
        return jsonify({"reports": reports, "total": len(reports)}), 200
    except Error as e:
        return jsonify({"reports": [], "error": str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/admin/trigger-fire', methods=['POST'])
def admin_trigger_fire():
    """Insert 3 consensus-level incidents for a specific room (admin one-click)."""
    data = request.json or {}
    qr_id = data.get('qr_id', 'qr_f1_101')
    disaster_type = data.get('disaster_type', 'Fire')
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    try:
        cursor = conn.cursor()
        for _ in range(3):
            cursor.execute(
                "INSERT INTO incidents (qr_id, disaster_type) VALUES (%s, %s)",
                (qr_id, disaster_type)
            )
        conn.commit()
        return jsonify({"message": f"{disaster_type} triggered at {qr_id}"}), 200
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/admin/clear-fire', methods=['POST'])
def admin_clear_fire():
    """Remove all recent incidents for a specific room."""
    data = request.json or {}
    qr_id = data.get('qr_id')
    if not qr_id:
        return jsonify({"error": "Missing qr_id"}), 400
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM incidents WHERE qr_id = %s", (qr_id,))
        conn.commit()
        return jsonify({"message": f"Cleared incidents for {qr_id}"}), 200
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/admin/mark-empty', methods=['POST'])
def admin_mark_empty():
    """Toggle room occupancy status (is_empty flag on locations table)."""
    data = request.json or {}
    qr_id = data.get('qr_id')
    is_empty = data.get('is_empty', True)
    if not qr_id:
        return jsonify({"error": "Missing qr_id"}), 400
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    try:
        cursor = conn.cursor()
        # Ensure column exists (for existing databases that pre-date this schema update)
        try:
            cursor.execute("ALTER TABLE locations ADD COLUMN is_empty TINYINT(1) DEFAULT 0")
            conn.commit()
        except Error:
            pass  # Column already exists
        cursor.execute(
            "UPDATE locations SET is_empty = %s WHERE qr_id = %s",
            (1 if is_empty else 0, qr_id)
        )
        conn.commit()
        return jsonify({"message": f"Room {qr_id} marked {'empty' if is_empty else 'occupied'}"}), 200
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/admin/upload-blueprint', methods=['POST'])
def admin_upload_blueprint():
    """
    Accept a floor plan image, send it to Gemini Vision,
    extract room/exit coordinates, and upsert into locations table.
    """
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['file']
    floor_num = int(request.form.get('floor_num', 1))

    # Read image bytes and encode for Gemini
    img_bytes = file.read()
    img_b64 = base64.b64encode(img_bytes).decode('utf-8')
    mime_type = file.content_type or 'image/png'

    prompt = (
        "You are an emergency building digitization AI.\n"
        "Analyze this floor plan image and extract room/exit locations.\n\n"
        "Return ONLY raw JSON (no markdown) in this exact format:\n"
        '{"rooms": [{"name": "Room 101", "x": 25, "y": 15, "type": "room"}, ...]}\n\n'
        "Rules:\n"
        "- Map coordinates to a 0-100 x 0-100 SVG grid (top-left origin).\n"
        "- 'type' must be one of: room, corridor, exit, emergency_exit, stairs.\n"
        "- Include all exits, stairwells, and named rooms you can identify.\n"
        "- If the image is not a floor plan, return {\"rooms\": []}."
    )

    try:
        vision_model = genai.GenerativeModel('gemini-2.5-flash')
        response = vision_model.generate_content([
            {"mime_type": mime_type, "data": img_b64},
            prompt
        ])
        raw = response.text.strip()
        if "```" in raw:
            parts = raw.split("```")
            raw = parts[1].lstrip("json").strip() if len(parts) > 1 else raw
        extracted = json.loads(raw)
        rooms = extracted.get("rooms", [])
    except Exception as e:
        return jsonify({"error": f"AI extraction failed: {e}"}), 500

    if not rooms:
        return jsonify({"error": "No rooms detected in blueprint"}), 422

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    try:
        cursor = conn.cursor()
        upserted = 0
        for room in rooms:
            name = room.get("name", "Unknown")
            x = room.get("x", 50)
            y = room.get("y", 50)
            rtype = room.get("type", "room")
            # Generate a stable qr_id from floor + name
            safe_name = name.lower().replace(" ", "_").replace("/", "_")
            qr_id = f"qr_f{floor_num}_{safe_name}"
            cursor.execute("""
                INSERT INTO locations (qr_id, x_coord, y_coord, floor_num, room_name, location_type)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    x_coord=%s, y_coord=%s, floor_num=%s, room_name=%s, location_type=%s
            """, (qr_id, x, y, floor_num, name, rtype,
                  x, y, floor_num, name, rtype))
            upserted += 1
        conn.commit()
        return jsonify({
            "message": f"Blueprint processed: {upserted} locations upserted for Floor {floor_num}",
            "nav_graph": {"nodes": upserted, "edges": max(0, upserted - 1)}
        }), 200
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5000)
@app.route("/")
def home():
    return "SafePath Backend Running 🚀"