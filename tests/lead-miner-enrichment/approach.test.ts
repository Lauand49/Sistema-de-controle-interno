/**
 * Testes de exemplo do Gerador_Abordagem (Req. 15.2, 15.3, 15.4, 15.5, 21.7).
 */
import { describe, expect, it } from 'vitest';
import {
  generateApproach,
  hasTemplateMarkers,
  parseApproachResponse,
  type ApproachChannel,
  type ApproachDeps,
  type ApproachInput,
} from '@/lib/leads/approach';
import { APPROACH_LIMITS } from '@/lib/leads/config';
import { monthKey } from '@/lib/leads/usage';
import { immediateTimer } from '../lead-miner/support/fake-ai';
import { fakeGemini, geminiJson, type FakeGemini, type GeminiStep } from './support/fake-gemini';
import { memoryUsageGate, type MemoryUsageGate } from './support/fake-usage';

const NOW = new Date('2026-10-15T12:00:00.000Z');
const MONTH = monthKey(NOW);
const LIMIT = 1_000;

function input(canal: ApproachChannel, over: Partial<ApproachInput> = {}): ApproachInput {
  return {
    nomeExibicao: 'Padaria Boa',
    nicho: 'Padaria',
    bairro: 'Vila Mariana',
    cidade: 'São Paulo',
    categoria: 'OTIMIZACAO_SEGURANCA',
    motivos: ['Desempenho baixo no PageSpeed'],
    pagespeed: null,
    sinais: null,
    cnpj: null,
    oportunidadeIa: null,
    canal,
    remetente: 'João',
    ...over,
  };
}

interface Setup {
  deps: ApproachDeps;
  usage: MemoryUsageGate;
  client: FakeGemini;
  log: string[];
}

/** `instantTimeout`: timeout dispara no próximo microtask (só para o caso de timeout). */
function setup(
  script: GeminiStep[],
  opts: { used?: number; withClient?: boolean; instantTimeout?: boolean } = {},
): Setup {
  const log: string[] = [];
  const usage = memoryUsageGate(opts.used !== undefined ? { [`gemini:${MONTH}`]: opts.used } : {}, log);
  const client = fakeGemini(script, { log });
  const deps: ApproachDeps = {
    client: opts.withClient === false ? null : client,
    usage,
    limit: LIMIT,
    now: () => NOW,
    ...(opts.instantTimeout ? { setTimer: immediateTimer } : {}),
  };
  return { deps, usage, client, log };
}

const repeat = (n: number) => 'a'.repeat(n);

describe('generateApproach: resposta válida da IA (Req. 15.2)', () => {
  it('WhatsApp: origem IA, sem assunto, uma reserva antes de uma única requisição', async () => {
    const s = setup([geminiJson({ texto: '  Olá! Somos a SciTec jr.  ' })]);
    const msg = await generateApproach(input('WHATSAPP'), s.deps);
    expect(msg).toEqual({ canal: 'WHATSAPP', origem: 'IA', assunto: null, texto: 'Olá! Somos a SciTec jr.', fallback: null });
    expect(s.usage.reserveCalls).toEqual([{ provider: 'gemini', month: MONTH, limit: LIMIT, granted: true }]);
    expect(s.client.prompts).toHaveLength(1);
    expect(s.log).toEqual(['reserve:gemini:ok', 'generate']);
    expect(s.usage.peek('gemini', MONTH)).toBe(1);
  });

  it('E-mail: origem IA com assunto', async () => {
    const s = setup([{ text: '```json\n{"assunto":"Diagnóstico do site","texto":"Olá, tudo bem?"}\n```' }]);
    const msg = await generateApproach(input('EMAIL'), s.deps);
    expect(msg).toEqual({
      canal: 'EMAIL',
      origem: 'IA',
      assunto: 'Diagnóstico do site',
      texto: 'Olá, tudo bem?',
      fallback: null,
    });
    expect(s.usage.reserveCalls).toHaveLength(1);
    expect(s.client.prompts).toHaveLength(1);
  });
});

