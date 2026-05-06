import { useState, useEffect } from 'react';
import LiveView        from './components/LiveView';
import HourlyChart     from './components/HourlyChart';
import SpeedChart      from './components/SpeedChart';
import FlowRatio       from './components/FlowRatio';
import VehicleMix      from './components/VehicleMix';
import EmergencyCounter from './components/EmergencyCounter';
import PatternHeatmap  from './components/PatternHeatmap';
import StationHealth   from './components/StationHealth';

function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return time;
}

export default function App() {
  const now = useClock();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* Header */}
      <header style={{ backgroundColor: '#0f2b52' }} className="text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold tracking-tight">Sea to Sky</span>
              <span className="text-blue-400 text-lg">·</span>
              <span className="text-blue-200 text-base font-medium">Traffic Monitor</span>
            </div>
            <p className="text-blue-400 text-xs mt-1 tracking-wide">
              Highway 99 &nbsp;·&nbsp; Squamish → Whistler → Pemberton
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 justify-end mb-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
              </span>
              <span className="text-green-300 text-xs font-semibold uppercase tracking-wider">Live</span>
            </div>
            <p className="text-blue-400 text-xs tabular-nums">
              {now.toLocaleString('en-CA', {
                weekday: 'short', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit', timeZone: 'America/Vancouver',
              })}
            </p>
          </div>
        </div>
        {/* Northbound / Southbound colour bar */}
        <div className="h-0.5 flex">
          <div className="flex-1 bg-blue-500" />
          <div className="flex-1 bg-orange-500" />
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-6">

        {/* Row 1: Live flow (wide) + Direction ratio (narrow) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2"><LiveView /></div>
          <div><FlowRatio /></div>
        </div>

        {/* Row 2: 24-hour traffic chart */}
        <HourlyChart />

        {/* Row 3: Speed trend */}
        <SpeedChart />

        {/* Row 4: Vehicle mix + Emergency counter */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <VehicleMix />
          <EmergencyCounter />
        </div>

        {/* Row 5: Weekly pattern heatmap */}
        <PatternHeatmap />

        {/* Row 6: Station health — case temp/humidity + ambient weather context */}
        <StationHealth stationId={1} />

      </main>

      <footer className="py-6 text-center text-xs text-gray-400 border-t border-gray-200 bg-white">
        Sea to Sky Traffic Monitor &nbsp;·&nbsp; Field Trip Management Ltd. &nbsp;·&nbsp;
        Count and class data only — no license plates, no individual tracking
      </footer>

    </div>
  );
}
