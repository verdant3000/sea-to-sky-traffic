import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [49.95, -123.08];
const DEFAULT_ZOOM   = 10;

const STATUS_COLOR = {
  free:      '#22c55e',
  degraded:  '#f59e0b',
  congested: '#ef4444',
  no_data:   '#9ca3af',
};

const STATUS_RANK = { congested: 3, degraded: 2, free: 1, no_data: 0 };

function worstStatus(directions = []) {
  return directions.reduce(
    (worst, d) => STATUS_RANK[d.flow_status] > STATUS_RANK[worst] ? d.flow_status : worst,
    'no_data'
  );
}

function pin(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:${color};border:2.5px solid white;
      box-shadow:0 1px 6px rgba(0,0,0,0.4);
    "></div>`,
    iconSize:    [14, 14],
    iconAnchor:  [7, 7],
    popupAnchor: [0, -11],
  });
}

export default function LiveMapIndex({ stations = [], liveData, onStationClick }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markersRef   = useRef({});

  // Build station_id → directions lookup from liveData
  const liveMap = Object.fromEntries(
    (liveData?.stations ?? []).map(s => [s.station_id, s.directions])
  );

  useEffect(() => {
    const map = L.map(containerRef.current, { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove stale markers
    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};

    const points = [];

    for (const station of stations) {
      if (station.lat == null || station.lng == null || !station.active) continue;
      const lat  = Number(station.lat);
      const lng  = Number(station.lng);
      const dirs = liveMap[station.station_id] ?? [];
      const status = worstStatus(dirs);
      const color  = STATUS_COLOR[status];

      const speedInfo = dirs.map(d => d.avg_speed_kmh ? `${d.direction}: ${d.avg_speed_kmh} km/h` : null)
        .filter(Boolean).join('<br/>');

      const marker = L.marker([lat, lng], { icon: pin(color) })
        .addTo(map)
        .bindPopup(
          `<strong style="font-size:13px">${station.name}</strong>` +
          (station.location ? `<br/><span style="color:#6b7280;font-size:11px">${station.location}</span>` : '') +
          (speedInfo ? `<br/><span style="color:#6b7280;font-size:11px">${speedInfo}</span>` : '') +
          `<br/><a href="/station/${station.station_id}" style="font-size:11px;color:#2563eb">View station →</a>`
        );

      marker.on('click', () => onStationClick?.(station.station_id));
      markersRef.current[station.station_id] = marker;
      points.push([lat, lng]);
    }

    if (points.length === 1) map.setView(points[0], Math.max(map.getZoom(), 13));
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points).pad(0.25));
  }, [stations, liveData]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />;
}
