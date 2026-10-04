/**
 * P4 — o trigger `company_set_tem_contato` (Postgres) coincide com a função TypeScript `temContato()`.
 * Insere e atualiza empresas com vazio, espaços, tabs, quebras de linha, Unicode e nulos e compara
 * o valor calculado pelo banco com o da função.
 *
 * SÓ roda em banco de teste: `npm run test:int` com `TEST_DATABASE_URL` terminando em `_test`
 * (ver tests/support/assert-test-db.ts). Pulado nos demais casos. Toda linha criada tem o prefixo
 * único do teste e só ela é apagada.
 */
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { temContato, type ContactSource } from '@/lib/leads/contact';
import { assertTestDatabase } from '../../support/assert-test-db';
import {
  RUN_DB_TESTS,
  cleanup,
  migrateDeploy,
  newPrisma,
  testDatabaseUrl,
  uniquePrefix,
} from '../../lead-miner/integration/db-helpers-repo';

describe.skipIf(!RUN_DB_TESTS)('trigger company_set_tem_contato × temContato() (Postgres)', () => {
  let db: PrismaClient;
  const prefix = uniquePrefix('TC');
  let seq = 0;

  beforeAll(async () => {
    const url = assertTestDatabase(testDatabaseUrl(), 'teste de integração do trigger'); // trava: só *_test
    migrateDeploy(url);
    db = newPrisma(url);
  }, 120_000);

  afterAll(async () => {
    if (!db) return;
    await cleanup(db, prefix, null); // só as linhas com o prefixo deste teste
    await db.$disconnect();
  }, 60_000);

  async function insert(src: ContactSource): Promise<string> {
    const nome = `${prefix} ${++seq}`;
    const row = await db.company.create({
      data: {
        nome,
        nomeNormalizado: nome.toLowerCase(),
        nicho: 'clinica_odontologica',
        telefone: src.telefone ?? null,
        whatsappOsm: src.whatsappOsm ?? null,
        instagramOsm: src.instagramOsm ?? null,
        emailOsm: src.emailOsm ?? null,
        temWhatsapp: src.temWhatsapp ?? null,
        temInstagram: src.temInstagram ?? null,
      },
      select: { id: true },
    });
    return row.id;
  }

  const stored = async (id: string) =>
    (await db.company.findUniqueOrThrow({ where: { id }, select: { temContato: true } })).temContato;

  const TEXTS = [
    '', ' ', '   ', '\t', '\n', '\r\n', '\f', '\v', ' \t\n\r\f\v ', '\u00a0', '\u200b', ' \u00a0 ',
    '11 4000-1234', '  11 4000-1234\n', 'x', ' x ', '@loja', 'a@b.co',
  ];

  it('casos fixos: INSERT com cada texto em cada campo de texto', async () => {
    const fields = ['telefone', 'whatsappOsm', 'instagramOsm', 'emailOsm'] as const;
    for (const field of fields) {
      for (const text of [...TEXTS, null]) {
        const src: ContactSource = { [field]: text };
        const id = await insert(src);
        expect(await stored(id), `${field}=${JSON.stringify(text)}`).toBe(temContato(src));
      }
    }
  });

  it('snapshots da análise: true conta; false e null não', async () => {
    for (const w of [true, false, null]) {
      for (const i of [true, false, null]) {
        const src: ContactSource = { temWhatsapp: w, temInstagram: i };
        const id = await insert(src);
        expect(await stored(id), `w=${w} i=${i}`).toBe(temContato(src));
      }
    }
  });

  it('nada preenchido → false', async () => {
    expect(await stored(await insert({}))).toBe(false);
  });

  it('UPDATE recalcula (ganha e perde contato) e o valor enviado pelo cliente é ignorado', async () => {
    const id = await insert({});
    expect(await stored(id)).toBe(false);
    await db.company.update({ where: { id }, data: { telefone: '11 4000-1234' } });
    expect(await stored(id)).toBe(true);
    await db.company.update({ where: { id }, data: { telefone: '  \t ' } });
    expect(await stored(id)).toBe(false);
    await db.company.update({ where: { id }, data: { temInstagram: true } });
    expect(await stored(id)).toBe(true);
    // O trigger é a fonte da verdade: forçar temContato = true sem contato não "cola".
    await db.company.update({ where: { id }, data: { temInstagram: false, temContato: true } });
    expect(await stored(id)).toBe(false);
  });

  it('propriedade: combinações aleatórias coincidem com a função TypeScript', async () => {
    const text = fc.option(fc.oneof(fc.constantFrom(...TEXTS), fc.string({ maxLength: 8 }).map((s) => s.replace(/\u0000/g, ''))), {
      nil: null,
    });
    const flag = fc.option(fc.boolean(), { nil: null });
    await fc.assert(
      fc.asyncProperty(
        fc.record({ telefone: text, whatsappOsm: text, instagramOsm: text, emailOsm: text, temWhatsapp: flag, temInstagram: flag }),
        async (src) => {
          const id = await insert(src);
          expect(await stored(id), JSON.stringify(src)).toBe(temContato(src));
        },
      ),
      { numRuns: 60 },
    );
  }, 120_000);
});
