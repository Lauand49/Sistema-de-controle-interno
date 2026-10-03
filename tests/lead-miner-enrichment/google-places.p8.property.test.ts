// Feature: lead-miner-enrichment, Property 8: Mapeamento e descarte de lugares
/**
 * **Validates: Requirements 3.4, 3.5**
 *
 * Para qualquer objeto de lugar gerado (campos presentes ou ausentes, `businessStatus`
 * arbitrário, nomes com espaços), `mapPlace` devolve `null` exatamente quando o status é
 * `CLOSED_PERMANENTLY` ou o nome é vazio após `trim`; nos demais casos devolve os campos
 * da resposta (texto aparado, coordenadas finitas) com `null` para cada campo ausente ou inválido.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { mapPlace } from '@/lib/leads/sources/google-places';

const pad = fc.constantFrom('', ' ', '  ', '\t', '\n ');
/** Texto com espaços nas pontas; pode ser vazio/só espaços. */
const paddedText = fc
  .tuple(pad, fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 12 })), pad)
  .map(([a, s, b]) => a + s + b);
/** Valor de campo textual: ausente, inválido (não string) ou texto com espaços. */
const textField = fc.oneof(
  fc.constant(undefined),
  fc.constantFrom<unknown>(null, 42, true, {}, []),
  paddedText,
);
const coord = fc.oneof(
  fc.constant(undefined),
  fc.double({ noNaN: true, noDefaultInfinity: true, min: -180, max: 180 }),
  fc.constantFrom<unknown>(NaN, Infinity, -Infinity, '12.5', null),
);
const status = fc.oneof(
  fc.constant(undefined),
  fc.constantFrom('OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY', 'BUSINESS_STATUS_UNSPECIFIED'),
  paddedText,
);
const componentTypes = fc.constantFrom(
  'sublocality_level_1',
  'sublocality',
  'administrative_area_level_2',
  'administrative_area_level_1',
  'route',
);
const addressComponent = fc.record(
  { longText: textField, shortText: textField, types: fc.array(componentTypes, { maxLength: 2 }) },
  { requiredKeys: ['types'] },
);
const nicheId = fc.constantFrom('restaurante', 'academia', 'salao', 'clinica');

const rawPlace = fc.record(
  {
    id: fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim() !== ''),
    displayName: fc.oneof(fc.constant(undefined), fc.record({ text: textField }, { requiredKeys: [] })),
    formattedAddress: textField,
    addressComponents: fc.oneof(fc.constant(undefined), fc.array(addressComponent, { maxLength: 5 })),
    location: fc.oneof(
      fc.constant(undefined),
      fc.record({ latitude: coord, longitude: coord }, { requiredKeys: [] }),
    ),
    nationalPhoneNumber: textField,
    websiteUri: textField,
    googleMapsUri: textField,
    businessStatus: status,
  },
  { requiredKeys: ['id'] },
);

// Oráculo independente ---------------------------------------------------------
type Raw = Record<string, any>;
const t = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const fin = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
function comp(list: unknown, types: string[], key: 'longText' | 'shortText'): string | null {
  if (!Array.isArray(list)) return null;
  for (const ty of types) {
    const hit = list.find((c) => c.types.includes(ty) && t(c[key]) !== null);
    if (hit) return t(hit[key]);
  }
  return null;
}

describe('Property 8: Mapeamento e descarte de lugares', () => {
  it('descarta exatamente fechados definitivamente ou sem nome; mapeia os demais campos', () => {
    fc.assert(
      fc.property(rawPlace, nicheId, (raw: Raw, niche) => {
        const nome = t(raw.displayName?.text);
        const st = t(raw.businessStatus);
        const result = mapPlace(raw, niche);
        if (nome === null || st === 'CLOSED_PERMANENTLY') {
          expect(result).toBeNull();
          return;
        }
        expect(result).not.toBeNull();
        expect(result).toMatchObject({
          placeId: raw.id.trim(),
          nome,
          nicho: niche,
          endereco: t(raw.formattedAddress),
          bairro: comp(raw.addressComponents, ['sublocality_level_1', 'sublocality'], 'longText'),
          cidade: comp(raw.addressComponents, ['administrative_area_level_2'], 'longText'),
          uf: comp(raw.addressComponents, ['administrative_area_level_1'], 'shortText'),
          telefone: t(raw.nationalPhoneNumber),
          website: t(raw.websiteUri),
          latitude: fin(raw.location?.latitude),
          longitude: fin(raw.location?.longitude),
          mapsUri: t(raw.googleMapsUri),
          businessStatus: st,
        });
        expect(result!.nome).toBe(result!.nome.trim());
      }),
      { numRuns: 200 },
    );
  });
});
