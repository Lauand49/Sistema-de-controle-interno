/**
 * T4 — propriedades da partição Com/Sem contato na rota GET /companies (offline).
 *
 * O Prisma é simulado por uma lista em memória com um avaliador mínimo de `where`
 * (AND/OR/NOT, nicho, temContato e Cache_Google). Para qualquer conjunto de empresas e filtros:
 *  - toda empresa cai em exatamente uma aba;
 *  - `contatoCounts.com + contatoCounts.sem` = total sem a aba (respeita os demais filtros);
 *  - `total` e as linhas da aba coincidem com `contatoCounts[aba]`;
 *  - sem `contato`, o total é a soma das abas.
 */
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeTemContato } from '@/lib/leads/contact';
import { NICHES } from '@/lib/leads/config';

const [N1, N2, N3] = NICHES.map((n) => n.id);

interface Row {
  id: string;
  nome: string;
  nicho: string;
  telefone: string | null;
  whatsappOsm: string | null;
  instagramOsm: string | null;
  emailOsm: string | null;
  temWhatsapp: boolean | null;
  temInstagram: boolean | null;
  temContato: boolean;
  googleCache: null | { telefone: string | null; expiraEm: Date };
}

const NOW = Date.now();
let rows: Row[] = [];
let calls: Array<{ where: unknown }> = [];

type Where = Record<string, any>;

function matches(r: Row, w: Where): boolean {
  if (!w || Object.keys(w).length === 0) return true;
  if (w.AND) return (w.AND as Where[]).every((x) => matches(r, x));
  if (w.OR) return (w.OR as Where[]).some((x) => matches(r, x));
  if (w.NOT) return !matches(r, w.NOT as Where);
  if ('temContato' in w) return r.temContato === w.temContato;
  if ('nicho' in w) {
    const v = w.nicho as { equals: string };
    return r.nicho.toLowerCase() === v.equals.toLowerCase();
  }
  if ('googleCache' in w) {
    const c = w.googleCache.is as { expiraEm: { gt: Date }; telefone: { not: string } };
    return r.googleCache !== null && r.googleCache.expiraEm > c.expiraEm.gt && r.googleCache.telefone !== null && r.googleCache.telefone !== c.telefone.not;
  }
  throw new Error(`where não suportado no teste: ${JSON.stringify(w)}`);
}

vi.mock('server-only', () => ({}));
vi.mock('@/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }));
vi.mock('@/lib/users', () => ({
  findUserDTO: async (id: string) => ({
    id,
    name: 'Ana',
    status: 'ATIVO',
    globalRole: null,
    departmentCode: 'NEGOCIOS',
    departmentRole: 'ASSESSOR',
    sectors: [],
  }),
}));
vi.mock('@/lib/leads/google-cache', () => ({ purgeExpiredGoogleCache: async () => undefined }));
vi.mock('@/lib/prisma', () => {
  const company = {
    findMany: vi.fn(async ({ where, skip = 0, take = 1000 }: { where: Where; skip?: number; take?: number }) => {
      calls.push({ where });
      return rows
        .filter((r) => matches(r, where))
        .slice(skip, skip + take)
        .map((r) => ({ ...r, googleCache: null, assignedUser: null, prospectLead: null, googlePlaceId: null, cnpj: null, cnpjNomeFantasia: null, endereco: null, bairro: null, cidade: null, uf: null, website: null, categoria: null, scoreFinal: null, prioridade: null, hasSite: null, isHttps: null, fonte: 'OSM', lastAnalyzedAt: null, latitude: null, longitude: null, situacaoCadastral: null, desempenhoRuim: null }));
    }),
    count: vi.fn(async ({ where }: { where: Where }) => {
      calls.push({ where });
      return rows.filter((r) => matches(r, where)).length;
    }),
  };
  const db = { company, $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops) };
  return { prisma: db };
});

afterEach(() => {
  rows = [];
  calls = [];
});

