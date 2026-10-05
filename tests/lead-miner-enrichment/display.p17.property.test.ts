/**
 * **Validates: Requirements 6.5, 6.6, 6.7**
 *
 * O Mapa (`ownFields` → coordenadas próprias), o CSV (`toCsvRow`/`buildCsv`) e o
 * Lead_de_Triagem (`buildTriageLead`) nunca expõem Conteudo_Google: só valores próprios da
 * Empresa e, quando há Place_ID, o link do Google Maps (derivado do identificador, não do cache).
 * Toda informação exclusiva do Cache_Google (marcada com `§G§`) jamais aparece na saída.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ownFields, type DisplaySource, type GoogleCacheRow } from '@/lib/leads/display';
import { buildCsv, toCsvRow, type ExportRow } from '@/lib/leads/csv';
import { buildTriageLead, type TriageSource } from '@/lib/leads/triage';
import { NICHES } from '@/lib/leads/config';
import type { CategoryCode } from '@/lib/leads/types';

// Feature: lead-miner-enrichment, Property 17: For any Empresa com Cache_Google arbitrário, nem o Mapa (ownFields), nem o CSV (toCsvRow), nem o Lead_de_Triagem (buildTriageLead) contêm valores exclusivos do cache; só valores próprios e o link do Google Maps (do Place_ID).

/** Marcador presente só em valores exclusivos do Cache_Google. */
const MARK = '§G§';
const NICHE_IDS = NICHES.map((n) => n.id);
const CATEGORIES: (CategoryCode | null)[] = ['CRIAR_SITE', 'OTIMIZACAO_SEGURANCA', 'ANALISE_DADOS_BI', null];

const ownText = fc.oneof(fc.constant(null), fc.constant(''), fc.constant('  '), fc.stringMatching(/^[A-Za-z0-9 ]{1,12}$/));
const cacheText = fc.stringMatching(/^[A-Za-z0-9 ]{0,8}$/).map((s) => `${s}${MARK}`);
const ownCoord = fc.oneof(fc.constant(null), fc.double({ min: -89, max: 89, noNaN: true }), fc.constant(Number.NaN));
const cacheCoord = fc.double({ min: 100, max: 179, noNaN: true });

const scenario = fc.record({
  nome: ownText.map((v) => v ?? ''),
  cnpjNomeFantasia: ownText,
  endereco: ownText,
  bairro: ownText,
  cidade: ownText,
  uf: ownText,
  telefone: ownText,
  website: ownText,
  latitude: ownCoord,
  longitude: ownCoord,
  googlePlaceId: fc.oneof(fc.constant(null), fc.stringMatching(/^[A-Za-z0-9_-]{1,20}$/)),
  nicho: fc.constantFrom(...NICHE_IDS),
  categoria: fc.constantFrom(...CATEGORIES),
  assignedTo: fc.oneof(fc.constant(null), fc.uuid()),
  situacaoCadastral: fc.oneof(fc.constant(null), fc.constantFrom('ATIVA', 'BAIXADA')),
  instagramOsm: ownText,
  whatsappOsm: ownText,
  desempenhoRuim: fc.oneof(fc.constant(null), fc.boolean()),
  // Cache sempre presente e cheio de marcadores: nada dele pode vazar.
  cache: fc.record({
    nome: cacheText,
    endereco: cacheText,
    bairro: cacheText,
    cidade: cacheText,
    uf: cacheText,
    telefone: cacheText,
    website: cacheText,
    latitude: cacheCoord,
    longitude: cacheCoord,
    mapsUri: fc.constant(`https://maps.example/${MARK}`),
    businessStatus: fc.constant(`OPERATIONAL${MARK}`),
    tipos: fc.constant([`tipo${MARK}`]),
  }),
});

type Scenario = typeof scenario extends fc.Arbitrary<infer T> ? T : never;

function toSource(r: Scenario): DisplaySource {
  const googleCache: GoogleCacheRow = {
    ...r.cache,
    obtidoEm: new Date('2025-01-01T00:00:00Z'),
    expiraEm: new Date('2025-01-31T00:00:00Z'),
  };
  return {
    nome: r.nome,
    cnpjNomeFantasia: r.cnpjNomeFantasia,
    endereco: r.endereco,
    bairro: r.bairro,
    cidade: r.cidade,
    uf: r.uf,
    telefone: r.telefone,
    website: r.website,
    latitude: r.latitude,
    longitude: r.longitude,
    googlePlaceId: r.googlePlaceId,
    googleCache,
  };
}

describe('Property 17: Mapa, CSV e triagem sem Conteudo_Google', () => {
  it('nenhum valor exclusivo do Cache_Google aparece no Mapa, no CSV nem na triagem', () => {
    fc.assert(
      fc.property(scenario, (r) => {
        const source = toSource(r);

        // ── Mapa: ownFields só usa coordenadas e campos próprios ──
        const own = ownFields(source);
        expect(JSON.stringify(own)).not.toContain(MARK);
        // Coordenadas vêm das próprias (ou null), nunca da faixa 100–179 do cache.
        if (own.latitude !== null) expect(own.latitude).toBeLessThan(100);
        if (own.longitude !== null) expect(own.longitude).toBeLessThan(100);

        // ── Triagem ──
        const triage: TriageSource = {
          id: 'c1',
          nomeExibicao: own.nome, // Nome_Exibicao sem cache = nome próprio/fantasia
          nicho: r.nicho,
          telefone: source.telefone,
          website: source.website,
          categoria: r.categoria,
          assignedTo: r.assignedTo,
          googlePlaceId: r.googlePlaceId,
        };
        const lead = buildTriageLead(triage);
        expect(JSON.stringify(lead)).not.toContain(MARK);
        // O contactInfo só tem telefone/website próprios + link do Maps (Place_ID).
        if (lead.contactInfo) {
          const partes = lead.contactInfo.split(' | ');
          for (const p of partes) {
            const ehTelefoneProprio = source.telefone?.trim() === p;
            const ehWebsiteProprio = source.website?.trim() === p;
            const ehMaps = r.googlePlaceId !== null && p === `https://www.google.com/maps/place/?q=place_id:${r.googlePlaceId}`;
            expect(ehTelefoneProprio || ehWebsiteProprio || ehMaps).toBe(true);
          }
        }

        // ── CSV ──
        const row: ExportRow = {
          nome: own.nome,
          nicho: r.nicho,
          endereco: own.endereco,
          bairro: own.bairro,
          cidade: own.cidade,
          uf: own.uf,
          telefone: own.telefone,
          website: own.website,
          categoria: r.categoria,
          scoreFinal: null,
          prioridade: null,
          responsavelNome: null,
          ultimaAnaliseEm: null,
          cnpj: null,
          situacaoCadastral: r.situacaoCadastral,
          instagram: r.instagramOsm,
          whatsapp: r.whatsappOsm,
          desempenhoRuim: r.desempenhoRuim,
          fonte: null,
          googlePlaceId: r.googlePlaceId,
        };
        const csv = buildCsv([toCsvRow(row)]);
        expect(csv).not.toContain(MARK);
        expect(csv).not.toContain('maps.example');
        expect(csv).not.toContain('OPERATIONAL');
      }),
      { numRuns: 300 },
    );
  });
});
