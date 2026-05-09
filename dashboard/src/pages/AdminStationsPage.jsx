import { useNavigate }  from 'react-router-dom';
import StationManager  from '../components/StationManager';

export default function AdminStationsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      <header style={{ backgroundColor: '#0f2b52' }} className="text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-blue-300 hover:text-white text-sm transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-lg font-bold">Station Manager</h1>
        </div>
        <div className="h-0.5 flex">
          <div className="flex-1 bg-blue-500" />
          <div className="flex-1 bg-orange-500" />
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <StationManager />
      </main>
    </div>
  );
}