describe('generateApproach: fallback para o modelo fixo (Req. 15.4, 15.5)', () => {
  function expectTemplate(msg: Awaited<ReturnType<typeof generateApproach>>, canal: ApproachChannel) {
    expect(msg.origem).toBe('MODELO');
    expect(msg.canal).toBe(canal);
    expect(msg.texto.length).toBeGreaterThan(0);
    expect(hasTemplateMarkers(msg.texto)).toBe(false);
    if (canal === 'EMAIL') {
      expect(msg.assunto).toBeTruthy();
      expect(msg.assunto!.length).toBeLessThanOrEqual(APPROACH_LIMITS.emailSubject);
      expect(msg.texto.length).toBeLessThanOrEqual(APPROACH_LIMITS.emailBody);
    } else {
      expect(msg.assunto).toBeNull();
      expect(msg.texto.length).toBeLessThanOrEqual(APPROACH_LIMITS.whatsapp);
    }
  }

  it('sem chave: IA_SEM_CHAVE, sem reserva nem requisição', async () => {
    const s = setup([], { withClient: false });
    const msg = await generateApproach(input('EMAIL'), s.deps);
    expectTemplate(msg, 'EMAIL');
    expect(msg.fallback).toBe('IA_SEM_CHAVE');
    expect(s.usage.reserveCalls).toHaveLength(0);
    expect(s.client.prompts).toHaveLength(0);
  });

  it('cota esgotada: IA_COTA_ESGOTADA, uma reserva negada e nenhuma requisição', async () => {
    const s = setup([geminiJson({ texto: 'nunca usado' })], { used: LIMIT });
    const msg = await generateApproach(input('WHATSAPP'), s.deps);
    expectTemplate(msg, 'WHATSAPP');
    expect(msg.fallback).toBe('IA_COTA_ESGOTADA');
    expect(s.usage.reserveCalls).toEqual([{ provider: 'gemini', month: MONTH, limit: LIMIT, granted: false }]);
    expect(s.client.prompts).toHaveLength(0);
    expect(s.usage.peek('gemini', MONTH)).toBe(LIMIT);
  });

  it('erro da IA: IA_ERRO, contador incrementado e sem nova tentativa', async () => {
    const s = setup([{ error: 'HTTP 500' }, geminiJson({ texto: 'segunda tentativa' })]);
    const msg = await generateApproach(input('EMAIL'), s.deps);
    expectTemplate(msg, 'EMAIL');
    expect(msg.fallback).toBe('IA_ERRO');
    expect(s.usage.reserveCalls).toHaveLength(1);
    expect(s.client.prompts).toHaveLength(1);
    expect(s.client.remaining()).toBe(1);
    expect(s.usage.peek('gemini', MONTH)).toBe(1);
  });

  it('erro síncrono do cliente: IA_ERRO', async () => {
    const s = setup([{ throw: true }]);
    const msg = await generateApproach(input('WHATSAPP'), s.deps);
    expect(msg.fallback).toBe('IA_ERRO');
    expect(msg.origem).toBe('MODELO');
  });

  it('timeout: IA_TIMEOUT, sinal abortado e uma única requisição', async () => {
    const s = setup([{ hang: true }, geminiJson({ texto: 'segunda tentativa' })], { instantTimeout: true });
    const msg = await generateApproach(input('WHATSAPP'), s.deps);
    expectTemplate(msg, 'WHATSAPP');
    expect(msg.fallback).toBe('IA_TIMEOUT');
    expect(s.client.prompts).toHaveLength(1);
    expect(s.client.signals[0].aborted).toBe(true);
    expect(s.usage.reserveCalls).toHaveLength(1);
    expect(s.usage.peek('gemini', MONTH)).toBe(1);
  });

  it('resposta inválida: IA_RESPOSTA_INVALIDA, sem nova tentativa', async () => {
    const s = setup([{ text: 'isto não é JSON' }, geminiJson({ texto: 'segunda tentativa' })]);
    const msg = await generateApproach(input('EMAIL'), s.deps);
    expectTemplate(msg, 'EMAIL');
    expect(msg.fallback).toBe('IA_RESPOSTA_INVALIDA');
    expect(s.client.prompts).toHaveLength(1);
    expect(s.usage.reserveCalls).toHaveLength(1);
  });

  it('e-mail sem assunto na resposta: IA_RESPOSTA_INVALIDA', async () => {
    const s = setup([geminiJson({ texto: 'Olá' })]);
    const msg = await generateApproach(input('EMAIL'), s.deps);
    expect(msg.fallback).toBe('IA_RESPOSTA_INVALIDA');
  });

  it('texto acima do limite vira fallback IA_RESPOSTA_INVALIDA', async () => {
    const s = setup([geminiJson({ texto: repeat(APPROACH_LIMITS.whatsapp + 1) })]);
    const msg = await generateApproach(input('WHATSAPP'), s.deps);
    expect(msg.fallback).toBe('IA_RESPOSTA_INVALIDA');
  });

  it('marcador na resposta vira fallback IA_RESPOSTA_INVALIDA', async () => {
    const s = setup([geminiJson({ texto: 'Olá, [NOME]!' })]);
    const msg = await generateApproach(input('WHATSAPP'), s.deps);
    expect(msg.fallback).toBe('IA_RESPOSTA_INVALIDA');
  });
});

