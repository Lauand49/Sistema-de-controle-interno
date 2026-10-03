/**
 * Nome_Exibicao e campos de exibição das Empresas (Req. 6.3–6.6, 6.11).
 *
 * Módulo puro e isomórfico: sem Prisma, sem Node, sem `server-only`. Toda leitura de
 * Conteudo_Google para exibição passa por aqui; cache com `expiraEm <= now` é tratado
 * como ausente, então conteúdo expirado nunca aparece, mesmo antes da purga.
 */
import { GOOGLE_EXPIRED_NAME } from './config';
import type { GooglePlace, PageSpeedResult } from './types';

/** Linha do Cache_Google (forma de `GooglePlaceCache` sem as colunas de controle). */
export type GoogleCacheRow = Omit<GooglePlace, 'placeId' | 'nicho'> & {
  obtidoEm: Date | string;
  expiraEm: Date | string;
};

/** Campos da `Company` necessários para exibição. */
export interface DisplaySource {
  nome: string;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string | null;
  cnpjNomeFantasia: string | null;
  googleCache: GoogleCacheRow | null;
}

export type NameOrigin = 'GOOGLE' | 'CNPJ' | 'PROPRIO' | 'EXPIRADO';

export type GoogleField = 'nome' | 'endereco' | 'bairro' | 'cidade' | 'uf' | 'telefone' | 'website' | 'coords';

export interface DisplayCompany {
  nome: string;
  nomeOrigem: NameOrigin;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  website: string | null;
  /** Fonte de cada campo exibido, para a Atribuicao_Google na UI. */
  googleFields: ReadonlyArray<GoogleField>;
  latitude: number | null;
  longitude: number | null;
  coordsFromGoogle: boolean;
  google: { placeId: string; mapsLink: string; cacheStatus: 'VALIDO' | 'AUSENTE' } | null;
}

/** Válido ⇔ now < expiraEm (29 dias válido; 30 dias completos expirado). */
export function isCacheValid(c: { expiraEm: Date | string } | null | undefined, now: Date): boolean {
  if (!c) return false;
  const exp = c.expiraEm instanceof Date ? c.expiraEm.getTime() : new Date(c.expiraEm).getTime();
  if (!Number.isFinite(exp)) return false;
  return now.getTime() < exp;
}

const nonEmpty = (v: string | null | undefined): string | null => (v != null && v.trim() !== '' ? v : null);
const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** Cache utilizável para exibição, ou null se ausente/expirado. */
function validCache(c: { googleCache: GoogleCacheRow | null }, now: Date): GoogleCacheRow | null {
  return isCacheValid(c.googleCache, now) ? c.googleCache : null;
}

/** Nome sem Conteudo_Google: nome fantasia → nome próprio → "Empresa do Google (dados expirados)". */
function ownName(c: Pick<DisplaySource, 'nome' | 'cnpjNomeFantasia'>): { nome: string; origem: NameOrigin } {
  const fantasia = nonEmpty(c.cnpjNomeFantasia);
  if (fantasia) return { nome: fantasia, origem: 'CNPJ' };
  const proprio = nonEmpty(c.nome);
  if (proprio) return { nome: proprio, origem: 'PROPRIO' };
  return { nome: GOOGLE_EXPIRED_NAME, origem: 'EXPIRADO' };
}

/** Nome_Exibicao: cache válido → nome fantasia → nome próprio → GOOGLE_EXPIRED_NAME (Req. 6.11). */
export function displayName(
  c: Pick<DisplaySource, 'nome' | 'cnpjNomeFantasia' | 'googleCache'>,
  now: Date,
): { nome: string; origem: NameOrigin } {
  const cache = validCache(c, now);
  const googleName = nonEmpty(cache?.nome);
  if (googleName) return { nome: googleName, origem: 'GOOGLE' };
  return ownName(c);
}

/** Nome para ordenação (= displayName com cache válido), gravado em Company.nomeExibicao. */
export function sortName(c: Pick<DisplaySource, 'nome' | 'cnpjNomeFantasia' | 'googleCache'>, now: Date): string {
  return displayName(c, now).nome;
}

