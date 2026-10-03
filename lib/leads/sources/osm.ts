/**
 * Fonte_OSM: geocodificação (Nominatim) e busca por nicho (Overpass) — Req. 2.
 *
 * Todas as dependências de I/O são injetáveis (`OsmDeps`): cliente HTTP JSON, limitador
 * de taxa do Nominatim e `sleep` das retentativas. Nenhuma função aqui acessa a rede
 * diretamente.
 */
import {
  NOMINATIM_TIMEOUT_MS,
  OSM_USER_AGENT,
  OVERPASS_TIMEOUT_MS,
  RETRY_DELAYS_MS,
  type Niche,
} from '../config';
import { normalizeInstagram, normalizeWhatsapp } from '../signals';
import type { FoundCompany } from '../types';
import type { RateLimiter } from './rate-limit';

export interface HttpJsonClient {
  /** Deve rejeitar em erro HTTP, erro de rede ou quando `timeoutMs` se esgota. */
  getJson(
    url: string,
    init: { headers: Record<string, string>; timeoutMs: number; body?: string; method?: 'GET' | 'POST' },
  ): Promise<unknown>;
}

export interface OsmDeps {
  http: HttpJsonClient;
  limiter: RateLimiter;
  sleep: (ms: number) => Promise<void>;
}

/** Retângulo geográfico (graus decimais). */
export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}
/**
 * Área de busca. `kind: 'area'` carrega o `bbox` do Nominatim quando disponível (usado
 * como retângulo da Text Search do Google, Req. 3.1); mineracões antigas podem não tê-lo.
 */
export type SearchArea =
  | { kind: 'area'; areaId: number; bbox?: BBox }
  | { kind: 'bbox'; south: number; west: number; north: number; east: number };

export type GeocodeResult =
  | { ok: true; area: SearchArea }
  | { ok: false; reason: 'NAO_ENCONTRADO' | 'INDISPONIVEL' };

export type OsmElementType = 'node' | 'way' | 'relation';

