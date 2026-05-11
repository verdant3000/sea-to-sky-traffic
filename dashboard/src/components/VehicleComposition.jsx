import { useApiData } from '../hooks/useData';

const VEHICLE_CLASSES = [
  { cls: 'car',                label: 'Cars',                color: '#2563eb', bg: '#eff6ff' },
  { cls: 'suv',                label: 'SUVs',                color: '#1d4ed8', bg: '#eff6ff' },
  { cls: 'pickup_truck',       label: 'Pickup Trucks',       color: '#b45309', bg: '#fffbeb' },
  { cls: 'box_truck',          label: 'Box Trucks',          color: '#d97706', bg: '#fffbeb' },
  { cls: 'flatbed_truck',      label: 'Flatbed Trucks',      color: '#92400e', bg: '#fffbeb' },
  { cls: 'delivery_van',       label: 'Delivery Vans',       color: '#a16207', bg: '#fefce8' },
  { cls: 'utility_van',        label: 'Utility Vans',        color: '#854d0e', bg: '#fefce8' },
  { cls: 'bus',                label: 'Buses',               color: '#7c3aed', bg: '#f5f3ff' },
  { cls: 'motorcycle',         label: 'Motorcycles',         color: '#059669', bg: '#ecfdf5' },
  { cls: 'rv',                 label: 'RVs',                 color: '#0d9488', bg: '#f0fdfa' },
  { cls: 'dumptruck',          label: 'Dump Trucks',         color: '#78350f', bg: '#fffbeb' },
  { cls: 'tanker_truck',       label: 'Tanker Trucks',       color: '#64748b', bg: '#f8fafc' },
  { cls: 'cybertruck',         label: 'Cybertrucks',         color: '#475569', bg: '#f8fafc' },
  { cls: 'overland_rig',       label: 'Overland Rigs',       color: '#166534', bg: '#f0fdf4' },
  { cls: 'emergency_vehicle',  label: 'Emergency Vehicles',  color: '#dc2626', bg: '#fef2f2' },
];

const ACTIVE_CLASSES = [
  { cls: 'person',  label: 'People',   color: '#ea580c', bg: '#fff7ed' },
  { cls: 'bicycle', label: 'Bicycles', color: '#0891b2', bg: '#ecfeff' },
];

function sumByClass(rows) {
  const counts = {};
  for (const row of rows ?? []) {
    counts[row.vehicle_class] = (counts[row.vehicle_class] ?? 0) + Number(row.count);
  }
  return counts;
}

function Row({ meta, count, pct }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 shrink-0">
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
}

function Group({ title, classes, counts }) {
  const items = classes
    .map(meta => ({ meta, count: counts[meta.cls] ?? 0 }))
    .sort((a, b) => b.count - a.count);
  const total = items.reduce((sum, it) => sum + it.count, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
        <span className="text-xs text-gray-400 tabular-nums">{total.toLocaleString()} total</span>
      </div>

      {total === 0 ? (
        <p className="text-xs text-gray-400 py-2">No detections in last 24 hours</p>
      ) : (
        <div className="space-y-3">
          {items.map(({ meta, count }) => (
            <Row
              key={meta.cls}
              meta={meta}
              count={count}
              pct={total > 0 ? Math.round((count / total) * 100) : 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function VehicleComposition() {
  const { data, loading } = useApiData('/api/flow/hourly?hours=24', 5 * 60_000);
  const counts = data?.rows ? sumByClass(data.rows) : {};
  const hasAnyData = data?.rows && data.rows.length > 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-baseline justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Vehicle Composition</h2>
        <span className="text-xs text-gray-400">Last 24 hours</span>
      </div>

      <div className="p-6">
        {loading && !data ? (
          <div className="space-y-3">
            {[80, 55, 40, 30, 20].map(w => (
              <div key={w} className="flex items-center gap-3">
                <div className="w-32 h-4 bg-gray-100 rounded animate-pulse" />
                <div
                  className="flex-1 h-2 bg-gray-100 rounded-full animate-pulse"
                  style={{ maxWidth: `${w}%` }}
                />
                <div className="w-12 h-4 bg-gray-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : !hasAnyData ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-2">
            <span className="text-4xl">🚗</span>
            <p className="text-sm">Vehicle breakdown appears after first detections</p>
          </div>
        ) : (
          <div className="space-y-6">
            <Group title="Vehicles" classes={VEHICLE_CLASSES} counts={counts} />
            <Group title="Active Transportation" classes={ACTIVE_CLASSES} counts={counts} />
          </div>
        )}
      </div>
    </div>
  );
}
