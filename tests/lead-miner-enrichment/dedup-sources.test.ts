import { describe, expect, it } from 'vitest';
import {
  companySource,
  effectiveKey,
  effectiveSource,
  ingestSourcesInMemory,
  matchCompany,
  toGoogleKey,
  type InMemoryBase,
} from '@/lib/leads/dedup';
import type { FoundCompany, GooglePlace } from '@/lib/leads/types';

const NOW = new Date('2026-01-10T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const place = (over: Partial<GooglePlace> = {}): GooglePlace => ({
  placeId: 'P1',
  nome: 'Padaria Boa',
  nicho: 'padaria',
  endereco: 'Rua A, 1',
  bairro: 'Centro',
  cidade: 'São Paulo',
  uf: 'SP',
  telefone: '1133334444',
  website: 'https://padariaboa.com.br',
  latitude: -23.5,
  longitude: -46.6,
  mapsUri: 'https://maps.google.com/?cid=1',
  businessStatus: 'OPERATIONAL',
  tipos: ['bakery'],
  ...over,
});

const osm = (over: Partial<FoundCompany> = {}): FoundCompany => ({
  osmId: 'node/1',
  nome: 'Padaria Boa',
  nicho: 'padaria',
  endereco: 'Rua A',
  bairro: null,
  cidade: 'São Paulo',
  uf: 'SP',
  telefone: null,
  website: null,
  latitude: -23.50001,
  longitude: -46.60001,
  marcaRede: null,
  ...over,
});

const empty: InMemoryBase = { companies: [], links: [] };

describe('dedup entre fontes', () => {
  it('casa Place_ID pelos googleAliases', () => {
    const e = { id: 'a', googlePlaceId: 'P0', osmId: null, cnpj: null, nomeNormalizado: '', latitude: null, longitude: null, googleAliases: ['P1'] };
    expect(matchCompany(toGoogleKey(place()), [e])).toBe(e);
  });

  it('effectiveKey usa nome/coords do cache válido e ignora o expirado', () => {
    const base = { googlePlaceId: 'P1', osmId: null, cnpj: null, nomeNormalizado: '', latitude: null, longitude: null };
    const cache = { nome: 'Padaria Boa', latitude: -23.5, longitude: -46.6 };
    const valid = effectiveKey({ ...base, googleCache: { ...cache, expiraEm: new Date(NOW.getTime() + DAY) } }, NOW);
    expect(valid.nomeNormalizado).not.toBe('');
    expect(valid.latitude).toBe(-23.5);
    const expired = effectiveKey({ ...base, googleCache: { ...cache, expiraEm: NOW } }, NOW);
    expect(expired.nomeNormalizado).toBe('');
    expect(expired.latitude).toBeNull();
  });

  it('companySource e effectiveSource', () => {
    expect(companySource({ googlePlaceId: 'P', osmId: null })).toBe('GOOGLE');
    expect(companySource({ googlePlaceId: null, osmId: 'node/1' })).toBe('OSM');
    expect(companySource({ googlePlaceId: null, osmId: 'node/1', googleAliases: ['P'] })).toBe('MISTA');
    expect(effectiveSource([])).toBe('OSM');
    expect(effectiveSource(['GOOGLE', 'GOOGLE'])).toBe('GOOGLE');
    expect(effectiveSource(['OSM', 'GOOGLE'])).toBe('MISTA');
  });

  it('Google cria Empresa sem campos próprios; OSM depois funde pela chave efetiva', () => {
    const r = ingestSourcesInMemory(empty, [{ kind: 'GOOGLE', place: place() }, { kind: 'OSM', found: osm() }], 'r1', NOW);
    expect(r.companies).toHaveLength(1);
    const c = r.companies[0];
    expect(c.googlePlaceId).toBe('P1');
    expect(c.osmId).toBe('node/1');
    expect(c.nome).toBe('Padaria Boa');
    expect(c.telefone).toBeNull(); // telefone do Google fica só no cache
    expect(c.fonte).toBe('MISTA');
    expect(c.googleCache?.telefone).toBe('1133334444');
    expect((c.googleCache!.expiraEm as Date).getTime() - NOW.getTime()).toBe(30 * DAY);
    expect(r.links).toEqual([{ runId: 'r1', companyId: c.id, isNew: true, nicho: 'padaria', origem: 'MISTA' }]);
  });

  it('Google sobre Empresa OSM não altera campos próprios; outro Place_ID vira alias', () => {
    const first = ingestSourcesInMemory(empty, [{ kind: 'OSM', found: osm() }], 'r0', NOW);
    const before = { ...first.companies[0] };
    const r = ingestSourcesInMemory(first, [{ kind: 'GOOGLE', place: place() }, { kind: 'GOOGLE', place: place({ placeId: 'P2' }) }], 'r1', NOW);
    const c = r.companies[0];
    expect(r.companies).toHaveLength(1);
    expect(c.nome).toBe(before.nome);
    expect(c.endereco).toBe(before.endereco);
    expect(c.latitude).toBe(before.latitude);
    expect(c.googlePlaceId).toBe('P1');
    expect(c.googleAliases).toEqual(['P2']);
    expect(r.links.find((l) => l.runId === 'r1')).toMatchObject({ isNew: false, origem: 'GOOGLE' });
  });

  it('é idempotente para a mesma lista', () => {
    const items = [
      { kind: 'GOOGLE' as const, place: place() },
      { kind: 'OSM' as const, found: osm() },
      { kind: 'GOOGLE' as const, place: place({ placeId: 'P9', nome: 'Outra', latitude: -23.6 }) },
    ];
    const once = ingestSourcesInMemory(empty, items, 'r1', NOW);
    expect(ingestSourcesInMemory(once, items, 'r1', NOW)).toEqual(once);
  });
});
