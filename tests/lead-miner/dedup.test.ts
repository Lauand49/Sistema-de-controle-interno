import { describe, expect, it } from 'vitest';
import {
  DEDUP_MAX_DISTANCE_M,
  ingestInMemory,
  matchCompany,
  mergeCompanyFields,
  toCompanyKey,
  type CompanyKey,
} from '@/lib/leads/dedup';
import { haversineMeters } from '@/lib/leads/geo';
import { normalizeCompanyName } from '@/lib/leads/text';
import type { FoundCompany } from '@/lib/leads/types';
import { BASE_POINT, pointAtMostMeters, pointNorth } from './support/arb-company';

function key(overrides: Partial<CompanyKey> = {}): CompanyKey {
  return {
    googlePlaceId: null,
    osmId: null,
    cnpj: null,
    nomeNormalizado: 'padaria pao quente',
    latitude: BASE_POINT.lat,
    longitude: BASE_POINT.lng,
    ...overrides,
  };
}

function found(overrides: Partial<FoundCompany> = {}): FoundCompany {
  return {
    osmId: 'node/1',
    nome: 'Padaria Pão Quente',
    nicho: 'padaria',
    endereco: 'Rua A, 1',
    bairro: 'Centro',
    cidade: 'São Paulo',
    uf: 'SP',
    telefone: null,
    website: null,
    latitude: BASE_POINT.lat,
    longitude: BASE_POINT.lng,
    marcaRede: null,
    ...overrides,
  };
}

describe('matchCompany — identificadores (Req. 9.1)', () => {
  it('googlePlaceId tem precedência sobre osmId e cnpj', () => {
    const byGoogle = key({ id: 'g', googlePlaceId: 'G1', nomeNormalizado: 'x' });
    const byOsm = key({ id: 'o', osmId: 'node/1', nomeNormalizado: 'y' });
    const byCnpj = key({ id: 'c', cnpj: '123', nomeNormalizado: 'z' });
    const f = key({ googlePlaceId: 'G1', osmId: 'node/1', cnpj: '123' });
    expect(matchCompany(f, [byCnpj, byOsm, byGoogle])?.id).toBe('g');
  });

  it('osmId tem precedência sobre cnpj quando googlePlaceId não coincide', () => {
    const byOsm = key({ id: 'o', osmId: 'node/1', nomeNormalizado: 'y' });
    const byCnpj = key({ id: 'c', cnpj: '123', nomeNormalizado: 'z' });
    const f = key({ googlePlaceId: 'G9', osmId: 'node/1', cnpj: '123' });
    expect(matchCompany(f, [byCnpj, byOsm])?.id).toBe('o');
  });

  it('cnpj é usado quando os anteriores não coincidem', () => {
    const byCnpj = key({ id: 'c', cnpj: '123', nomeNormalizado: 'z' });
    expect(matchCompany(key({ osmId: 'node/9', cnpj: '123' }), [byCnpj])?.id).toBe('c');
  });

  it('identificadores vazios ou só com espaços são ignorados', () => {
    const empty = key({ id: 'e', googlePlaceId: '', osmId: '  ', nomeNormalizado: 'outra', latitude: null });
    const f = key({ googlePlaceId: '', osmId: '  ', nomeNormalizado: 'nome', latitude: null });
    expect(matchCompany(f, [empty])).toBeNull();
  });

  it('osmId casa com alias da existente, antes de cnpj e do critério de nome', () => {
    const near = key({ id: 'near' });
    const byCnpj = key({ id: 'c', cnpj: '123', nomeNormalizado: 'z' });
    const byAlias = key({ id: 'a', osmId: 'node/7', aliases: ['node/1'], nomeNormalizado: 'y', latitude: null });
    expect(matchCompany(key({ osmId: 'node/1', cnpj: '123' }), [near, byCnpj, byAlias])?.id).toBe('a');
  });

  it('identificador coincidente vence o critério de nome + distância', () => {
    const near = key({ id: 'near' });
    const byOsm = key({ id: 'osm', osmId: 'node/1', nomeNormalizado: 'outra', latitude: null, longitude: null });
    expect(matchCompany(key({ osmId: 'node/1' }), [near, byOsm])?.id).toBe('osm');
  });
});

describe('Nome_Normalizado (Req. 9.2)', () => {
  const variants = [
    'PADARIA PÃO QUENTE',
    'padaria pao quente',
    'Padaria, Pão-Quente!',
    '  Padaria   Pão    Quente  ',
    'Padaria Pão Quente Ltda',
    'Padaria Pão Quente ME',
    'Padaria Pão Quente Eireli',
    'Padaria Pão Quente S/A',
    'Padaria Pão Quente SA',
    'Padaria Pão Quente EPP',
  ];

  it.each(variants)('"%s" é a mesma empresa que "Padaria Pão Quente" a 0 m', (nome) => {
    const existing = key({ id: 'x', nomeNormalizado: normalizeCompanyName('Padaria Pão Quente') });
    expect(normalizeCompanyName(nome)).toBe('padaria pao quente');
    expect(matchCompany(key({ nomeNormalizado: normalizeCompanyName(nome) }), [existing])?.id).toBe('x');
  });

  it('Nome_Normalizado vazio → inexistente (Req. 9.3)', () => {
    const existing = key({ id: 'x', nomeNormalizado: '' });
    expect(matchCompany(key({ nomeNormalizado: normalizeCompanyName('LTDA') }), [existing])).toBeNull();
  });
});

