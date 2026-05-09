import { useApiData } from '../hooks/useData';

const SEVERITY_CFG = {
  critical: { bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-700',    dot: 'bg-red-500'    },
  warning:  { bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-700',  dot: 'bg-amber-400'  },
  info:     { bg: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-700',   dot: 'bg-blue-400'   },
};

const TYPE_LABEL = {
  volume_surge:      'Volume surge',
  speed_drop:        'Speed drop',
  event_correlation: 'Event',
};

export default function ActiveAlerts() {
  const { data: alerts, loading } = useApiData('/api/alerts', 30_000);

  const active   = (alerts ?? []).filter(a => !a.resolved_at);
  const resolved = (alerts ?? []).filter(a =>  a.resolved_at);

  if (loading && !alerts) return null;

  if (!active.length && !resolved.length) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-4 flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
        <div>
          <p className="text-sm font-medium text-slate-700">All clear</p>
          <p className="text-xs text-slate-400">No active traffic alerts</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {active.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">
            Active Alerts
          </span>
        </div>
      )}

      {active.map(alert => {
        const cfg = SEVERITY_CFG[alert.severity] ?? SEVERITY_CFG.info;
        return (
          <div key={alert.alert_id} className={`rounded-xl border p-3 ${cfg.bg} ${cfg.border}`}>
            <div className="flex items-start gap-2">
              <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${cfg.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-semibold ${cfg.text}`}>
                    {TYPE_LABEL[alert.alert_type] ?? alert.alert_type}
                  </span>
                  {alert.station_name && (
                    <span className="text-xs text-slate-500">· {alert.station_name}</span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  {alert.direction && `${alert.direction} · `}
                  {alert.vehicle_count != null && `${alert.vehicle_count} vehicles`}
                  {alert.avg_speed_kmh != null && ` · ${alert.avg_speed_kmh} km/h avg`}
                  {alert.notes && ` · ${alert.notes}`}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {new Date(alert.triggered_at).toLocaleTimeString('en-CA', {
                    hour: 'numeric', minute: '2-digit', timeZone: 'America/Vancouver',
                  })}
                </p>
              </div>
            </div>
          </div>
        );
      })}

      {resolved.length > 0 && (
        <details className="text-xs text-slate-400 px-1">
          <summary className="cursor-pointer hover:text-slate-600">
            {resolved.length} resolved in last 24 h
          </summary>
          <div className="mt-1 space-y-1">
            {resolved.map(alert => (
              <div key={alert.alert_id} className="bg-slate-50 rounded-lg border border-slate-100 px-3 py-2 text-xs text-slate-500">
                {TYPE_LABEL[alert.alert_type] ?? alert.alert_type}
                {alert.station_name && ` · ${alert.station_name}`}
                <span className="text-slate-400"> · resolved</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
