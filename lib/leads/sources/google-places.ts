/**
 * Fonte_Google: Text Search (New) e Place Details (New) da Places API — Req. 3, 2.4, 2.5, 6.8, 6.10.
 *
 * Todo I/O é injetado (`GooglePlacesDeps`): o cliente HTTP real (deps.ts) monta a URL sobre
 * `PLACES_HOST` e envia a chave no cabeçalho — a chave nunca passa por este módulo (Req. 2.8,
 * 20.4). Cada tentativa de requisição reserva antes 1 chamada no Portao_Uso `places`.
 */
import {
  GOOGLE_PAGE_SIZE,
  GOOGLE_QUERIES,
  PLACES_TIMEOUT_MS,
  RETRY_DELAYS_MS,
  type Niche,
} from '../config';
import { sleepOrAbort } from '../abort';
import { isSafePathSegment } from '../net/path-segment';
import type { GooglePlace } from '../types';
import { monthKey, type UsageGate } from '../usage';
import type { SearchArea } from './osm';

/** Cliente HTTP mínimo injetado; o real (deps.ts) usa fetch com a chave no cabeçalho. */
export interface PlacesHttp {
  /** Resolve com { status, json } para qualquer status HTTP; rejeita só em rede/timeout. */
  request(req: {
    method: 'GET' | 'POST';
    path: string; // '/v1/places:searchText' | `/v1/places/${encodeURIComponent(id)}`
    query?: Record<string, string>;
    fieldMask: string;
    body?: unknown;
    timeoutMs: number;
    /** Cancelamento da mineração (P2): aborta a requisição em voo. */
    signal?: AbortSignal;
  }): Promise<{ status: number; json: unknown }>;
}
export type PlacesRequest = Parameters<PlacesHttp['request']>[0];

export interface GooglePlacesDeps {
  /** null = sem GOOGLE_PLACES_API_KEY. */
  http: PlacesHttp | null;
  usage: UsageGate;
  /** Limite mensal do provedor `places`. */
  limit: number;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  /** Sinal da mineração em curso (P2); ausente = sem cancelamento. */
  signal?: AbortSignal;
}

export const PLACES_HOST = 'https://places.googleapis.com';
export const SEARCH_TEXT_PATH = '/v1/places:searchText';

export const SEARCH_FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,' +
  'places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.businessStatus,places.types,nextPageToken';
/** Mesmos campos da Text Search, sem prefixo `places.` e sem `nextPageToken` (Req. 6.8). */
export const DETAILS_FIELD_MASK = SEARCH_FIELD_MASK.split(',')
  .filter((f) => f !== 'nextPageToken')
  .map((f) => f.replace(/^places\./, ''))
  .join(',');

/** Caminho do Place Details: o Place_ID entra só como segmento codificado (Req. 20.4). */
export function placeDetailsPath(placeId: string): string {
  return `/v1/places/${encodeURIComponent(placeId)}`;
}

/** URL absoluta de uma requisição; a origem é sempre `PLACES_HOST`. Para o cliente real. */
export function buildPlacesUrl(path: string, query?: Record<string, string>): string {
  const url = new URL(PLACES_HOST);
  url.pathname = path;
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url.toString();
}

export interface Rect {
  low: { latitude: number; longitude: number };
  high: { latitude: number; longitude: number };
}
export interface RunPlace {
  bairro: string;
  cidade: string;
  uf: string;
}

/** "low/high" a partir de SearchArea com bbox; null se a área não tem bbox. */
export function rectFromArea(area: SearchArea): Rect | null {
  const b = area.kind === 'bbox' ? area : area.bbox;
  if (!b) return null;
  return { low: { latitude: b.south, longitude: b.west }, high: { latitude: b.north, longitude: b.east } };
}

/** Corpo da Text Search (puro). O texto vem de GOOGLE_QUERIES; sem entrada, usa o rótulo do Nicho. */
export function buildTextSearchBody(niche: Niche, run: RunPlace, rect: Rect, pageToken?: string): object {
  const q = GOOGLE_QUERIES[niche.id] ?? { text: niche.label.toLowerCase() };
  const body: Record<string, unknown> = {
    textQuery: `${q.text} em ${run.bairro}, ${run.cidade} - ${run.uf}`,
    languageCode: 'pt-BR',
    regionCode: 'BR',
    locationRestriction: { rectangle: rect },
    pageSize: GOOGLE_PAGE_SIZE,
  };
  if (q.includedType) body.includedType = q.includedType;
  if (pageToken) body.pageToken = pageToken;
  return body;
}