describe('distância (Req. 9.2, 9.3)', () => {
  it('a exatamente ≤ 100 m é a mesma empresa', () => {
    const p = pointAtMostMeters(BASE_POINT, DEDUP_MAX_DISTANCE_M);
    const d = haversineMeters(BASE_POINT, p);
    expect(d).toBeLessThanOrEqual(100);
    expect(d).toBeGreaterThan(99.999999);
    expect(matchCompany(key(), [key({ id: 'x', latitude: p.lat, longitude: p.lng })])?.id).toBe('x');
  });

  it('a 100,5 m é outra empresa', () => {
    const p = pointNorth(BASE_POINT, 100.5);
    const d = haversineMeters(BASE_POINT, p);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeCloseTo(100.5, 6);
    expect(matchCompany(key(), [key({ id: 'x', latitude: p.lat, longitude: p.lng })])).toBeNull();
  });

  it('entre várias candidatas vence a de menor distância', () => {
    const far = pointNorth(BASE_POINT, 80);
    const near = pointNorth(BASE_POINT, 20);
    const existing = [
      key({ id: 'far', latitude: far.lat, longitude: far.lng }),
      key({ id: 'near', latitude: near.lat, longitude: near.lng }),
    ];
    expect(matchCompany(key(), existing)?.id).toBe('near');
  });

  it('sem coordenadas na encontrada → inexistente', () => {
    expect(matchCompany(key({ latitude: null, longitude: null }), [key({ id: 'x' })])).toBeNull();
    expect(matchCompany(key({ longitude: null }), [key({ id: 'x' })])).toBeNull();
  });

  it('sem coordenadas na candidata → inexistente', () => {
    expect(matchCompany(key(), [key({ id: 'x', latitude: null, longitude: null })])).toBeNull();
  });
});

describe('mergeCompanyFields (Req. 9.4)', () => {
  it('vazio nunca apaga e campos protegidos ficam de fora', () => {
    const current = {
      nome: 'A',
      telefone: '11 9999',
      website: null as string | null,
      assignedTo: 'u1' as string | null,
      osmId: 'node/1',
    };
    const patch = mergeCompanyFields(current, {
      nome: 'A',
      telefone: '  ',
      website: 'https://a.com',
      assignedTo: null,
      osmId: 'node/2',
    });
    expect(patch).toEqual({ website: 'https://a.com' });
  });
});

describe('toCompanyKey', () => {
  it('normaliza o nome e limpa o osmId', () => {
    const k = toCompanyKey(found({ osmId: ' node/5 ', nome: 'Padaria Pão Quente LTDA' }));
    expect(k).toMatchObject({ osmId: 'node/5', nomeNormalizado: 'padaria pao quente', googlePlaceId: null, cnpj: null });
    expect(toCompanyKey(found({ osmId: '' })).osmId).toBeNull();
  });
});

describe('ingestInMemory (Req. 9.4–9.6)', () => {
  it('mesma empresa em dois nichos gera um único vínculo com o isNew da 1ª ocorrência', () => {
    const out = ingestInMemory(
      { companies: [], links: [] },
      [found({ nicho: 'padaria' }), found({ nicho: 'mercado', telefone: '11 1234' })],
      'r1',
    );
    expect(out.companies).toHaveLength(1);
    expect(out.companies[0].telefone).toBe('11 1234');
    expect(out.links).toEqual([{ runId: 'r1', companyId: out.companies[0].id, isNew: true, nicho: 'padaria' }]);
  });

  it('empresa existente mantém assignedTo e gera vínculo isNew = false', () => {
    const first = ingestInMemory({ companies: [], links: [] }, [found()], 'r1');
    first.companies[0].assignedTo = 'u1';
    const second = ingestInMemory(first, [found({ endereco: null, telefone: '11 1234' })], 'r2');
    expect(second.companies).toHaveLength(1);
    expect(second.companies[0]).toMatchObject({ assignedTo: 'u1', endereco: 'Rua A, 1', telefone: '11 1234' });
    expect(second.links.find((l) => l.runId === 'r2')?.isNew).toBe(false);
  });

  it('osmId de elemento fundido por nome + proximidade vira alias e a reingestão não duplica', () => {
    const base = ingestInMemory({ companies: [], links: [] }, [found({ osmId: 'node/9' })], 'r0');
    const moved = pointNorth(BASE_POINT, 90);
    // node/1 casa com a empresa de node/9 por nome + 90 m; o osmId dela fica como alias.
    const batch = [
      found({ osmId: 'node/1', nome: 'Padaria Pão Quente', latitude: moved.lat, longitude: moved.lng }),
    ];
    const once = ingestInMemory(base, batch, 'r1');
    expect(once.companies).toHaveLength(1);
    expect(once.companies[0]).toMatchObject({ osmId: 'node/9', aliases: ['node/1'] });
    const twice = ingestInMemory(once, batch, 'r1');
    expect(twice).toEqual(once);
  });

  it('empresa sem osmId recebe o osmId encontrado (sem alias)', () => {
    const base = ingestInMemory({ companies: [], links: [] }, [found({ osmId: '' })], 'r0');
    const out = ingestInMemory(base, [found({ osmId: 'node/3' })], 'r1');
    expect(out.companies[0].osmId).toBe('node/3');
    expect(out.companies[0].aliases).toBeUndefined();
  });

  it('não muta a base de entrada', () => {
    const base = ingestInMemory({ companies: [], links: [] }, [found()], 'r1');
    const snapshot = structuredClone(base);
    ingestInMemory(base, [found({ telefone: '11 1234' })], 'r2');
    expect(base).toEqual(snapshot);
  });
});
