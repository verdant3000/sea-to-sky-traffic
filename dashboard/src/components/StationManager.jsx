import { useState, useEffect, useCallback, useMemo } from 'react';
import StationMap from './StationMap';

const API_BASE = import.meta.env.VITE_API_URL || 'https://sea-to-sky-traffic-production.up.railway.app';

const EMPTY_FORM = { name: '', location: '', lat: '', lng: '' };

function getStoredKey() { return localStorage.getItem('sts_api_key') || ''; }
function saveStoredKey(k) { localStorage.setItem('sts_api_key', k); }

// ── API key ────────────────────────────────────────────────────────────────────

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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
        <h3 className="font-semibold text-slate-800 mb-3">API Key</h3>
        <input
          type="password"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSave(val.trim())}
          placeholder="Paste API key…"
          className="w-full border border-slate-200 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
          autoFocus
        />
        <div className="flex gap-2 mt-4 justify-end">
          <button onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5">Cancel</button>
          <button onClick={() => onSave(val.trim())}
            className="text-sm font-medium bg-blue-600 text-white rounded px-4 py-1.5 hover:bg-blue-700">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add station form ───────────────────────────────────────────────────────────

function AddStationForm({ form, onChange, onSubmit, onCancel, saving, error }) {
  const set = (field) => (e) => onChange({ ...form, [field]: e.target.value });
  const hasCoords = form.lat !== '' && form.lng !== '';

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <h3 className="font-semibold text-slate-700">Add Station</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          {hasCoords
            ? `Pin at ${Number(form.lat).toFixed(5)}, ${Number(form.lng).toFixed(5)}`
            : 'Click the map to place a pin, or type coordinates below'}
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Name <span className="text-red-400">*</span>
          </label>
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

// ── Edit station form ──────────────────────────────────────────────────────────

function EditStationForm({ form, original, onChange, onSubmit, onCancel, saving, error }) {
  const set     = (field) => (e) => onChange({ ...form, [field]: e.target.value });
  const setBool = (field) => (e) => onChange({ ...form, [field]: e.target.checked });
  const hasCoords = form.lat !== '' && form.lng !== '';

  return (
    <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <h3 className="font-semibold text-slate-700">Edit Station #{original.station_id}</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          {hasCoords
            ? `Pin at ${Number(form.lat).toFixed(5)}, ${Number(form.lng).toFixed(5)}`
            : 'Click the map to place a pin, or type coordinates below'}
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Name <span className="text-red-400">*</span>
          </label>
          <input value={form.name} onChange={set('name')}
            className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>

        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-medium text-slate-500 mb-1">Location</label>
          <input value={form.location} onChange={set('location')}
            className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Direction A</label>
          <input value={form.direction_a} onChange={set('direction_a')} placeholder="northbound"
            className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Direction B</label>
          <input value={form.direction_b} onChange={set('direction_b')} placeholder="southbound"
            className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Latitude</label>
          <input value={form.lat} onChange={set('lat')} type="number" step="any"
            className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Longitude</label>
          <input value={form.lng} onChange={set('lng')} type="number" step="any"
            className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>

        <div className="col-span-2">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={setBool('active')}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-400" />
            <span className="text-sm text-slate-700">Active</span>
          </label>
        </div>

        {error && <p className="col-span-2 text-sm text-red-500">{error}</p>}

        <div className="col-span-2 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="text-sm font-medium bg-blue-600 text-white rounded px-5 py-2 hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Station table ──────────────────────────────────────────────────────────────

function StationRow({ station, onToggle, onEdit, editDisabled }) {
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
      <td className="py-3 px-4 text-sm text-slate-600">
        {station.location || <span className="text-slate-300">—</span>}
      </td>
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
      <td className="py-3 px-4 text-right">
        <button
          onClick={() => onEdit(station)}
          disabled={editDisabled}
          className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Edit
        </button>
      </td>
    </tr>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function StationManager() {
  const [stations,      setStations]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [fetchError,    setFetchError]    = useState(null);
  const [apiKey,        setApiKey]        = useState(getStoredKey);
  const [showKeyModal,  setShowKeyModal]  = useState(false);
  const [showAddForm,   setShowAddForm]   = useState(false);
  const [form,          setForm]          = useState(EMPTY_FORM);
  const [saving,        setSaving]        = useState(false);
  const [saveError,     setSaveError]     = useState(null);
  const [editingId,     setEditingId]     = useState(null);
  const [editForm,      setEditForm]      = useState(null);
  const [editOriginal,  setEditOriginal]  = useState(null);
  const [editSaving,    setEditSaving]    = useState(false);
  const [editError,     setEditError]     = useState(null);

  // Derive pendingLatLng for the map: prefer editing target, fall back to add form
  const pendingLatLng = useMemo(() => {
    if (editingId != null && editForm) {
      const lat = parseFloat(editForm.lat);
      const lng = parseFloat(editForm.lng);
      if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
      return null;
    }
    if (!showAddForm) return null;
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
  }, [showAddForm, form.lat, form.lng, editingId, editForm]);

  const fetchStations = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${API_BASE}/api/stations?all=true`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStations(await res.json());
    } catch (e) {
      setFetchError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStations(); }, [fetchStations]);

  // Map click → fill whichever form is currently open
  const handleMapClick = useCallback(({ lat, lng }) => {
    if (editingId != null) {
      setEditForm(f => f && { ...f, lat: lat.toFixed(6), lng: lng.toFixed(6) });
    } else {
      setForm(f => ({ ...f, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
    }
  }, [editingId]);

  const beginEdit = (station) => {
    if (showAddForm) { setShowAddForm(false); setForm(EMPTY_FORM); }
    setEditingId(station.station_id);
    setEditOriginal(station);
    setEditForm({
      name:        station.name ?? '',
      location:    station.location ?? '',
      lat:         station.lat != null ? String(station.lat) : '',
      lng:         station.lng != null ? String(station.lng) : '',
      direction_a: station.direction_a ?? '',
      direction_b: station.direction_b ?? '',
      active:      !!station.active,
    });
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
    setEditOriginal(null);
    setEditError(null);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editForm.name.trim()) { setEditError('Name is required'); return; }

    const orig = editOriginal;
    const f    = editForm;
    const patch = {};
    if (f.name.trim() !== orig.name) patch.name = f.name.trim();
    if ((f.location.trim() || null) !== (orig.location ?? null))
      patch.location = f.location.trim() || null;
    if ((f.direction_a.trim() || null) !== (orig.direction_a ?? null))
      patch.direction_a = f.direction_a.trim() || null;
    if ((f.direction_b.trim() || null) !== (orig.direction_b ?? null))
      patch.direction_b = f.direction_b.trim() || null;

    const latNum  = f.lat === '' ? null : parseFloat(f.lat);
    const lngNum  = f.lng === '' ? null : parseFloat(f.lng);
    const origLat = orig.lat != null ? Number(orig.lat) : null;
    const origLng = orig.lng != null ? Number(orig.lng) : null;
    if (latNum !== origLat) patch.lat = latNum;
    if (lngNum !== origLng) patch.lng = lngNum;
    if (f.active !== orig.active) patch.active = f.active;

    if (Object.keys(patch).length === 0) { cancelEdit(); return; }

    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`${API_BASE}/api/stations/${editingId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
        body:    JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const updated = await res.json();
      setStations(prev => prev.map(s => s.station_id === updated.station_id ? updated : s));
      cancelEdit();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  };

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setSaveError('Name is required'); return; }
    console.log('[StationManager] apiKey from localStorage:', JSON.stringify(apiKey));
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`${API_BASE}/api/stations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
        body: JSON.stringify({
          name:     form.name.trim(),
          location: form.location.trim() || null,
          lat:      form.lat !== '' ? parseFloat(form.lat) : null,
          lng:      form.lng !== '' ? parseFloat(form.lng) : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const newStation = await res.json();
      setStations(prev => [...prev, newStation]);
      setForm(EMPTY_FORM);
      setShowAddForm(false);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelForm = () => {
    setShowAddForm(false);
    setForm(EMPTY_FORM);
    setSaveError(null);
  };

  const handleSaveKey = (key) => {
    setApiKey(key);
    saveStoredKey(key);
    setShowKeyModal(false);
  };

  return (
    <div className="space-y-5">

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <ApiKeyBanner apiKey={apiKey} onEdit={() => setShowKeyModal(true)} />
        <button
          onClick={() => {
            if (editingId != null) cancelEdit();
            setShowAddForm(v => !v);
            if (showAddForm) setForm(EMPTY_FORM);
          }}
          className="text-sm font-medium bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700"
        >
          {showAddForm ? '✕ Cancel' : '+ Add Station'}
        </button>
      </div>

      {/* Map — always shown; interactive when add form is open */}
      <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm"
           style={{ height: 380 }}>
        <StationMap
          stations={stations}
          interactive={showAddForm || editingId != null}
          onMapClick={handleMapClick}
          pendingLatLng={pendingLatLng}
        />
      </div>

      {/* Add form — below map */}
      {showAddForm && (
        <AddStationForm
          form={form}
          onChange={setForm}
          onSubmit={handleSubmit}
          onCancel={handleCancelForm}
          saving={saving}
          error={saveError}
        />
      )}

      {/* Station table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">Station</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">Location</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">Lat / Lng</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">Status</th>
              <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-12 text-center text-sm text-slate-400">Loading…</td></tr>
            ) : fetchError ? (
              <tr><td colSpan={5} className="py-12 text-center text-sm text-red-400">Error: {fetchError}</td></tr>
            ) : stations.length === 0 ? (
              <tr><td colSpan={5} className="py-12 text-center text-sm text-slate-400">No stations yet</td></tr>
            ) : (
              stations.flatMap(s => {
                const row = (
                  <StationRow
                    key={s.station_id}
                    station={s}
                    onToggle={handleToggle}
                    onEdit={beginEdit}
                    editDisabled={editingId != null && editingId !== s.station_id}
                  />
                );
                if (editingId !== s.station_id) return [row];
                return [
                  row,
                  <tr key={`${s.station_id}-edit`} className="bg-slate-50 border-t border-slate-100">
                    <td colSpan={5} className="py-4 px-4">
                      <EditStationForm
                        form={editForm}
                        original={editOriginal}
                        onChange={setEditForm}
                        onSubmit={handleEditSubmit}
                        onCancel={cancelEdit}
                        saving={editSaving}
                        error={editError}
                      />
                    </td>
                  </tr>,
                ];
              })
            )}
          </tbody>
        </table>
      </div>

      {showKeyModal && (
        <ApiKeyModal current={apiKey} onSave={handleSaveKey} onCancel={() => setShowKeyModal(false)} />
      )}
    </div>
  );
}
