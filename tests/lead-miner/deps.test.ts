/**
 * Fiação das dependências reais (sem rede): o `fetch` global é substituído por um
 * gravador local que nunca abre conexões.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// `server-only` lança fora do bundle de servidor do Next; nos testes é neutro.
vi.mock('server-only', () => ({}));

import {
  createGeminiClient,
  GEMINI_MODEL_DEFAULT,
  getPipelineDeps,
  isAiAvailable,
} from '@/lib/leads/deps';
import { GEMINI_MONTHLY_LIMIT_DEFAULT } from '@/lib/leads/config';

const KEY = 'chave-de-teste-123';

function recordingFetch(response: Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response;
  };
  vi.stubGlobal('fetch', fn);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('createGeminiClient', () => {
  it('envia a chave só no cabeçalho, pede JSON e concatena os textos das parts', async () => {
    const calls = recordingFetch(
      Response.json({ candidates: [{ content: { parts: [{ text: '{"a":' }, { text: '1}' }] } }] }),
    );
    const client = createGeminiClient(KEY);
    const text = await client.generate('prompt', { signal: new AbortController().signal });

    expect(text).toBe('{"a":1}');
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_DEFAULT}:generateContent`,
    );
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
    const body = JSON.parse(String(init.body));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.contents[0].parts[0].text).toBe('prompt');
  });

  it('rejeita em HTTP != 2xx sem incluir a chave na mensagem', async () => {
    recordingFetch(new Response('erro', { status: 403 }));
    const client = createGeminiClient(KEY);
    const err = await client
      .generate('p', { signal: new AbortController().signal })
      .catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('403');
    expect((err as Error).message).not.toContain(KEY);
  });
});

describe('getPipelineDeps / isAiAvailable', () => {
  it('sem GEMINI_API_KEY: IA indisponível e client null', () => {
    vi.stubEnv('GEMINI_API_KEY', '  ');
    expect(isAiAvailable()).toBe(false);
    expect(getPipelineDeps().ai.client).toBeNull();
  });

  it('com chave: client presente e limite lido de GEMINI_MONTHLY_LIMIT', () => {
    vi.stubEnv('GEMINI_API_KEY', KEY);
    vi.stubEnv('GEMINI_MONTHLY_LIMIT', '250');
    expect(isAiAvailable()).toBe(true);
    const deps = getPipelineDeps();
    expect(deps.ai.client).not.toBeNull();
    expect(deps.ai.limit).toBe(250);
  });

  it('limite inválido cai no padrão', () => {
    vi.stubEnv('GEMINI_MONTHLY_LIMIT', 'abc');
    expect(getPipelineDeps().ai.limit).toBe(GEMINI_MONTHLY_LIMIT_DEFAULT);
  });
});
