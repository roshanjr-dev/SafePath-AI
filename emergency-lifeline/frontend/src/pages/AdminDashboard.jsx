import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { ShieldAlert, Users, Flame, RefreshCcw, Layers, Upload, CheckCircle2, MapPin, FileText, X, Eye } from 'lucide-react';
import FloorPlan from '../components/FloorPlan';

const ROOM_DATA = {
  1: [
    { qr: 'qr_f1_101', name: 'Room 101', x: 28, y: 15 },
    { qr: 'qr_f1_102', name: 'Room 102', x: 50, y: 15 },
    { qr: 'qr_f1_103', name: 'Room 103', x: 72, y: 15 },
    { qr: 'qr_f1_104', name: 'Room 104', x: 28, y: 55 },
    { qr: 'qr_f1_105', name: 'Room 105', x: 50, y: 55 },
    { qr: 'qr_f1_106', name: 'Room 106', x: 72, y: 55 },
    { qr: 'qr_f1_stairs_left', name: 'Stairs A', x: 9, y: 15 },
    { qr: 'qr_f1_stairs_right', name: 'Stairs B', x: 91, y: 55 },
  ],
  2: [
    { qr: 'qr_f2_201', name: 'Room 201', x: 28, y: 15 },
    { qr: 'qr_f2_202', name: 'Room 202', x: 50, y: 15 },
    { qr: 'qr_f2_203', name: 'Room 203', x: 72, y: 15 },
    { qr: 'qr_f2_204', name: 'Room 204', x: 28, y: 55 },
    { qr: 'qr_f2_205', name: 'Room 205', x: 50, y: 55 },
    { qr: 'qr_f2_206', name: 'Room 206', x: 72, y: 55 },
    { qr: 'qr_f2_stairs_left', name: 'Stairs A', x: 9, y: 15 },
    { qr: 'qr_f2_stairs_right', name: 'Stairs B', x: 91, y: 55 },
  ],
};

