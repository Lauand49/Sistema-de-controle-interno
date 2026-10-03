// Feature: lead-miner-enrichment, Property 13: Deduplicação entre fontes segue o modelo de referência — matchCompany sobre as chaves efetivas (próprias ou do Cache_Google válido) devolve a mesma Empresa que um modelo que testa, nesta ordem, Place_ID (com aliases GOOGLE), osmId (com aliases OSM), CNPJ e Nome_Normalizado a ≤ 100 m (menor distância; empate na primeira).
/**
 * **Validates: Requirements 5.1, 5.3**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  effectiveKey,
  matchCompany,
  toCompanyKey,
  toGoogleKey,
  type CompanyKey,
  type EffectiveKeyCache,
} from '@/lib/leads/dedup';
import { haversineMeters } from '@/lib/leads/geo';
import { normalizeCompanyName } from '@/lib/leads/text';
import type { FoundCompany, GooglePlace } from '@/lib/leads/types';

const NOW = new Date('2025-06-01T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const BASE_LAT = -23.55;
const BASE_LNG = -46.63;

type Existing = CompanyKey & { googleCache?: EffectiveKeyCache | null };

// ---------------------------------------------------------------------------
// Geradores (pools pequenos para provocar colisões)
// ---------------------------------------------------------------------------

const pad = (a: fc.Arbitrary<string>) =>
  fc.tuple(fc.constantFrom('', ' '), a, fc.constantFrom('', ' ')).map(([l, v, r]) => `${l}${v}${r}`);
const arbBlank = fc.constantFrom<string | null>(null, '', '  ');
const arbId = (pool: string[]) => fc.oneof({ weight: 3, arbitrary: pad(fc.constantFrom(...pool)) }, { weight: 2, arbitrary: arbBlank });
const PLACE_IDS = ['ChIJ-a', 'ChIJ-b', 'ChIJ-c'];
const OSM_IDS = ['node/1', 'way/2', 'node/3'];
const CNPJS = ['11222333000181', '45997418000153'];
const RAW_NAMES = ['Padaria Sol', 'Padaria Sol Ltda', 'PADARIA  SOL', 'Mercado Lua', 'Ótica Centro ME', ''];

const arbAliases = (pool: string[]) =>
  fc.option(fc.array(fc.oneof(pad(fc.constantFrom(...pool)), fc.constantFrom('', ' ')), { maxLength: 2 }), {
    nil: undefined,
  });

/** Coordenada: perto da base (0–~170 m, atravessando os 100 m), ausente ou inválida. */
const arbCoord: fc.Arbitrary<[number | null, number | null]> = fc.oneof(
  { weight: 6, arbitrary: fc.tuple(fc.integer({ min: 0, max: 1500 }), fc.integer({ min: 0, max: 400 })).map(
    ([dLat, dLng]) => [BASE_LAT + dLat * 1e-6, BASE_LNG + dLng * 1e-6] as [number, number],
  ) },
  { weight: 1, arbitrary: fc.constant<[number | null, number | null]>([null, null]) },
  { weight: 1, arbitrary: fc.constantFrom<[number | null, number | null]>([120, BASE_LNG], [BASE_LAT, null], [Number.NaN, 0]) },
);

const arbCache: fc.Arbitrary<EffectiveKeyCache | null | undefined> = fc.option(
  fc.record({
    nome: fc.constantFrom(...RAW_NAMES),
    coord: arbCoord,
    // Expira entre 2 dias atrás e 2 dias à frente (inclui exatamente `now` = expirado).
    expDelta: fc.oneof(fc.integer({ min: -2 * DAY, max: 2 * DAY }), fc.constant(0)),
    asString: fc.boolean(),
  }).map(({ nome, coord, expDelta, asString }) => {
    const exp = new Date(NOW.getTime() + expDelta);
    return { nome, latitude: coord[0], longitude: coord[1], expiraEm: asString ? exp.toISOString() : exp };
  }),
  { nil: undefined },
);

const arbExisting: fc.Arbitrary<Existing> = fc
  .record({
    googlePlaceId: arbId(PLACE_IDS),
    osmId: arbId(OSM_IDS),
    cnpj: arbId(CNPJS),
    nome: fc.constantFrom(...RAW_NAMES),
    coord: arbCoord,
    aliases: arbAliases(OSM_IDS),
    googleAliases: arbAliases(PLACE_IDS),
    googleCache: arbCache,
  })
  .map((r) => {
    const e: Existing = {
      googlePlaceId: r.googlePlaceId,
      osmId: r.osmId,
      cnpj: r.cnpj,
      nomeNormalizado: normalizeCompanyName(r.nome),
      latitude: r.coord[0],
      longitude: r.coord[1],
    };
    if (r.aliases !== undefined) e.aliases = r.aliases;
    if (r.googleAliases !== undefined) e.googleAliases = r.googleAliases;
    if (r.googleCache !== undefined) e.googleCache = r.googleCache;
    return e;
  });

const arbBase = fc
  .array(arbExisting, { maxLength: 7 })
  .map((list) => list.map((e, i) => ({ ...e, id: `c${i}` })));

