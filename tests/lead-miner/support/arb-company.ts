/**
 * Geradores (fast-check) e utilitários para os testes do Deduplicador.
 */
import fc from 'fast-check';
import type { CompanyKey, InMemoryBase, InMemoryCompany } from '@/lib/leads/dedup';
import { haversineMeters } from '@/lib/leads/geo';
import { normalizeCompanyName } from '@/lib/leads/text';
import type { FoundCompany, LatLng } from '@/lib/leads/types';

/** Ponto de referência (São Paulo). */
export const BASE_POINT: LatLng = { lat: -23.55052, lng: -46.633308 };

const EARTH_RADIUS_M = 6_371_008.8;

/**
 * Ponto ao norte de `origin` (mesma longitude) cuja distância real por `haversineMeters`
 * é a maior possível ≤ `meters` (busca binária sobre a latitude, sem aproximação).
 */
export function pointAtMostMeters(origin: LatLng, meters: number): LatLng {
  let lo = 0;
  let hi = ((2 * meters) / EARTH_RADIUS_M) * (180 / Math.PI);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (haversineMeters(origin, { lat: origin.lat + mid, lng: origin.lng }) <= meters) lo = mid;
    else hi = mid;
  }
  return { lat: origin.lat + lo, lng: origin.lng };
}

/** Ponto ao norte de `origin` a aproximadamente `meters` metros (use para distâncias > limite). */
export function pointNorth(origin: LatLng, meters: number): LatLng {
  return { lat: origin.lat + (meters / EARTH_RADIUS_M) * (180 / Math.PI), lng: origin.lng };
}

const BASE_NAMES = ['Padaria Pão Quente', 'Mercado Bom Preço', 'Oficina São José'];
const SUFFIXES = ['', ' ltda', ' LTDA.', ' ME', ' eireli', ' S/A', ' s.a.', ' SA', ' Epp'];
const EMPTY_NAMES = ['', '   ', 'LTDA', 'S/A', '...'];

const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Nome bruto com variações de caixa, acentos, pontuação, espaços e sufixos societários. */
export const arbRawName: fc.Arbitrary<string> = fc.oneof(
  {
    weight: 9, arbitrary: fc
      .record({
        base: fc.constantFrom(...BASE_NAMES),
        caseMode: fc.constantFrom('keep', 'upper', 'lower'),
        noAccents: fc.boolean(),
        punct: fc.constantFrom('', '!', ' - ', ',', '.'),
        pad: fc.constantFrom('', ' ', '   '),
        suffix: fc.constantFrom(...SUFFIXES),
      })
      .map(({ base, caseMode, noAccents, punct, pad, suffix }) => {
        let s = noAccents ? stripAccents(base) : base;
        s = s.replace(' ', `${pad} `);
        s = `${pad}${s}${punct}${suffix}${pad}`;
        if (caseMode === 'upper') s = s.toUpperCase();
        if (caseMode === 'lower') s = s.toLowerCase();
        return s;
      })
  },
  { weight: 1, arbitrary: fc.constantFrom(...EMPTY_NAMES) },
);

/** Identificador de um pool pequeno (colisões frequentes), incluindo vazios. */
const arbId = (prefix: string) =>
  fc.constantFrom<string | null>(null, '', '  ', `${prefix}1`, `${prefix}2`, `${prefix}3`);

/** Deslocamento em metros, concentrado em torno do limite de 100 m. */
const arbOffsetM = fc.oneof(
  fc.double({ min: 0, max: 200, noNaN: true }),
  fc.constantFrom(0, 50, 99.9, 100, 100.5, 150),
);

/** Coordenadas perto de BASE_POINT, ausentes (uma ou ambas) ou inválidas. */
export const arbCoords: fc.Arbitrary<{ latitude: number | null; longitude: number | null }> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc
      .record({ north: arbOffsetM, east: fc.double({ min: -60, max: 60, noNaN: true }) })
      .map(({ north, east }) => {
        const p = pointNorth(BASE_POINT, north);
        const lngPerM = (1 / (EARTH_RADIUS_M * Math.cos((p.lat * Math.PI) / 180))) * (180 / Math.PI);
        return { latitude: p.lat, longitude: p.lng + east * lngPerM };
      }),
  },
  {
    weight: 2,
    arbitrary: fc.constantFrom(
      { latitude: null, longitude: null },
      { latitude: BASE_POINT.lat, longitude: null },
      { latitude: null, longitude: BASE_POINT.lng },
    ),
  },
  {
    weight: 1,
    arbitrary: fc.constantFrom(
      { latitude: Number.NaN, longitude: BASE_POINT.lng },
      { latitude: 91, longitude: BASE_POINT.lng },
    ),
  },
);

