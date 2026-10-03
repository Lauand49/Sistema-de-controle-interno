/**
 * **Validates: Requirements 7.4**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeHtml } from '@/lib/leads/html';
// Feature: lead-miner-enrichment, Property 19: For any texto com caracteres latinos acentuados codificado em UTF-8 ou windows-1252 e declarado no Content-Type ou numa <meta charset>, decodeHtml devolve o texto original; for any charset desconhecido ou bytes inválidos, decodeHtml não lança e devolve a decodificação UTF-8 com caractere de substituição.

const RUNS = { numRuns: 150 };

/** ASCII imprimível (sem `<`, para não forjar tags) + Latin-1 0xA0–0xFF (acentos). */
const latinChar = fc.oneof(
  fc.integer({ min: 0x20, max: 0x7e }).filter((c) => c !== 0x3c),
  fc.integer({ min: 0xa0, max: 0xff }),
  fc.constantFrom(...'áéíóúãõâêôàçÁÉÍÓÚÃÕÂÊÔÀÇüÜ'.split('').map((c) => c.charCodeAt(0))),
);
const latinText = fc.array(latinChar, { maxLength: 300 }).map((cs) => String.fromCharCode(...cs));

type Enc = 'utf-8' | 'windows-1252';
const LABELS: Record<Enc, string[]> = {
  'utf-8': ['utf-8', 'UTF-8', 'utf8', 'unicode-1-1-utf-8'],
  'windows-1252': ['windows-1252', 'WINDOWS-1252', 'iso-8859-1', 'latin1', 'cp1252'],
};

function encode(text: string, enc: Enc): Uint8Array {
  if (enc === 'utf-8') return new TextEncoder().encode(text);
  // Em 0x20–0x7E e 0xA0–0xFF o windows-1252 coincide com o Latin-1.
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

const utf8 = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: false }).decode(bytes);

function isKnownLabel(label: string): boolean {
  try {
    new TextDecoder(label);
    return true;
  } catch {
    return false;
  }
}

const encArb = fc.constantFrom<Enc>('utf-8', 'windows-1252');
const encWithLabel = encArb.chain((enc) => fc.tuple(fc.constant(enc), fc.constantFrom(...LABELS[enc])));

const unknownLabel = fc
  .stringMatching(/^[a-z0-9]{1,12}$/)
  .map((s) => `x-zz-${s}`)
  .filter((l) => !isKnownLabel(l));

describe('Property 19: decodificação por charset', () => {
  it('charset no Content-Type: devolve o texto original', () => {
    fc.assert(
      fc.property(latinText, encWithLabel, fc.boolean(), (text, [enc, label], quoted) => {
        const ct = `text/html; charset=${quoted ? `"${label}"` : label}`;
        expect(decodeHtml(encode(text, enc), ct)).toBe(text);
      }),
      RUNS,
    );
  });

  it('charset em <meta charset> ou http-equiv: devolve o documento original', () => {
    fc.assert(
      fc.property(
        latinText,
        encWithLabel,
        fc.boolean(),
        fc.constantFrom<string | null>(null, 'text/html', 'text/html; foo=bar'),
        (text, [enc, label], httpEquiv, ct) => {
          const meta = httpEquiv
            ? `<meta http-equiv="Content-Type" content="text/html; charset=${label}">`
            : `<meta charset="${label}">`;
          const prefix = `<!doctype html><html><head>${meta}</head><body>`;
          const body = concat(new TextEncoder().encode(prefix), encode(text, enc));
          expect(decodeHtml(body, ct)).toBe(prefix + text);
        },
      ),
      RUNS,
    );
  });

  it('charset desconhecido ou bytes inválidos: não lança e decodifica como UTF-8 com U+FFFD', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ maxLength: 400 }),
        fc.option(unknownLabel, { nil: null }),
        fc.boolean(),
        (raw, label, inMeta) => {
          // Garante ao menos um byte inválido em UTF-8.
          const bytes = concat(raw, Uint8Array.of(0xff));
          let body = bytes;
          let ct: string | null = null;
          if (label != null) {
            if (inMeta) body = concat(new TextEncoder().encode(`<meta charset="${label}">`), bytes);
            else ct = `text/html; charset=${label}`;
          }
          let out = '';
          expect(() => {
            out = decodeHtml(body, ct);
          }).not.toThrow();
          // Sem declaração, bytes aleatórios podem conter um <meta charset> válido; isso é
          // improvável, mas o oráculo só vale quando não há declaração reconhecida.
          expect(out).toBe(utf8(body));
          expect(out).toContain('\uFFFD');
        },
      ),
      RUNS,
    );
  });
});
