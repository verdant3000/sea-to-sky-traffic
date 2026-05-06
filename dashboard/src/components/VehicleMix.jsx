import { useApiData } from '../hooks/useData';

const CLASS_META = {
  car:        { label: 'Cars',        color: '#2563eb', bg: '#eff6ff' },
  truck:      { label: 'Trucks',      color: '#d97706', bg: '#fffbeb' },
  bus:        { label: 'Buses',       color: '#7c3aed', bg: '#f5f3ff' },
  motorcycle: { label: 'Motorcycles', color: '#059669', bg: '#ecfdf5' },
  bicycle:    { label: 'Bicycles',    color: '#0891b2', bg: '#ecfeff' },
  rv:         { label: 'RVs',         color: '#e11d48', bg: '#fff1f2' },
};

function processVehicleMix(rows) {
  const byClass = {};
  for (const row of rows) {
    const cls = row.vehicle_class;
    byClass[cls] = (byClass[cls] || 0) + Number(row.count);
  }
  const total = Object.values(byClass).reduce((a, b) => a + b, 0);
  return {
    total,
    items: Object.entries(byClass)
      .map(([cls, count]) => ({
        cls,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

export default function VehicleMix() {
  const { data, loading } = useApiData('/api/flow/hourly?hours=24', 5 * 60_000);

  const { items, total } = data?.rows ? processVehicleMix(data.rows) : { items: [], total: 0 };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-baseline justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Vehicle Mix</h2>
        <span className="text-xs text-gray-400">Last 24 hours</span>
      </div>

      <div className="p-6">
        {(loading && !data) && (
          <div className="space-y-4">
            {[80, 45, 25, 15, 8].map(w => (
              <div key={w} className="flex items-center gap-3">
                <div className="w-24 h-4 bg-gray-100 rounded animate-pulse" />
                <div className="flex-1 h-2 bg-gray-100 rounded-full animate-pulse" style={{ maxWidth: `${w}%` }} />
                <div className="w-12 h-4 bg-gray-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
            <span className="text-4xl">🚗</span>
            <p className="text-sm">Vehicle breakdown appears after first detections</p>
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-4">
            {items.map(({ cls, count, pct }) => {
              const meta = CLASS_META[cls] ?? CLASS_META.car;
              return (
                <div key={cls} className="flex items-center gap-3">
                  <div className="w-24 shrink-0">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
                      style={{ backgroundColor: meta.bg, color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  </div>

                  <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, backgroundColor: meta.color }}
                    />
                  </div>

                  <div className="w-20 text-right shrink-0">
                    <span className="text-sm font-semibold text-gray-800 tabular-nums">
                      {count.toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-400 ml-1">({pct}%)</span>
                  </div>
                </div>
              );
            })}

            <div className="pt-3 border-t border-gray-100 text-xs text-gray-400 text-right tabular-nums">
              {total.toLocaleString()} total detections
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
