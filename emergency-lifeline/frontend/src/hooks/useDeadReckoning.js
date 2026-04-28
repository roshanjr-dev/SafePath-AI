import { useState, useEffect, useCallback, useRef } from 'react';

// ─────────────────────────────────────────────────────────────
// WALKABLE ZONE MAP  (matches FloorPlan.jsx viewBox 0 0 100 70)
//
//  Corridor band  : y = 28 → 42   (all x 2–98)
//  Stair A Left   : x = 2  → 16,  y = 2  → 28   (enters corridor at bottom, y=28)
//  Stair B Right  : x = 84 → 98,  y = 42 → 68   (enters corridor at top, y=42)
//  Room top row   : y = 2  → 28,  x = 18→38 / 40→60 / 62→82
//  Room bottom row: y = 42 → 68,  x = 18→38 / 40→60 / 62→82
//
// Stair directions (on the SVG screen):
//   Stair A — user enters from corridor (y≈28) and moves UP (y decreases → ascending)
//   Stair B — user enters from corridor (y≈42) and moves DOWN (y increases → descending to exit)
// ─────────────────────────────────────────────────────────────
const WALKABLE_ZONES = [
  // Corridor
  { id: 'corridor',     x: 2,  y: 28, w: 96, h: 14, isStair: false },
  // Stair A – ascending (corridor → floor above), user goes y=28 → y=2
  { id: 'stair_a', x: 2,  y: 2,  w: 14, h: 26, isStair: true,
    direction: 'up',    entryY: 28, exitY: 2,  entryX: 9 },
  // Stair B – descending (corridor → exit below), user goes y=42 → y=68
  { id: 'stair_b', x: 84, y: 42, w: 14, h: 26, isStair: true,
    direction: 'down',  entryY: 42, exitY: 68, entryX: 91 },
  // Top-row rooms
  { id: 'room_101_201', x: 18, y: 2,  w: 20, h: 26, isStair: false },
  { id: 'room_102_202', x: 40, y: 2,  w: 20, h: 26, isStair: false },
  { id: 'room_103_203', x: 62, y: 2,  w: 20, h: 26, isStair: false },
  // Bottom-row rooms
  { id: 'room_104_204', x: 18, y: 42, w: 20, h: 26, isStair: false },
  { id: 'room_105_205', x: 40, y: 42, w: 20, h: 26, isStair: false },
  { id: 'room_106_206', x: 62, y: 42, w: 20, h: 26, isStair: false },
];

/** Returns the zone the point is in, or null */
const getZoneAt = (x, y) =>
  WALKABLE_ZONES.find(
    z => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h
  ) || null;

/**
 * Wall-aware movement — tries full move, then X-slide, then Y-slide, then stays.
 * Returns { x, y, zone }
 */
const resolveMove = (newX, newY, prevX, prevY) => {
  let zone = getZoneAt(newX, newY);
  if (zone) return { x: newX, y: newY, zone };

  zone = getZoneAt(newX, prevY);
  if (zone) return { x: newX, y: prevY, zone };

  zone = getZoneAt(prevX, newY);
  if (zone) return { x: prevX, y: newY, zone };

  return { x: prevX, y: prevY, zone: getZoneAt(prevX, prevY) };
};

// ─────────────────────────────────────────────────────────────