/** https://www.google.com/maps/place/?q=place_id:{Place_ID} (Req. 6.6). */
export function googleMapsLink(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
}

const TEXT_FIELDS = ['endereco', 'bairro', 'cidade', 'uf', 'telefone', 'website'] as const;

/** Campos de exibição: cache válido quando presente, senão o próprio (Req. 6.3, 6.11). */
export function displayCompany(c: DisplaySource, now: Date): DisplayCompany {
  const cache = validCache(c, now);
  const name = displayName(c, now);
  const googleFields: GoogleField[] = [];
  if (name.origem === 'GOOGLE') googleFields.push('nome');

  const text = {} as Record<(typeof TEXT_FIELDS)[number], string | null>;
  for (const f of TEXT_FIELDS) {
    const g = nonEmpty(cache?.[f]);
    if (g) {
      text[f] = g;
      googleFields.push(f);
    } else {
      text[f] = c[f];
    }
  }

  let latitude = finite(c.latitude) ? c.latitude : null;
  let longitude = finite(c.longitude) ? c.longitude : null;
  let coordsFromGoogle = false;
  if (cache && finite(cache.latitude) && finite(cache.longitude)) {
    latitude = cache.latitude;
    longitude = cache.longitude;
    coordsFromGoogle = true;
    googleFields.push('coords');
  }

  const placeId = nonEmpty(c.googlePlaceId);
  return {
    nome: name.nome,
    nomeOrigem: name.origem,
    ...text,
    googleFields,
    latitude,
    longitude,
    coordsFromGoogle,
    google: placeId
      ? { placeId, mapsLink: googleMapsLink(placeId), cacheStatus: cache ? 'VALIDO' : 'AUSENTE' }
      : null,
  };
}

/** Campos sem Conteudo_Google (CSV, triagem, Mapa): só valores próprios. */
export function ownFields(
  c: DisplaySource,
): Pick<DisplayCompany, 'endereco' | 'bairro' | 'cidade' | 'uf' | 'telefone' | 'website' | 'latitude' | 'longitude'> & {
  nome: string;
} {
  return {
    nome: ownName(c).nome,
    endereco: c.endereco,
    bairro: c.bairro,
    cidade: c.cidade,
    uf: c.uf,
    telefone: c.telefone,
    website: c.website,
    latitude: finite(c.latitude) ? c.latitude : null,
    longitude: finite(c.longitude) ? c.longitude : null,
  };
}

/**
 * Nº de Empresas sem coordenadas próprias que só têm coordenadas no Cache_Google válido —
 * as que o Mapa não pode posicionar (aviso do Req. 6.5).
 */
export function googleOnlyCoords(
  companies: ReadonlyArray<Pick<DisplaySource, 'latitude' | 'longitude' | 'googleCache'>>,
  now: Date,
): number {
  let n = 0;
  for (const c of companies) {
    if (finite(c.latitude) && finite(c.longitude)) continue;
    const cache = validCache(c, now);
    if (cache && finite(cache.latitude) && finite(cache.longitude)) n++;
  }
  return n;
}

const optNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Leitura defensiva de `CompanyAnalysis.pagespeed`; formas inválidas → null. */
export function parsePageSpeedJson(v: unknown): PageSpeedResult | null {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const desempenho = optNumber(o.desempenho);
  if (desempenho == null || desempenho < 0 || desempenho > 100) return null;
  if (typeof o.urlAnalisada !== 'string') return null;
  return {
    desempenho,
    acessibilidade: optNumber(o.acessibilidade),
    boasPraticas: optNumber(o.boasPraticas),
    seo: optNumber(o.seo),
    lcpMs: optNumber(o.lcpMs),
    cls: optNumber(o.cls),
    tbtMs: optNumber(o.tbtMs),
    fcpMs: optNumber(o.fcpMs),
    urlAnalisada: o.urlAnalisada,
  };
}
