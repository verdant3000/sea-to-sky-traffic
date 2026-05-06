import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  ReferenceLine, Tooltip, Legend, ResponsiveContainer, Dot,
} from 'recharts';
import { useApiData } from '../hooks/useData';

const STATUS_COLOR = {
  free:      '#16a34a',   // green-600
  degraded:  '#d97706',   // amber-600
  congested: '#dc2626',   // red-600
  no_data:   '#94a3b8',   // slate-400
};

const STATUS_LABEL = {
  free:      'Free flow (>80 km/h)',
  degraded:  'Degraded (40–80 km/h)',
  congested: 'Congested (<40 km/h)',
  no_data:   'No speed data',
};

function processSegments(segments) {
  // Merge NB+SB into one row per window, keyed by window_start
  const byWindow = {};
  for (const seg of segments) {
    const key = new Date(seg.window_start).toISOString().slice(0, 16);
    if (!byWindow[key]) byWindow[key] = { window: new Date(seg.window_start) };
    const prefix = seg.direction === 'northbound' ? 'nb' : 'sb';
    byWindow[key][`${prefix}_speed`]  = seg.avg_speed_kmh;
    byWindow[key][`${prefix}_status`] = seg.flow_status;
  }
  return Object.values(byWindow).sort((a, b) => a.window - b.window);
}

const SpeedDot = (statusKey) => (props) => {
  const { cx, cy, payload } = props;
  const status = payload[statusKey] || 'no_data';
  const color  = STATUS_COLOR[status];
  if (!payload[statusKey === 'nb_status' ? 'nb_speed' : 'sb_speed']) return null;
  return <Dot cx={cx} cy={cy} r={4} fill={color} stroke="#fff" strokeWidth={1.5} />;
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map(p => {
        const statusKey = p.dataKey === 'nb_speed' ? 'nb_status' : 'sb_status';
        const status    = p.payload[statusKey] || 'no_data';
        return (
          <div key={p.dataKey} className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: p.stroke }} />
            <span className="text-gray-500">{p.name}:</span>
            <span className="font-semibold text-gray-900">
              {p.value != null ? `${p.value} km/h` : '—'}
            </span>
            <span style={{ color: STATUS_COLOR[status] }} className="font-medium">
              {status}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default function SpeedChart() {
  const { data, loading } = useApiData('/api/speed/segments?hours=24', 5 * 60_000);

  const segments  = data?.segments ?? [];
  const chartData = segments.length ? processSegments(segments) : [];

  const fmt = (d) => d.window?.toLocaleString('en-CA', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Vancouver',
  }) ?? '';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-baseline justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-gray-900">Speed Trend</h2>
          <span className="text-gray-400 text-sm">· 10-min segments</span>
        </div>
        {/* Flow status legend */}
        <div className="flex items-center gap-4">
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLOR[k] }} />
              <span className="text-xs text-gray-500 hidden lg:inline">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-6">
        {(loading && !data) && (
          <div className="h-64 bg-gray-50 rounded-xl animate-pulse" />
        )}

        {!loading && chartData.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-2 text-gray-400">
            <span className="text-4xl">🚗</span>
            <p className="text-sm">Speed data appears as vehicles are detected</p>
            <p className="text-xs text-gray-300">Requires speed_estimate values in detections</p>
          </div>
        )}

        {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={264}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey={fmt}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false} axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={false} axisLine={false}
                domain={[0, 'auto']} allowDecimals={false}
                unit=" km/h"
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
              {/* Speed limit reference */}
              <ReferenceLine y={90} stroke="#e2e8f0" strokeDasharray="4 4"
                label={{ value: '90 km/h limit', position: 'insideTopRight', fontSize: 10, fill: '#cbd5e1' }} />
              <ReferenceLine y={80} stroke="#16a34a" strokeDasharray="2 4" strokeOpacity={0.4} />
              <ReferenceLine y={40} stroke="#dc2626" strokeDasharray="2 4" strokeOpacity={0.4} />
              <Line
                type="monotone" dataKey="nb_speed" name="Northbound ↑"
                stroke="#2563eb" strokeWidth={2}
                dot={SpeedDot('nb_status')} activeDot={{ r: 5 }}
                connectNulls={false}
              />
              <Line
                type="monotone" dataKey="sb_speed" name="Southbound ↓"
                stroke="#ea580c" strokeWidth={2}
                dot={SpeedDot('sb_status')} activeDot={{ r: 5 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
