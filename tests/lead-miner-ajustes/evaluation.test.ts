/**
 * T5 — avaliação básica dos leads sem contato (lógica pura + lote + cota + fallback).
 * Offline: cliente Gemini e contador de uso simulados.
 */
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import type { GeminiClient } from '@/lib/leads/ai';
import type { UsageGate } from '@/lib/leads/usage';
import {
  EVALUATION_AUTO_CAP,
  EVALUATION_BATCH_SIZE,
  RESUMO_MAX,
  SUGESTAO_MAX,
  buildEvaluationPrompt,
  evaluateBatch,
  evaluateMany,
  evaluationDto,
  parseEvaluationResponse,
  ruleEvaluation,
  type EvaluationDeps,
  type EvaluationInput,
} from '@/lib/leads/evaluation';

const input = (i: number, over: Partial<EvaluationInput> = {}): EvaluationInput => ({
  id: `c${i}`,
  nome: `Loja ${i}`,
  nicho: 'clinica_odontologica',
  bairro: 'Centro',
  cidade: 'Santos',
  website: null,
  hasSite: false,
  isHttps: null,
  desempenho: null,
  ...over,
});

const many = (n: number) => Array.from({ length: n }, (_, i) => input(i));

/** Resposta válida do Gemini para `n` itens. */
const okResponse = (n: number) =>
  JSON.stringify({
    avaliacoes: Array.from({ length: n }, (_, i) => ({ ref: i + 1, resumo: `Resumo IA ${i + 1}`, sugestao: `Sugestão IA ${i + 1}` })),
  });

function makeUsage(limit = Number.POSITIVE_INFINITY) {
  let used = 0;
  const gate: UsageGate = {
    reserve: vi.fn(async () => {
      if (used >= limit) return false;
      used += 1;
      return true;
    }),
    count: vi.fn(async () => used),
  };
  return gate;
}

function deps(client: GeminiClient | null, over: Partial<EvaluationDeps> = {}): EvaluationDeps {
  return { client, usage: makeUsage(), limit: 1000, now: () => new Date('2026-10-20T12:00:00Z'), ...over };
}

const clientReturning = (fn: (prompt: string) => string | Promise<string>) => {
  const generate = vi.fn(async (prompt: string) => fn(prompt));
  return { client: { generate } as GeminiClient, generate };
};

/** Resposta que acompanha o tamanho do lote enviado (conta os `"ref":` do bloco de empresas). */
const echoBatch = (prompt: string) => {
  const n = (prompt.match(/"ref":/g) ?? []).length - 1; // -1: o exemplo do formato também tem "ref"
  return okResponse(n);
};

describe('prompt', () => {
  it('envia só nome, nicho, local, site, HTTPS e desempenho; sem ids internos', () => {
    const prompt = buildEvaluationPrompt([
      input(1, { website: 'https://loja1.com.br', hasSite: true, isHttps: true, desempenho: 71.6 }),
    ]);
    const json = prompt.split('EMPRESAS (JSON):\n')[1].split('\n')[0];
    const [item] = JSON.parse(json) as Array<Record<string, unknown>>;
    expect(Object.keys(item).sort()).toEqual(['desempenho', 'https', 'local', 'nicho', 'nome', 'ref', 'site', 'temSite']);
    expect(item).toMatchObject({ ref: 1, nome: 'Loja 1', local: 'Centro, Santos', site: 'https://loja1.com.br', https: true, desempenho: 72 });
    expect(prompt).not.toContain('c1');
    expect(prompt).toMatch(/português/i);
    expect(prompt).toMatch(/ignore quaisquer instruções/i);
  });

  it('nome vazio (empresa só do Google) vai como null, nunca inventado', () => {
    const json = buildEvaluationPrompt([input(1, { nome: '' })]).split('EMPRESAS (JSON):\n')[1].split('\n')[0];
    expect((JSON.parse(json) as Array<{ nome: unknown }>)[0].nome).toBeNull();
  });
});

