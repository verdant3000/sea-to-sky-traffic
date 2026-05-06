import { useApiData } from '../hooks/useData';

const TREND = {
  rising:  { icon: '↑', label: 'Rising',  color: 'text-blue-500'   },
  falling: { icon: '↓', label: 'Falling', color: 'text-orange-500' },
  stable:  { icon: '→', label: 'Stable',  color: 'text-green-600'  },
  no_data: { icon: '—', label: 'No data', color: 'text-gray-300'   },
};

function StatBox({ label, value, unit, alert = false }) {
  const isEmpty = value == null;
  return (
    <div className={`rounded-xl px-4 py-3 ${alert ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
      <p className={`text-xs font-medium mb-1 ${alert ? 'text-red-500' : 'text-gray-500'}`}>{label}</p>
      <p className={`text-xl font-bold tabular-nums ${alert ? 'text-red-600' : isEmpty ? 'text-gray-200' : 'text-gray-800'}`}>
        {isEmpty
          ? '—'
          : <>{value}<span className="text-sm font-normal ml-0.5">{unit}</span></>}
      </p>
    </div>
  );
}

export default function StationHealth({ stationId = 1 }) {
  const { data, loading } = useApiData(`/api/stations/${stationId}/environment`, 60_000);

  const inside  = data?.inside  ?? null;
  const outside = data?.outside ?? null;
  const delta   = data?.temp_delta ?? null;
  const trend   = TREND[data?.pressure_trend ?? 'no_data'];
  const alerts  = data?.alerts ?? [];

  const tempAlert = (inside?.temp_c ?? 0) > 55;
  const humAlert  = (inside?.humidity_pct ?? 0) > 80;

  const noData = !loading && !inside && !outside;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-gray-900">Station Health</h2>
          {alerts.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {alerts.length} alert{alerts.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">BME280 sensors · 60 s refresh</span>
      </div>

      <div className="p-6">
        {/* Alert banners */}
        {alerts.map(a => (
          <div key={a.type} className="flex items-center gap-2 mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <span className="text-red-500 shrink-0">⚠</span>
            <p className="text-sm text-red-700">{a.message}</p>
          </div>
        ))}

        {loading && !data && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-xl bg-gray-50 animate-pulse" />
            ))}
          </div>
        )}

        {noData && (
          <div className="flex flex-col items-center justify-center h-24 text-gray-400 gap-1">
            <span className="text-3xl">🌡</span>
            <p className="text-sm">No sensor readings yet — run env_reader.py --simulate to test</p>
          </div>
        )}

        {!loading && (inside || outside) && (
          <>
            {/* Row 1: Case health */}
            <div className="mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Case / Enclosure</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatBox label="Case Temp"     value={inside?.temp_c}       unit="°C" alert={tempAlert} />
                <StatBox label="Case Humidity" value={inside?.humidity_pct} unit="%"  alert={humAlert}  />
                <StatBox label="Ambient Temp"  value={outside?.temp_c}      unit="°C" />
                <StatBox
                  label="Temp Delta"
                  value={delta != null ? (delta > 0 ? `+${delta}` : String(delta)) : null}
                  unit="°C"
                />
              </div>
            </div>

            {/* Row 2: Weather context */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Outside / Weather</p>
              <div className="grid grid-cols-3 gap-3">
                <StatBox label="Ambient Humidity" value={outside?.humidity_pct} unit="%" />
                <StatBox label="Pressure"         value={outside?.pressure_hpa} unit=" hPa" />
                <div className="rounded-xl px-4 py-3 bg-gray-50">
                  <p className="text-xs font-medium text-gray-500 mb-1">Pressure Trend</p>
                  <p className={`text-xl font-bold ${trend.color}`}>
                    {trend.icon}{' '}
                    <span className="text-sm font-normal">{trend.label}</span>
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
