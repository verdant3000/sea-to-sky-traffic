import { useApiData } from '../hooks/useData';

function todayMidnightVan() {
  const now = new Date();
  const vanDateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' });
  return new Date(`${vanDateStr}T00:00:00-07:00`); // PDT; close enough for filtering
}

export default function TodaysNumbers() {
  const { data, loading } = useApiData('/api/flow/hourly?hours=24', 5 * 60_000);

  const midnight = todayMidnightVan();
  const rows = (data?.rows ?? []).filter(r => new Date(r.hour) >= midnight);

  const total = rows.reduce((n, r) => n + Number(r.count), 0);
  const nb    = rows.filter(r => r.direction === 'northbound').reduce((n, r) => n + Number(r.count), 0);
  const sb    = rows.filter(r => r.direction === 'southbound').reduce((n, r) => n + Number(r.count), 0);

  // Busiest hour
  const byHour = {};
  for (const r of rows) {
    const key = new Date(r.hour).toISOString().slice(0, 13);
    byHour[key] = (byHour[key] ?? 0) + Number(r.count);
  }
  const busiestEntry = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];
  const busiestLabel = busiestEntry
    ? new Date(busiestEntry[0]).toLocaleString('en-CA', { hour: 'numeric', hour12: true, timeZone: 'America/Vancouver' })
    : null;

  const nbPct = total > 0 ? Math.round((nb / total) * 100) : 50;
  const sbPct = total > 0 ? Math.round((sb / total) * 100) : 50;

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 animate-pulse">
        <div className="h-4 w-32 bg-slate-100 rounded mb-4" />
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">Today's Numbers</h2>
        <p className="text-xs text-slate-400">Since midnight · Vancouver time</p>
      </div>
      <div className="grid grid-cols-3 gap-px bg-slate-100">
        <div className="bg-white p-4 text-center">
          <p className="text-2xl font-bold tabular-nums text-slate-800">
            {total > 0 ? total.toLocaleString() : '—'}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Total vehicles</p>
        </div>
        <div className="bg-white p-4 text-center">
          <p className="text-lg font-bold text-slate-800">{busiestLabel ?? '—'}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {busiestEntry ? `${busiestEntry[1]} veh · busiest hour` : 'Busiest hour'}
          </p>
        </div>
        <div className="bg-white p-4 text-center">
          <div className="flex justify-center gap-1 mb-1">
            <span className="text-sm font-bold text-blue-600">{nbPct}%</span>
            <span className="text-xs text-slate-300 mt-0.5">·</span>
            <span className="text-sm font-bold text-orange-500">{sbPct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden bg-orange-500 mx-2">
            <div className="h-full bg-blue-600 rounded-full" style={{ width: `${nbPct}%` }} />
          </div>
          <p className="text-xs text-slate-400 mt-1.5">NB · SB split</p>
        </div>
      </div>
    </div>
  );
}
