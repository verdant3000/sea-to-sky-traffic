import { useState } from 'react';
import { useApiData } from '../hooks/useData';

const DAYS  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function fmtHour(h) {
  if (h === 0)  return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function heatColor(count, max) {
  if (!count || max === 0) return '#f1f5f9';
  const t = Math.min(count / max, 1);
  // slate-100 → blue-800
  const r = Math.round(241 - (241 -  30) * t);
  const g = Math.round(245 - (245 -  64) * t);
  const b = Math.round(249 - (249 - 175) * t);
  return `rgb(${r},${g},${b})`;
}

function textColor(count, max) {
  if (!count || max === 0) return '#cbd5e1';
  return count / max > 0.55 ? '#fff' : '#1e40af';
}

export default function PatternHeatmap() {
  const { data, loading } = useApiData('/api/patterns', 60 * 60_000);
  const [tooltip, setTooltip] = useState(null);

  const heatmap = data?.heatmap ?? [];

  // Build [day][hour] lookup
  const grid = {};
  let maxCount = 0;
  for (const row of heatmap) {
    const d = Number(row.day_of_week);
    const h = Number(row.hour);
    const v = Number(row.avg_count);
    if (!grid[d]) grid[d] = {};
    grid[d][h] = { avg: v, days: Number(row.sample_days) };
    if (v > maxCount) maxCount = v;
  }

  const hasData      = heatmap.length > 0;
  const minSampleDays = 3;
  const dataIsEarly  = hasData && heatmap.every(r => Number(r.sample_days) < minSampleDays);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-baseline justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Weekly Pattern</h2>
        <span className="text-xs text-gray-400">Avg vehicles / hour · all time</span>
      </div>

      <div className="p-6">
        {(loading && !data) && (
          <div className="h-48 bg-gray-50 rounded-xl animate-pulse" />
        )}

        {!loading && !hasData && (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
            <span className="text-4xl">🗓️</span>
            <p className="text-sm">Pattern heatmap builds after 3+ days of data</p>
          </div>
        )}

        {hasData && (
          <>
            {dataIsEarly && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-4">
                Early data — patterns become reliable after 3+ days per slot
              </p>
            )}

            <div className="flex gap-1 select-none">
              {/* Day labels */}
              <div className="flex flex-col gap-px pt-5 pr-2 shrink-0">
                {DAYS.map(d => (
                  <div key={d} className="h-7 flex items-center text-xs text-gray-400 font-medium">
                    {d}
                  </div>
                ))}
              </div>

              <div className="flex-1 min-w-0">
                {/* Hour labels */}
                <div className="flex mb-1">
                  {HOURS.map(h => (
                    <div key={h} className="flex-1 text-center" style={{ fontSize: 9, color: '#94a3b8' }}>
                      {h % 4 === 0 ? fmtHour(h) : ''}
                    </div>
                  ))}
                </div>

                {/* Grid rows */}
                {DAYS.map((_, dayIdx) => (
                  <div key={dayIdx} className="flex gap-px mb-px">
                    {HOURS.map(hour => {
                      const cell  = grid[dayIdx]?.[hour];
                      const count = cell?.avg ?? 0;
                      const bg    = heatColor(count, maxCount);
                      const fg    = textColor(count, maxCount);
                      return (
                        <div
                          key={hour}
                          className="flex-1 h-7 rounded-sm flex items-center justify-center cursor-default transition-transform hover:scale-110 hover:z-10 hover:shadow-sm relative"
                          style={{ backgroundColor: bg }}
                          onMouseEnter={() => setTooltip({ day: dayIdx, hour, count, days: cell?.days })}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          {count > 0 && maxCount > 0 && count / maxCount > 0.35 && (
                            <span style={{ fontSize: 8, color: fg, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                              {Math.round(count)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Tooltip */}
            {tooltip && (
              <div className="mt-3 text-center text-xs text-gray-500 h-5">
                {tooltip.count > 0
                  ? `${DAYS[tooltip.day]} ${fmtHour(tooltip.hour)}–${fmtHour(tooltip.hour + 1)}: avg ${Math.round(tooltip.count)} vehicles/hr (${tooltip.days} sample days)`
                  : `${DAYS[tooltip.day]} ${fmtHour(tooltip.hour)}: no data yet`
                }
              </div>
            )}
            {!tooltip && <div className="mt-3 h-5" />}

            {/* Legend */}
            <div className="flex items-center justify-end gap-1.5 mt-2">
              <span className="text-xs text-gray-400">Less</span>
              {[0, 0.15, 0.3, 0.5, 0.7, 0.85, 1].map(t => (
                <div
                  key={t}
                  className="w-5 h-3 rounded-sm"
                  style={{ backgroundColor: heatColor(t * maxCount, maxCount) }}
                />
              ))}
              <span className="text-xs text-gray-400">More</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
