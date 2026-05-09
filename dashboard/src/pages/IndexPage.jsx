import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiData }   from '../hooks/useData';
import CorridorStatus   from '../components/CorridorStatus';
import FlowRatio        from '../components/FlowRatio';
import LiveMapIndex     from '../components/LiveMapIndex';
import TodaysNumbers    from '../components/TodaysNumbers';
import ActiveAlerts     from '../components/ActiveAlerts';
import VendorCounter    from '../components/VendorCounter';

function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return time;
}

export default function IndexPage() {
  const now      = useClock();
  const navigate = useNavigate();

  const { data: stationsData } = useApiData('/api/stations',   60_000);
  const { data: liveData }     = useApiData('/api/flow/live',  30_000);

  const activeStations = (stationsData ?? []).filter(s => s.active);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* Header */}
      <header style={{ backgroundColor: '#0f2b52' }} className="text-white shadow-lg">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-2 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-tight">The Traffic Bureau</h1>
            <p className="text-blue-400 text-xs mt-0.5">Highway 99 · Squamish → Pemberton</p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
            </span>
            <span className="text-blue-200 text-xs tabular-nums">
              {now.toLocaleString('en-CA', {
                hour: 'numeric', minute: '2-digit', timeZone: 'America/Vancouver',
              })}
            </span>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 pb-2">
          <button
            onClick={() => navigate('/admin/stations')}
            className="text-xs text-blue-400 hover:text-blue-200 transition-colors"
          >
            Admin →
          </button>
        </div>
        <div className="h-0.5 flex">
          <div className="flex-1 bg-blue-500" />
          <div className="flex-1 bg-orange-500" />
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-5 space-y-4">

        {/* 1. Corridor Status */}
        <CorridorStatus />

        {/* 2. Traffic Tide */}
        <FlowRatio />

        {/* 3. Live Map */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Live Map</h2>
            <p className="text-xs text-slate-400">Tap a pin for station detail</p>
          </div>
          <div style={{ height: 320 }}>
            <LiveMapIndex
              stations={activeStations}
              liveData={liveData}
              onStationClick={(id) => navigate(`/station/${id}`)}
            />
          </div>
        </div>

        {/* 4. Today's Numbers */}
        <TodaysNumbers />

        {/* 5. Active Alerts */}
        <ActiveAlerts />

        {/* 6. Vendor Counter */}
        <VendorCounter />

      </main>

      <footer className="max-w-2xl w-full mx-auto px-4 py-5 text-center text-xs text-slate-400 border-t border-slate-200 bg-white mt-4">
        Field Trip Management Ltd. · Count + class data only · No license plates
      </footer>

    </div>
  );
}