const AdminDashboard = () => {
  const [tab, setTab] = useState('map');
  const [floor, setFloor] = useState(1);
  const [fireZones, setFireZones] = useState([]);
  const [liveUsers, setLiveUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const fileRef = useRef(null);
  const [animatedUsers, setAnimatedUsers] = useState({});

  // Fetch fire zones + locations
  const fetchStatus = async () => {
    try {
      const [pathRes, locRes] = await Promise.all([
        axios.post('/api/get-safe-path', { x: 0, y: 0, floor_num: 1 }),
        axios.get('/api/locations'),
      ]);
      if (pathRes.data?.fire_zones) setFireZones(pathRes.data.fire_zones);
      if (locRes.data) setLocations(locRes.data);
    } catch (e) { console.error(e); }
  };

  // Fetch live users
  const fetchUsers = async () => {
    try {
      const res = await axios.get('/api/admin/live-users');
      setLiveUsers(res.data || []);
    } catch (e) { setLiveUsers([]); }
  };

  // Fetch reports
  const fetchReports = async () => {
    try {
      const res = await axios.get('/api/admin/reports?per_page=50');
      setReports(res.data?.reports || []);
    } catch (e) { setReports([]); }
  };

  useEffect(() => {
    fetchStatus(); fetchUsers(); fetchReports();
    const i1 = setInterval(fetchStatus, 4000);
    const i2 = setInterval(fetchUsers, 1000);
    const i3 = setInterval(fetchReports, 10000);
    return () => { clearInterval(i1); clearInterval(i2); clearInterval(i3); };
  }, []);
  useEffect(() => {
    setAnimatedUsers(prev => {
      const updated = {};

      liveUsers.forEach(user => {
        const id = user.session_id;
        const prevPos = prev[id] || { x: user.x_coord, y: user.y_coord };

        updated[id] = {
          // first time → no animation
          x: prevPos.x + (user.x_coord - prevPos.x) * 0.2,
          y: prevPos.y + (user.y_coord - prevPos.y) * 0.2,
        };
      });
      return updated;
    });
  }, [liveUsers]);
  // Trigger fire on a room
  const triggerFire = async (qr_id, floorNum) => {
    try {
      await axios.post('/api/admin/trigger-fire', { qr_id, floor_num: floorNum, disaster_type: 'Fire' });
      fetchStatus();
    } catch (e) { alert('Failed to trigger fire'); }
    setSelectedRoom(null);
  };

  // Clear fire on a room
  const clearFire = async (qr_id) => {
    try {
      await axios.post('/api/admin/clear-fire', { qr_id });
      fetchStatus();
    } catch (e) { alert('Failed to clear'); }
    setSelectedRoom(null);
  };

  // Clear all
  const clearAll = async () => {
    await axios.post('/api/simulation/clear');
    fetchStatus();
  };

  // Mark empty
  const markEmpty = async (qr_id, isEmpty) => {
    try {
      await axios.post('/api/admin/mark-empty', { qr_id, is_empty: isEmpty });
      fetchStatus();
    } catch (e) { alert('Failed'); }
    setSelectedRoom(null);
  };

  // Upload blueprint
  const uploadBlueprint = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true); setUploadResult(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('floor_num', floor);
    try {
      const res = await axios.post('/api/admin/upload-blueprint', fd);
      setUploadResult(res.data);
      fetchStatus();
    } catch (err) {
      setUploadResult({ error: err.response?.data?.error || 'Upload failed' });
    } finally { setUploading(false); }
  };

  const usersOnFloor = liveUsers.filter(u => u.floor_num === floor);
  const roomIsOnFire = (qr) => fireZones.some(z => {
    const loc = locations.find(l => l.room_name === z.room_name && l.floor_num === floor);
    return loc?.qr_id === qr;
  });
  const roomIsEmpty = (qr) => locations.find(l => l.qr_id === qr)?.is_empty;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col p-4 gap-2">
        <div className="flex items-center gap-2 text-cyan-400 mb-6">
          <ShieldAlert className="w-6 h-6" />
          <h1 className="font-black text-sm tracking-wider uppercase">Emergency Lifeline</h1>
        </div>
        {[
          { id: 'map', icon: <Eye className="w-4 h-4" />, label: 'God View' },
          { id: 'blueprint', icon: <Upload className="w-4 h-4" />, label: 'Blueprint Upload' },
          { id: 'reports', icon: <FileText className="w-4 h-4" />, label: 'Reports' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}>
            {t.icon}{t.label}
          </button>
        ))}
        <div className="mt-auto pt-4 border-t border-slate-800 space-y-2">
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Live Users</p>
            <p className="text-xl font-black text-blue-400">{liveUsers.length}</p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Active Fires</p>
            <p className="text-xl font-black text-red-400">{fireZones.length}</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-auto">
        {/* Floor Selector */}
        <div className="flex items-center gap-3 mb-4">
          <Layers className="w-4 h-4 text-slate-500" />
          {[1, 2].map(f => (
            <button key={f} onClick={() => setFloor(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${floor === f ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}>Floor {f}</button>
          ))}
          <div className="ml-auto flex gap-2">
            <button onClick={clearAll}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-semibold flex items-center gap-2">
              <RefreshCcw className="w-3.5 h-3.5" /> Clear All
            </button>
          </div>
        </div>

        {/* ─── GOD VIEW TAB ─── */}
        {tab === 'map' && (
          <div className="grid grid-cols-3 gap-6">
            {/* Map */}
            <div className="col-span-2">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-2xl">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-cyan-400" /> GOD VIEW — Floor {floor}
                  </h2>
                  <span className="text-[10px] bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded-full">
                    {usersOnFloor.length} users on this floor
                  </span>
                </div>
                <div className="relative">
                  <FloorPlan floorNum={floor} activeHazards={fireZones}>
                    {/* Live user dots */}
                    {usersOnFloor.map((u, i) => {
                      const pos = animatedUsers[u.session_id] || {
                        x: u.x_coord,
                        y: u.y_coord
                      };
                      return (
                        <g key={u.session_id || i}>
                          {/* Outer ping */}
                          <circle
                            cx={pos.x}
                            cy={pos.y}
                            r="3"
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth="0.4"
                            className="animate-ping opacity-40"
                          />
                          {/* Main dot */}
                          <circle
                            cx={pos.x}
                            cy={pos.y}
                            r="1.5"
                            fill={u.status === 'sos' ? '#ef4444' : '#3b82f6'}
                            style={{
                              filter: 'drop-shadow(0 0 4px rgba(59,130,246,1))'
                            }}
                          />

                          {/* Icon */}
                          <text
                            x={pos.x}
                            y={pos.y - 3}
                            fill="#93c5fd"
                            fontSize="1.8"
                            textAnchor="middle"
                            fontWeight="bold"
                          >
                            {u.status === 'sos' ? '🆘' : '👤'}
                          </text>
                        </g>
                      );
                    })}


                    {/* Empty room badges */}
                    {(ROOM_DATA[floor] || []).filter(r => roomIsEmpty(r.qr)).map(r => (
                      <g key={r.qr + '_empty'}>
                        <rect x={r.x - 5} y={r.y + 5} width={10} height={4} fill="rgba(16,185,129,0.3)"
                          stroke="#10b981" strokeWidth="0.3" rx="1" />
                        <text x={r.x} y={r.y + 7.5} fill="#34d399" fontSize="2" textAnchor="middle"
                          fontWeight="bold">EMPTY</text>
                      </g>
                    ))}
                  </FloorPlan>
                </div>
              </div>
            </div>

            {/* Room Controls Sidebar */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2">
                🔥 One-Click Fire Trigger
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {(ROOM_DATA[floor] || []).map(r => {
                  const onFire = roomIsOnFire(r.qr);
                  const empty = roomIsEmpty(r.qr);
                  return (
                    <button key={r.qr} onClick={() => setSelectedRoom(r)}
                      className={`relative px-2 py-3 rounded-xl text-xs font-bold border transition-all ${onFire
                        ? 'bg-red-900/50 border-red-500/50 text-red-300 animate-pulse'
                        : empty
                          ? 'bg-emerald-900/30 border-emerald-600/30 text-emerald-400'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                        }`}>
                      {onFire && <span className="absolute top-1 right-1 text-[10px]">🔥</span>}
                      {empty && <span className="absolute top-1 right-1 text-[10px]">✅</span>}
                      {r.name}
                    </button>
                  );
                })}
              </div>

              {/* Alerts */}
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2 mt-4">
                ⚠️ Active Alerts
              </h3>
              {fireZones.length === 0 ? (
                <p className="text-slate-600 text-xs text-center py-4">No active hazards</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {fireZones.map((z, i) => (
                    <div key={i} className="bg-red-950/50 border border-red-800/40 rounded-lg p-2 flex items-center gap-2">
                      <Flame className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-red-300 text-xs font-bold truncate">{z.room_name}</p>
                        <p className="text-red-400/60 text-[10px]">{z.report_count} reports</p>
                      </div>
                      <button onClick={() => clearFire(locations.find(l => l.room_name === z.room_name)?.qr_id)}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 px-2 py-1 rounded">
                        Clear
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Live Users List */}
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2 mt-4">
                👤 Live Users ({liveUsers.length})
              </h3>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {liveUsers.length === 0 ? (
                  <p className="text-slate-600 text-xs text-center py-3">No active users</p>
                ) : liveUsers.map((u, i) => (
                  <div key={i} className="bg-slate-800 rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs">
                    <span className={`w-2 h-2 rounded-full ${u.status === 'sos' ? 'bg-red-500 animate-pulse' : 'bg-blue-500'}`} />
                    <span className="text-slate-300 flex-1 truncate">F{u.floor_num} ({u.x_coord?.toFixed(0)},{u.y_coord?.toFixed(0)})</span>
                    <span className={`text-[10px] font-bold uppercase ${u.status === 'sos' ? 'text-red-400' : 'text-slate-500'}`}>{u.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── BLUEPRINT TAB ─── */}
        {tab === 'blueprint' && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-bold mb-4">Upload Building Blueprint</h2>
            <p className="text-slate-400 text-sm mb-6">Upload a floor plan image and AI will auto-generate the navigation map.</p>
            <div className="bg-slate-900 border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-2xl p-12 text-center cursor-pointer transition-all"
              onClick={() => fileRef.current?.click()}>
              <Upload className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 font-semibold">Click to upload blueprint for Floor {floor}</p>
              <p className="text-slate-600 text-xs mt-1">PNG, JPG, PDF supported</p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadBlueprint} />
            </div>
            {uploading && (
              <div className="mt-6 text-center">
                <div className="inline-flex items-center gap-3 bg-cyan-950/50 border border-cyan-700/50 rounded-xl px-6 py-3">
                  <RefreshCcw className="w-5 h-5 text-cyan-400 animate-spin" />
                  <span className="text-cyan-300 font-semibold">AI Digitizing Blueprint...</span>
                </div>
              </div>
            )}
            {uploadResult && (
              <div className={`mt-6 p-4 rounded-xl border ${uploadResult.error
                ? 'bg-red-950/50 border-red-800 text-red-300'
                : 'bg-emerald-950/50 border-emerald-800 text-emerald-300'}`}>
                {uploadResult.error ? (
                  <p>❌ {uploadResult.error}</p>
                ) : (
                  <>
                    <p className="font-bold">✅ {uploadResult.message}</p>
                    <p className="text-xs mt-2 text-slate-400">
                      Nodes: {uploadResult.nav_graph?.nodes?.length || 0} |
                      Edges: {uploadResult.nav_graph?.edges?.length || 0}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── REPORTS TAB ─── */}
        {tab === 'reports' && (
          <div>
            <h2 className="text-xl font-bold mb-4">Incident Reports</h2>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800">
                  <tr>
                    <th className="text-left px-4 py-3 text-slate-400 font-semibold text-xs uppercase">ID</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-semibold text-xs uppercase">Room</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-semibold text-xs uppercase">Floor</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-semibold text-xs uppercase">Type</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-semibold text-xs uppercase">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-slate-600">No reports yet</td></tr>
                  ) : reports.map((r, i) => (
                    <tr key={i} className="border-t border-slate-800 hover:bg-slate-800/50">
                      <td className="px-4 py-2.5 text-slate-500">#{r.id}</td>
                      <td className="px-4 py-2.5 text-slate-200 font-semibold">{r.room_name}</td>
                      <td className="px-4 py-2.5 text-slate-400">F{r.floor_num}</td>
                      <td className="px-4 py-2.5">
                        <span className="bg-red-900/40 text-red-400 text-xs px-2 py-0.5 rounded-full font-bold">{r.disaster_type}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{r.timestamp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Room Action Modal */}
      {selectedRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setSelectedRoom(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-lg">{selectedRoom.name}</h3>
              <button onClick={() => setSelectedRoom(null)}><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="p-4 space-y-3">
              {roomIsOnFire(selectedRoom.qr) ? (
                <button onClick={() => clearFire(selectedRoom.qr)}
                  className="w-full py-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-5 h-5" /> Clear Fire
                </button>
              ) : (
                <button onClick={() => triggerFire(selectedRoom.qr, floor)}
                  className="w-full py-3 bg-red-700 hover:bg-red-600 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                  <Flame className="w-5 h-5" /> Trigger Fire
                </button>
              )}
              {roomIsEmpty(selectedRoom.qr) ? (
                <button onClick={() => markEmpty(selectedRoom.qr, false)}
                  className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                  <Users className="w-5 h-5" /> Mark Occupied
                </button>
              ) : (
                <button onClick={() => markEmpty(selectedRoom.qr, true)}
                  className="w-full py-3 bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-5 h-5" /> Mark Empty
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
