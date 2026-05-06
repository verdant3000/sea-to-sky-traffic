import { useApiData } from '../hooks/useData';

// Detectable NOW with standard yolov8n.pt
const COCO_META = {
  car:        { label: 'Cars',        color: '#2563eb', bg: '#eff6ff' },
  truck:      { label: 'Trucks',      color: '#d97706', bg: '#fffbeb' },
  bus:        { label: 'Buses',       color: '#7c3aed', bg: '#f5f3ff' },
  motorcycle: { label: 'Motorcycles', color: '#059669', bg: '#ecfdf5' },
  bicycle:    { label: 'Bicycles',    color: '#0891b2', bg: '#ecfeff' },
};

// Requires custom YOLOv8 training — grouped for "coming soon" section
const CUSTOM_CLASSES = [
  { cls: 'pickup_truck',  label: 'Pickup Trucks' },
  { cls: 'suv',           label: 'SUVs'          },
  { cls: 'minivan',       label: 'Minivans'      },
  { cls: 'semi_truck',    label: 'Semi Trucks'   },
  { cls: 'logging_truck', label: 'Logging Trucks'},
  { cls: 'box_truck',     label: 'Box Trucks'    },
  { cls: 'overland_rig',  label: 'Overland Rigs' },
  { cls: 'convertible',   label: 'Convertibles'  },
  { cls: 'tow_truck',     label: 'Tow Trucks'    },
  { cls: 'ambulance',     label: 'Ambulances'    },
  { cls: 'fire_truck',    label: 'Fire Trucks'   },
  { cls: 'police_vehicle',label: 'Police'        },
];

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
      .map(([cls, count]) => ({ cls, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }))
      .sort((a, b) => b.count - a.count),
  };
}

export default function VehicleMix() {
  const { data, loading } = useApiData('/api/flow/hourly?hours=24', 5 * 60_000);

  const { items, total } = data?.rows ? processVehicleMix(data.rows) : { items: [], total: 0 };

  // Split into COCO (have data) vs custom (coming soon)
  const cocoItems   = items.filter(d => COCO_META[d.cls]);
  const customItems = items.filter(d => !COCO_META[d.cls]); // if custom model runs

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

        {!loading && items.length === 0 && cocoItems.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-2">
            <span className="text-4xl">🚗</span>
            <p className="text-sm">Vehicle breakdown appears after first detections</p>
          </div>
        )}

        {/* COCO-detectable classes */}
        {cocoItems.length > 0 && (
          <div className="space-y-3.5 mb-5">
            {cocoItems.map(({ cls, count, pct }) => {
              const meta = COCO_META[cls];
              return (
                <div key={cls} className="flex items-center gap-3">
                  <div className="w-24 shrink-0">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
                      style={{ backgroundColor: meta.bg, color: meta.color }}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, backgroundColor: meta.color }} />
                  </div>
                  <div className="w-20 text-right shrink-0">
                    <span className="text-sm font-semibold text-gray-800 tabular-nums">{count.toLocaleString()}</span>
                    <span className="text-xs text-gray-400 ml-1">({pct}%)</span>
                  </div>
                </div>
              );
            })}
            <div className="pt-2 border-t border-gray-100 text-xs text-gray-400 text-right tabular-nums">
              {total.toLocaleString()} total · standard COCO detection
            </div>
          </div>
        )}

        {/* Custom-training classes — always shown as "coming soon" */}
        <div className="rounded-xl border border-dashed border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Custom training required
            </span>
            <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full">
              In development
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CUSTOM_CLASSES.map(({ cls, label }) => {
              const liveCount = customItems.find(i => i.cls === cls)?.count;
              return (
                <span key={cls}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-gray-50 text-gray-400 border border-gray-100">
                  {label}
                  {liveCount ? (
                    <span className="font-semibold text-gray-600">{liveCount}</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </span>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Fine-tuned model on BC highway imagery will distinguish these classes.
            Logging trucks, semi trucks, and RVs are high-value for RMOW + MoT analysis.
          </p>
        </div>
      </div>
    </div>
  );
}