// ---------------------------------------------------------------------------
// Mapeamento (Req. 3.4, 3.5)
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}
function finite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Componente de endereço com um dos tipos, na ordem de preferência dos tipos. */
function component(raw: unknown, types: string[], key: 'longText' | 'shortText'): string | null {
  if (!Array.isArray(raw)) return null;
  for (const t of types) {
    for (const c of raw) {
      if (isRecord(c) && Array.isArray(c.types) && c.types.includes(t)) {
        const v = str(c[key]);
        if (v !== null) return v;
      }
    }
  }
  return null;
}

/** Campos do lugar sem descarte; null só quando não há id. */
function mapPlaceFields(raw: unknown): Omit<GooglePlace, 'nicho'> | null {
  if (!isRecord(raw)) return null;
  const placeId = str(raw.id);
  if (placeId === null) return null;
  const location = isRecord(raw.location) ? raw.location : {};
  return {
    placeId,
    nome: (isRecord(raw.displayName) ? str(raw.displayName.text) : null) ?? '',
    endereco: str(raw.formattedAddress),
    bairro: component(raw.addressComponents, ['sublocality_level_1', 'sublocality'], 'longText'),
    cidade: component(raw.addressComponents, ['administrative_area_level_2'], 'longText'),
    uf: component(raw.addressComponents, ['administrative_area_level_1'], 'shortText'),
    telefone: str(raw.nationalPhoneNumber),
    website: str(raw.websiteUri),
    latitude: finite(location.latitude),
    longitude: finite(location.longitude),
    mapsUri: str(raw.googleMapsUri),
    businessStatus: str(raw.businessStatus),
    tipos: Array.isArray(raw.types) ? raw.types.filter((t): t is string => typeof t === 'string') : [],
  };
}

/** Mapeia um lugar da resposta; null se sem id, CLOSED_PERMANENTLY ou nome vazio (Req. 3.4, 3.5). Puro. */
export function mapPlace(raw: unknown, nicheId: string): GooglePlace | null {
  const p = mapPlaceFields(raw);
  if (p === null || p.nome === '' || p.businessStatus === 'CLOSED_PERMANENTLY') return null;
  return { ...p, nicho: nicheId };
}

// ---------------------------------------------------------------------------
// Text Search (Req. 3.1–3.3, 3.7, 3.8, 2.4, 2.5)
// ---------------------------------------------------------------------------

export type PageOutcome =
  | { ok: true; places: GooglePlace[]; nextPageToken: string | null }
  | { ok: false; kind: 'RETRYABLE_EXHAUSTED' | 'FATAL' | 'QUOTA' | 'UNAVAILABLE' | 'ABORTED' };

type Attempt =
  | { kind: 'ok'; places: GooglePlace[]; nextPageToken: string | null }
  | { kind: 'retry' }
  | { kind: 'fatal' };

function classifySearch(res: { status: number; json: unknown } | null, nicheId: string): Attempt {
  if (res === null) return { kind: 'retry' }; // rede/timeout
  const { status, json } = res;
  if (status >= 200 && status < 300) {
    // Resposta sem resultados vem como `{}`; `places` presente e não-lista é JSON inválido.
    if (!isRecord(json) || (json.places !== undefined && !Array.isArray(json.places))) return { kind: 'retry' };
    const list = Array.isArray(json.places) ? json.places : [];
    const places: GooglePlace[] = [];
    for (const raw of list) {
      const p = mapPlace(raw, nicheId);
      if (p) places.push(p);
    }
    return { kind: 'ok', places, nextPageToken: str(json.nextPageToken) };
  }
  if (status === 429 || status >= 500) return { kind: 'retry' };
  return { kind: 'fatal' }; // 400/401/403 e demais 4xx: não repete
}

