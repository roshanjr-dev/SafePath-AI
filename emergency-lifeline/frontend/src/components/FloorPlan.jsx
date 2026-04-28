import React from 'react';

// Door X positions and corridor side for each room (matches renderRoom calls)
// doorCorridorY: top rooms open at y=28 (top wall of corridor), bottom at y=42
const ROOM_DOOR_MAP = {
  'Room 101': { doorX: 25, corridorY: 28 }, 'Room 201': { doorX: 25, corridorY: 28 },
  'Room 102': { doorX: 47, corridorY: 28 }, 'Room 202': { doorX: 47, corridorY: 28 },
  'Room 103': { doorX: 69, corridorY: 28 }, 'Room 203': { doorX: 69, corridorY: 28 },
  'Room 104': { doorX: 25, corridorY: 42 }, 'Room 204': { doorX: 25, corridorY: 42 },
  'Room 105': { doorX: 47, corridorY: 42 }, 'Room 205': { doorX: 47, corridorY: 42 },
  'Room 106': { doorX: 69, corridorY: 42 }, 'Room 206': { doorX: 69, corridorY: 42 },
};

const FloorPlan = ({ floorNum, activeHazards = [], warningZones = [], children }) => {
  const wallStroke = "#475569";
  const glowFilter = "url(#glow)";
  const dropShadow = "url(#dropShadow)";

  const renderStairs = (roomName, x, y, width, height) => {
    const hazard = activeHazards.find(h => h.room_name === roomName);
    const steps = [];
    const stepCount = 12;
    const stepHeight = height / stepCount;

    let fill = "#1e293b";
    if (hazard) fill = "rgba(220, 38, 38, 0.6)";

    for (let i = 0; i <= stepCount; i++) {
      steps.push(
        <line
          key={i}
          x1={x}
          y1={y + (i * stepHeight)}
          x2={x + width}
          y2={y + (i * stepHeight)}
          stroke={hazard ? "#ef4444" : "#334155"}
          strokeWidth="0.4"
        />
      );
    }
    const labelY = y + height / 2;
    return (
      <g className={hazard ? 'animate-[pulse_1s_infinite]' : ''}>
        <rect x={x} y={y} width={width} height={height} fill={fill} stroke={hazard ? "#ef4444" : wallStroke} strokeWidth="1.5" filter={dropShadow} rx="0.5" />
        {steps}
        {/* Central Handrail */}
        <line x1={x + width / 2} y1={y} x2={x + width / 2} y2={y + height} stroke={hazard ? "#fca5a5" : "#64748b"} strokeWidth="0.8" />
        {/* Label background pill */}
        <rect x={x + 1} y={labelY - 3} width={width - 2} height={6} fill={fill} rx="1" />
        <text x={x + width / 2} y={labelY} fill={hazard ? "#fca5a5" : "#cbd5e1"} fontSize="2.2" textAnchor="middle" dominantBaseline="middle" fontWeight="bold">
          {hazard ? "🔥 BLOCKED" : "EXIT ↓"}
        </text>
        <text
          x={x + width / 2}
          y={labelY + 3}
          fill="#22c55e"
          fontSize="2"
          textAnchor="middle"
        >
          ↓ DESCEND
        </text>
      </g>
    );
  };

  const renderDoor = (x, y, facingDown) => {
    // Door opening is 5 units wide, centred on x
    // facingDown = top rooms (door at bottom wall, opens into corridor)
    if (facingDown) {
      return (
        <g>
          {/* Gap in wall */}
          <rect x={x - 0.5} y={y - 1} width={5} height={2} fill="#0c1523" />
          {/* Door leaf (hinged left, swings into corridor) */}
          <rect x={x - 0.5} y={y} width={1.2} height={4.5} fill="#10b981" rx="0.4" />
          {/* Swing arc */}
          <path d={`M ${x + 4} ${y} A 4.5 4.5 0 0 1 ${x - 0.5} ${y + 4.5}`} fill="none" stroke="#10b981" strokeWidth="0.7" strokeDasharray="1 1.5" opacity="0.7" />
        </g>
      );
    } else {
      return (
        <g>
          {/* Gap in wall */}
          <rect x={x - 0.5} y={y - 1} width={5} height={2} fill="#0c1523" />
          {/* Door leaf (hinged left, swings into corridor from bottom room) */}
          <rect x={x - 0.5} y={y - 4.5} width={1.2} height={4.5} fill="#10b981" rx="0.4" />
          {/* Swing arc */}
          <path d={`M ${x + 4} ${y} A 4.5 4.5 0 0 0 ${x - 0.5} ${y - 4.5}`} fill="none" stroke="#10b981" strokeWidth="0.7" strokeDasharray="1 1.5" opacity="0.7" />
        </g>
      );
    }
  };

  const renderRoom = (roomName, x, y, w, h, doorX, doorFacingDown) => {
    const hazard = activeHazards.find(h => h.room_name === roomName);
    const warning = warningZones.find(wz => wz.room_name === roomName);

    let fill = "url(#roomGradient)";
    let stroke = "#475569";
    let extra = null;

    if (hazard) {
      fill = "rgba(220, 38, 38, 0.55)";
      stroke = "#ef4444";
      extra = (
        <text x={x + w / 2} y={y + h / 2 + 4} fill="#fca5a5" fontSize="2.8" textAnchor="middle" dominantBaseline="middle" fontWeight="bold">
          🔥 {hazard.disaster_type ? hazard.disaster_type.toUpperCase() : 'HAZARD'}
        </text>
      );
    } else if (warning) {
      fill = "rgba(234, 88, 12, 0.35)";
      stroke = "#f97316";
      extra = (
        <text x={x + w / 2} y={y + h / 2 + 4} fill="#fdba74" fontSize="2.2" textAnchor="middle" dominantBaseline="middle" fontWeight="bold">
          ⚠ {warning.spread_time || '?'}
        </text>
      );
    }

    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth="1.5" rx="1" filter={dropShadow} className={hazard ? 'animate-[pulse_1s_infinite]' : ''} />
        {/* Room number label */}
        <text x={x + w / 2} y={y + h / 2 - (hazard || warning ? 3 : 0)} fill={hazard ? '#fca5a5' : '#94a3b8'} fontSize="4" textAnchor="middle" dominantBaseline="middle" fontWeight="bold" letterSpacing="0.5">{roomName.replace('Room ', '')}</text>
        {doorX && renderDoor(doorX, doorFacingDown ? y + h : y, doorFacingDown)}
        {extra}
      </g>
    );
  };

  // ── Corridor hazard markers — ONLY for hazards on this specific floor ──
  const renderCorridorHazardMarkers = () => {
    return activeHazards
      .filter(hazard => hazard.floor_num === floorNum)  // ← only current floor
      .map((hazard, i) => {
        const door = ROOM_DOOR_MAP[hazard.room_name];
        if (!door) return null;
        const cx = door.doorX + 2;
        const cy = door.corridorY === 28 ? 31 : 39;
        return (
          <g key={i}>
            {/* Red corridor tint strip behind the icon */}
            <rect
              x={cx - 6} y={door.corridorY === 28 ? 28 : 36}
              width={16} height={6}
              fill="rgba(220,38,38,0.25)" rx="1"
              className="animate-[pulse_1s_infinite]"
            />
            {/* Pulsing glow ring */}
            <circle cx={cx} cy={cy} r="5.5" fill="rgba(220,38,38,0.15)"
              className="animate-ping" style={{ transformOrigin: `${cx}px ${cy}px` }} />
            {/* Solid red core */}
            <circle cx={cx} cy={cy} r="3.2" fill="rgba(220,38,38,0.55)" />
            {/* Fire emoji */}
            <text x={cx} y={cy} fontSize="4.5" textAnchor="middle" dominantBaseline="middle"
              className="animate-[pulse_0.8s_infinite]">
              🔥
            </text>
            {/* Label */}
            <text
              x={cx} y={door.corridorY === 28 ? cy + 6 : cy - 5.5}
              fontSize="1.8" textAnchor="middle" dominantBaseline="middle"
              fill="#fca5a5" fontWeight="bold"
            >
              {hazard.disaster_type?.toUpperCase() ?? 'HAZARD'}
            </text>
          </g>
        );
      });
  };


  return (
    <svg
      viewBox="0 0 100 70"
      className="w-full h-full text-slate-600 rounded-xl bg-black border border-slate-800"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="dropShadow" x="-10%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="0.5" dy="0.5" stdDeviation="0.8" floodColor="#000000" floodOpacity="0.8" />
        </filter>

        <linearGradient id="roomGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>

        {/* Corridor gradient */}
        <linearGradient id="corridorGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#172032" />
          <stop offset="100%" stopColor="#0d1520" />
        </linearGradient>
      </defs>

      {/* Building outer wall */}
      <rect x="1" y="1" width="98" height="68" fill="none" stroke="#334155" strokeWidth="1" rx="1" />

      {/* Corridor Band — center strip from y=28 to y=42 (14 units wide) */}
      <rect x="2" y="28" width="96" height="14" fill="url(#corridorGradient)" />
      {/* Corridor center dashes */}
      <line x1="2" y1="35" x2="98" y2="35" stroke="#1e3a5f" strokeWidth="0.5" strokeDasharray="3 3" />
      {/* Corridor edge highlights */}
      <line x1="2" y1="28" x2="98" y2="28" stroke="#475569" strokeWidth="0.5" />
      <line x1="2" y1="42" x2="98" y2="42" stroke="#475569" strokeWidth="0.5" />

      {floorNum === 1 && (
        <g id="floor-1">
          {/* Stairs — left side spans full height */}
          {renderStairs('Stairs A (Left)', 2, 2, 14, 26)}
          {renderStairs('Stairs B (Right)', 84, 42, 14, 26)}

          {/* Top Row rooms: x from 18, y from 2, height=26 */}
          {renderRoom('Room 101', 18, 2, 20, 26, 25, true)}
          {renderRoom('Room 102', 40, 2, 20, 26, 47, true)}
          {renderRoom('Room 103', 62, 2, 20, 26, 69, true)}

          {/* Bottom Row rooms: y from 42, height=26 */}
          {renderRoom('Room 104', 18, 42, 20, 26, 25, false)}
          {renderRoom('Room 105', 40, 42, 20, 26, 47, false)}
          {renderRoom('Room 106', 62, 42, 20, 26, 69, false)}

          {/* Corridor fire markers — rendered on top of corridor */}
          {renderCorridorHazardMarkers()}

          {/* Main Exit */}
          <rect x="86" y="62" width="10" height="5" fill="#166534" filter={glowFilter} rx="0.5" />
          <text x="91" y="65.5" fill="#bbf7d0" fontSize="2.2" textAnchor="middle" dominantBaseline="middle" className="font-extrabold tracking-widest">EXIT</text>
        </g>
      )}

      {floorNum === 2 && (
        <g id="floor-2">
          {/* Stairs */}
          {renderStairs('Stairs A (Left)', 2, 2, 14, 26)}
          {renderStairs('Stairs B (Right)', 84, 42, 14, 26)}

          {/* Top Row */}
          {renderRoom('Room 201', 18, 2, 20, 26, 25, true)}
          {renderRoom('Room 202', 40, 2, 20, 26, 47, true)}
          {renderRoom('Room 203', 62, 2, 20, 26, 69, true)}

          {/* Bottom Row */}
          {renderRoom('Room 204', 18, 42, 20, 26, 25, false)}
          {renderRoom('Room 205', 40, 42, 20, 26, 47, false)}
          {renderRoom('Room 206', 62, 42, 20, 26, 69, false)}

          {/* Corridor fire markers */}
          {renderCorridorHazardMarkers()}
        </g>
      )}

      {floorNum > 2 && (
        <g id={`floor-${floorNum}`}>
          {renderStairs('Stairs A (Left)', 2, 28, 14, 14)}
          {renderStairs('Stairs B (Right)', 84, 42, 14, 14)}
          {renderRoom(`Room ${floorNum}01`, 18, 2, 20, 26, 25, true)}
          {renderRoom(`Room ${floorNum}02`, 40, 2, 20, 26, 47, true)}
          {renderRoom(`Room ${floorNum}03`, 62, 2, 20, 26, 69, true)}
          {renderRoom(`Room ${floorNum}04`, 18, 42, 20, 26, 25, false)}
          {renderRoom(`Room ${floorNum}05`, 40, 42, 20, 26, 47, false)}
          {renderRoom(`Room ${floorNum}06`, 62, 42, 20, 26, 69, false)}
        </g>
      )}

      {/* Dynamic Overlays (Dots, Lines, etc) */}
      {children}
    </svg>
  );
};

export default FloorPlan;
