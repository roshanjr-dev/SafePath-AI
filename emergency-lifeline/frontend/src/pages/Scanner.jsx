import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Html5QrcodeScanner } from 'html5-qrcode';
import axios from 'axios';
import { ScanLine } from 'lucide-react';

const Scanner = () => {
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleScan = async (decodedText) => {
    try {
      const response = await axios.post('/api/scan', { qr_id: decodedText });
      const data = response.data;
      
      localStorage.setItem('user_location', JSON.stringify({
        qr_id: data.qr_id,
        x: data.x_coord,
        y: data.y_coord,
        floor_num: data.floor_num,
        room: data.room_name
      }));
      
      navigate('/hud');
    } catch (err) {
      setError('Failed to fetch location data for this QR code.');
      console.error(err);
    }
  };

  useEffect(() => {
    // Check if we came from a direct physical QR scan URL
    const scanParam = searchParams.get('scan');
    if (scanParam) {
      handleScan(scanParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!scanning) return;

    // Initialize scanner
    const scanner = new Html5QrcodeScanner('reader', {
      qrbox: {
        width: 250,
        height: 250,
      },
      fps: 5,
    }, false);

    const onScanSuccess = async (decodedText) => {
      scanner.clear();
      setScanning(false);
      handleScan(decodedText);
    };

    const onScanFailure = (err) => {
      // Handle scan failure, usually just ignore until success
    };

    scanner.render(onScanSuccess, onScanFailure);

    // Cleanup
    return () => {
      scanner.clear().catch(error => {
        console.error("Failed to clear html5QrcodeScanner. ", error);
      });
    };
  }, [scanning, navigate]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-white flex items-center justify-center gap-3">
            <ScanLine className="w-10 h-10 text-cyan-400" />
            Lifeline
          </h1>
          <p className="text-slate-400 text-lg">Indoor Emergency Navigation System</p>
        </div>

        {!scanning ? (
          <button 
            onClick={() => setScanning(true)}
            className="w-full py-4 px-6 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold rounded-xl shadow-lg shadow-cyan-500/30 transition-all text-xl"
          >
            Scan Check-in QR
          </button>
        ) : (
          <div className="bg-slate-800 p-4 rounded-2xl shadow-2xl border border-slate-700">
            <div id="reader" className="w-full overflow-hidden rounded-xl bg-black"></div>
            <button 
              onClick={() => setScanning(false)}
              className="mt-4 w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-medium"
            >
              Cancel Scan
            </button>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400">
            {error}
          </div>
        )}
        
        {/* Development Bypass Controls */}
        <div className="pt-8 mt-8 border-t border-slate-800">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Development Tools</h3>
            <div className="space-y-3">
              <button 
                onClick={() => handleScan('qr_f1_101')}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 rounded-lg transition-colors text-sm font-medium"
              >
                Simulate Scan (Enter as Guest in Room 101 - Floor 1)
              </button>

              <button 
                onClick={() => handleScan('qr_f2_201')}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 rounded-lg transition-colors text-sm font-medium"
              >
                Simulate Scan (Enter as Guest in Room 201 - Floor 2)
              </button>
              
              <button 
                onClick={() => navigate('/admin')}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-red-400 border border-slate-700 rounded-lg transition-colors text-sm font-medium"
              >
                Access Admin Dashboard
              </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Scanner;