export interface OverpassElement {
  type: OsmElementType;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
/** Deslocamentos de área do Overpass para relation e way. */
export const RELATION_AREA_OFFSET = 3_600_000_000;
export const WAY_AREA_OFFSET = 2_400_000_000;

/** Total de tentativas = 1 + número de retentativas. */
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/** Erro de resposta com formato inesperado (tratado como falha e retentado). */
class InvalidResponseError extends Error { }

/**
 * Executa `attempt` até `MAX_ATTEMPTS` vezes, aguardando `RETRY_DELAYS_MS[i]` antes da
 * retentativa i+1. Retorna o primeiro sucesso ou rejeita com o último erro.
 */
async function withRetries<T>(attempt: () => Promise<T>, sleep: (ms: number) => Promise<void>): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (i > 0) await sleep(RETRY_DELAYS_MS[i - 1]);
    try {
      return await attempt();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Nominatim
// ---------------------------------------------------------------------------

export function buildNominatimUrl(bairro: string, cidade: string, uf: string): string {
  const params = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'br',
    addressdetails: '0',
    q: `${bairro}, ${cidade}, ${uf}`,
  });
  return `${NOMINATIM_SEARCH_URL}?${params.toString()}`;
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Converte o primeiro resultado do Nominatim em área de busca; null se inutilizável. */
function areaFromNominatim(first: unknown): SearchArea | null {
  if (typeof first !== 'object' || first === null) return null;
  const r = first as Record<string, unknown>;
  const bbox = bboxFromNominatim(r.boundingbox);
  const osmId = toFiniteNumber(r.osm_id);
  if (osmId !== null && Number.isSafeInteger(osmId) && osmId > 0) {
    const offset = r.osm_type === 'relation' ? RELATION_AREA_OFFSET : r.osm_type === 'way' ? WAY_AREA_OFFSET : null;
    if (offset !== null) {
      const areaId = offset + osmId;
      return bbox ? { kind: 'area', areaId, bbox } : { kind: 'area', areaId };
    }
  }
  // node ou sem limite: usa o próprio retângulo
  return bbox ? { kind: 'bbox', ...bbox } : null;
}
/** boundingbox do Nominatim = [south, north, west, east] (strings); null se inválido. */
function bboxFromNominatim(bb: unknown): BBox | null {
  if (!Array.isArray(bb) || bb.length !== 4) return null;
  const [south, north, west, east] = bb.map(toFiniteNumber);
  if (south === null || north === null || west === null || east === null) return null;
  return { south, west, north, east };
}

export async function geocode(bairro: string, cidade: string, uf: string, deps: OsmDeps): Promise<GeocodeResult> {
  const url = buildNominatimUrl(bairro, cidade, uf);
  let results: unknown[];
  try {
    results = await withRetries(
      () =>
        deps.limiter.schedule(async () => {
          const body = await deps.http.getJson(url, {
            method: 'GET',
            headers: { 'User-Agent': OSM_USER_AGENT, Accept: 'application/json' },
            timeoutMs: NOMINATIM_TIMEOUT_MS,
          });
          if (!Array.isArray(body)) throw new InvalidResponseError('Resposta do Nominatim não é uma lista');
          return body;
        }),
      deps.sleep,
    );
  } catch {
    return { ok: false, reason: 'INDISPONIVEL' };
  }
  if (results.length === 0) return { ok: false, reason: 'NAO_ENCONTRADO' };
  const area = areaFromNominatim(results[0]);
  return area ? { ok: true, area } : { ok: false, reason: 'NAO_ENCONTRADO' };
}

// ---------------------------------------------------------------------------
// Overpass
// ---------------------------------------------------------------------------

/** Escapa barras invertidas e aspas para uso dentro de uma string entre aspas duplas. */
export function escapeOverpassString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildOverpassQuery(niche: Niche, area: SearchArea): string {
  const filter =
    area.kind === 'area'
      ? '(area.a)'
      : `(${area.south},${area.west},${area.north},${area.east})`;
  const lines = ['[out:json][timeout:55];'];
  if (area.kind === 'area') lines.push(`area(id:${area.areaId})->.a;`);
  lines.push('(');
  for (const t of niche.tags) {
    lines.push(`  nwr["${escapeOverpassString(t.key)}"="${escapeOverpassString(t.value)}"]${filter};`);
  }
  lines.push(');', 'out center tags;');
  return lines.join('\n');
}

function tagValue(tags: Record<string, string> | undefined, ...keys: string[]): string | null {
  if (!tags) return null;
  for (const k of keys) {
    const v = tags[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Mapeia um elemento Overpass para `FoundCompany`; null quando não há nome (Req. 2.5, 2.6). */
export function mapElement(el: OverpassElement, nicheId: string): FoundCompany | null {
  const nome = tagValue(el.tags, 'name');
  if (nome === null) return null;
  const street = tagValue(el.tags, 'addr:street');
  const number = tagValue(el.tags, 'addr:housenumber');
  const endereco = street === null ? null : number === null ? street : `${street}, ${number}`;
  const hasOwnCoords = finiteOrNull(el.lat) !== null && finiteOrNull(el.lon) !== null;
  return {
    osmId: `${el.type}/${el.id}`,
    nome,
    nicho: nicheId,
    endereco,
    bairro: tagValue(el.tags, 'addr:suburb'),
    cidade: tagValue(el.tags, 'addr:city'),
    uf: tagValue(el.tags, 'addr:state'),
    telefone: tagValue(el.tags, 'phone', 'contact:phone'),
    website: tagValue(el.tags, 'website', 'contact:website'),
    latitude: hasOwnCoords ? (el.lat as number) : finiteOrNull(el.center?.lat),
    longitude: hasOwnCoords ? (el.lon as number) : finiteOrNull(el.center?.lon),
    marcaRede: tagValue(el.tags, 'brand'),
    instagramOsm: normalizeInstagram(tagValue(el.tags, 'contact:instagram', 'instagram')),
    whatsappOsm: normalizeWhatsapp(tagValue(el.tags, 'contact:whatsapp', 'whatsapp')),
  };
}

function isOverpassElement(v: unknown): v is OverpassElement {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    (e.type === 'node' || e.type === 'way' || e.type === 'relation') &&
    typeof e.id === 'number' &&
    Number.isSafeInteger(e.id)
  );
}

export async function searchNiche(
  niche: Niche,
  area: SearchArea,
  deps: OsmDeps,
): Promise<{ ok: true; companies: FoundCompany[] } | { ok: false }> {
  const body = new URLSearchParams({ data: buildOverpassQuery(niche, area) }).toString();
  let elements: unknown[];
  try {
    elements = await withRetries(async () => {
      const res = await deps.http.getJson(OVERPASS_URL, {
        method: 'POST',
        headers: {
          'User-Agent': OSM_USER_AGENT,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeoutMs: OVERPASS_TIMEOUT_MS,
        body,
      });
      const list = typeof res === 'object' && res !== null ? (res as { elements?: unknown }).elements : undefined;
      if (!Array.isArray(list)) throw new InvalidResponseError('Resposta do Overpass sem "elements"');
      return list;
    }, deps.sleep);
  } catch {
    return { ok: false };
  }
  const companies: FoundCompany[] = [];
  for (const el of elements) {
    if (!isOverpassElement(el)) continue;
    const c = mapElement(el, niche.id);
    if (c) companies.push(c);
  }
  return { ok: true, companies };
}

// ---------------------------------------------------------------------------
// Pré-processamento (Req. 2.9, 2.12)
// ---------------------------------------------------------------------------

/** Remove osmIds repetidos; a primeira ocorrência (primeiro nicho) vence. */
export function mergeByOsmId(perNiche: FoundCompany[][]): FoundCompany[] {
  const seen = new Set<string>();
  const out: FoundCompany[] = [];
  for (const list of perNiche) {
    for (const c of list) {
      if (seen.has(c.osmId)) continue;
      seen.add(c.osmId);
      out.push(c);
    }
  }
  return out;
}

/** Remove empresas de rede (marcaRede não vazio após trim). */
export function excludeChains(companies: FoundCompany[]): FoundCompany[] {
  return companies.filter((c) => c.marcaRede === null || c.marcaRede.trim() === '');
}