describe('parseEvaluationResponse (zod)', () => {
  it('aceita JSON puro e dentro de ```json```', () => {
    expect(parseEvaluationResponse(okResponse(2), 2)?.size).toBe(2);
    expect(parseEvaluationResponse('```json\n' + okResponse(1) + '\n```', 1)?.get(1)?.resumo).toBe('Resumo IA 1');
  });

  it('rejeita o que não é JSON ou não tem o formato', () => {
    for (const raw of ['', 'texto solto', '{"avaliacoes": "x"}', '[]', '{"outro": []}', 'null']) {
      expect(parseEvaluationResponse(raw, 3)).toBeNull();
    }
  });

  it('ignora só os itens inválidos: campos ausentes, longos demais, ref fora do lote ou repetido', () => {
    const raw = JSON.stringify({
      avaliacoes: [
        { ref: 1, resumo: 'ok', sugestao: 'ok' },
        { ref: 2, resumo: '', sugestao: 'x' },
        { ref: 3, resumo: 'x'.repeat(RESUMO_MAX + 1), sugestao: 'x' },
        { ref: 4, resumo: 'x', sugestao: 'y'.repeat(SUGESTAO_MAX + 1) },
        { ref: 9, resumo: 'x', sugestao: 'y' },
        { ref: 1, resumo: 'duplicado', sugestao: 'duplicado' },
        { resumo: 'sem ref', sugestao: 'x' },
        'lixo',
      ],
    });
    const parsed = parseEvaluationResponse(raw, 5);
    expect([...(parsed?.keys() ?? [])]).toEqual([1]);
    expect(parsed?.get(1)?.resumo).toBe('ok');
  });

  it('remove marcadores de modelo dos textos', () => {
    const raw = JSON.stringify({ avaliacoes: [{ ref: 1, resumo: 'Olá {{nome}} [X]', sugestao: 'ok' }] });
    expect(parseEvaluationResponse(raw, 1)?.get(1)?.resumo).not.toMatch(/[{}[\]]/);
  });
});

