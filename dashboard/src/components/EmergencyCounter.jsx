import { useApiData } from '../hooks/useData';

const EMERGENCY_CLASSES = [
  { cls: 'ambulance',     label: 'Ambulance',    icon: '🚑', color: 'text-red-600',    bg: 'bg-red-50'   },
  { cls: 'fire_truck',    label: 'Fire Truck',   icon: '🚒', color: 'text-orange-600', bg: 'bg-orange-50'},
  { cls: 'police_vehicle',label: 'Police',       icon: '🚓', color: 'text-blue-700',   bg: 'bg-blue-50'  },
];

function countEmergencyVehicles(rows) {
  const counts = {};
  for (const row of rows) {
    if (EMERGENCY_CLASSES.some(e => e.cls === row.vehicle_class)) {
      counts[row.vehicle_class] = (counts[row.vehicle_class] || 0) + Number(row.count);
    }
  }
  return counts;
}

export default function EmergencyCounter() {
  const { data, loading } = useApiData('/api/flow/hourly?hours=24', 5 * 60_000);

  const counts = data?.rows ? countEmergencyVehicles(data.rows) : {};
  const total  = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-baseline justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Emergency Vehicles</h2>
        <span className="text-xs text-gray-400">Last 24 hours</span>
      </div>

      <div className="p-6">
        <div className="space-y-3 mb-5">
          {EMERGENCY_CLASSES.map(({ cls, label, icon, color, bg }) => {
            const count = counts[cls] ?? 0;
            return (
              <div key={cls} className={`flex items-center gap-4 rounded-xl px-4 py-3 ${bg}`}>
                <span className="text-2xl">{icon}</span>
                <div className="flex-1">
                  <p className={`font-semibold text-sm ${color}`}>{label}</p>
                </div>
                <div className={`text-2xl font-bold tabular-nums ${count > 0 ? color : 'text-gray-300'}`}>
                  {count}
                </div>
              </div>
            );
          })}
        </div>

        {/* Custom training notice */}
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
          <div className="flex gap-2">
            <span className="text-amber-500 shrink-0">⚠</span>
            <div>
              <p className="text-xs font-semibold text-amber-700">Custom training required</p>
              <p className="text-xs text-amber-600 mt-0.5">
                Emergency vehicle detection requires fine-tuning YOLOv8 on BC
                highway imagery. Standard COCO weights do not distinguish emergency
                vehicles from regular cars and trucks.
              </p>
            </div>
          </div>
        </div>

        {total > 0 && (
          <p className="text-center text-xs text-gray-400 mt-4">
            {total} emergency vehicle{total !== 1 ? 's' : ''} counted today
          </p>
        )}
      </div>
    </div>
  );
}
