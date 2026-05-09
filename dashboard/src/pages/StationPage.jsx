import { useParams, useNavigate } from 'react-router-dom';
import { useApiData }    from '../hooks/useData';
import HourlyChart       from '../components/HourlyChart';
import VehicleMix        from '../components/VehicleMix';
import SpeedChart        from '../components/SpeedChart';
import StationHealth     from '../components/StationHealth';
import VendorSightings   from '../components/VendorSightings';

const STATUS_DOT   = { free: 'bg-green-500', degraded: 'bg-amber-400', congested: 'bg-red-500', no_data: 'bg-slate-300' };
const STATUS_COLOR = { free: 'text-green-600', degraded: 'text-amber-500', congested: 'text-red-500', no_data: 'text-slate-400' };

function LiveCounts({ stationId }) {
  const { data } = useApiData('/api/flow/live', 30_000);
  const station  = (data?.stations ?? []).find(s => s.station_id === stationId);

  return (
    <div className="grid grid-cols-2 gap-3">
      {['northbound', 'southbound'].map(dir => {
        const d = station?.directions?.find(x => x.direction === dir);
        return (
          <div key={dir} className="bg-white rounded-xl p-4 border border-slate-100">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`w-2 h-2 rounded-full shrink-0 ${d ? STATUS_DOT[d.flow_status] : 'bg-slate-200'}`} />
              <p className="text-xs text-slate-400 capitalize">{dir}</p>
            </div>
            <p className="text-3xl font-bold tabular-nums text-slate-800 leading-none mt-1">
              {d ? d.vehicles_per_hour : '—'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">veh / hr</p>
            {d?.avg_speed_kmh && (
              <p className={`text-xs font-medium mt-1.5 ${STATUS_COLOR[d.flow_status]}`}>
                {d.avg_speed_kmh} km/h
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function StationPage() {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const stationId   = parseInt(id);

  const { data: stationsData } = useApiData('/api/stations', 60_000);
  const station = (stationsData ?? []).find(s => s.station_id === stationId);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      <header style={{ backgroundColor: '#0f2b52' }} className="text-white shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-blue-300 hover:text-white text-sm transition-colors shrink-0"
          >
            ← Back
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight truncate">
              {station?.name ?? `Station ${stationId}`}
            </h1>
            {station?.location && (
              <p className="text-blue-400 text-xs truncate">{station.location}</p>
            )}
          </div>
        </div>
        <div className="h-0.5 flex">
          <div className="flex-1 bg-blue-500" />
          <div className="flex-1 bg-orange-500" />
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-5 space-y-4">

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Live · Last 15 min
          </p>
          <LiveCounts stationId={stationId} />
        </div>

        <HourlyChart stationId={stationId} />
        <VehicleMix  stationId={stationId} />
        <SpeedChart />

        <VendorSightings stationId={stationId} />

        <StationHealth stationId={stationId} />

      </main>

    </div>
  );
}