/** Uma página com até 2 retentativas (2 s, 4 s); reserva 1 cota por tentativa. */
export async function searchGooglePage(
  niche: Niche,
  run: RunPlace,
  rect: Rect,
  pageToken: string | null,
  deps: GooglePlacesDeps,
): Promise<PageOutcome> {
  const http = deps.http;
  if (http === null) return { ok: false, kind: 'UNAVAILABLE' };
  const body = buildTextSearchBody(niche, run, rect, pageToken ?? undefined);
  const signal = deps.signal;
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    // Cancelada (P2): não espera, não reserva cota e não envia; o chamador trata como cancelamento.
    if (signal?.aborted) return { ok: false, kind: 'ABORTED' };
    if (i > 0) {
      try {
        await sleepOrAbort(deps.sleep, RETRY_DELAYS_MS[i - 1], signal);
      } catch {
        return { ok: false, kind: 'ABORTED' };
      }
    }
    if (!(await deps.usage.reserve('places', monthKey(deps.now()), deps.limit))) {
      return { ok: false, kind: 'QUOTA' };
    }
    let res: { status: number; json: unknown } | null;
    try {
      res = await http.request({
        method: 'POST',
        path: SEARCH_TEXT_PATH,
        fieldMask: SEARCH_FIELD_MASK,
        body,
        timeoutMs: PLACES_TIMEOUT_MS,
        signal,
      });
    } catch {
      res = null;
    }
    if (signal?.aborted) return { ok: false, kind: 'ABORTED' };
    const a = classifySearch(res, niche.id);
    if (a.kind === 'ok') return { ok: true, places: a.places, nextPageToken: a.nextPageToken };
    if (a.kind === 'fatal') return { ok: false, kind: 'FATAL' };
  }
  return { ok: false, kind: 'RETRYABLE_EXHAUSTED' };
}

// ---------------------------------------------------------------------------
// Place Details (Req. 6.8, 6.10)
// ---------------------------------------------------------------------------

export type DetailsOutcome =
  | { ok: true; place: Omit<GooglePlace, 'nicho'> }
  | { ok: false; kind: 'NOT_FOUND' | 'ERRO' | 'QUOTA' | 'UNAVAILABLE' };

/**
 * Place Details (New) com DETAILS_FIELD_MASK, sem retentativa; reserva 1 cota.
 * O lugar é devolvido mesmo se fechado (o status vai em `businessStatus`); sem id → `ERRO`.
 */
export async function fetchPlaceDetails(placeId: string, deps: GooglePlacesDeps): Promise<DetailsOutcome> {
  const http = deps.http;
  if (http === null) return { ok: false, kind: 'UNAVAILABLE' };
  // Place_ID vazio, '.' ou '..' viraria segmento de ponto: nada é enviado nem reservado (Req. 20.4).
  if (!isSafePathSegment(placeId)) return { ok: false, kind: 'ERRO' };
  if (!(await deps.usage.reserve('places', monthKey(deps.now()), deps.limit))) return { ok: false, kind: 'QUOTA' };
  let res: { status: number; json: unknown };
  try {
    res = await http.request({
      method: 'GET',
      path: placeDetailsPath(placeId),
      query: { languageCode: 'pt-BR', regionCode: 'BR' },
      fieldMask: DETAILS_FIELD_MASK,
      timeoutMs: PLACES_TIMEOUT_MS,
    });
  } catch {
    return { ok: false, kind: 'ERRO' };
  }
  if (res.status === 404) return { ok: false, kind: 'NOT_FOUND' };
  if (res.status < 200 || res.status >= 300) return { ok: false, kind: 'ERRO' };
  const place = mapPlaceFields(res.json);
  return place ? { ok: true, place } : { ok: false, kind: 'ERRO' };
}

// ---------------------------------------------------------------------------
// Pré-processamento (Req. 3.6, 3.9)
// ---------------------------------------------------------------------------

/** Remove placeIds repetidos entre Nichos; a 1ª ocorrência (1º Nicho) vence. Puro. */
export function mergeByPlaceId(perNiche: GooglePlace[][]): GooglePlace[] {
  const seen = new Set<string>();
  const out: GooglePlace[] = [];
  for (const list of perNiche) {
    for (const p of list) {
      if (seen.has(p.placeId)) continue;
      seen.add(p.placeId);
      out.push(p);
    }
  }
  return out;
}

/** Mínimo de lugares distintos com o mesmo Nome_Normalizado para caracterizar Rede. */
export const GOOGLE_CHAIN_MIN_PLACES = 3;

/**
 * placeIds cujo Nome_Normalizado (não vazio) aparece em ≥ 3 placeIds distintos (Req. 3.9). Puro.
 * O chamador normaliza o nome com `normalizeCompanyName` (text.ts), como na Etapa 1.
 */
export function detectGoogleChains(entries: readonly { placeId: string; nomeNormalizado: string }[]): Set<string> {
  const byName = new Map<string, Set<string>>();
  for (const { placeId, nomeNormalizado } of entries) {
    if (nomeNormalizado === '') continue;
    let ids = byName.get(nomeNormalizado);
    if (!ids) byName.set(nomeNormalizado, (ids = new Set()));
    ids.add(placeId);
  }
  const out = new Set<string>();
  byName.forEach((ids) => {
    if (ids.size >= GOOGLE_CHAIN_MIN_PLACES) ids.forEach((id) => out.add(id));
  });
  return out;
}
