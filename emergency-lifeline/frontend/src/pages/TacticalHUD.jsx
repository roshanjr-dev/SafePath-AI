import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AlertTriangle, Navigation, Compass, Layers, X, MapPin, Activity, Clock, CheckCircle2, Flame } from 'lucide-react';
import { useDeadReckoning } from '../hooks/useDeadReckoning';
import FloorPlan from '../components/FloorPlan';

const TacticalHUD = () => {
  const navigate = useNavigate();
  // Synchronously load location so we can pass it to the hook
  const initialLocStr = localStorage.getItem('user_location');
  const initialLoc = initialLocStr ? JSON.parse(initialLocStr) : null;

  const [userLocation, setUserLocation] = useState(initialLoc);
  const [currentFloor, setCurrentFloor] = useState(initialLoc ? initialLoc.floor_num || 1 : 1);
  const [safePath, setSafePath] = useState([]);
  const [loadingPath, setLoadingPath] = useState(false);
  const [sosStatus, setSosStatus] = useState('idle');

  const [allLocations, setAllLocations] = useState([]);
  const [showSosModal, setShowSosModal] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState('');

  const [fireZones, setFireZones] = useState([]);
  const [warningZones, setWarningZones] = useState([]);

  const disasterTypes = ['Fire', 'Earthquake', 'Active Shooter', 'Medical Emergency'];
  const [selectedDisasterType, setSelectedDisasterType] = useState('Fire');

  const [aiInstructions, setAiInstructions] = useState('');
  const [aiEstimatedTime, setAiEstimatedTime] = useState('');
  const [floorChangeToast, setFloorChangeToast] = useState(null);
  // Tracks live countdown labels for spreading fire zones e.g. { 'Room 104': 47 }
  const [spreadCountdowns, setSpreadCountdowns] = useState({});

  // Refs to clear spread timers when component unmounts or hazards update
  const spreadTimersRef = useRef([]);
  // Track which rooms already have scheduled spread (prevents cascade)
  const scheduledSpreadRef = useRef(new Set());
  // Keep a ref to current fireZones for cascade check inside timer callbacks
  const fireZonesRef = useRef([]);
  // Waypoint progress tracker — must be here (before any conditional return)
  const waypointIdxRef = useRef(0);
  // Rerouting refs for Google Maps-style off-track detection
  const offTrackCountRef = useRef(0);
  const rerouteTimeoutRef = useRef(null);
  // Store warning zone objects so timer closures can access latest data
  const warningZoneMapRef = useRef({});
  // Pending floor: user tapped the stair popup but must physically reach the stair first
  const [pendingFloor, setPendingFloor] = useState(null);
  // Corridor checkpoint: confirmed when user reaches corridor from inside a room
  const [corridorConfirmed, setCorridorConfirmed] = useState(false);

  // Reset corridor checkpoint each time a new QR is scanned (userLocation changes)
  useEffect(() => {
    setCorridorConfirmed(false);
  }, [userLocation?.qr_id]);

  // Initialize Dead Reckoning
  const { position, heading, isTracking, error: sensorError, debugInfo, onStairs, stairDirection, floorDelta, requestPermissions } = useDeadReckoning(
    initialLoc ? initialLoc.x : 0,
    initialLoc ? initialLoc.y : 0
  );
  // ✅ ADD THIS BLOCK HERE
  useEffect(() => {
    // create session id once
    if (!localStorage.getItem("session_id")) {
      localStorage.setItem("session_id", crypto.randomUUID());
    }
  }, []);
  useEffect(() => {
    if (!isTracking) return;

    const interval = setInterval(() => {
      const session_id = localStorage.getItem("session_id");
      if (!session_id) return;

      axios.post('/api/admin/update-position', {
        session_id,
        x: position.x,
        y: position.y,
        floor_num: currentFloor,
        status: sosStatus === 'sent' ? 'sos' : 'active'
      }).catch(err => {
        console.error("Position update failed:", err);
      });

    }, 1000);

    return () => clearInterval(interval);

  }, [isTracking, currentFloor, sosStatus]); // ❗ REMOVE position
  // Sync fireZones into ref so timer callbacks can read latest value
  useEffect(() => { fireZonesRef.current = fireZones; }, [fireZones]);

  // Sync warningZones into map-ref so timer closures get fresh zone objects
  useEffect(() => {
    const map = {};
    warningZones.forEach(z => { map[z.room_name] = z; });
    warningZoneMapRef.current = map;
  }, [warningZones]);

  // Reset progress tracking when a new path loads
  useEffect(() => { waypointIdxRef.current = 0; offTrackCountRef.current = 0; }, [safePath]);

  // ── Google Maps-style rerouting: only if VERY off-track for a sustained time ──
  const lastRerouteRef = useRef(0); // timestamp of last reroute (ms)
  useEffect(() => {
    if (safePath.length === 0 || fireZones.length === 0) {
      offTrackCountRef.current = 0;
      return;
    }
    // Find minimum distance from user to ANY waypoint on the path
    let minDist = Infinity;
    for (let i = 0; i < safePath.length; i++) {
      minDist = Math.min(minDist, Math.hypot(position.x - safePath[i].x, position.y - safePath[i].y));
    }
    // Threshold raised to 20 units to tolerate dead-reckoning drift
    if (minDist > 20) {
      offTrackCountRef.current += 1;
      // Require 8 consecutive off-track steps AND 45s cooldown between reroutes
      if (offTrackCountRef.current >= 8) {
        const now = Date.now();
        if (now - lastRerouteRef.current > 45000) {
          offTrackCountRef.current = 0;
          lastRerouteRef.current = now;
          clearTimeout(rerouteTimeoutRef.current);
          rerouteTimeoutRef.current = setTimeout(() => {
            fetchSafePath({ x: position.x, y: position.y, floor_num: currentFloor || 1 });
          }, 800);
        }
      }
    } else {
      offTrackCountRef.current = 0; // back on track — reset counter
    }
  }, [position]);

  // Auto floor-change when user completes stair traversal
  useEffect(() => {
    if (floorDelta === 0) return;
    setCurrentFloor(prev => {
      const next = Math.max(1, Math.min(5, prev + (floorDelta > 0 ? 1 : -1)));
      setFloorChangeToast(floorDelta > 0 ? 'up' : 'down');
      setTimeout(() => setFloorChangeToast(null), 2500);
      return next;
    });
  }, [floorDelta]);

  // Apply pending floor switch the moment user steps onto the stairwell
  useEffect(() => {
    if (onStairs && pendingFloor !== null) {
      const targetFloor = pendingFloor;

      // 1. Switch map view to new floor
      setCurrentFloor(targetFloor);

      // 2. Update user's effective floor so the blue dot + path show on the new floor
      //    (userFloor drives showPath and dot visibility)
      setUserLocation(prev => ({ ...prev, floor_num: targetFloor }));

      // 3. Toast notification
      setFloorChangeToast(targetFloor > currentFloor ? 'up' : 'down');
      setTimeout(() => setFloorChangeToast(null), 2500);

      // 4. Re-fetch path from current position on new floor
      //    (AI will now route: stair exit → corridor → building exit)
      setTimeout(() => {
        fetchSafePath({ x: position.x, y: position.y, floor_num: targetFloor });
      }, 600);

      setPendingFloor(null);
    }
  }, [onStairs]);

  // ── Auto fire-spread based on warning zone time estimates ─────────────────
  useEffect(() => {
    // Clear previous timers AND reset scheduled set — so rooms can be re-scheduled
    spreadTimersRef.current.forEach(t => { clearTimeout(t.timer); clearInterval(t.interval); });
    spreadTimersRef.current = [];
    scheduledSpreadRef.current.clear(); // ← CRITICAL: reset so re-fetch can reschedule
    setSpreadCountdowns({});

    if (warningZones.length === 0) return;

    warningZones.forEach(zone => {
      // Skip if already a CONFIRMED fire zone (prevent cascade at schedule time)
      if (fireZonesRef.current.some(fz => fz.room_name === zone.room_name)) return;
      // Skip if already scheduled in THIS batch
      if (scheduledSpreadRef.current.has(zone.room_name)) return;
      scheduledSpreadRef.current.add(zone.room_name);

      // Parse spread_time: '1m' → 60000ms, '3m' → 180000ms
      const match = zone.spread_time?.match(/(\d+)m/);
      if (!match) return;
      const totalSecs = parseInt(match[1]) * 60;
      const totalMs = totalSecs * 1000;

      // ── Live countdown ticker (percentage relative to THIS zone's totalSecs) ──
      let remaining = totalSecs;
      setSpreadCountdowns(prev => ({ ...prev, [zone.room_name]: { secs: remaining, total: totalSecs } }));

      const tickInterval = setInterval(() => {
        remaining -= 1;
        setSpreadCountdowns(prev => ({
          ...prev,
          [zone.room_name]: { secs: Math.max(0, remaining), total: totalSecs }
        }));
        if (remaining <= 0) clearInterval(tickInterval);
      }, 1000);

      // ── Fire spread trigger ────────────────────────────────────────────
      const spreadTimer = setTimeout(async () => {
        clearInterval(tickInterval);
        setSpreadCountdowns(prev => {
          const n = { ...prev };
          delete n[zone.room_name];
          return n;
        });
        try {
          // ── Cascade guard: skip if room is ALREADY a confirmed fire zone ──
          const alreadyFire = fireZonesRef.current.some(
            fz => fz.room_name === zone.room_name
          );
          if (alreadyFire) return;

          // ── Immediately turn room red in UI (don't wait for backend round-trip) ──
          const zoneData = warningZoneMapRef.current[zone.room_name] || zone;
          setFireZones(prev => [
            ...prev,
            {
              room_name: zoneData.room_name,
              floor_num: zoneData.floor_num,
              x_coord: zoneData.x_coord,
              y_coord: zoneData.y_coord,
              disaster_type: 'Fire',
              report_count: 3,
            }
          ]);

          // Find the qr_id for this room
          const locRes = await axios.get('/api/locations');
          const matchLoc = locRes.data.find(l => l.room_name === zone.room_name);
          if (matchLoc) {
            // Insert 3 reports to trigger consensus (fire spread simulation)
            await Promise.all([
              axios.post('/api/report-sos', { qr_id: matchLoc.qr_id, disaster_type: 'Fire' }),
              axios.post('/api/report-sos', { qr_id: matchLoc.qr_id, disaster_type: 'Fire' }),
              axios.post('/api/report-sos', { qr_id: matchLoc.qr_id, disaster_type: 'Fire' }),
            ]);
            // Re-fetch to refresh full state (path, new warning zones, etc.)
            fetchSafePath(userLocation || initialLoc);
          }
        } catch (e) {
          console.error('Auto spread failed:', e);
        }
      }, totalMs);

      spreadTimersRef.current.push({ timer: spreadTimer, interval: tickInterval });
    });

    // Cleanup on unmount or when warningZones change
    return () => {
      spreadTimersRef.current.forEach(t => {
        clearTimeout(t.timer);
        clearInterval(t.interval);
      });
    };
  }, [warningZones]);

  useEffect(() => {
    if (!initialLoc) {
      navigate('/');
      return;
    }
    fetchSafePath(initialLoc);
    fetchLocations();
  }, [navigate]);

  const fetchLocations = async () => {
    try {
      const res = await axios.get('/api/locations');
      setAllLocations(res.data);
    } catch (err) {
      console.error("Failed to fetch locations", err);
    }
  };

  const fetchSafePath = async (loc) => {
    setLoadingPath(true);
    try {
      const res = await axios.post('/api/get-safe-path', {
        x: loc.x,
        y: loc.y,
        floor_num: loc.floor_num || currentFloor || 1,
      });
      if (res.data && res.data.path) {
        setSafePath(res.data.path);
        setAiInstructions(res.data.instructions || '');
        setAiEstimatedTime(res.data.estimated_time || '');
      }
      if (res.data) {
        setFireZones(res.data.fire_zones || []);
        setWarningZones(res.data.warning_zones || []);
      }
    } catch (err) {
      console.error("Failed to fetch path", err);
    } finally {
      setLoadingPath(false);
    }
  };

  const openSosModal = () => {
    if (sosStatus === 'sending') return;
    // Pre-select the user's current location if possible
    setSelectedLocationId(userLocation?.qr_id || '');
    setShowSosModal(true);
  };

  const submitSOS = async () => {
    if (!selectedLocationId || sosStatus === 'sending') return;

    setShowSosModal(false);
    setSosStatus('sending');
    try {
      await axios.post('/api/report-sos', {
        qr_id: selectedLocationId,
        disaster_type: selectedDisasterType
      });
      setSosStatus('sent');
      // Re-fetch path in case the fire zone just got triggered by consensus
      fetchSafePath(userLocation);

      setTimeout(() => setSosStatus('idle'), 5000); // Reset after 5s
    } catch (err) {
      console.error("SOS Failed", err);
      setSosStatus('idle');
      alert("Failed to send SOS. Please try again.");
    }
  };

  if (!userLocation) return null;

  // ── Google Maps path: nearest-SEGMENT projection (never jumps backward) ────
  const userFloor = userLocation?.floor_num || 1;
  const showPath = fireZones.length > 0 && currentFloor === userFloor;

  // For each segment A→B: project user position onto segment, find closest segment.
  // Show path from that segment's endpoint (B) onward — correct "current progress".
  let bestSegIdx = 0;
  if (safePath.length > 1) {
    let bestDist = Infinity;
    for (let i = 0; i < safePath.length - 1; i++) {
      const a = safePath[i], b = safePath[i + 1];
      const abx = b.x - a.x, aby = b.y - a.y;
      const lenSq = abx * abx + aby * aby;
      // t = projection parameter [0,1] along segment
      const t = lenSq > 0
        ? Math.max(0, Math.min(1, ((position.x - a.x) * abx + (position.y - a.y) * aby) / lenSq))
        : 0;
      const closestX = a.x + t * abx, closestY = a.y + t * aby;
      const dist = Math.hypot(position.x - closestX, position.y - closestY);
      if (dist < bestDist) { bestDist = dist; bestSegIdx = i; }
    }
  }
  // Remaining = endpoint of current segment onward (user dot prepended)
  const aheadWaypoints = safePath.slice(bestSegIdx + 1);
  const remainingPath = (showPath && safePath.length > 0)
    ? [{ x: position.x, y: position.y }, ...aheadWaypoints]
    : [];
  const remainingPolyline = remainingPath.map(p => `${p.x},${p.y}`).join(' ');
  const fullPolyline = showPath ? safePath.map(p => `${p.x},${p.y}`).join(' ') : '';


  // ── Stair proximity detection for AI-guided popup ────────────────────────
  // Stair A entrance (top-left): corridor entry at x=9,y=28
  // Stair B entrance (bottom-right): corridor entry at x=91,y=42
  const NEAR_THRESH = 13;
  const nearStairA = Math.hypot(position.x - 9, position.y - 28) < NEAR_THRESH;
  const nearStairB = Math.hypot(position.x - 91, position.y - 42) < NEAR_THRESH;
  const nearAnyStair = (nearStairA || nearStairB) && isTracking;
  // Determine AI-recommended floor direction
  // If safe path goes through Stair B (x>80) suggest going DOWN; Stair A (x<20) suggest UP
  const pathUsesStairB = safePath.some(p => p.x > 80 && p.y > 40);
  const pathUsesStairA = safePath.some(p => p.x < 20 && p.y < 30);
  const stairPopupDir = 'down';
  const stairPopupTargetFloor = Math.max(1, currentFloor - 1);

  return (
    <div className="min-h-screen bg-black text-slate-100 flex flex-col pt-6 pb-4 px-2 font-sans">
      {/* Header */}
      <header className="flex items-center justify-center py-2 mb-2">
        <h1 className="font-bold text-lg tracking-wide text-white uppercase">
          GUEST / EVACUEE - FLOOR {currentFloor}
        </h1>
      </header>

      {/* Navigation Instructions Panel */}
      <div className="bg-[#1a232c] border-y border-cyan-900/50 py-3 px-4 mb-2 text-center">
        <p className="text-[#38bdf8] text-xs font-bold uppercase tracking-wider mb-1">Navigation Instructions:</p>
        <p className="text-white font-bold text-sm tracking-wide">
          {aiInstructions ? aiInstructions.toUpperCase() : "AWAITING INSTRUCTIONS..."}
        </p>
      </div>

      {/* 🔥 Fire Spread Countdown Panel */}
      {Object.keys(spreadCountdowns).length > 0 && (
        <div className="mx-2 mb-2 bg-red-950/80 border border-red-700/50 rounded-xl px-3 py-2 space-y-1.5">
          <p className="text-red-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
            <span className="animate-pulse">🔥</span> Fire Spreading — Time to Reach Room
          </p>
          {Object.entries(spreadCountdowns).map(([roomName, entry]) => {
            const secsLeft = typeof entry === 'object' ? entry.secs : entry;
            const totalSecs = typeof entry === 'object' ? entry.total : 180;
            const pct = Math.max(0, (secsLeft / totalSecs) * 100);
            const isUrgent = secsLeft <= 30;
            const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0');
            const ss = String(secsLeft % 60).padStart(2, '0');
            return (
              <div key={roomName}>
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span className={`font-bold ${isUrgent ? 'text-red-300 animate-pulse' : 'text-orange-300'}`}>
                    {roomName}
                  </span>
                  <span className={`font-mono font-bold ${isUrgent ? 'text-red-300' : 'text-orange-400'}`}>
                    {mm}:{ss}
                  </span>
                </div>
                <div className="w-full bg-red-900/40 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${isUrgent ? 'bg-red-500 animate-pulse' : 'bg-orange-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 🚶 Corridor checkpoint banner — re-anchors position when user exits room into corridor */}
      {isTracking && !corridorConfirmed && fireZones.length > 0
        && Math.abs(position.y - 35) < 10 && !onStairs
        && !nearAnyStair && (
          <div className="mx-2 mb-2">
            <div className="bg-slate-800/90 border border-yellow-500/60 rounded-xl px-3 py-2 flex items-center gap-3">
              <span className="text-xl flex-shrink-0">🚶</span>
              <div className="flex-1 min-w-0">
                <p className="text-yellow-300 text-[10px] font-black uppercase tracking-widest">Corridor Checkpoint</p>
                <p className="text-slate-300 text-[10px] truncate">Have you reached the corridor?</p>
              </div>
              <button
                onClick={() => {
                  setCorridorConfirmed(true);
                  // Re-anchor path from corridor entry — corrects dead-reckoning drift
                  fetchSafePath({ x: position.x, y: 35, floor_num: currentFloor || 1 });
                }}
                className="flex-shrink-0 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white font-black rounded-lg text-[10px] tracking-wide transition-all"
              >
                Yes!
              </button>
            </div>
          </div>
        )}

      {/* 🪜 Stair proximity banner — compact, in page flow (NEVER blocks the map) */}
      {nearAnyStair && !onStairs && (
        <div className="mx-2 mb-2">
          <div className={`border rounded-xl px-3 py-2 flex items-center gap-3 transition-all ${pendingFloor
            ? 'bg-emerald-950/90 border-emerald-500/60'
            : 'bg-slate-800/90 border-cyan-600/60'
            }`}>
            <span className="text-xl flex-shrink-0">{pendingFloor ? '✅' : '🪜'}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-[10px] font-black uppercase tracking-widest ${pendingFloor ? 'text-emerald-300' : 'text-cyan-300'
                }`}>
                {pendingFloor ? `Ready — step onto stairwell → auto-switch to floor ${pendingFloor}` : 'Stairwell Nearby'}
              </p>
              {!pendingFloor && (
                <p className="text-slate-300 text-[10px] truncate">
                  {stairPopupDir === 'down'
                    ? `Go DOWN → Floor ${stairPopupTargetFloor} for exit`
                    : `Go UP → Floor ${stairPopupTargetFloor}`
                  }
                </p>
              )}
            </div>
            {!pendingFloor ? (
              <button
                onClick={() => setPendingFloor(stairPopupTargetFloor)}
                className="flex-shrink-0 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-black rounded-lg text-[10px] tracking-wide transition-all"
              >
                Confirm
              </button>
            ) : (
              <button
                onClick={() => setPendingFloor(null)}
                className="flex-shrink-0 px-3 py-1.5 bg-slate-600 text-slate-300 font-bold rounded-lg text-[10px] transition-all"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floor Selector */}
      <div className="flex items-center gap-2 mb-4 px-2">
        {[5, 4, 3, 2, 1].map(f => (
          <button
            key={f}
            onClick={() => setCurrentFloor(f)}
            className={`flex-1 py-2 rounded-md text-xs font-bold transition-all border border-slate-700 ${currentFloor === f
              ? 'bg-[#38bdf8] text-black shadow-md border-transparent'
              : 'bg-[#2a3441] text-slate-300 hover:bg-slate-700'
              }`}
          >
            F{f}
          </button>
        ))}
      </div>

      {/* Map Area */}
      <div className="relative flex-1 bg-slate-800 rounded-2xl shadow-xl overflow-hidden mb-6 border border-slate-700">
        <div className="absolute inset-0 p-2">
          <FloorPlan floorNum={currentFloor} activeHazards={fireZones} warningZones={warningZones}>
            {/* Path — only on the floor the user is currently on */}
            {showPath && safePath.length > 0 && (
              <polyline
                points={fullPolyline}
                fill="none"
                stroke="#0ea5e9"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.2"
              />
            )}
            {showPath && remainingPath.length > 1 && (
              <polyline
                points={remainingPolyline}
                fill="none"
                stroke="#0ea5e9"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="2 3"
                className="animate-[dash_1s_linear_infinite]"
                style={{ filter: "drop-shadow(0px 0px 4px rgba(14,165,233,1))" }}
              />
            )}

            {/* Draw User Dot and Direction Arrow using Sensor Data - only if on same floor */}
            {(!userLocation.floor_num || userLocation.floor_num === currentFloor) && (
              <g transform={`translate(${position.x}, ${position.y}) rotate(${heading})`}>
                {/* Outer ping ring */}
                <circle r="3" fill="none" stroke="#3b82f6" strokeWidth="0.4" className="animate-ping opacity-40" />
                {/* Main dot - smaller */}
                <circle r="1.5" fill={onStairs ? '#a78bfa' : '#3b82f6'} style={{ filter: 'drop-shadow(0 0 2px rgba(59,130,246,0.9))' }} />
                {/* Direction arrow - proportionally shrunk */}
                <polygon points="-0.5,-0.5 0.5,-0.5 0,-2" fill={onStairs ? '#c4b5fd' : '#93c5fd'} />
              </g>
            )}
          </FloorPlan>
        </div>

        {/* Removed AI Panel from bottom since it is now at the top */}

        {/* Map Overlays */}
        {isTracking && (
          <div className="absolute top-2 right-2 bg-slate-900/80 backdrop-blur text-slate-300 text-[9px] px-2 py-1 rounded-md border border-slate-700 flex flex-col items-end gap-0.5">
            <div>Accel: {debugInfo.accel}</div>
            <div>Steps: {debugInfo.steps}</div>
          </div>
        )}

        {/* Stair descent / ascent overlay (while ON stairs) */}
        {onStairs && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end pb-3 pointer-events-none">
            <div className="bg-violet-950/90 backdrop-blur border border-violet-500/50 rounded-xl px-4 py-2 flex items-center gap-3 shadow-lg shadow-violet-900/40">
              <div className="flex flex-col items-center gap-0.5">
                {stairDirection === 'down' ? (
                  <>
                    <span className="text-violet-300 text-lg leading-none animate-bounce">↓</span>
                    <span className="text-violet-300 text-lg leading-none animate-bounce" style={{ animationDelay: '150ms' }}>↓</span>
                  </>
                ) : (
                  <>
                    <span className="text-violet-300 text-lg leading-none animate-bounce">↑</span>
                    <span className="text-violet-300 text-lg leading-none animate-bounce" style={{ animationDelay: '150ms' }}>↑</span>
                  </>
                )}
              </div>
              <div>
                <p className="text-violet-100 text-xs font-bold uppercase tracking-wider">
                  {stairDirection === 'down' ? 'Descending Stairwell' : 'Ascending Stairwell'}
                </p>
                <p className="text-violet-400 text-[10px]">Keep moving — floor change ahead</p>
              </div>
            </div>
          </div>
        )}


        {/* Floor change toast — fires when stair traversal is complete */}
        {floorChangeToast && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <div className="bg-slate-900/95 border-2 border-cyan-400 rounded-2xl px-8 py-5 flex flex-col items-center gap-2 shadow-2xl shadow-cyan-400/30 animate-[pulse_0.5s_ease-in-out]">
              <span className="text-4xl">{floorChangeToast === 'up' ? '⬆️' : '⬇️'}</span>
              <p className="text-cyan-300 text-lg font-black tracking-wider">FLOOR {currentFloor}</p>
              <p className="text-slate-400 text-xs uppercase tracking-widest">Floor Changed</p>
            </div>
          </div>
        )}


        {!isTracking && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-10">
            <Compass className="w-12 h-12 text-cyan-400 mb-4 animate-bounce" />
            <h3 className="text-xl font-bold text-white mb-2">Enable Live Tracking</h3>
            <p className="text-slate-300 text-sm mb-6">Allow access to your phone's compass and motion sensors to track your steps and direction.</p>
            <button
              onClick={requestPermissions}
              className="py-3 px-6 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-500/30 transition-all"
            >
              Enable Navigation Sensors
            </button>
            {sensorError && <p className="text-red-400 text-sm mt-4 text-center">{sensorError}</p>}
          </div>
        )}
        {loadingPath && (
          <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur text-cyan-400 text-xs px-3 py-1.5 rounded-full border border-cyan-900 flex items-center gap-2">
            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></div>
            AI Calculating Route...
          </div>
        )}
      </div>

      {/* Action Area */}
      <div className="pb-4 px-2 flex gap-3 mt-2">
        <button
          onClick={() => {
            alert('You are marked safe. Evacuation instructions will pause.');
            navigate('/');
          }}
          className="flex-1 py-4 bg-[#5be26e] hover:bg-[#4dd25f] text-slate-900 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 border-b-4 border-[#3ca94c]"
        >
          <CheckCircle2 className="w-6 h-6" strokeWidth={3} />
          <span className="text-lg font-black tracking-wide uppercase">I AM SAFE</span>
        </button>

        <button
          onClick={openSosModal}
          disabled={sosStatus === 'sending'}
          className={`flex-1 py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 border-b-4
            ${sosStatus === 'idle'
              ? 'bg-[#f88180] hover:bg-[#e76d6c] text-[#7f1d1d] border-[#c95150]'
              : 'bg-red-900 text-red-300 border-red-950 opacity-80'
            }
          `}
        >
          <Flame className={`w-6 h-6 ${sosStatus === 'idle' ? 'animate-pulse' : ''}`} strokeWidth={3} />
          <div className="flex flex-col items-center leading-tight">
            <span className="text-lg font-black tracking-wide uppercase">
              {sosStatus === 'idle' ? 'REPORT' : sosStatus === 'sending' ? 'SENDING...' : 'SENT'}
            </span>
            {sosStatus === 'idle' && <span className="text-sm font-black tracking-wide uppercase">FIRE/SMOKE</span>}
          </div>
        </button>
      </div>

      {/* SOS Modal */}
      {showSosModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl shadow-2xl shadow-red-900/20 w-full max-w-sm overflow-hidden flex flex-col">
            <div className="bg-red-500/10 p-4 border-b border-red-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-500 font-bold">
                <AlertTriangle className="w-5 h-5" />
                <span>REPORT EMERGENCY</span>
              </div>
              <button onClick={() => setShowSosModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              <p className="text-slate-300 text-sm">Please pinpoint the exact location of the hazard to improve consensus accuracy.</p>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Location of Hazard
                </label>
                <select
                  value={selectedLocationId}
                  onChange={(e) => setSelectedLocationId(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg py-3 px-4 focus:ring-2 focus:ring-red-500 focus:outline-none appearance-none"
                >
                  <option value="" disabled>Select location...</option>
                  {allLocations.map((loc) => (
                    <option key={loc.qr_id} value={loc.qr_id}>
                      Floor {loc.floor_num} - {loc.room_name} ({loc.location_type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Activity className="w-3 h-3" /> Type of Emergency
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {disasterTypes.map(type => (
                    <button
                      key={type}
                      onClick={() => setSelectedDisasterType(type)}
                      className={`py-2 px-1 rounded-lg text-xs font-bold border transition-all ${selectedDisasterType === type
                        ? 'bg-red-900/50 border-red-500 text-red-100 shadow-[inset_0_0_10px_rgba(239,68,68,0.2)]'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                        }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={submitSOS}
                disabled={!selectedLocationId}
                className="mt-4 w-full py-4 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold tracking-widest rounded-xl transition-colors shadow-lg shadow-red-600/30"
              >
                CONFIRM SOS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TacticalHUD;
