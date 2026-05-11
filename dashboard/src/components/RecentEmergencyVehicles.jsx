import { useApiData } from '../hooks/useData';

const CLASS_META = {
  ambulance:      { label: 'Ambulance',  icon: '🚑', color: 'text-red-600',    bg: 'bg-red-50'    },
  fire_truck:     { label: 'Fire Truck', icon: '🚒', color: 'text-orange-600', bg: 'bg-orange-50' },
  police_vehicle: { label: 'Police',     icon: '🚓', color: 'text-blue-700',   bg: 'bg-blue-50'   },
};

function formatTime(iso) {
  return new Date(iso).toLocaleString('en-CA', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Vancouver',
  });
}

export default function RecentEmergencyVehicles() {
  const { data, loading } = useApiData('/api/detections/emergency?hours=24', 60_000);
  const rows = data?.rows ?? [];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-baseline justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Recent Emergency Vehicles</h2>
        <span className="text-xs text-gray-400">Last 24 hours</span>
      </div>

      <div className="p-6">
        {loading && !data && (
          <div className="space-y-2">
            <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
            <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center h-24 text-gray-400">
            <p className="text-sm">None detected in last 24 hours</p>
          </div>
        )}

        {rows.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {rows.map(r => {
              const meta = CLASS_META[r.vehicle_class] ?? CLASS_META.police_vehicle;
              return (
                <li key={r.detection_id} className="flex items-center gap-3 py-2.5">
                  <span className={`text-xl shrink-0 rounded-lg ${meta.bg} px-2 py-1`}>{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className={`text-sm font-semibold ${meta.color}`}>{meta.label}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {r.station_name ?? 'Unknown station'} · {r.direction}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 tabular-nums">{formatTime(r.timestamp)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
