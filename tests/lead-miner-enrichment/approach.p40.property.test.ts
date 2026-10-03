/**
 * **Validates: Requirements 15.4, 15.5**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  generateApproach,
  hasTemplateMarkers,
  templateMessage,
  type ApproachChannel,
  type ApproachDeps,
  type ApproachFallbackReason,
  type ApproachInput,
} from '@/lib/leads/approach';
import type { CategoryCode, PageSpeedResult } from '@/lib/leads/types';
import { monthKey } from '@/lib/leads/usage';
import { immediateTimer } from '../lead-miner/support/fake-ai';
import { fakeGemini, type GeminiStep } from './support/fake-gemini';
import { memoryUsageGate } from './support/fake-usage';

// Feature: lead-miner-enrichment, Property 40: For any Categoria, canal e dados de Empresa (incluindo nomes e bairros longos) e qualquer falha da IA (sem chave, cota recusada, erro, timeout, resposta inválida), `generateApproach` devolve origem `MODELO` com o motivo correspondente; e `templateMessage` sempre devolve texto não vazio, dentro dos limites do canal e sem marcadores não substituídos.

const LIMITS = { whatsapp: 700, emailSubject: 120, emailBody: 2_000 };
const NOW = new Date('2026-10-15T12:00:00.000Z');
const MONTH = monthKey(NOW);
const LIMIT = 1_000;

// ---------------------------------------------------------------------------
// Geradores
// ---------------------------------------------------------------------------

/** Texto livre com acentos, emojis, chaves/colchetes e marcadores que o modelo deve neutralizar. */
const nasty = fc.constantFrom('{{nome}}', '[NOME]', '[CIDADE]', '{', '}', '[', ']', '😀', 'ç', 'ã', '\n', '\t', '  ', '&', '#');
const freeText = (maxLength: number) =>
  fc.oneof(
    fc.string({ maxLength }),
    fc.array(fc.oneof(fc.string({ maxLength: 8 }), nasty), { maxLength: 40 }).map((a) => a.join('')),
    // Nomes/bairros longos (bem acima dos limites internos e do canal).
    fc.tuple(fc.constantFrom('a', 'Padaria ', 'Rua São João ', '😀', 'x'), fc.integer({ min: 50, max: 3_000 })).map(([s, n]) => s.repeat(n)),
  );

const arbPagespeed: fc.Arbitrary<PageSpeedResult | null> = fc.option(
  fc.record({
    desempenho: fc.oneof(fc.integer({ min: 0, max: 100 }), fc.double({ min: 0, max: 100, noNaN: true })),
    acessibilidade: fc.constant(null),
    boasPraticas: fc.constant(null),
    seo: fc.constant(null),
    lcpMs: fc.constant(null),
    cls: fc.constant(null),
    tbtMs: fc.constant(null),
    fcpMs: fc.constant(null),
    urlAnalisada: fc.constant('https://exemplo.com.br/'),
  }),
  { nil: null },
);

const arbInput: fc.Arbitrary<ApproachInput> = fc.record({
  nomeExibicao: freeText(200),
  nicho: freeText(80),
  bairro: fc.option(freeText(200), { nil: null }),
  cidade: fc.option(freeText(200), { nil: null }),
  categoria: fc.constantFrom<CategoryCode>('CRIAR_SITE', 'OTIMIZACAO_SEGURANCA', 'ANALISE_DADOS_BI'),
  motivos: fc.array(freeText(300), { maxLength: 6 }),
  pagespeed: arbPagespeed,
  sinais: fc.constant(null),
  cnpj: fc.constant(null),
  oportunidadeIa: fc.option(freeText(200), { nil: null }),
  canal: fc.constantFrom<ApproachChannel>('WHATSAPP', 'EMAIL'),
  remetente: freeText(60),
});

/** Resposta da IA que `parseApproachResponse` rejeita para qualquer canal. */
const invalidResponse = fc.constantFrom(
  'não é JSON',
  '',
  'null',
  '[]',
  '{"texto": ""}',
  '{"texto": "   "}',
  '{"texto": "Olá {{nome}}, tudo bem?", "assunto": "Contato"}',
  '{"texto": "Olá [NOME]!", "assunto": "Contato"}',
  JSON.stringify({ texto: 'a'.repeat(2_001), assunto: 'Contato' }),
  '{"texto": 42, "assunto": "Contato"}',
  '{"assunto": "Contato"}',
);

