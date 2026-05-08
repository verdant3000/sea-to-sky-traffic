import { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://sea-to-sky-traffic-production.up.railway.app';

// ── API key helpers ────────────────────────────────────────────────────────────

function getStoredKey() { return localStorage.getItem('sts_api_key') || ''; }
function saveStoredKey(k) { localStorage.setItem('sts_api_key', k); }

// ── Sub-components ─────────────────────────────────────────────────────────────

function ApiKeyBanner({ apiKey, onEdit }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <span className={apiKey ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>
        {apiKey ? '● API key set' : '● No API key'}
      </span>
      <button onClick={onEdit} className="underline hover:text-slate-700">
        {apiKey ? 'change' : 'set key'}
      </button>
      {!apiKey && <span className="text-slate-400">(required to add or toggle stations)</span>}
    </div>
  );
}

function ApiKeyModal({ current, onSave, onCancel }) {
  const [val, setVal] = useState(current);
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
        <h3 className="font-semibold text-slate-800 mb-3">API Key</h3>
        <input
          type="password"
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder="Paste API key…"
          className="w-full border border-slate-200 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
          autoFocus
        />
        <div className="flex gap-2 mt-4 justify-end">
          <button onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5">
            Cancel
          </button>
          <button
            onClick={() => onSave(val.trim())}
            className="text-sm font-medium bg-blue-600 text-white rounded px-4 py-1.5 hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function AddStationForm({ onSave, onCancel, apiKey }) {
  const [form, setForm]     = useState({ name: '', location: '', lat: '', lng: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/stations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
        body: JSON.stringify({
          name:     form.name.trim(),
          location: form.location.trim() || null,
          lat:      form.lat ? parseFloat(form.lat) : null,
          lng:      form.lng ? parseFloat(form.lng) : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const station = await res.json();
      onSave(station);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
      <h3 className="font-semibold text-slate-700 mb-4">Add Station</h3>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-medium text-slate-500 mb-1">Name <span className="text-red-400">*</span></label>
          <input value={form.name} onChange={set('name')} placeholder="e.g. Squamish North"
            className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-medium text-slate-500 mb-1">Location</label>
          <input value={form.location} onChange={set('location')} placeholder="e.g. Hwy 99 km 45"
            className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Latitude</label>
          <input value={form.lat} onChange={set('lat')} placeholder="49.7016"
            type="number" step="any"
            className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Longitude</label>
          <input value={form.lng} onChange={set('lng')} placeholder="-123.1558"
            type="number" step="any"
            className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        {error && <p className="col-span-2 text-sm text-red-500">{error}</p>}
        <div className="col-span-2 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="text-sm font-medium bg-blue-600 text-white rounded px-5 py-2 hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Station'}
          </button>
        </div>
      </form>
    </div>
  );
}

function StationRow({ station, onToggle }) {
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    setToggling(true);
    await onToggle(station);
    setToggling(false);
  };

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50">
      <td className="py-3 px-4">
        <div className="font-medium text-slate-800 text-sm">{station.name}</div>
        <div className="text-xs text-slate-400"># {station.station_id}</div>
      </td>
      <td className="py-3 px-4 text-sm text-slate-600">{station.location || <span className="text-slate-300">—</span>}</td>
      <td className="py-3 px-4 text-sm text-slate-500 tabular-nums">
        {station.lat != null && station.lng != null
          ? `${Number(station.lat).toFixed(4)}, ${Number(station.lng).toFixed(4)}`
          : <span className="text-slate-300">—</span>}
      </td>
      <td className="py-3 px-4">
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 transition-colors
            ${station.active
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            } disabled:opacity-50`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${station.active ? 'bg-green-500' : 'bg-slate-400'}`} />
          {toggling ? '…' : station.active ? 'Active' : 'Inactive'}
        </button>
      </td>
    </tr>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function StationManager() {
  const [stations,    setStations]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [apiKey,      setApiKey]      = useState(getStoredKey);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showAddForm,  setShowAddForm]  = useState(false);

  const fetchStations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/stations?all=true`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStations(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStations(); }, [fetchStations]);

  const handleToggle = async (station) => {
    try {
      const res = await fetch(`${API_BASE}/api/stations/${station.station_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
        body: JSON.stringify({ active: !station.active }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const updated = await res.json();
      setStations(prev => prev.map(s => s.station_id === updated.station_id ? updated : s));
    } catch (e) {
      alert(`Could not update station: ${e.message}`);
    }
  };

  const handleSaveKey = (key) => {
    setApiKey(key);
    saveStoredKey(key);
    setShowKeyModal(false);
  };

  const handleStationAdded = (station) => {
    setStations(prev => [...prev, station]);
    setShowAddForm(false);
  };

  return (
    <div className="space-y-5">

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <ApiKeyBanner apiKey={apiKey} onEdit={() => setShowKeyModal(true)} />
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="text-sm font-medium bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700"
        >
          + Add Station
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <AddStationForm
          apiKey={apiKey}
          onSave={handleStationAdded}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">Station</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">Location</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">Lat / Lng</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="py-12 text-center text-sm text-slate-400">Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={4} className="py-12 text-center text-sm text-red-400">Error: {error}</td></tr>
            ) : stations.length === 0 ? (
              <tr><td colSpan={4} className="py-12 text-center text-sm text-slate-400">No stations yet</td></tr>
            ) : (
              stations.map(s => (
                <StationRow key={s.station_id} station={s} onToggle={handleToggle} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* API key modal */}
      {showKeyModal && (
        <ApiKeyModal current={apiKey} onSave={handleSaveKey} onCancel={() => setShowKeyModal(false)} />
      )}
    </div>
  );
}
