import { useEffect, useState } from 'react';
import axios from 'axios';
import { ShieldAlert, Users, Flame, RefreshCcw, Layers } from 'lucide-react';
import FloorPlan from '../components/FloorPlan';

const IncidentCommand = () => {
  const [currentFloor, setCurrentFloor] = useState(1);
  const [fireZones, setFireZones] = useState([]);
  const [totalReports, setTotalReports] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      // In a real app this would be a dedicated endpoint, we'll use a trick
      // to call the safe path API with dummy coordinates just to get the fire zones back.
      const res = await axios.post('/api/get-safe-path', {
        x: 0, y: 0 // dummy location
      });
      if (res.data && res.data.fire_zones) {
        setFireZones(res.data.fire_zones);
        // Calculate total reports from consensus
        const total = res.data.fire_zones.reduce((sum, zone) => sum + zone.report_count, 0);
        setTotalReports(total);
      }
    } catch (err) {
      console.error("Failed to fetch admin status", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, []);

  const forceTriggerFire = async () => {
    try {
      await axios.post('/api/simulation/fire');
      fetchStatus();
    } catch (err) {
      alert('Failed to trigger fire');
    }
  };

  const clearIncidents = async () => {
    try {
      await axios.post('/api/simulation/clear');
      setFireZones([]);
      setTotalReports(0);
    } catch (err) {
      alert('Failed to clear incidents');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-6">
      {/* Header */}
      <header className="flex items-center justify-between py-4 border-b border-slate-800 mb-6">
        <div className="flex flex-col">
          <div className="flex items-center gap-3 text-red-500">
            <ShieldAlert className="w-8 h-8" />
            <div>
              <h1 className="font-bold text-2xl tracking-tight">INCIDENT COMMAND</h1>
              <p className="text-xs tracking-widest text-slate-500 uppercase">God-View Dashboard</p>
            </div>
          </div>
          {/* Floor Selector */}
          <div className="flex items-center gap-2 mt-4 ml-11">
            <Layers className="w-4 h-4 text-slate-500" />
            <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1">
              {[1, 2].map(f => (
                <button
                  key={f}
                  onClick={() => setCurrentFloor(f)}
                  className={`px-4 py-1.5 rounded text-sm font-bold transition-all ${currentFloor === f ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                  Floor {f}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          {/* Live Stats */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 flex items-center gap-3">
            <Users className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Active Users</p>
              <p className="font-bold text-lg leading-none">1</p>
            </div>
          </div>
          <div className="bg-slate-900 border border-red-900/50 rounded-lg px-4 py-2 flex items-center gap-3">
            <Flame className="w-5 h-5 text-red-500" />
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Verified Hazards</p>
              <p className="font-bold text-lg leading-none text-red-400">{fireZones.length}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-6 flex-1">
        {/* Map View - 2 columns */}
        <div className="col-span-2 flex flex-col gap-4">
          <div className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-800">
            <h2 className="font-semibold text-slate-300 flex items-center gap-2">
              <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : 'text-slate-500'}`} />
              Live Consensus Heatmap
            </h2>
            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded">Auto-refreshing</span>
          </div>

          <div className="relative flex-1 bg-slate-900 rounded-2xl border border-slate-800 p-2 shadow-2xl">
            <FloorPlan floorNum={currentFloor} activeHazards={fireZones}>
              {/* Draw Fire Zones (Consensus > 3) - Only if on current floor */}
              {fireZones.filter(z => z.floor_num === currentFloor || !z.floor_num).map((zone, idx) => (
                <g key={idx}>
                  <circle
                    cx={zone.x_coord}
                    cy={zone.y_coord}
                    r="8"
                    fill="rgba(239, 68, 68, 0.4)"
                    className="animate-ping"
                  />
                  <circle
                    cx={zone.x_coord}
                    cy={zone.y_coord}
                    r="4"
                    fill="#ef4444"
                    className="animate-pulse shadow-[0_0_20px_rgba(239,68,68,1)]"
                  />
                  <text
                    x={zone.x_coord}
                    y={zone.y_coord - 8}
                    fill="#fca5a5"
                    fontSize="3"
                    textAnchor="middle"
                    className="font-bold drop-shadow-md"
                  >
                    {zone.disaster_type ? zone.disaster_type.toUpperCase() : 'FIRE'} ZONE
                  </text>
                </g>
              ))}
            </FloorPlan>
          </div>
        </div>

        {/* Sidebar Controls - 1 column */}
        <div className="flex flex-col gap-6">
          {/* Alerts Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex-1">
            <h3 className="font-semibold text-slate-300 mb-4 flex items-center gap-2 uppercase tracking-wide text-sm border-b border-slate-800 pb-2">
              <ShieldAlert className="w-4 h-4 text-orange-500" />
              Consensus Alerts
            </h3>

            {fireZones.length === 0 ? (
              <div className="text-center text-slate-500 mt-10 space-y-2">
                <ShieldAlert className="w-12 h-12 mx-auto text-slate-700" />
                <p>No verified hazards detected.</p>
                <p className="text-xs">Consensus requires 3+ SOS reports in the same zone.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {fireZones.map((zone, idx) => (
                  <div key={idx} className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg flex items-start gap-3">
                    <div className="p-2 bg-red-500/20 rounded-full mt-1">
                      <Flame className="w-4 h-4 text-red-500" />
                    </div>
                    <div>
                      <p className="text-red-400 font-bold">{zone.room_name} {zone.disaster_type || 'Hazard'}</p>
                      <p className="text-xs text-red-300/70 mt-1">
                        Verified by {zone.report_count} independent SOS reports. AI rerouting activated.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Simulation Controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h3 className="font-semibold text-slate-300 mb-4 uppercase tracking-wide text-sm border-b border-slate-800 pb-2">
              Simulation Tools
            </h3>
            <div className="space-y-3">
              <button
                onClick={forceTriggerFire}
                className="w-full py-3 px-4 bg-red-900/50 hover:bg-red-900 text-red-400 hover:text-red-300 border border-red-900/50 hover:border-red-500 rounded-xl transition-all flex items-center justify-center gap-2 font-medium"
              >
                <Flame className="w-5 h-5" />
                Force Trigger Fire (Rm 101)
              </button>

              <button
                onClick={clearIncidents}
                className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all flex items-center justify-center gap-2 font-medium"
              >
                <RefreshCcw className="w-5 h-5" />
                Clear All Incidents
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IncidentCommand;
