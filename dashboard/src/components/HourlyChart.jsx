import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useApiData } from '../hooks/useData';

function processRows(rows) {
  const byHour = {};
  for (const row of rows) {
    const key = new Date(row.hour).toISOString().slice(0, 13);
    if (!byHour[key]) byHour[key] = { hour: new Date(row.hour), northbound: 0, southbound: 0 };
    const n = Number(row.count);
    if (row.direction === 'northbound') byHour[key].northbound += n;
    if (row.direction === 'southbound') byHour[key].southbound += n;
  }
  return Object.values(byHour)
    .sort((a, b) => a.hour - b.hour)
    .map(d => ({
      ...d,
      label: d.hour.toLocaleString('en-CA', {
        hour: 'numeric', hour12: true, timeZone: 'America/Vancouver',
      }),
    }));
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.fill }} />
          <span className="text-gray-500 capitalize">{p.name}:</span>
          <span className="font-medium text-gray-900">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function HourlyChart() {
  const { data, loading } = useApiData('/api/flow/hourly?hours=24', 5 * 60_000);

  const chartData = data?.rows ? processRows(data.rows) : [];
  const total     = chartData.reduce((s, d) => s + d.northbound + d.southbound, 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-baseline justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-gray-900">24-Hour Traffic</h2>
          <span className="text-gray-400 text-sm">· Rolling window</span>
        </div>
        {total > 0 && (
          <span className="text-xs text-gray-400 tabular-nums">{total.toLocaleString()} vehicles total</span>
        )}
      </div>

      <div className="p-6">
        {(loading && !data) && (
          <div className="h-72 bg-gray-50 rounded-xl animate-pulse" />
        )}

        {!loading && chartData.length === 0 && (
          <div className="flex flex-col items-center justify-center h-72 text-gray-400 gap-2">
            <span className="text-4xl">📊</span>
            <p className="text-sm">Hourly chart fills in as vehicles are counted</p>
          </div>
        )}

        {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={288}>
            <BarChart data={chartData} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 20 }}
                formatter={(val) => (
                  <span className="text-gray-500">{val === 'northbound' ? '↑ Northbound' : '↓ Southbound'}</span>
                )}
              />
              <Bar dataKey="northbound" name="northbound" fill="#2563eb" radius={[3, 3, 0, 0]} maxBarSize={24} />
              <Bar dataKey="southbound" name="southbound" fill="#ea580c" radius={[3, 3, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
