/**
 * Teste de integração da migração `20261015000000_lead_miner_enrichment` (Tarefa 3.3).
 * Pulado sem `RUN_DB_TESTS=1` + `TEST_DATABASE_URL` (banco `*_test`; `npm run test:int`).
 *
 * Fluxo: cria um banco descartável (`lmint_mig_*_test`) no mesmo servidor de `TEST_DATABASE_URL`, aplica as migrações até a Etapa 2 (cópia de `prisma/migrations` sem a
 * migração nova, num diretório temporário), insere dados no formato da Etapa 2 por SQL, aplica a
 * migração nova com `prisma migrate deploy` e verifica a preservação dos dados. O banco é removido
 * no fim; nenhum dado do banco de desenvolvimento é lido ou alterado.
 * Requisitos: 19.2, 13.1, 21.9.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { RUN_DB_TESTS, testDatabaseUrl } from '../../lead-miner/integration/db-helpers-repo';
import { assertTestDatabase } from '../../support/assert-test-db';

const ROOT = path.resolve(__dirname, '../../..');
const NEW_MIGRATION = '20261015000000_lead_miner_enrichment';

/** Tabelas das etapas anteriores cujas linhas devem ser preservadas. */
const OLD_TABLES = [
  'User',
  'Company',
  'CompanyAlias',
  'CompanyAnalysis',
  'MiningRun',
  'MiningRunCompany',
  'ProspectLead',
  'ApiUsage',
] as const;

const PARTIAL_INDEXES = [
  'User_one_manager_per_department',
  'SectorMember_one_manager_per_sector',
  'MiningRun_one_active_per_author_params',
];

type Row = Record<string, unknown>;