export const useDeadReckoning = (initialX, initialY) => {
  const [position,       setPosition]       = useState({ x: initialX, y: initialY });
  const [heading,        setHeading]        = useState(0);
  const [isTracking,     setIsTracking]     = useState(false);
  const [error,          setError]          = useState(null);
  const [debugInfo,      setDebugInfo]      = useState({ accel: 0, steps: 0 });
  const [onStairs,       setOnStairs]       = useState(false);
  const [stairDirection, setStairDirection] = useState(null);  // 'up' | 'down'
  // floorDelta fires when user completes a stair traversal: +1 = floor up, -1 = floor down
  const [floorDelta,     setFloorDelta]     = useState(0);

  const headingRef  = useRef(0);
  const prevZoneRef = useRef(null); // track previous zone to detect stair completion

  // ── Step detection ────────────────────────────────────────
  const STEP_THRESHOLD = 1.0;   // m/s²
  const STEP_COOLDOWN  = 380;   // ms
  const STEP_DISTANCE  = 1.2;   // SVG units per step
  const lastStepTimeRef = useRef(0);
  const stepCountRef    = useRef(0);

  // ── Permissions ───────────────────────────────────────────
  const requestPermissions = async () => {
    try {
      if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
        const p = await DeviceOrientationEvent.requestPermission();
        if (p !== 'granted') throw new Error('Orientation permission denied');
      }
      if (typeof DeviceMotionEvent?.requestPermission === 'function') {
        const p = await DeviceMotionEvent.requestPermission();
        if (p !== 'granted') throw new Error('Motion permission denied');
      }
      setIsTracking(true);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to get sensor permissions.');
    }
  };

  // ── Compass ───────────────────────────────────────────────
  const handleOrientation = useCallback((event) => {
    let dir = event.webkitCompassHeading ?? (360 - event.alpha);
    if (dir != null) { setHeading(dir); headingRef.current = dir; }
  }, []);

  // ── Motion / steps ────────────────────────────────────────
  const handleMotion = useCallback((event) => {
    let delta = 0;
    if (event.acceleration && (event.acceleration.x || event.acceleration.y || event.acceleration.z)) {
      const a = event.acceleration;
      delta = Math.sqrt(a.x**2 + a.y**2 + a.z**2);
    } else if (event.accelerationIncludingGravity) {
      const a = event.accelerationIncludingGravity;
      delta = Math.abs(Math.sqrt(a.x**2 + a.y**2 + a.z**2) - 9.8);
    } else return;

    setDebugInfo(prev => ({ ...prev, accel: delta.toFixed(2) }));

    const now = Date.now();
    if (delta > STEP_THRESHOLD && now - lastStepTimeRef.current > STEP_COOLDOWN) {
      lastStepTimeRef.current = now;
      stepCountRef.current += 1;
      setDebugInfo(prev => ({ ...prev, steps: stepCountRef.current }));

      setPosition(prev => {
        const currentZone = getZoneAt(prev.x, prev.y);

        let dx, dy;

        if (currentZone?.isStair) {
          // ── Stair movement: ALWAYS vertical, direction from zone definition ──
          // Stair A (direction:'up')   → y decreases (dot moves up toward top of screen)
          // Stair B (direction:'down') → y increases (dot moves down toward exit)
          dx = 0;
          dy = currentZone.direction === 'down'
            ?  Math.abs(STEP_DISTANCE)   // descend (y++)
            : -Math.abs(STEP_DISTANCE);  // ascend  (y--)
        } else {
          // ── Normal compass-driven movement ──────────────────────────────────
          const rad = headingRef.current * (Math.PI / 180);
          dx =  Math.sin(rad) * STEP_DISTANCE;
          dy = -Math.cos(rad) * STEP_DISTANCE;
        }

        const rawX = Math.max(2, Math.min(98, prev.x + dx));
        const rawY = Math.max(2, Math.min(68, prev.y + dy));

        const { x, y, zone: newZone } = resolveMove(rawX, rawY, prev.x, prev.y);

        // ── Detect stair completion ──────────────────────────────────────────
        // When user was in a stair zone and now exits into a different zone
        // (back to corridor counts too — but floor change only fires when they
        // reach the far end of the stairwell, not when retreating).
        const prev_zone = prevZoneRef.current;
        if (prev_zone?.isStair && !newZone?.isStair) {
          // Stair A: if user left from the TOP (small y) they went up a floor
          // Stair B: if user left from the BOTTOM (large y) they went down a floor
          // We check which end they exited from based on y position
          if (prev_zone.direction === 'up' && prev.y <= prev_zone.y + 4) {
            setFloorDelta(f => f + 1); // floor increased
          } else if (prev_zone.direction === 'down' && prev.y >= prev_zone.y + prev_zone.h - 4) {
            setFloorDelta(f => f - 1); // floor decreased
          }
        }
        prevZoneRef.current = newZone;

        return { x, y };
      });
    }
  }, []);

  // ── Sync stair UI state ───────────────────────────────────
  useEffect(() => {
    const zone = getZoneAt(position.x, position.y);
    setOnStairs(!!zone?.isStair);
    setStairDirection(zone?.direction ?? null);
  }, [position]);

  // ── Sensor event attachment ───────────────────────────────
  useEffect(() => {
    if (isTracking) {
      window.addEventListener('deviceorientation', handleOrientation);
      window.addEventListener('devicemotion',      handleMotion);
    } else {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('devicemotion',      handleMotion);
    }
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('devicemotion',      handleMotion);
    };
  }, [isTracking, handleOrientation, handleMotion]);

  return { position, heading, isTracking, error, debugInfo, onStairs, stairDirection, floorDelta, requestPermissions };
};
