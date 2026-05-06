import { useApiData } from '../hooks/useData';

const STATUS_STYLE = {
  'Corridor filling':  { color: '#2563eb', icon: '↑', bg: 'bg-blue-50',   text: 'text-blue-700'  },
  'Corridor emptying': { color: '#ea580c', icon: '↓', bg: 'bg-orange-50', text: 'text-orange-700'},
  'Balanced flow':     { color: '#16a34a', icon: '⇄', bg: 'bg-green-50',  text: 'text-green-700' },
};

export default function FlowRatio() {
  const { data, loading, lastUpdated } = useApiData('/api/flow/ratio', 30_000);

  const cur = data?.current;
  const style = cur ? (STATUS_STYLE[cur.status] ?? STATUS_STYLE['Balanced flow']) : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Direction Ratio</h2>
        <span className="text-xs text-gray-400">
          {lastUpdated && !loading ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading…'}
        </span>
      </div>

      <div className="p-6">
        {(loading && !data) && (
          <div className="space-y-4">
            <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
            <div className="h-6 w-48 bg-gray-100 rounded animate-pulse mx-auto" />
          </div>
        )}

        {!loading && !cur?.northbound && !cur?.southbound && (
          <div className="flex flex-col items-center justify-center h-28 text-gray-400 gap-2">
            <p className="text-sm">Ratio appears once traffic is detected</p>
          </div>
        )}

        {cur && (cur.northbound > 0 || cur.southbound > 0) && (
          <div className="space-y-5">
            {/* Split bar */}
            <div className="flex rounded-xl overflow-hidden h-10 text-white text-sm font-semibold">
              <div
                className="flex items-center justify-center transition-all duration-700 bg-blue-600"
                style={{ width: `${cur.northbound_pct}%` }}
              >
                {cur.northbound_pct >= 20 && `↑ ${cur.northbound_pct}%`}
              </div>
              <div
                className="flex items-center justify-center transition-all duration-700 bg-orange-500"
                style={{ width: `${cur.southbound_pct}%` }}
              >
                {cur.southbound_pct >= 20 && `${cur.southbound_pct}% ↓`}
              </div>
            </div>

            {/* Labels */}
            <div className="flex justify-between text-xs text-gray-500">
              <span>
                <span className="font-semibold text-blue-700">{cur.northbound}</span> northbound
              </span>
              <span>
                <span className="font-semibold text-orange-600">{cur.southbound}</span> southbound
              </span>
            </div>

            {/* Status badge */}
            {style && (
              <div className={`flex items-center justify-center gap-2 rounded-xl py-3 ${style.bg}`}>
                <span className="text-xl">{style.icon}</span>
                <span className={`font-semibold text-sm ${style.text}`}>{cur.status}</span>
                {cur.ratio && (
                  <span className="text-xs text-gray-400 ml-1">· {cur.ratio}:1 ratio</span>
                )}
              </div>
            )}

            <p className="text-center text-xs text-gray-400">Last 15 minutes</p>
          </div>
        )}
      </div>
    </div>
  );
}
