/**
 * **Validates: Requirements 15.3**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hasTemplateMarkers, parseApproachResponse, type ApproachChannel } from '@/lib/leads/approach';
// Feature: lead-miner-enrichment, Property 39: For any texto de resposta (JSON com `texto`/`assunto` arbitrários, com ou sem marcadores `{{`, `}}`, `[NOME]`, vazio, acima dos limites), `parseApproachResponse` aceita exatamente quando o texto (e o assunto, em `EMAIL`) é não vazio após `trim`, respeita 700 caracteres em `WHATSAPP` ou 120/2.000 em `EMAIL`, e não contém marcadores não substituídos.

const LIMITS = { whatsapp: 700, emailSubject: 120, emailBody: 2_000 };

// ---------------------------------------------------------------------------
// Geradores: o texto-base nunca contém chaves nem colchetes; o marcador (se houver)
// é inserido explicitamente, então o oráculo sabe se ele existe sem reusar a regex.
// ---------------------------------------------------------------------------
const SAFE = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZáéíóúãõçÁÉÇ0123456789 .,!?-:\n';
const safeChar = fc.constantFrom(...SAFE.split(''));
const MARKERS = ['{{nome}}', '{{', '}}', '[NOME]', '[NOME DA EMPRESA]', '[CIDADE_X]', '[ÁREA]', 'Olá {{empresa}}!'];
// Colchetes/chaves "inofensivos": não são marcadores não substituídos.
const HARMLESS = ['[1]', '[a]', '[A]', '[Nome]', '{', '}', '[', ']', '{x}'];
const WS = fc.constantFrom('', ' ', '  ', '\n', '\t', ' \n ');

interface Part {
  value: unknown;
  /** true quando o valor é string e foi inserido um marcador. */
  marked: boolean;
}

/** String com comprimento próximo de `max` (ou aleatório), com marcador opcional. */
function arbStringPart(max: number): fc.Arbitrary<Part> {
  const len = fc.oneof(
    fc.constantFrom(0, 1, max - 1, max, max + 1, max + 50),
    fc.integer({ min: 0, max: max + 100 }),
  );
  return fc
    .record({
      len,
      ch: safeChar,
      body: fc.array(safeChar, { maxLength: 40 }).map((a) => a.join('')),
      insert: fc.option(fc.oneof(fc.constantFrom(...MARKERS).map((m) => ({ m, marked: true })), fc.constantFrom(...HARMLESS).map((m) => ({ m, marked: false }))), { nil: null }),
      pos: fc.nat(),
      lead: WS,
      trail: WS,
    })
    .map(({ len, ch, body, insert, pos, lead, trail }) => {
      let core = (body + ch.repeat(len)).slice(0, Math.max(0, len));
      let marked = false;
      if (insert) {
        const p = core.length === 0 ? 0 : pos % (core.length + 1);
        core = core.slice(0, p) + insert.m + core.slice(p);
        marked = insert.marked;
      }
      return { value: lead + core + trail, marked };
    });
}

function arbPart(max: number): fc.Arbitrary<Part> {
  return fc.oneof(
    { weight: 8, arbitrary: arbStringPart(max) },
    { weight: 1, arbitrary: fc.constantFrom<unknown>(undefined, null, 42, true, ['x'], { a: 1 }).map((value) => ({ value, marked: false })) },
  );
}

function expectedPart(p: Part, max: number): string | null {
  if (typeof p.value !== 'string') return null;
  const t = p.value.trim();
  if (t.length === 0 || t.length > max || p.marked) return null;
  return t;
}

const arbCase = fc.record({
  canal: fc.constantFrom<ApproachChannel>('WHATSAPP', 'EMAIL'),
  fenced: fc.boolean(),
  pad: WS,
}).chain((base) =>
  fc.record({
    canal: fc.constant(base.canal),
    fenced: fc.constant(base.fenced),
    pad: fc.constant(base.pad),
    texto: arbPart(base.canal === 'WHATSAPP' ? LIMITS.whatsapp : LIMITS.emailBody),
    assunto: arbPart(LIMITS.emailSubject),
  }),
);

function serialize(texto: Part, assunto: Part): string {
  const obj: Record<string, unknown> = {};
  if (texto.value !== undefined) obj.texto = texto.value;
  if (assunto.value !== undefined) obj.assunto = assunto.value;
  return JSON.stringify(obj);
}

describe('Property 39: Validação da Mensagem_Abordagem', () => {
  it('aceita exatamente quando texto (e assunto em EMAIL) são não vazios, dentro dos limites e sem marcadores', () => {
    fc.assert(
      fc.property(arbCase, ({ canal, fenced, pad, texto, assunto }) => {
        const json = serialize(texto, assunto);
        const raw = pad + (fenced ? '```json\n' + json + '\n```' : json) + pad;
        const result = parseApproachResponse(raw, canal);

        const t = expectedPart(texto, canal === 'WHATSAPP' ? LIMITS.whatsapp : LIMITS.emailBody);
        const a = canal === 'EMAIL' ? expectedPart(assunto, LIMITS.emailSubject) : null;
        const accept = t !== null && (canal === 'WHATSAPP' || a !== null);

        if (!accept) {
          expect(result).toBeNull();
          return;
        }
        expect(result).toEqual({ texto: t, assunto: canal === 'EMAIL' ? a : null });
        expect(hasTemplateMarkers(result!.texto)).toBe(false);
        if (result!.assunto !== null) expect(hasTemplateMarkers(result!.assunto)).toBe(false);
      }),
      { numRuns: 300 },
    );
  });

  it('respostas que não são um objeto JSON são rejeitadas', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.constantFrom('null', '[]', '"texto"', '42', '{"texto": "oi"', '```json\n[1]\n```')),
        fc.constantFrom<ApproachChannel>('WHATSAPP', 'EMAIL'),
        (raw, canal) => {
          let isObject = false;
          try {
            const d = JSON.parse(raw.trim());
            isObject = d !== null && typeof d === 'object' && !Array.isArray(d);
          } catch {
            isObject = false;
          }
          fc.pre(!isObject);
          expect(parseApproachResponse(raw, canal)).toBeNull();
        },
      ),
      { numRuns: 200 },
    );
  });
});
