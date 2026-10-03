/**
 * **Validates: Requirements 8.4, 8.5, 8.6**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  INSTAGRAM_RESERVED,
  detectSignals,
  instagramLink,
  normalizeInstagram,
  normalizeWhatsapp,
  pickMostFrequent,
  whatsappLink,
} from '@/lib/leads/signals';
// Feature: lead-miner-enrichment, Property 21: For any HTML com várias ocorrências de handles e números válidos e quaisquer tags OSM, o Detector_Sinais escolhe o valor mais frequente (empate: o primeiro na ordem do documento) com origem SITE; quando o HTML não fornece o sinal, usa a tag OSM normalizada com origem OSM (ou null se a tag é inválida); e chamar detectSignals duas vezes com as mesmas entradas devolve resultados profundamente iguais.

const RUNS = { numRuns: 150 };

// ---------------------------------------------------------------------------
// Modelo de referência (Req. 8.4)
// ---------------------------------------------------------------------------

/** Maior contagem; empate → menor índice da primeira ocorrência. */
function modelPick(values: readonly string[]): string | null {
  let best: string | null = null;
  let bestCount = 0;
  let bestFirst = Infinity;
  for (const v of new Set(values)) {
    const count = values.filter((x) => x === v).length;
    const first = values.indexOf(v);
    if (count > bestCount || (count === bestCount && first < bestFirst)) {
      best = v;
      bestCount = count;
      bestFirst = first;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Geradores
// ---------------------------------------------------------------------------

const RESERVED: ReadonlySet<string> = new Set(INSTAGRAM_RESERVED);
const handle = fc.stringMatching(/^[a-z0-9._]{1,30}$/).filter((h) => !RESERVED.has(h));
/** Número já normalizado (12–13 dígitos começando com 55). */
const number = fc.stringMatching(/^55\d{10,11}$/);

const handlePool = fc.uniqueArray(handle, { minLength: 1, maxLength: 4 });
const numberPool = fc.uniqueArray(number, { minLength: 1, maxLength: 4 });

/** Sequência de índices no pool (com repetições), possivelmente vazia. */
function picks(pool: readonly string[]): fc.Arbitrary<string[]> {
  return fc.array(fc.constantFrom(...pool), { maxLength: 8 });
}

const filler = fc.stringMatching(/^[A-Za-z0-9 .,;:!?\n-]{0,40}$/);

/** Tag OSM: válida (várias formas), inválida ou ausente. */
const osmInstagram = fc.oneof(
  fc.constant(null),
  handle.map((h) => `@${h}`),
  handle.map((h) => `https://www.instagram.com/${h}/`),
  fc.string({ maxLength: 40 }),
  fc.constantFrom('', '   ', 'p', '@explore', 'nome com espaço'),
);
const osmWhatsapp = fc.oneof(
  fc.constant(null),
  fc.stringMatching(/^\d{10,13}$/).map((d) => `+${d}`),
  fc.stringMatching(/^\(\d{2}\) 9\d{4}-\d{4}$/),
  fc.string({ maxLength: 20 }),
  fc.constantFrom('', '123', 'sem número'),
);

/** HTML com os links de Instagram e WhatsApp intercalados (na ordem gerada). */
function buildHtml(handles: readonly string[], numbers: readonly string[], fill: readonly string[]): string {
  const parts: string[] = ['<html><body>'];
  const n = Math.max(handles.length, numbers.length);
  for (let i = 0; i < n; i++) {
    parts.push(`<p>${fill[i % fill.length] ?? ''}</p>`);
    if (i < handles.length) {
      parts.push(`<a href="${instagramLink(handles[i], i % 2 ? 'www' : 'bare')}">ig</a>`);
    }
    if (i < numbers.length) {
      const variant = (['wa.me', 'api', 'web', 'scheme'] as const)[i % 4];
      parts.push(`<a href="${whatsappLink(numbers[i], variant)}">wa</a>`);
    }
  }
  parts.push('</body></html>');
  return parts.join('\n');
}

const scenario = fc
  .record({ hp: handlePool, np: numberPool })
  .chain(({ hp, np }) =>
    fc.record({
      handles: picks(hp),
      numbers: picks(np),
      fill: fc.array(filler, { minLength: 1, maxLength: 4 }),
      osm: fc.record({ instagram: osmInstagram, whatsapp: osmWhatsapp }),
      withHtml: fc.boolean(),
    }),
  );

// ---------------------------------------------------------------------------
// Propriedade
// ---------------------------------------------------------------------------

describe('Property 21: escolha do sinal, fallback OSM e determinismo', () => {
  it('pickMostFrequent segue o modelo (mais frequente; empate → primeira ocorrência)', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('a', 'b', 'c', 'd'), { maxLength: 20 }), (values) => {
        expect(pickMostFrequent(values)).toBe(modelPick(values));
      }),
      RUNS,
    );
  });

  it('detectSignals escolhe o mais frequente do site, cai para OSM e é determinístico', () => {
    fc.assert(
      fc.property(scenario, ({ handles, numbers, fill, osm, withHtml }) => {
        const html = withHtml ? buildHtml(handles, numbers, fill) : null;
        const r1 = detectSignals(html, osm);
        const r2 = detectSignals(html, osm);
        expect(r2).toEqual(r1);

        const siteIg = withHtml ? modelPick(handles) : null;
        const siteWa = withHtml ? modelPick(numbers) : null;

        if (siteIg !== null) {
          expect(r1.instagram).toBe(siteIg);
          expect(r1.instagramOrigem).toBe('SITE');
        } else {
          const n = normalizeInstagram(osm.instagram);
          expect(r1.instagram).toBe(n);
          expect(r1.instagramOrigem).toBe(n === null ? null : 'OSM');
        }

        if (siteWa !== null) {
          expect(r1.whatsapp).toBe(siteWa);
          expect(r1.whatsappOrigem).toBe('SITE');
        } else {
          const n = normalizeWhatsapp(osm.whatsapp);
          expect(r1.whatsapp).toBe(n);
          expect(r1.whatsappOrigem).toBe(n === null ? null : 'OSM');
        }
      }),
      RUNS,
    );
  });

  it('tag OSM válida é usada normalizada quando o site não tem o sinal', () => {
    fc.assert(
      fc.property(handle, fc.stringMatching(/^\d{10,11}$/), (h, d) => {
        const r = detectSignals('<html><body><p>sem links</p></body></html>', {
          instagram: `@${h.toUpperCase()}`,
          whatsapp: `+${d}`,
        });
        expect(r.instagram).toBe(h);
        expect(r.instagramOrigem).toBe('OSM');
        expect(r.whatsapp).toBe(`55${d}`);
        expect(r.whatsappOrigem).toBe('OSM');
      }),
      RUNS,
    );
  });
});