type Failure =
  | { kind: 'IA_SEM_CHAVE' }
  | { kind: 'IA_COTA_ESGOTADA'; limit: number }
  | { kind: 'IA_ERRO'; via: 'reject' | 'throw' | 'usage' }
  | { kind: 'IA_TIMEOUT' }
  | { kind: 'IA_RESPOSTA_INVALIDA'; raw: string };

const arbFailure: fc.Arbitrary<Failure> = fc.oneof(
  fc.constant<Failure>({ kind: 'IA_SEM_CHAVE' }),
  fc.constantFrom(0, 1, 5, LIMIT).map<Failure>((limit) => ({ kind: 'IA_COTA_ESGOTADA', limit })),
  fc.constantFrom<'reject' | 'throw' | 'usage'>('reject', 'throw', 'usage').map<Failure>((via) => ({ kind: 'IA_ERRO', via })),
  fc.constant<Failure>({ kind: 'IA_TIMEOUT' }),
  invalidResponse.map<Failure>((raw) => ({ kind: 'IA_RESPOSTA_INVALIDA', raw })),
);

function depsFor(f: Failure): ApproachDeps {
  // Cota recusada: contador já no limite (ou limite < 1).
  const used = f.kind === 'IA_COTA_ESGOTADA' ? Math.max(0, f.limit) : 0;
  const usage = memoryUsageGate({ [`gemini:${MONTH}`]: used });
  if (f.kind === 'IA_ERRO' && f.via === 'usage') {
    usage.reserve = async () => {
      throw new Error('banco indisponível');
    };
  }
  let step: GeminiStep | null = null;
  if (f.kind === 'IA_ERRO' && f.via === 'reject') step = { error: 'HTTP 500' };
  if (f.kind === 'IA_ERRO' && f.via === 'throw') step = { throw: true };
  if (f.kind === 'IA_TIMEOUT') step = { hang: true };
  if (f.kind === 'IA_RESPOSTA_INVALIDA') step = { text: f.raw };
  const client = fakeGemini(step ? [step] : []);
  return {
    client: f.kind === 'IA_SEM_CHAVE' ? null : client,
    usage,
    limit: f.kind === 'IA_COTA_ESGOTADA' ? f.limit : LIMIT,
    now: () => NOW,
    // Timeout instantâneo só no caso de timeout; nos demais o timer real é cancelado logo.
    ...(f.kind === 'IA_TIMEOUT' ? { setTimer: immediateTimer } : {}),
  };
}

function expectValidTemplate(canal: ApproachChannel, assunto: string | null, texto: string) {
  expect(texto.trim().length).toBeGreaterThan(0);
  expect(texto.length).toBeLessThanOrEqual(canal === 'WHATSAPP' ? LIMITS.whatsapp : LIMITS.emailBody);
  expect(hasTemplateMarkers(texto)).toBe(false);
  if (canal === 'WHATSAPP') {
    expect(assunto).toBeNull();
  } else {
    expect(assunto).not.toBeNull();
    expect(assunto!.trim().length).toBeGreaterThan(0);
    expect(assunto!.length).toBeLessThanOrEqual(LIMITS.emailSubject);
    expect(hasTemplateMarkers(assunto!)).toBe(false);
  }
}

describe('Property 40: Fallback para o modelo fixo', () => {
  it('qualquer falha da IA → origem MODELO com o motivo correspondente e o texto do modelo fixo', async () => {
    await fc.assert(
      fc.asyncProperty(arbInput, arbFailure, async (input, failure) => {
        const msg = await generateApproach(input, depsFor(failure));
        const expected: ApproachFallbackReason = failure.kind;
        expect(msg.origem).toBe('MODELO');
        expect(msg.fallback).toBe(expected);
        expect(msg.canal).toBe(input.canal);
        expect({ assunto: msg.assunto, texto: msg.texto }).toEqual(templateMessage(input));
        expectValidTemplate(input.canal, msg.assunto, msg.texto);
      }),
      { numRuns: 200 },
    );
  });

  it('templateMessage sempre devolve texto não vazio, dentro dos limites e sem marcadores', () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const tpl = templateMessage(input);
        expectValidTemplate(input.canal, tpl.assunto, tpl.texto);
      }),
      { numRuns: 300 },
    );
  });
});