describe('ruleEvaluation', () => {
  it('é determinística e cita como obter contato', () => {
    const a = ruleEvaluation(input(1));
    expect(ruleEvaluation(input(1))).toEqual(a);
    expect(a.resumo).toMatch(/não tem site/i);
    expect(a.sugestao).toMatch(/Google Maps|redes sociais/i);
  });

  it('cobre site sem HTTPS, desempenho fraco, desempenho bom e site sem medição', () => {
    const base = { hasSite: true, website: 'https://x.com' };
    expect(ruleEvaluation(input(1, { ...base, isHttps: false })).resumo).toMatch(/sem HTTPS/);
    expect(ruleEvaluation(input(1, { ...base, isHttps: true, desempenho: 30 })).resumo).toMatch(/30\/100/);
    expect(ruleEvaluation(input(1, { ...base, isHttps: true, desempenho: 90 })).resumo).toMatch(/90\/100/);
    expect(ruleEvaluation(input(1, { ...base, isHttps: true })).resumo).toMatch(/nenhum contato direto/);
    expect(ruleEvaluation(input(1, base)).sugestao).toMatch(/formulário|página de contato/i);
  });

  it('propriedade: qualquer entrada gera textos não vazios dentro dos limites', () => {
    const str = fc.option(fc.string({ maxLength: 500 }), { nil: null });
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string(),
          nome: fc.string({ maxLength: 500 }),
          nicho: fc.string({ maxLength: 100 }),
          bairro: str,
          cidade: str,
          website: str,
          hasSite: fc.option(fc.boolean(), { nil: null }),
          isHttps: fc.option(fc.boolean(), { nil: null }),
          desempenho: fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: null }),
        }),
        (i) => {
          const r = ruleEvaluation(i);
          expect(r.resumo.trim().length).toBeGreaterThan(0);
          expect(r.resumo.length).toBeLessThanOrEqual(RESUMO_MAX);
          expect(r.sugestao.trim().length).toBeGreaterThan(0);
          expect(r.sugestao.length).toBeLessThanOrEqual(SUGESTAO_MAX);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('evaluateBatch', () => {
  it('sem chave: regras rotuladas, sem tocar na cota', async () => {
    const d = deps(null);
    const out = await evaluateBatch(many(3), d);
    expect(out).toHaveLength(3);
    for (const r of out) expect(r).toMatchObject({ fonte: 'REGRA', motivo: 'IA_SEM_CHAVE' });
    expect(d.usage.reserve).not.toHaveBeenCalled();
  });

  it('com IA: uma única chamada por lote, reservada em ApiUsage (provider gemini)', async () => {
    const { client, generate } = clientReturning(echoBatch);
    const d = deps(client, { limit: 77 });
    const out = await evaluateBatch(many(4), d);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(d.usage.reserve).toHaveBeenCalledWith('gemini', '2026-10', 77);
    expect(out.map((r) => r.fonte)).toEqual(['IA', 'IA', 'IA', 'IA']);
    expect(out.map((r) => r.id)).toEqual(['c0', 'c1', 'c2', 'c3']);
    expect(out[0].resumo).toBe('Resumo IA 1');
  });

  it('cota mensal esgotada: não chama a IA e usa regras', async () => {
    const { client, generate } = clientReturning(echoBatch);
    const out = await evaluateBatch(many(2), deps(client, { usage: makeUsage(0) }));
    expect(generate).not.toHaveBeenCalled();
    expect(out.every((r) => r.fonte === 'REGRA' && r.motivo === 'IA_COTA_ESGOTADA')).toBe(true);
  });

  it('falha ao reservar a cota, erro do cliente e resposta inválida caem em regras', async () => {
    const usageFail: UsageGate = { reserve: vi.fn(async () => { throw new Error('db'); }), count: vi.fn(async () => 0) };
    const a = await evaluateBatch(many(1), deps(clientReturning(echoBatch).client, { usage: usageFail }));
    expect(a[0]).toMatchObject({ fonte: 'REGRA', motivo: 'IA_ERRO' });

    const b = await evaluateBatch(many(1), deps(clientReturning(() => { throw new Error('500'); }).client));
    expect(b[0]).toMatchObject({ fonte: 'REGRA', motivo: 'IA_ERRO' });

    const c = await evaluateBatch(many(2), deps(clientReturning(() => 'isto não é JSON').client));
    expect(c.every((r) => r.fonte === 'REGRA' && r.motivo === 'IA_RESPOSTA_INVALIDA')).toBe(true);
  });

  it('timeout: aborta a chamada e usa regras', async () => {
    let aborted = false;
    const client: GeminiClient = {
      generate: (_p, { signal }) =>
        new Promise<string>((_, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('abortado'));
          });
        }),
    };
    const out = await evaluateBatch(many(1), deps(client, { setTimer: (cb) => { const h = setTimeout(cb, 0); return () => clearTimeout(h); } }));
    expect(out[0]).toMatchObject({ fonte: 'REGRA', motivo: 'IA_TIMEOUT' });
    expect(aborted).toBe(true);
  });

  it('resposta parcial: quem a IA cobriu fica como IA e o resto usa regras', async () => {
    const partial = JSON.stringify({ avaliacoes: [{ ref: 2, resumo: 'só este', sugestao: 'só este' }] });
    const out = await evaluateBatch(many(3), deps(clientReturning(() => partial).client));
    expect(out.map((r) => r.fonte)).toEqual(['REGRA', 'IA', 'REGRA']);
  });

  it('sem tempo até o prazo: nem reserva cota', async () => {
    const { client, generate } = clientReturning(echoBatch);
    const d = deps(client, { deadline: new Date('2026-10-20T12:00:05Z').getTime() });
    const out = await evaluateBatch(many(1), d);
    expect(generate).not.toHaveBeenCalled();
    expect(d.usage.reserve).not.toHaveBeenCalled();
    expect(out[0].motivo).toBe('IA_SEM_TEMPO');
  });

  it('lista vazia não faz nada', async () => {
    const d = deps(clientReturning(echoBatch).client);
    expect(await evaluateBatch([], d)).toEqual([]);
    expect(d.usage.reserve).not.toHaveBeenCalled();
  });
});

