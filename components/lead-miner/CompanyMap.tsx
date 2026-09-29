'use client';

/**
 * Mapa da Tela_Ranking (Req. 13.1–13.8, 19.7). Leaflet puro, carregado apenas no cliente:
 * a página importa este módulo com `next/dynamic({ ssr: false })` e o próprio `leaflet` é
 * importado dinamicamente dentro do efeito, então nenhuma API de navegador é tocada no SSR.
 */
import React, { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPoint } from '@/lib/leads/client-api';
import { ODBL_TEXT, ODBL_URL } from '@/lib/leads/config';
import { MAP_LEGEND, markerColor, popupContent, truncationNotice } from './company-map-helpers';

export interface CompanyMapProps {
  points: MapPoint[];
  shown: number;
  total: number;
  loading?: boolean;
  className?: string;
}

/** Centro inicial (Brasil) antes do primeiro `fitBounds`. */
const INITIAL_CENTER: [number, number] = [-14.235, -51.9253];
const INITIAL_ZOOM = 4;

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = `<a href="${ODBL_URL}" target="_blank" rel="noopener noreferrer">${ODBL_TEXT}</a>`;

/** Popup montado com nós DOM e `textContent`: nada vindo do usuário vira HTML. */
function buildPopup(point: MapPoint): HTMLElement {
  const c = popupContent(point);
  const root = document.createElement('div');
  root.className = 'lead-miner-map-popup';
  root.style.minWidth = '180px';

  const title = document.createElement('p');
  title.style.fontWeight = '600';
  title.style.margin = '0 0 4px';
  title.textContent = c.nome;
  root.appendChild(title);

  const dl = document.createElement('dl');
  dl.style.margin = '0 0 6px';
  const rows: Array<[string, string]> = [
    ['Categoria', c.categoria],
    ['Score', c.score],
    ['Prioridade', c.prioridade],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    dt.style.display = 'inline';
    dt.style.fontWeight = '600';
    dt.textContent = `${label}: `;
    const dd = document.createElement('dd');
    dd.style.display = 'inline';
    dd.style.margin = '0';
    dd.textContent = value;
    row.appendChild(dt);
    row.appendChild(dd);
    dl.appendChild(row);
  }
  root.appendChild(dl);

  const link = document.createElement('a');
  link.href = c.href;
  link.textContent = 'Abrir ficha da empresa';
  link.setAttribute('aria-label', `Abrir ficha de ${c.nome}`);
  root.appendChild(link);
  return root;
}

const CompanyMap: React.FC<CompanyMapProps> = ({ points, shown, total, loading = false, className = '' }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);

  // Inicializa o mapa uma única vez.
  useEffect(() => {
    let cancelled = false;
    let map: Leaflet.Map | null = null;
    (async () => {
      const mod = await import('leaflet');
      const L = ((mod as unknown as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet;
      if (cancelled || !containerRef.current) return;
      map = L.map(containerRef.current, { center: INITIAL_CENTER, zoom: INITIAL_ZOOM, preferCanvas: true });
      const tiles = L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 });
      tiles.on('tileerror', () => setTileError(true));
      tiles.addTo(map);
      leafletRef.current = L;
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      setReady(true);
    })().catch(() => {
      if (!cancelled) setTileError(true);
    });
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      layerRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  // Redesenha os marcadores e ajusta a visão sempre que os pontos mudam.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;
    layer.clearLayers();
    if (points.length === 0) return;
    const latLngs: Leaflet.LatLngTuple[] = [];
    for (const p of points) {
      const color = markerColor(p.prioridade);
      const marker = L.circleMarker([p.latitude, p.longitude], {
        radius: 7,
        color: '#0f172a',
        weight: 1,
        fillColor: color,
        fillOpacity: 0.9,
      });
      marker.bindPopup(() => buildPopup(p));
      marker.addTo(layer);
      latLngs.push([p.latitude, p.longitude]);
    }
    map.fitBounds(L.latLngBounds(latLngs), { padding: [24, 24], maxZoom: 16 });
  }, [points, ready]);

  const notice = truncationNotice(shown, total);
  const empty = !loading && points.length === 0;

  return (
    <section
      aria-label="Mapa de empresas"
      className={`rounded-2xl border border-slate-800 bg-slate-950 p-4 text-slate-100 ${className}`}
    >
      {tileError && (
        <p role="alert" className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          Não foi possível carregar o mapa
        </p>
      )}
      {notice && (
        <p role="status" className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {notice}
        </p>
      )}
      {empty && (
        <p role="status" className="mb-3 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300">
          Não há empresas com localização para os filtros atuais.
        </p>
      )}
      {loading && (
        <p role="status" className="mb-3 text-sm text-slate-400">
          Carregando mapa…
        </p>
      )}

      <div
        ref={containerRef}
        className="h-[480px] w-full overflow-hidden rounded-xl border border-slate-800 text-slate-900"
      />

      <ul aria-label="Legenda do mapa" className="mt-3 flex flex-wrap gap-4 text-xs text-slate-300">
        {MAP_LEGEND.map((item) => (
          <li key={item.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-full border border-slate-900"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default CompanyMap;