describe('parseApproachResponse: limites por canal (Req. 15.3, 1.8)', () => {
  it('WhatsApp: 700 aceito, 701 recusado', () => {
    expect(APPROACH_LIMITS.whatsapp).toBe(700);
    expect(parseApproachResponse(JSON.stringify({ texto: repeat(700) }), 'WHATSAPP')?.texto).toHaveLength(700);
    expect(parseApproachResponse(JSON.stringify({ texto: repeat(701) }), 'WHATSAPP')).toBeNull();
  });

  it('E-mail: assunto 120/121 e corpo 2.000/2.001', () => {
    expect(APPROACH_LIMITS.emailSubject).toBe(120);
    expect(APPROACH_LIMITS.emailBody).toBe(2_000);
    const ok = parseApproachResponse(JSON.stringify({ assunto: repeat(120), texto: repeat(2_000) }), 'EMAIL');
    expect(ok?.assunto).toHaveLength(120);
    expect(ok?.texto).toHaveLength(2_000);
    expect(parseApproachResponse(JSON.stringify({ assunto: repeat(121), texto: 'ok' }), 'EMAIL')).toBeNull();
    expect(parseApproachResponse(JSON.stringify({ assunto: 'ok', texto: repeat(2_001) }), 'EMAIL')).toBeNull();
  });

  it('texto vazio ou não-string é recusado', () => {
    expect(parseApproachResponse(JSON.stringify({ texto: '   ' }), 'WHATSAPP')).toBeNull();
    expect(parseApproachResponse(JSON.stringify({ texto: 42 }), 'WHATSAPP')).toBeNull();
    expect(parseApproachResponse('[]', 'WHATSAPP')).toBeNull();
  });
});

describe('marcadores de modelo não substituídos (Req. 15.3)', () => {
  it.each([
    ['{{', 'Olá {{nome, tudo bem?'],
    ['}}', 'Olá nome}}, tudo bem?'],
    ['[NOME]', 'Olá [NOME], tudo bem?'],
  ])('recusa %s', (_m, texto) => {
    expect(hasTemplateMarkers(texto)).toBe(true);
    expect(parseApproachResponse(JSON.stringify({ texto }), 'WHATSAPP')).toBeNull();
    expect(parseApproachResponse(JSON.stringify({ assunto: texto, texto: 'ok' }), 'EMAIL')).toBeNull();
  });

  it('texto comum sem marcadores é aceito', () => {
    expect(hasTemplateMarkers('Olá! Podemos conversar (15 min)?')).toBe(false);
  });

  it('modelo fixo não gera marcadores mesmo com dados contendo chaves/colchetes', async () => {
    const s = setup([], { withClient: false });
    const msg = await generateApproach(
      input('EMAIL', { nomeExibicao: '{{Padaria}} [NOME]', motivos: ['[MOTIVO] }}'] }),
      s.deps,
    );
    expect(msg.origem).toBe('MODELO');
    expect(hasTemplateMarkers(msg.texto)).toBe(false);
    expect(hasTemplateMarkers(msg.assunto!)).toBe(false);
  });
});
