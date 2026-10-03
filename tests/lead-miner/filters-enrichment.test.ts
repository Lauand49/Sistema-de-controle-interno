import { describe, expect, it } from 'vitest';
import { cnpjCheckDigits } from '@/lib/leads/cnpj';
import {
  MSG,
  approachBodySchema,
  buildRunParamsKey,
  cnpjBodySchema,
  validateRunInput,
  zodFieldErrors,
} from '@/lib/leads/filters';

const base = { bairro: 'Centro', cidade: 'Santos', uf: 'SP', nichos: ['padaria'] };

describe('validateRunInput — parâmetros da Etapa 2 (Req. 4.3, 10.1, 12.7, 20.5)', () => {
  it('aplica os padrões fonte=MISTA, pagespeedEnabled=true e cnpjEnabled=true', () => {
    const r = validateRunInput(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.fonte).toBe('MISTA');
    expect(r.value.pagespeedEnabled).toBe(true);
    expect(r.value.cnpjEnabled).toBe(true);
  });

  it('preserva valores válidos informados', () => {
    const r = validateRunInput({ ...base, fonte: 'OSM', pagespeedEnabled: false, cnpjEnabled: false });
    expect(r.ok && r.value).toMatchObject({ fonte: 'OSM', pagespeedEnabled: false, cnpjEnabled: false });
  });

  it('rejeita fonte fora do domínio e opções não booleanas, apontando cada campo', () => {
    const r = validateRunInput({ ...base, fonte: 'BING', pagespeedEnabled: 'sim', cnpjEnabled: 1 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fields).toEqual({ fonte: MSG.fonte, pagespeedEnabled: MSG.booleano, cnpjEnabled: MSG.booleano });
  });

  it('buildRunParamsKey não depende dos campos novos', () => {
    const a = validateRunInput({ ...base, fonte: 'OSM' });
    const b = validateRunInput({ ...base, fonte: 'GOOGLE', pagespeedEnabled: false });
    if (!a.ok || !b.ok) throw new Error('esperado válido');
    expect(buildRunParamsKey(a.value)).toBe(buildRunParamsKey(b.value));
  });
});

describe('approachBodySchema (Req. 20.3, 20.5)', () => {
  it('aceita WHATSAPP e EMAIL e descarta ids de autor', () => {
    expect(approachBodySchema.parse({ canal: 'WHATSAPP' })).toEqual({ canal: 'WHATSAPP' });
    expect(approachBodySchema.parse({ canal: 'EMAIL', userId: 'x', createdById: 'y' })).toEqual({ canal: 'EMAIL' });
  });

  it('rejeita canal inválido ou ausente com o campo canal', () => {
    for (const body of [{ canal: 'SMS' }, {}, { canal: 'whatsapp' }]) {
      const r = approachBodySchema.safeParse(body);
      expect(r.success).toBe(false);
      if (!r.success) expect(zodFieldErrors(r.error).canal).toBe(MSG.canal);
    }
  });

  it('é estrito: campos desconhecidos são rejeitados', () => {
    expect(approachBodySchema.safeParse({ canal: 'EMAIL', extra: 1 }).success).toBe(false);
  });
});

describe('cnpjBodySchema (Req. 11.7, 20.5)', () => {
  const alnumBase = '12ABC34501DE';
  const alnum = alnumBase + cnpjCheckDigits(alnumBase);

  it('aceita CNPJ numérico com máscara e alfanumérico, devolvendo normalizado', () => {
    expect(cnpjBodySchema.parse({ cnpj: '11.222.333/0001-81' })).toEqual({ cnpj: '11222333000181' });
    expect(cnpjBodySchema.parse({ cnpj: alnum.toLowerCase(), authorId: 'z' })).toEqual({ cnpj: alnum });
  });

  it('rejeita CNPJ inválido, ausente ou não textual com "CNPJ inválido"', () => {
    for (const body of [{ cnpj: '11.222.333/0001-82' }, { cnpj: '00000000000000' }, {}, { cnpj: 123 }]) {
      const r = cnpjBodySchema.safeParse(body);
      expect(r.success).toBe(false);
      if (!r.success) expect(zodFieldErrors(r.error).cnpj).toBe('CNPJ inválido');
    }
  });

  it('é estrito: campos desconhecidos são rejeitados', () => {
    expect(cnpjBodySchema.safeParse({ cnpj: '11222333000181', origem: 'SITE' }).success).toBe(false);
  });
});
