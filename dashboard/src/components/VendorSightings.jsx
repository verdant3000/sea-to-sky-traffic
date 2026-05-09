import { useApiData } from '../hooks/useData';

export default function VendorSightings({ stationId }) {
  const { data, loading } = useApiData(
    `/api/vendor-sightings?station_id=${stationId}&days=1`,
    60_000
  );

  const sightings = data?.sightings ?? [];

  if (loading && !data) return null;
  if (!sightings.length) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">Vendor Sightings</h2>
        <p className="text-xs text-slate-400">Today at this station</p>
      </div>
      <div className="divide-y divide-slate-50">
        {sightings.map(s => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700">{s.vendor_name}</p>
              <p className="text-xs text-slate-400 capitalize">{s.direction}</p>
            </div>
            <span className="text-xs text-slate-400 tabular-nums shrink-0">
              {new Date(s.timestamp).toLocaleTimeString('en-CA', {
                hour: 'numeric', minute: '2-digit', timeZone: 'America/Vancouver',
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
