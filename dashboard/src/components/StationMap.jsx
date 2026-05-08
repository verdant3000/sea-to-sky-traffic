import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Hwy 99 corridor default view
const DEFAULT_CENTER = [49.95, -123.08];
const DEFAULT_ZOOM   = 10;

// divIcon avoids the Vite/webpack marker-image path issue entirely
function pin(color, size = 14) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:2.5px solid white;
      box-shadow:0 1px 5px rgba(0,0,0,0.35);
    "></div>`,
    iconSize:    [size, size],
    iconAnchor:  [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

const BLUE   = '#3b82f6';
const GREY   = '#9ca3af';
const RED    = '#ef4444';

// ── Component ──────────────────────────────────────────────────────────────────

export default function StationMap({ stations = [], interactive = false, onMapClick, pendingLatLng }) {
  const containerRef   = useRef(null);
  const mapRef         = useRef(null);
  const stationMarkers = useRef([]);
  const pendingMarker  = useRef(null);

  // ── Init map once ────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom:   DEFAULT_ZOOM,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Station pins ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    stationMarkers.current.forEach(m => m.remove());
    stationMarkers.current = [];

    const points = [];

    stations.forEach(s => {
      if (s.lat == null || s.lng == null) return;
      const lat = Number(s.lat), lng = Number(s.lng);
      const marker = L.marker([lat, lng], { icon: pin(s.active ? BLUE : GREY) })
        .addTo(map)
        .bindPopup(
          `<strong style="font-size:13px">${s.name}</strong>` +
          (s.location ? `<br/><span style="color:#6b7280;font-size:11px">${s.location}</span>` : '')
        );
      stationMarkers.current.push(marker);
      points.push([lat, lng]);
    });

    if (points.length === 1) {
      map.setView(points[0], Math.max(map.getZoom(), 12));
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points).pad(0.2));
    }
  }, [stations]);

  // ── Pending pin (new station preview) ────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!pendingLatLng || pendingLatLng.lat == null || pendingLatLng.lng == null) {
      pendingMarker.current?.remove();
      pendingMarker.current = null;
      return;
    }

    const { lat, lng } = pendingLatLng;
    if (pendingMarker.current) {
      pendingMarker.current.setLatLng([lat, lng]);
    } else {
      pendingMarker.current = L.marker([lat, lng], { icon: pin(RED, 16) }).addTo(map);
    }
  }, [pendingLatLng]);

  // Remove pending pin when interactive mode turns off
  useEffect(() => {
    if (!interactive) {
      pendingMarker.current?.remove();
      pendingMarker.current = null;
    }
  }, [interactive]);

  // ── Map click handler ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !interactive) return;

    const handler = (e) => {
      onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    };

    map.on('click', handler);
    return () => map.off('click', handler);
  }, [interactive, onMapClick]);

  return (
    <div
      ref={containerRef}
      className={interactive ? 'cursor-crosshair' : ''}
      style={{ height: '100%', width: '100%' }}
    />
  );
}