const arbGooglePlace: fc.Arbitrary<GooglePlace> = fc
  .record({ placeId: fc.oneof(pad(fc.constantFrom(...PLACE_IDS, 'ChIJ-novo')), fc.constantFrom('', ' ')), nome: fc.constantFrom(...RAW_NAMES), coord: arbCoord })
  .map(({ placeId, nome, coord }) => ({
    placeId,
    nome,
    nicho: 'padaria',
    endereco: null,
    bairro: null,
    cidade: null,
    uf: null,
    telefone: null,
    website: null,
    latitude: coord[0],
    longitude: coord[1],
    mapsUri: null,
    businessStatus: null,
    tipos: [],
  }));

const arbOsmFound: fc.Arbitrary<FoundCompany> = fc
  .record({ osmId: fc.oneof(pad(fc.constantFrom(...OSM_IDS, 'node/99')), fc.constantFrom('', ' ')), nome: fc.constantFrom(...RAW_NAMES), coord: arbCoord })
  .map(({ osmId, nome, coord }) => ({
    osmId,
    nome,
    nicho: 'padaria',
    endereco: null,
    bairro: null,
    cidade: null,
    uf: null,
    telefone: null,
    website: null,
    latitude: coord[0],
    longitude: coord[1],
    marcaRede: null,
  }));

/** Chave encontrada genérica (exercita também o critério CNPJ e combinações de identificadores). */
const arbRawFound: fc.Arbitrary<CompanyKey> = fc
  .record({
    googlePlaceId: arbId(PLACE_IDS),
    osmId: arbId(OSM_IDS),
    cnpj: arbId([...CNPJS, '00000000000191']),
    nome: fc.constantFrom(...RAW_NAMES),
    coord: arbCoord,
  })
  .map((r) => ({
    googlePlaceId: r.googlePlaceId,
    osmId: r.osmId,
    cnpj: r.cnpj,
    nomeNormalizado: normalizeCompanyName(r.nome),
    latitude: r.coord[0],
    longitude: r.coord[1],
  }));

const arbFound: fc.Arbitrary<CompanyKey> = fc.oneof(
  arbGooglePlace.map(toGoogleKey),
  arbOsmFound.map(toCompanyKey),
  arbRawFound,
);

// ---------------------------------------------------------------------------
// Modelo de referência (independente da implementação)
// ---------------------------------------------------------------------------

const t = (v: string | null | undefined): string | null => (v == null || v.trim() === '' ? null : v.trim());
const coordOk = (lat: number | null, lng: number | null): boolean =>
  lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

function refEffective(e: Existing, now: Date) {
  const c = e.googleCache;
  const valid = !!c && new Date(c.expiraEm).getTime() > now.getTime();
  const nome = e.nomeNormalizado !== '' ? e.nomeNormalizado : valid ? normalizeCompanyName(c!.nome) : '';
  const own = coordOk(e.latitude, e.longitude);
  const useCache = !own && valid && coordOk(c!.latitude, c!.longitude);
  return {
    nome,
    lat: useCache ? c!.latitude : e.latitude,
    lng: useCache ? c!.longitude : e.longitude,
  };
}

/** Índice da Empresa escolhida pelo modelo, ou -1. */
function refMatch(found: CompanyKey, base: Existing[], now: Date): number {
  const pid = t(found.googlePlaceId);
  if (pid !== null) {
    const i = base.findIndex((e) => t(e.googlePlaceId) === pid || (e.googleAliases ?? []).some((a) => t(a) === pid));
    if (i >= 0) return i;
  }
  const osm = t(found.osmId);
  if (osm !== null) {
    const i = base.findIndex((e) => t(e.osmId) === osm || (e.aliases ?? []).some((a) => t(a) === osm));
    if (i >= 0) return i;
  }
  const cnpj = t(found.cnpj);
  if (cnpj !== null) {
    const i = base.findIndex((e) => t(e.cnpj) === cnpj);
    if (i >= 0) return i;
  }
  if (found.nomeNormalizado === '' || !coordOk(found.latitude, found.longitude)) return -1;
  let best = -1;
  let bestD = Infinity;
  base.forEach((e, i) => {
    const k = refEffective(e, now);
    if (k.nome !== found.nomeNormalizado || !coordOk(k.lat, k.lng)) return;
    const d = haversineMeters({ lat: found.latitude!, lng: found.longitude! }, { lat: k.lat!, lng: k.lng! });
    if (d <= 100 && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

describe('Property 13: Deduplicação entre fontes segue o modelo de referência', () => {
  it('matchCompany(chaves efetivas) escolhe a mesma Empresa que o modelo', () => {
    fc.assert(
      fc.property(arbBase, arbFound, (base, found) => {
        const keys = base.map((e) => effectiveKey(e, NOW));
        const hit = matchCompany(found, keys);
        const got = hit === null ? -1 : keys.indexOf(hit);
        expect(got).toBe(refMatch(found, base, NOW));
        if (hit !== null) expect(hit.id).toBe(base[got].id);
      }),
      { numRuns: 300 },
    );
  });
});