/** Chave de deduplicação: identificadores repetidos ou vazios, nomes variados, coordenadas próximas ou ausentes. */
export const arbCompanyKey: fc.Arbitrary<CompanyKey> = fc
  .record({
    googlePlaceId: arbId('g'),
    osmId: arbId('node/'),
    cnpj: arbId('cnpj'),
    nome: arbRawName,
    coords: arbCoords,
  })
  .map(({ nome, coords, ...ids }) => ({
    ...ids,
    nomeNormalizado: normalizeCompanyName(nome),
    ...coords,
  }));

/** Base existente com ids distintos; algumas empresas têm aliases de osmId (inclusive vazios). */
export const arbExistingKeys: fc.Arbitrary<CompanyKey[]> = fc
  .array(
    fc.record({
      key: arbCompanyKey,
      aliases: fc.option(fc.array(arbId('node/'), { maxLength: 2 }), { nil: undefined }),
    }),
    { maxLength: 8 },
  )
  .map((rows) =>
    rows.map(({ key, aliases }, i) => ({
      ...key,
      id: `c${i}`,
      ...(aliases === undefined
        ? {}
        : { aliases: aliases.filter((a): a is string => a !== null) }),
    })),
  );

// ---------------------------------------------------------------------------
// Ingestão em memória
// ---------------------------------------------------------------------------

const arbOptText = fc.constantFrom<string | null>(null, '', ' ', 'A', 'B');

/** Dados cadastrais de uma empresa encontrada (sem osmId/nicho). */
const arbFoundData = fc
  .record({
    nome: arbRawName,
    endereco: arbOptText,
    bairro: arbOptText,
    cidade: arbOptText,
    uf: fc.constantFrom<string | null>(null, 'SP', 'RJ'),
    telefone: arbOptText,
    website: fc.constantFrom<string | null>(null, '', 'https://a.com', 'http://b.com'),
    marcaRede: arbOptText,
    coords: arbCoords,
  })
  .map(({ coords, ...rest }) => ({ ...rest, ...coords }));

/**
 * Resultado de busca realista da Fonte_OSM: elementos com `osmId` único e não vazio;
 * o mesmo elemento pode reaparecer (ex.: em outro nicho) com os mesmos dados.
 */
export const arbFoundCompanies: fc.Arbitrary<FoundCompany[]> = fc
  .array(arbFoundData, { maxLength: 6 })
  .chain((elements) =>
    elements.length === 0
      ? fc.constant<FoundCompany[]>([])
      : fc
        .array(
          fc.record({
            idx: fc.nat({ max: elements.length - 1 }),
            nicho: fc.constantFrom('padaria', 'mercado', 'oficina'),
          }),
          { maxLength: 10 },
        )
        .map((picks) =>
          picks.map(({ idx, nicho }) => ({ ...elements[idx], osmId: `node/${idx + 1}`, nicho })),
        ),
  );

/** Base inicial: empresas com `osmId` do mesmo pool (ou nulo), responsável opcional e vínculos anteriores. */
export const arbInMemoryBase: fc.Arbitrary<InMemoryBase> = fc
  .array(
    fc.record({
      data: arbFoundData,
      osmId: fc.constantFrom<string | null>(null, 'node/1', 'node/2', 'node/3', 'node/9'),
      assignedTo: fc.constantFrom<string | null>(null, 'user-1'),
    }),
    { maxLength: 5 },
  )
  .map((rows) => {
    const seen = new Set<string>();
    const companies: InMemoryCompany[] = rows.map(({ data, osmId, assignedTo }, i) => {
      // Unicidade de osmId na base (Req. 9.11).
      const uniqueOsm = osmId !== null && !seen.has(osmId) ? osmId : null;
      if (uniqueOsm) seen.add(uniqueOsm);
      return {
        id: `base-${i}`,
        googlePlaceId: null,
        osmId: uniqueOsm,
        cnpj: null,
        nomeNormalizado: normalizeCompanyName(data.nome),
        nicho: 'padaria',
        assignedTo,
        ...data,
      };
    });
    const links = companies.map((c) => ({ runId: 'run-0', companyId: c.id, isNew: true, nicho: c.nicho }));
    return { companies, links };
  });
