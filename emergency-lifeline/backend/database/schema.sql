CREATE DATABASE IF NOT EXISTS emergency_lifeline;
USE emergency_lifeline;

-- Map QR codes to physical SVG coordinates
CREATE TABLE IF NOT EXISTS locations (
    qr_id VARCHAR(50) PRIMARY KEY,
    x_coord FLOAT,          -- Percentage of SVG width (0-100)
    y_coord FLOAT,          -- Percentage of SVG height (0-100)
    floor_num INT,
    room_name VARCHAR(100),
    location_type VARCHAR(30) DEFAULT 'room',  -- 'room', 'corridor', 'exit', 'emergency_exit', 'stairs'
    is_empty TINYINT(1) DEFAULT 0              -- Admin-marked occupancy flag
);

-- Store every SOS report for Consensus Logic
CREATE TABLE IF NOT EXISTS incidents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    qr_id VARCHAR(50),
    disaster_type VARCHAR(50) DEFAULT 'Fire',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (qr_id) REFERENCES locations(qr_id)
);

-- Track live user sessions for God-View dashboard
CREATE TABLE IF NOT EXISTS live_users (
    session_id VARCHAR(64) PRIMARY KEY,
    x_coord FLOAT,
    y_coord FLOAT,
    floor_num INT DEFAULT 1,
    status VARCHAR(20) DEFAULT 'active',  -- 'active', 'sos', 'evacuated'
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
