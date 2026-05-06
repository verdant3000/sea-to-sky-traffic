import { useApiData } from '../hooks/useData';

const STATUS_DOT = {
  free:      { color: 'bg-green-500',  ring: 'ring-green-200',  label: 'Free flow'  },
  degraded:  { color: 'bg-amber-400',  ring: 'ring-amber-200',  label: 'Slow'       },
  congested: { color: 'bg-red-500',    ring: 'ring-red-200',    label: 'Congested'  },
  no_data:   { color: 'bg-slate-300',  ring: 'ring-slate-200',  label: 'No speed data' },
};

function FlowStatusBadge({ status }) {
  const s = STATUS_DOT[status] ?? STATUS_DOT.no_data;
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ring-2 ${s.color} ${s.ring}`} />
      <span className="text-xs text-gray-500">{s.label}</span>
    </div>
  );
}

function DirectionCard({ dir, data }) {
  const isNorth  = dir === 'northbound';
  const arrow    = isNorth ? '↑' : '↓';
  const label    = isNorth ? 'Northbound' : 'Southbound';
  const bgClass  = isNorth ? 'bg-blue-50  border-blue-100'   : 'bg-orange-50 border-orange-100';
  const numClass = isNorth ? 'text-blue-700'   : 'text-orange-700';
  const metaCls  = isNorth ? 'text-blue-500'   : 'text-orange-500';
  const arrowCls = isNorth ? 'text-blue-400'   : 'text-orange-400';

  return (
    <div className={`flex flex-col items-center rounded-2xl border py-8 px-6 ${bgClass}`}>
      <span className={`text-3xl mb-3 ${arrowCls}`}>{arrow}</span>
      <span className={`text-7xl font-bold tabular-nums leading-none ${numClass}`}>
        {data ? Number(data.vehicles_per_hour) : '—'}
      </span>
      <span className={`text-sm font-medium mt-3 ${metaCls}`}>vehicles / hr</span>
      <span className={`text-xs mt-0.5 ${metaCls} opacity-70`}>{label}</span>

      {/* Flow status indicator */}
      <div className="mt-4">
        <FlowStatusBadge status={data?.flow_status ?? 'no_data'} />
      </div>

      {data?.avg_speed_kmh && (
        <span className="text-xs text-gray-400 mt-1 tabular-nums">
          avg {data.avg_speed_kmh} km/h
        </span>
      )}

      {data && (
        <span className="text-xs text-gray-400 mt-3 tabular-nums">
          {data.count} counted this window
        </span>
      )}
    </div>
  );
}

export default function LiveView() {
  const { data, loading, error, lastUpdated } = useApiData('/api/flow/live', 30_000);

  const stations = data?.stations ?? [];
  const station  = stations[0];
  const nb       = station?.directions.find(d => d.direction === 'northbound');
  const sb       = station?.directions.find(d => d.direction === 'southbound');
  const nbVph    = nb ? Number(nb.vehicles_per_hour) : 0;
  const sbVph    = sb ? Number(sb.vehicles_per_hour) : 0;
  const net      = nbVph - sbVph;
  const hasFlow  = nb || sb;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <h2 className="font-semibold text-gray-900">Live Flow</h2>
          <span className="text-gray-400 text-sm">· Last 15 min</span>
        </div>
        <span className="text-xs text-gray-400">
          {loading    && 'Loading…'}
          {error      && <span className="text-red-400">Connection error</span>}
          {lastUpdated && !loading && `Updated ${lastUpdated.toLocaleTimeString()}`}
        </span>
      </div>

      <div className="p-6">
        {!loading && stations.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
            <span className="text-4xl">📡</span>
            <p className="text-sm">No traffic detected in the last 15 minutes</p>
            <p className="text-xs text-gray-300">Run detect.py to start counting</p>
          </div>
        )}

        {loading && !data && (
          <div className="grid grid-cols-2 gap-5">
            {[0, 1].map(i => <div key={i} className="h-52 rounded-2xl bg-gray-50 animate-pulse" />)}
          </div>
        )}

        {station && (
          <>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-5">
              {station.station_name}
            </p>

            <div className="grid grid-cols-2 gap-5 mb-6">
              <DirectionCard dir="northbound" data={nb} />
              <DirectionCard dir="southbound" data={sb} />
            </div>

            {hasFlow && (
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-5 py-3.5">
                <span className="text-sm font-medium text-gray-600">Corridor net flow</span>
                <div className={`flex items-center gap-2 font-semibold text-sm ${
                  net >= 0 ? 'text-blue-600' : 'text-orange-600'
                }`}>
                  <span>{net >= 0 ? '↑' : '↓'}</span>
                  <span>{Math.abs(net)} vph {net >= 0 ? 'northbound' : 'southbound'}</span>
                  <span className="font-normal text-gray-400">
                    · {net > 10 ? 'Corridor filling' : net < -10 ? 'Corridor emptying' : 'Balanced'}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
