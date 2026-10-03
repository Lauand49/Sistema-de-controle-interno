/**
 * Exemplos de display.ts (Nome_Exibicao e campos de exibição).
 * **Validates: Requirements 6.3, 6.4, 6.5, 6.6, 6.11**
 */
import { describe, expect, it } from 'vitest';
import { GOOGLE_EXPIRED_NAME } from '@/lib/leads/config';
import {
  displayCompany,
  displayName,
  googleMapsLink,
  googleOnlyCoords,
  isCacheValid,
  ownFields,
  parsePageSpeedJson,
  sortName,
  type DisplaySource,
  type GoogleCacheRow,
} from '@/lib/leads/display';

const DAY = 86_400_000;
const obtido = new Date('2025-05-01T12:00:00Z');
const expira = new Date(obtido.getTime() + 30 * DAY);

const cache: GoogleCacheRow = {
  nome: 'Padaria Google',
  endereco: 'Rua do Google, 1',
  bairro: null,
  cidade: 'São José dos Campos',
  uf: 'SP',
  telefone: '+55 12 3333-4444',
  website: null,
  latitude: -23.2,
  longitude: -45.9,
  mapsUri: null,
  businessStatus: 'OPERATIONAL',
  tipos: ['bakery'],
  obtidoEm: obtido,
  expiraEm: expira.toISOString(),
};

const base: DisplaySource = {
  nome: '',
  endereco: null,
  bairro: 'Centro',
  cidade: null,
  uf: null,
  telefone: null,
  website: 'https://proprio.com.br',
  latitude: null,
  longitude: null,
  googlePlaceId: 'ChIJ abc/1',
  cnpjNomeFantasia: null,
  googleCache: cache,
};

const valid = new Date(obtido.getTime() + 29 * DAY + 23 * 3_600_000);
const expired = new Date(obtido.getTime() + 30 * DAY);

describe('isCacheValid', () => {
  it('válido até antes de expiraEm; 30 dias completos expirado; ausente inválido', () => {
    expect(isCacheValid(cache, valid)).toBe(true);
    expect(isCacheValid(cache, expired)).toBe(false);
    expect(isCacheValid(null, valid)).toBe(false);
    expect(isCacheValid({ expiraEm: 'lixo' }, valid)).toBe(false);
  });
});

describe('displayName / sortName', () => {
  it('segue cache válido → nome fantasia → nome próprio → expirado', () => {
    expect(displayName(base, valid)).toEqual({ nome: 'Padaria Google', origem: 'GOOGLE' });
    expect(displayName({ ...base, cnpjNomeFantasia: 'Fantasia' }, expired)).toEqual({ nome: 'Fantasia', origem: 'CNPJ' });
    expect(displayName({ ...base, nome: 'Própria' }, expired)).toEqual({ nome: 'Própria', origem: 'PROPRIO' });
    expect(displayName(base, expired)).toEqual({ nome: GOOGLE_EXPIRED_NAME, origem: 'EXPIRADO' });
    expect(sortName(base, valid)).toBe('Padaria Google');
  });
});

describe('displayCompany', () => {
  it('com cache válido usa os campos do cache e lista googleFields', () => {
    const d = displayCompany(base, valid);
    expect(d.endereco).toBe('Rua do Google, 1');
    expect(d.bairro).toBe('Centro');
    expect(d.website).toBe('https://proprio.com.br');
    expect(d.coordsFromGoogle).toBe(true);
    expect([...d.googleFields].sort()).toEqual(['cidade', 'coords', 'endereco', 'nome', 'telefone', 'uf']);
    expect(d.google).toEqual({
      placeId: 'ChIJ abc/1',
      mapsLink: 'https://www.google.com/maps/place/?q=place_id:ChIJ%20abc%2F1',
      cacheStatus: 'VALIDO',
    });
  });

  it('com cache expirado não expõe nenhum Conteudo_Google', () => {
    const d = displayCompany(base, expired);
    expect(d.googleFields).toEqual([]);
    expect(d.nome).toBe(GOOGLE_EXPIRED_NAME);
    expect(d.endereco).toBeNull();
    expect(d.latitude).toBeNull();
    expect(d.coordsFromGoogle).toBe(false);
    expect(d.google?.cacheStatus).toBe('AUSENTE');
    expect(JSON.stringify(d)).not.toContain('Google, 1');
  });
});

describe('ownFields / googleMapsLink / googleOnlyCoords', () => {
  it('ownFields ignora o cache mesmo válido', () => {
    expect(ownFields({ ...base, cnpjNomeFantasia: 'Fantasia' })).toEqual({
      nome: 'Fantasia',
      endereco: null,
      bairro: 'Centro',
      cidade: null,
      uf: null,
      telefone: null,
      website: 'https://proprio.com.br',
      latitude: null,
      longitude: null,
    });
  });

  it('googleMapsLink usa o formato do Req. 6.6', () => {
    expect(googleMapsLink('ChIJ123')).toBe('https://www.google.com/maps/place/?q=place_id:ChIJ123');
  });

  it('conta só Empresas sem coordenadas próprias com coordenadas no cache válido', () => {
    const list = [base, { ...base, latitude: -23, longitude: -45 }, { ...base, googleCache: null }];
    expect(googleOnlyCoords(list, valid)).toBe(1);
    expect(googleOnlyCoords(list, expired)).toBe(0);
  });
});

describe('parsePageSpeedJson', () => {
  it('aceita a forma gravada e descarta formas inválidas', () => {
    const ok = { desempenho: 42, acessibilidade: 90, boasPraticas: 'x', seo: null, lcpMs: 2500, cls: 0.1, tbtMs: 300, fcpMs: 1200, urlAnalisada: 'https://a.com/' };
    expect(parsePageSpeedJson(ok)).toEqual({ ...ok, boasPraticas: null });
    expect(parsePageSpeedJson(null)).toBeNull();
    expect(parsePageSpeedJson([])).toBeNull();
    expect(parsePageSpeedJson({ desempenho: 120, urlAnalisada: 'x' })).toBeNull();
    expect(parsePageSpeedJson({ desempenho: 50 })).toBeNull();
  });
});
