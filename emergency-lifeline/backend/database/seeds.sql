USE emergency_lifeline;

-- Clear existing data
DELETE FROM incidents;
DELETE FROM locations;

-- ============================================================
-- Coordinate system: SVG viewBox 0 0 100 70
-- Corridor band: y=28 to y=42, centerline y=35
-- Top rooms: y=2 to y=28  (height=26)
-- Bottom rooms: y=42 to y=68 (height=26)
-- Stairs Left:  x=2  to x=16
-- Rooms top/bot: x=18..38, 40..60, 62..82
-- Stairs Right: x=84 to x=98
--
-- QR spawn point = corridor centerline (y=35) at door's x-center
-- Door X values: Room *01/*04 -> x=25, *02/*05 -> x=47, *03/*06 -> x=69
-- Stair QR: y=15 (mid of top stair block) or y=55 (mid of bottom stair block)
-- Exit QR:  bottom-right corner area
-- ============================================================

INSERT INTO locations (qr_id, x_coord, y_coord, floor_num, room_name, location_type) VALUES

-- ── Floor 1 ──────────────────────────────────────────────────
-- Stairs QR at corridor edge (used for stair detection)
('qr_f1_stairs_left',  16.0, 35.0, 1, 'Stairs A (Left)',  'stairs'),
-- Top row rooms — QR placed at ROOM CENTER (y=15 = midpoint of y=2..28)
('qr_f1_101',          28.0, 15.0, 1, 'Room 101', 'room'),
('qr_f1_102',          50.0, 15.0, 1, 'Room 102', 'room'),
('qr_f1_103',          72.0, 15.0, 1, 'Room 103', 'room'),
-- Bottom row rooms — QR placed at ROOM CENTER (y=55 = midpoint of y=42..68)
('qr_f1_104',          28.0, 55.0, 1, 'Room 104', 'room'),
('qr_f1_105',          50.0, 55.0, 1, 'Room 105', 'room'),
('qr_f1_106',          72.0, 55.0, 1, 'Room 106', 'room'),
-- Right stairwell entry
('qr_f1_stairs_right', 84.0, 35.0, 1, 'Stairs B (Right)', 'stairs'),
-- Main Exit (bottom right)
('qr_f1_exit',         91.0, 66.0, 1, 'Main Exit',        'exit'),

-- ── Floor 2 ──────────────────────────────────────────────────
('qr_f2_stairs_left',  16.0, 35.0, 2, 'Stairs A (Left)',  'stairs'),
-- Top row rooms at room centers
('qr_f2_201',          28.0, 15.0, 2, 'Room 201', 'room'),
('qr_f2_202',          50.0, 15.0, 2, 'Room 202', 'room'),
('qr_f2_203',          72.0, 15.0, 2, 'Room 203', 'room'),
-- Bottom row rooms at room centers
('qr_f2_204',          28.0, 55.0, 2, 'Room 204', 'room'),
('qr_f2_205',          50.0, 55.0, 2, 'Room 205', 'room'),
('qr_f2_206',          72.0, 55.0, 2, 'Room 206', 'room'),
('qr_f2_stairs_right', 84.0, 35.0, 2, 'Stairs B (Right)', 'stairs');