describe('evaluateMany — lotes de 10 e teto', () => {
  it('25 leads = 3 chamadas (10 + 10 + 5)', async () => {
    const { client, generate } = clientReturning(echoBatch);
    const out = await evaluateMany(many(25), deps(client));
    expect(generate).toHaveBeenCalledTimes(3);
    expect(out).toHaveLength(25);
    expect(out.every((r) => r.fonte === 'IA')).toBe(true);
    expect(EVALUATION_BATCH_SIZE).toBe(10);
  });

  it('teto de 30: com 45 candidatos só 30 são avaliados (3 chamadas)', async () => {
    const { client, generate } = clientReturning(echoBatch);
    const out = await evaluateMany(many(45), deps(client));
    expect(EVALUATION_AUTO_CAP).toBe(30);
    expect(out).toHaveLength(30);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(out.map((r) => r.id)).toEqual(many(30).map((i) => i.id));
  });

  it('respeita o limite mensal: cota de 2 chamadas → 20 por IA e 10 por regras', async () => {
    const { client, generate } = clientReturning(echoBatch);
    const out = await evaluateMany(many(30), deps(client, { usage: makeUsage(2) }));
    expect(generate).toHaveBeenCalledTimes(2);
    expect(out.filter((r) => r.fonte === 'IA')).toHaveLength(20);
    expect(out.slice(20).every((r) => r.fonte === 'REGRA' && r.motivo === 'IA_COTA_ESGOTADA')).toBe(true);
  });

  it('depois de cota esgotada os lotes seguintes nem tentam reservar', async () => {
    const usage = makeUsage(0);
    const { client } = clientReturning(echoBatch);
    await evaluateMany(many(30), deps(client, { usage }));
    expect(usage.reserve).toHaveBeenCalledTimes(1);
  });

  it('sem chave: nenhuma chamada e tudo por regras', async () => {
    const d = deps(null);
    const out = await evaluateMany(many(12), d);
    expect(out).toHaveLength(12);
    expect(out.every((r) => r.fonte === 'REGRA')).toBe(true);
    expect(d.usage.reserve).not.toHaveBeenCalled();
  });

  it('propriedade: nunca lança e devolve um resultado por lead, na ordem, até o teto', async () => {
    const behaviors = [
      () => okResponse(10),
      () => 'lixo',
      () => { throw new Error('x'); },
      () => '{"avaliacoes": []}',
    ];
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 45 }), fc.integer({ min: 0, max: 3 }), fc.boolean(), fc.integer({ min: 0, max: 5 }), async (n, b, hasKey, limit) => {
        const client = hasKey ? clientReturning(behaviors[b]).client : null;
        const items = many(n);
        const out = await evaluateMany(items, deps(client, { usage: makeUsage(limit) }));
        expect(out.map((r) => r.id)).toEqual(items.slice(0, EVALUATION_AUTO_CAP).map((i) => i.id));
        for (const r of out) {
          expect(r.resumo.length).toBeGreaterThan(0);
          expect(r.sugestao.length).toBeGreaterThan(0);
          expect(['IA', 'REGRA']).toContain(r.fonte);
        }
      }),
      { numRuns: 60 },
    );
  });
});

describe('evaluationDto', () => {
  it('só existe quando há data, fonte e algum texto', () => {
    const date = new Date('2026-10-20T12:00:00Z');
    expect(evaluationDto({ avaliacaoResumo: null, sugestaoAcao: null, avaliadoEm: null, fonteAvaliacao: null })).toBeNull();
    expect(evaluationDto({ avaliacaoResumo: 'a', sugestaoAcao: 'b', avaliadoEm: null, fonteAvaliacao: 'IA' })).toBeNull();
    expect(evaluationDto({ avaliacaoResumo: 'a', sugestaoAcao: 'b', avaliadoEm: date, fonteAvaliacao: 'REGRA' })).toEqual({
      resumo: 'a',
      sugestao: 'b',
      fonte: 'REGRA',
      avaliadoEm: date.toISOString(),
    });
  });
});