const str = fc.option(fc.constantFrom('', '  ', '11 4000-1234', 'x'), { nil: null });
const rowArb: fc.Arbitrary<Omit<Row, 'id' | 'nome' | 'temContato'>> = fc.record({
  nicho: fc.constantFrom(N1, N2, N3),
  telefone: str,
  whatsappOsm: str,
  instagramOsm: str,
  emailOsm: str,
  temWhatsapp: fc.option(fc.boolean(), { nil: null }),
  temInstagram: fc.option(fc.boolean(), { nil: null }),
  googleCache: fc.option(
    fc.record({
      telefone: fc.option(fc.constantFrom('', '11 3000-0000'), { nil: null }),
      expiraEm: fc.constantFrom(new Date(NOW + 86_400_000), new Date(NOW - 86_400_000)),
    }),
    { nil: null },
  ),
});

function load(list: Array<Omit<Row, 'id' | 'nome' | 'temContato'>>) {
  rows = list.map((r, i) => ({
    ...r,
    id: `id-${i}`,
    nome: `Empresa ${i}`,
    // o trigger do banco faz exatamente isto a cada INSERT/UPDATE
    temContato: computeTemContato(r),
  }));
}

async function get(qs: string) {
  const { GET } = await import('@/app/api/tools/lead-miner/companies/route');
  const res = await GET(new Request(`http://localhost/api/tools/lead-miner/companies?${qs}`), { params: {} } as never);
  return (await res.json()) as {
    items: Array<{ id: string }>;
    total: number;
    contatoCounts: { com: number; sem: number };
  };
}

describe('GET /companies — abas de contato', () => {
  it('partição: toda empresa está em exatamente uma aba e os contadores fecham com o total', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(rowArb, { maxLength: 25 }), fc.constantFrom(N1, N2, N3, ''), async (list, nicho) => {
        load(list);
        const base = nicho ? `nicho=${nicho}&` : '';
        const [com, sem, todas] = await Promise.all([get(`${base}contato=com`), get(`${base}contato=sem`), get(base.replace(/&$/, ''))]);

        const esperado = rows.filter((r) => !nicho || r.nicho === nicho);
        const comIds = com.items.map((i) => i.id);
        const semIds = sem.items.map((i) => i.id);

        // disjuntas e completas
        expect(comIds.filter((id) => semIds.includes(id))).toEqual([]);
        expect(new Set([...comIds, ...semIds])).toEqual(new Set(esperado.map((r) => r.id)));

        // contadores respeitam o filtro ativo e são iguais nas três respostas
        for (const r of [com, sem, todas]) {
          expect(r.contatoCounts.com + r.contatoCounts.sem).toBe(esperado.length);
          expect(r.contatoCounts).toEqual(com.contatoCounts);
        }
        expect(com.total).toBe(com.contatoCounts.com);
        expect(sem.total).toBe(sem.contatoCounts.sem);
        expect(todas.total).toBe(esperado.length);
      }),
      { numRuns: 60 },
    );
  });

  it('telefone só no Cache_Google válido conta como contato; expirado não', async () => {
    const sem = { nicho: N1, telefone: null, whatsappOsm: null, instagramOsm: null, emailOsm: null, temWhatsapp: null, temInstagram: null };
    load([
      { ...sem, googleCache: { telefone: '11 3000-0000', expiraEm: new Date(NOW + 86_400_000) } },
      { ...sem, googleCache: { telefone: '11 3000-0000', expiraEm: new Date(NOW - 86_400_000) } },
      { ...sem, googleCache: null },
    ]);
    const r = await get('');
    expect(r.contatoCounts).toEqual({ com: 1, sem: 2 });
  });

  it('o where da contagem das abas não carrega o filtro `contato`', async () => {
    load([]);
    await get(`nicho=${N1}&contato=sem`);
    const texts = calls.map((c) => JSON.stringify(c.where));
    // 1 findMany + total (com aba) + 2 contagens (com/sem) sobre o mesmo filtro base
    expect(texts).toHaveLength(4);
    expect(texts.filter((t) => t.includes('"nicho"'))).toHaveLength(4);
  });

  it('contato inválido → 400', async () => {
    const { GET } = await import('@/app/api/tools/lead-miner/companies/route');
    const res = await GET(new Request('http://localhost/api/tools/lead-miner/companies?contato=talvez'), { params: {} } as never);
    expect(res.status).toBe(400);
  });
});
