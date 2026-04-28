import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Scanner from './pages/Scanner';
import TacticalHUD from './pages/TacticalHUD';
import AdminDashboard from './pages/AdminDashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Scanner />} />
        <Route path="/hud" element={<TacticalHUD />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
