import { useState, useCallback } from 'react';
import { useApiData } from '../hooks/useData';

const API = import.meta.env.VITE_API_URL || 'https://sea-to-sky-traffic-production.up.railway.app';

function LogModal({ vendor, stations, onClose }) {
  const [direction, setDirection] = useState(null);
  const [stationId, setStationId] = useState('');
  const [saving,    setSaving]    = useState(false);
  const [done,      setDone]      = useState(false);

  const submit = async () => {
    if (!direction) return;
    setSaving(true);
    try {
      await fetch(`${API}/api/vendor-sightings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_id:  vendor.id,
          station_id: stationId ? parseInt(stationId) : null,
          direction,
        }),
      });
      setDone(true);
      setTimeout(() => onClose(true), 800);
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full sm:max-w-sm p-5 shadow-2xl">
        {done ? (
          <div className="text-center py-4">
            <p className="text-2xl mb-1">✓</p>
            <p className="font-semibold text-slate-700">Sighting logged</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: vendor.color }} />
              <h3 className="font-semibold text-slate-800">{vendor.name}</h3>
            </div>

            <p className="text-xs font-medium text-slate-500 mb-2">Direction</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {[['northbound', '↑ Northbound', 'bg-blue-600'], ['southbound', '↓ Southbound', 'bg-orange-500']].map(
                ([dir, label, activeCls]) => (
                  <button
                    key={dir}
                    onClick={() => setDirection(dir)}
                    className={`py-3 rounded-xl text-sm font-medium transition-colors ${
                      direction === dir ? `${activeCls} text-white` : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                )
              )}
            </div>

            <p className="text-xs font-medium text-slate-500 mb-2">Station (optional)</p>
            <select
              value={stationId}
              onChange={e => setStationId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mb-5 bg-white"
            >
              <option value="">Not specified</option>
              {stations.map(s => (
                <option key={s.station_id} value={s.station_id}>{s.name}</option>
              ))}
            </select>

            <div className="flex gap-2">
              <button
                onClick={() => onClose(false)}
                className="flex-1 py-2.5 text-sm text-slate-500 hover:text-slate-700 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!direction || saving}
                className="flex-1 py-2.5 text-sm font-semibold bg-slate-900 text-white rounded-xl disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Log sighting'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function VendorCounter() {
  const { data: vendorsData,  refresh: refreshSightings } = useApiData('/api/vendors', 120_000);
  const { data: sightingsData }                           = useApiData('/api/vendor-sightings?days=7', 60_000);
  const { data: stationsData }                            = useApiData('/api/stations', 120_000);

  const [activeVendor, setActiveVendor] = useState(null);

  const summary = Object.fromEntries(
    (sightingsData?.summary ?? []).map(s => [s.vendor_id, s])
  );

  const vendors   = vendorsData  ?? [];
  const stations  = stationsData ?? [];

  const handleClose = useCallback((logged) => {
    setActiveVendor(null);
    if (logged) refreshSightings();
  }, [refreshSightings]);

  if (!vendors.length) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-800">Vendor Counter</h2>
          <p className="text-xs text-slate-400">Tap to log a sighting</p>
        </div>
        <div className="flex gap-4 text-xs text-slate-400 font-medium">
          <span>Today</span>
          <span>Week</span>
        </div>
      </div>

      <div className="divide-y divide-slate-50">
        {vendors.map(vendor => {
          const s = summary[vendor.id];
          return (
            <button
              key={vendor.id}
              onClick={() => setActiveVendor(vendor)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: vendor.color }} />
              <span className="flex-1 text-sm font-medium text-slate-700">{vendor.name}</span>
              <div className="flex gap-6 text-right">
                <span className="w-8 text-sm font-bold tabular-nums text-slate-800">
                  {s?.today ?? 0}
                </span>
                <span className="w-8 text-sm tabular-nums text-slate-400">
                  {s?.this_week ?? 0}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {activeVendor && (
        <LogModal vendor={activeVendor} stations={stations} onClose={handleClose} />
      )}
    </div>
  );
}