function deploy(schemaPath: string, url: string): void {
  execFileSync('npx', ['prisma', 'migrate', 'deploy', '--schema', schemaPath], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}

/** Campos antigos de `after` iguais aos de `before` (colunas novas são ignoradas). */
function pickOld(before: Row[], after: Row[]): Row[] {
  return after.map((row, i) => Object.fromEntries(Object.keys(before[i] ?? {}).map((k) => [k, row[k]])));
}

describe.skipIf(!RUN_DB_TESTS)('lead-miner-enrichment — migração da Etapa 2 para a Etapa 3 (Postgres)', () => {
  const dbName = `lmint_mig_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}_test`;
  let admin: PrismaClient | null = null;
  let db: PrismaClient | null = null;
  let tmpDir: string | null = null;
  let created = false;

  const before: Record<string, Row[]> = {};
  let indexesBefore: { indexname: string; indexdef: string }[] = [];
  let checksBefore: string[] = [];

  async function snapshot(client: PrismaClient): Promise<Record<string, Row[]>> {
    const out: Record<string, Row[]> = {};
    for (const t of OLD_TABLES) out[t] = await client.$queryRawUnsafe<Row[]>(`SELECT * FROM "${t}" ORDER BY id`);
    return out;
  }

  beforeAll(async () => {
    const baseUrl = assertTestDatabase(testDatabaseUrl(), 'migração de teste (servidor)');
    const url = new URL(baseUrl);
    url.pathname = `/${dbName}`;
    // O banco descartável também precisa ser `*_test` antes de qualquer CREATE/DROP DATABASE.
    const testUrl = assertTestDatabase(url.toString(), 'migração de teste (banco descartável)');

    // Conexão administrativa: só executa CREATE/DROP DATABASE do banco descartável.
    admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    created = true;

    // Migrações até a Etapa 2 num diretório temporário.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmint-mig-'));
    const schemaPath = path.join(tmpDir, 'schema.prisma');
    fs.copyFileSync(path.join(ROOT, 'prisma/schema.prisma'), schemaPath);
    fs.cpSync(path.join(ROOT, 'prisma/migrations'), path.join(tmpDir, 'migrations'), {
      recursive: true,
      // Fora a migração testada E as posteriores (16+ dependem das colunas criadas por ela).
      filter: (src) => !/^\d{14}_/.test(path.basename(src)) || path.basename(src) < NEW_MIGRATION,
    });
    deploy(schemaPath, testUrl);

    db = new PrismaClient({ datasources: { db: { url: testUrl } } });
    await seedEtapa2(db);

    for (const [t, rows] of Object.entries(await snapshot(db))) before[t] = rows;
    indexesBefore = await db.$queryRawUnsafe(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`,
    );
    checksBefore = (
      await db.$queryRawUnsafe<{ conname: string }[]>(
        `SELECT conname FROM pg_constraint WHERE contype = 'c' ORDER BY conname`,
      )
    ).map((r) => r.conname);

    // Aplica a migração nova.
    fs.cpSync(path.join(ROOT, 'prisma/migrations', NEW_MIGRATION), path.join(tmpDir, 'migrations', NEW_MIGRATION), {
      recursive: true,
    });
    // Conexão nova: as instruções preparadas antes da migração têm o formato antigo das tabelas.
    await db.$disconnect();
    deploy(schemaPath, testUrl);
    db = new PrismaClient({ datasources: { db: { url: testUrl } } });
  }, 180_000);

  afterAll(async () => {
    await db?.$disconnect();
    if (admin) {
      if (created) await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      await admin.$disconnect();
    }
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }, 60_000);

  it('preserva as contagens e os campos antigos de todas as tabelas', async () => {
    const after = await snapshot(db!);
    for (const t of OLD_TABLES) {
      expect(before[t]!.length, t).toBeGreaterThan(0);
      expect(after[t]!.length, t).toBe(before[t]!.length);
      expect(pickOld(before[t]!, after[t]!), t).toEqual(before[t]);
    }
  });

  it('marca todas as Analises antigas com versaoScore = 1 e novas recebem 2 (Req. 13.1)', async () => {
    const rows = await db!.$queryRawUnsafe<{ versaoScore: number }[]>(`SELECT "versaoScore" FROM "CompanyAnalysis"`);
    expect(rows.length).toBe(before.CompanyAnalysis!.length);
    expect(rows.every((r) => r.versaoScore === 1)).toBe(true);

    const companyId = String(before.Company![0]!.id);
    await db!.$executeRawUnsafe(
      `INSERT INTO "CompanyAnalysis" (id, "companyId", "hasSite", online, "isHttps", "sslValid", categoria, motivos,
         "scoreDigital", "scoreIcp", "scoreObjetivo", "scoreFinal", prioridade, detalhamento)
       VALUES ('mig_new_analysis', $1, false, false, false, false, 'CRIAR_SITE', '[]', 0, 0, 0, 0, 'BAIXA', '{}')`,
      companyId,
    );
    const [fresh] = await db!.$queryRawUnsafe<{ versaoScore: number }[]>(
      `SELECT "versaoScore" FROM "CompanyAnalysis" WHERE id = 'mig_new_analysis'`,
    );
    expect(fresh!.versaoScore).toBe(2);
    await db!.$executeRawUnsafe(`DELETE FROM "CompanyAnalysis" WHERE id = 'mig_new_analysis'`);
  });

  it('mantém os índices (incluindo os parciais) e os CHECKs existentes', async () => {
    const after = await db!.$queryRawUnsafe<{ indexname: string; indexdef: string }[]>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`,
    );
    const afterMap = new Map(after.map((i) => [i.indexname, i.indexdef]));
    for (const idx of indexesBefore) expect(afterMap.get(idx.indexname), idx.indexname).toBe(idx.indexdef);
    for (const name of PARTIAL_INDEXES) expect(afterMap.get(name), name).toMatch(/WHERE/);

    const checksAfter = (
      await db!.$queryRawUnsafe<{ conname: string }[]>(`SELECT conname FROM pg_constraint WHERE contype = 'c'`)
    ).map((r) => r.conname);
    expect(checksBefore.length).toBeGreaterThan(0);
    for (const c of checksBefore) expect(checksAfter).toContain(c);
  });

  it('deixa os campos novos vazios nos registros antigos', async () => {
    const companies = await db!.$queryRawUnsafe<Row[]>(`SELECT * FROM "Company" ORDER BY id`);
    for (const c of companies) {
      for (const col of [
        'cnpjCnaeCodigo', 'cnpjCnaeDescricao', 'cnpjConsultadoEm', 'cnpjDadosCnpj', 'cnpjInicioAtividade',
        'cnpjMei', 'cnpjMunicipio', 'cnpjNatureza', 'cnpjNomeFantasia', 'cnpjOrigem', 'cnpjPorte',
        'cnpjRazaoSocial', 'cnpjSituacaoData', 'cnpjStatus', 'cnpjUf', 'desempenhoRuim', 'instagramOsm',
        'reanaliseAte', 'situacaoCadastral', 'temInstagram', 'temWhatsapp', 'whatsappOsm',
      ]) {
        expect(c[col], `Company.${col}`).toBeNull();
      }
      expect(c.cnpjCandidatos).toEqual([]);
      // Backfill: sem Cache_Google nem Dados_CNPJ, Nome_Exibicao = nome próprio.
      expect(c.nomeExibicao).toBe(c.nome);
    }

    const analyses = await db!.$queryRawUnsafe<Row[]>(
      `SELECT sinais, "pagespeedMotivo", "cnpjEncontrados" FROM "CompanyAnalysis"`,
    );
    for (const a of analyses) {
      expect(a.sinais).toBeNull();
      expect(a.pagespeedMotivo).toBeNull();
      expect(a.cnpjEncontrados).toBeNull();
    }

    const runs = await db!.$queryRawUnsafe<Row[]>(`SELECT * FROM "MiningRun"`);
    for (const r of runs) {
      expect(r.cnpjEnabled).toBe(false);
      expect(r.pagespeedEnabled).toBe(false);
      expect(r.fonteSolicitada).toBe('OSM');
      expect(r.googleCursor).toBeNull();
      expect(r.googleMotivo).toBeNull();
      expect(r.pagespeedMotivo).toBeNull();
      expect(r.googleNichosAfetados).toEqual([]);
      expect(r.nichosGoogleFalhos).toEqual([]);
      expect(r.nichosGoogleProcessados).toEqual([]);
    }

    const links = await db!.$queryRawUnsafe<{ origem: string }[]>(`SELECT origem::text AS origem FROM "MiningRunCompany"`);
    expect(links.every((l) => l.origem === 'OSM')).toBe(true);

    for (const t of ['GooglePlaceCache', 'ApproachMessage']) {
      const [{ n }] = await db!.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${t}"`);
      expect(n, t).toBe(0);
    }
  });
});

/** Dados no formato da Etapa 2 (só colunas existentes antes da migração nova). */
async function seedEtapa2(db: PrismaClient): Promise<void> {
  const sql = [
    `INSERT INTO "User" (id, name, email, "globalRole", status, "updatedAt")
       VALUES ('mig_user', 'Usuário Migração', 'migracao.teste@scitecjr.com', 'PRESIDENTE', 'ATIVO', '2026-10-01T10:00:00Z')`,
    `INSERT INTO "Company" (id, "osmId", nome, "nomeNormalizado", nicho, bairro, cidade, uf, telefone, website,
         latitude, longitude, fonte, categoria, "scoreFinal", prioridade, "hasSite", "isHttps", "lastAnalyzedAt",
         "assignedTo", "updatedAt")
       VALUES
       ('mig_c1', 'node/1', 'Clínica Sorriso', 'clinica sorriso', 'clinica_odontologica', 'Centro', 'São José dos Campos',
         'SP', '(12) 3333-4444', 'http://sorriso.example', -23.18, -45.88, 'OSM', 'OTIMIZACAO_SEGURANCA', 72, 'ALTA',
         true, false, '2026-10-02T12:00:00Z', 'mig_user', '2026-10-02T12:00:00Z'),
       ('mig_c2', 'node/2', 'Advocacia Lima', 'advocacia lima', 'advocacia', 'Centro', 'São José dos Campos',
         'SP', NULL, NULL, NULL, NULL, 'OSM', 'CRIAR_SITE', 55, 'MEDIA', false, false, '2026-10-02T12:05:00Z',
         NULL, '2026-10-02T12:05:00Z'),
       ('mig_c3', 'way/3', 'Pet Shop Amigo', 'pet shop amigo', 'pet_shop', 'Vila Ema', 'São José dos Campos',
         'SP', NULL, NULL, NULL, NULL, 'OSM', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02T12:10:00Z')`,
    `INSERT INTO "CompanyAlias" (id, "companyId", source, "externalId")
       VALUES ('mig_a1', 'mig_c1', 'OSM', 'node/1'), ('mig_a2', 'mig_c1', 'OSM', 'node/99')`,
    `INSERT INTO "MiningRun" (id, bairro, cidade, uf, "bairroNorm", "cidadeNorm", nichos, "iaEnabled", "paramsKey",
         status, total, processados, "nichosProcessados", "createdById", "updatedAt", "finishedAt")
       VALUES
       ('mig_r1', 'Centro', 'São José dos Campos', 'SP', 'centro', 'sao jose dos campos',
         '["clinica_odontologica","advocacia"]', true, 'key1', 'CONCLUIDA', 2, 2,
         '["clinica_odontologica","advocacia"]', 'mig_user', '2026-10-02T12:06:00Z', '2026-10-02T12:06:00Z'),
       ('mig_r2', 'Vila Ema', 'São José dos Campos', 'SP', 'vila ema', 'sao jose dos campos', '["pet_shop"]', false,
         'key2', 'EM_ANDAMENTO', 1, 0, '[]', 'mig_user', '2026-10-02T12:10:00Z', NULL)`,
    `INSERT INTO "CompanyAnalysis" (id, "companyId", "runId", "hasSite", online, "statusCode", "isHttps", "sslValid",
         "sslProblem", "responseTime", lento, "finalUrl", categoria, motivos, "scoreDigital", "scoreIcp",
         "scoreObjetivo", "scoreIa", "scoreFinal", prioridade, "iaAplicada", "oportunidadeIa", "justificativaIa",
         detalhamento, tecnologias, "createdAt")
       VALUES
       ('mig_an1', 'mig_c1', 'mig_r1', true, true, 200, false, false, 'Sem HTTPS', 850, false, 'http://sorriso.example/',
         'OTIMIZACAO_SEGURANCA', '["Site sem HTTPS"]', 60, 80, 68, 85, 72, 'ALTA', true, 'Migrar para HTTPS',
         'Clínica com site inseguro', '{"digital":[{"regra":"sem_https","pontos":30}]}', '["WordPress"]',
         '2026-10-02T12:00:00Z'),
       ('mig_an2', 'mig_c2', 'mig_r1', false, false, NULL, false, false, NULL, NULL, false, NULL, 'CRIAR_SITE',
         '["Sem site"]', 100, 40, 55, NULL, 55, 'MEDIA', false, NULL, NULL, '{"digital":[]}', NULL,
         '2026-10-02T12:05:00Z'),
       ('mig_an3', 'mig_c1', NULL, true, false, NULL, false, false, NULL, NULL, false, NULL, 'CRIAR_SITE',
         '["Site fora do ar"]', 90, 80, 86, NULL, 86, 'ALTA', false, NULL, NULL, '{}', NULL, '2026-09-30T08:00:00Z')`,
    `INSERT INTO "MiningRunCompany" (id, "runId", "companyId", "isNew", nicho, "processedAt", "analysisId")
       VALUES
       ('mig_l1', 'mig_r1', 'mig_c1', true, 'clinica_odontologica', '2026-10-02T12:00:00Z', 'mig_an1'),
       ('mig_l2', 'mig_r1', 'mig_c2', true, 'advocacia', '2026-10-02T12:05:00Z', 'mig_an2'),
       ('mig_l3', 'mig_r2', 'mig_c3', true, 'pet_shop', NULL, NULL)`,
    `INSERT INTO "ProspectLead" (id, "companyName", "contactInfo", "actionPlan", segment, status, "companyId",
         "assignedTo", "updatedAt")
       VALUES
       ('mig_p1', 'Clínica Sorriso', '(12) 3333-4444', 'Oferecer HTTPS', 'Saúde', 'PENDING', 'mig_c1', 'mig_user',
         '2026-10-03T09:00:00Z'),
       ('mig_p2', 'Lead Antigo', NULL, 'Plano manual', NULL, 'PENDING', NULL, NULL, '2026-09-01T09:00:00Z')`,
    `INSERT INTO "ApiUsage" (id, provider, month, count) VALUES ('mig_u1', 'gemini', '2026-10', 7)`,
  ];
  for (const s of sql) await db.$executeRawUnsafe(s);
}
