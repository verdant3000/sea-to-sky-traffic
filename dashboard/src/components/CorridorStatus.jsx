import { useApiData } from '../hooks/useData';

const SEGMENTS = [
  { id: 'van-sqm', from: 'Vancouver',  to: 'Squamish',  latMax: 49.9  },
  { id: 'sqm-whi', from: 'Squamish',   to: 'Whistler',  latMin: 49.9, latMax: 50.2 },
  { id: 'whi-pem', from: 'Whistler',   to: 'Pemberton', latMin: 50.2  },
];

const STATUS_CFG = {
  free:      { label: 'Free flow',  color: '#22c55e', bg: '#f0fdf4', bar: 'bg-green-500' },
  degraded:  { label: 'Slow',       color: '#f59e0b', bg: '#fffbeb', bar: 'bg-amber-400' },
  congested: { label: 'Congested',  color: '#ef4444', bg: '#fef2f2', bar: 'bg-red-500'   },
  no_data:   { label: 'No data',    color: '#9ca3af', bg: '#f9fafb', bar: 'bg-slate-300' },
};

const STATUS_RANK = { congested: 3, degraded: 2, free: 1, no_data: 0 };

function stationSegment(lat) {
  if (lat == null) return null;
  const n = Number(lat);
  for (const seg of SEGMENTS) {
    const aboveMin = seg.latMin == null || n >= seg.latMin;
    const belowMax = seg.latMax == null || n <  seg.latMax;
    if (aboveMin && belowMax) return seg.id;
  }
  return null;
}

function worstStatus(directions = []) {
  return directions.reduce(
    (worst, d) => STATUS_RANK[d.flow_status] > STATUS_RANK[worst] ? d.flow_status : worst,
    'no_data'
  );
}

export default function CorridorStatus() {
  const { data: liveData }     = useApiData('/api/flow/live', 30_000);
  const { data: stationsData } = useApiData('/api/stations',  60_000);

  const stations   = stationsData ?? [];
  const liveMap    = Object.fromEntries(
    (liveData?.stations ?? []).map(s => [s.station_id, s.directions])
  );

  // Compute worst status per segment
  const segStatus = {};
  const segSpeed  = {};
  for (const station of stations) {
    const seg = stationSegment(station.lat);
    if (!seg) continue;
    const dirs     = liveMap[station.station_id] ?? [];
    const status   = worstStatus(dirs);
    const curRank  = STATUS_RANK[segStatus[seg] ?? 'no_data'];
    if (STATUS_RANK[status] > curRank) segStatus[seg] = status;

    // avg speed across directions
    const speeds = dirs.map(d => d.avg_speed_kmh).filter(Boolean);
    if (speeds.length && !segSpeed[seg]) {
      segSpeed[seg] = Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length);
    }
  }

  const activeCount = stations.filter(s => s.active).length;
  const totalLive   = (liveData?.stations ?? []).reduce(
    (n, s) => n + s.directions.reduce((m, d) => m + d.count, 0), 0
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">Corridor Status</h2>
        <span className="text-xs text-slate-400">
          {activeCount} station{activeCount !== 1 ? 's' : ''} active
          {totalLive > 0 && ` · ${totalLive} last 15 min`}
        </span>
      </div>
      <div className="divide-y divide-slate-50">
        {SEGMENTS.map(seg => {
          const status = segStatus[seg.id] ?? 'no_data';
          const cfg    = STATUS_CFG[status];
          const speed  = segSpeed[seg.id];

          return (
            <div key={seg.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.bar}`} />
                  <span className="text-xs font-medium text-slate-700 truncate">
                    {seg.from} → {seg.to}
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
                    style={{ width: status === 'no_data' ? '0%' : '100%', opacity: status === 'no_data' ? 0.3 : 1 }}
                  />
                </div>
              </div>
              <div className="text-right shrink-0 w-20">
                <span className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
                {speed && (
                  <p className="text-xs text-slate-400 tabular-nums">{speed} km/h</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
