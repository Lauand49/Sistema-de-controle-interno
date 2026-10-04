# Handoff — SciTec jr. (Minerador de Leads, pós-Etapa 3)

Atualizado ao fim dos ajustes pós-etapa 3 (T1–T6) e das correções da revisão (P1–P5). Leia junto com `docs/PLANO-INTEGRACAO.md` (seção 8.4 e 8.4.1) e `AGENTS.md`.

## Onde estamos

- Branch de trabalho: `etapa-3-melhorias` (a partir de `etapa-2-paineis`). **Nada foi enviado ao remoto** (sem `git push`) e **o PR ainda não foi aberto**. As PRs das Etapas 0–2 também estão pendentes; o PR desta branch deve ter base `etapa-2-paineis` (retargetar para `main` depois).
- Etapa 3 (spec `.kiro/specs/lead-miner-enrichment/`) concluída. Depois dela, cinco ajustes sem spec, um commit `[kiro] T<n>: ...` cada:

| Tarefa | Resultado | Migração |
|---|---|---|
| T1 Parar mineração | status `CANCELADA`, `POST /runs/[id]/cancel`, botão "Parar" (Minerar e Minerações), aborta a análise em curso | `20261016000000_mining_run_cancelada` |
| T2 Localização em cascata | UF → Cidade (IBGE) → Bairro (OSM), comboboxes, caches em memória, digitação livre como fallback | nenhuma |
| T4 Abas com/sem contato | `Company.temContato` (trigger), `emailOsm`, filtro `contato`, contadores por filtro | `20261017000000_company_tem_contato` |
| T3 Resultados progressivos | polling de 3 s, selo "analisando…", ordem `recentes`, contadores ao vivo, coluna "Contato" | nenhuma |
| T5 Avaliação dos sem contato | Gemini em lote (10), teto 30 por mineração, fallback por regras "sem IA", botão "Avaliar", seção na Ficha | `20261018000000_company_avaliacao` |
| T6 Documentação | `PLANO-INTEGRACAO.md` 8.4.1 e este arquivo | — |
| P1 (correção) Proteção do banco de dev | testes de integração só em `*_test` (`npm run test:int`), trava no seed | — |
| P2 (correção) Parar interrompe a descoberta | `AbortSignal` até Nominatim, Overpass e Google Places | — |
| P3 (correção) Avaliação automática no servidor | disparo único ao concluir, no lote que conclui | `20261019000000_mining_run_avaliacao_iniciada` |
| P4 (correção) Regra de contato única | `temContato()` TS + trigger alinhado | `20261020000000_tem_contato_whitespace` |
| P5 (correção) Documentação | 8.4.1, este arquivo, `docs/PR-ETAPA-3.md` | — |

Detalhes, decisões e limitações de cada uma: `docs/PLANO-INTEGRACAO.md`, seção 8.4.1.

## Como a mineração avança (quem dispara cada etapa)

1. **Criar** (`POST /runs`): o servidor grava a mineração `PENDENTE`. Nada roda em segundo plano: não há worker, fila nem cron.
2. **Descoberta e análise são dirigidas pelo navegador do autor** (`hooks/lead-miner/driveRun.ts`): ele chama `POST /runs/[id]/discover` enquanto `PENDENTE` e `POST /runs/[id]/batch` enquanto `EM_ANDAMENTO`, um passo de até ~55 s por requisição (`maxDuration` 60), com retentativa em falha de rede.
3. **Dentro de cada passo tudo é do servidor**: as consultas a Nominatim/Overpass/Google Places, a análise (site, PageSpeed, CNPJ, IA) e a gravação. O servidor marca a mineração `CONCLUIDA` na requisição de lote que termina o último item.
4. **Sem a aba do autor aberta a mineração para** e retoma quando ele volta (estado no banco); isso NÃO foi reestruturado. "Parar" é um `POST /cancel` de qualquer usuário autorizado.
5. **Avaliação automática dos sem contato (P3)**: é disparada pelo servidor, na mesma requisição de lote que vê `CONCLUIDA` (`lib/leads/auto-evaluation.ts`), uma única vez (marca atômica `MiningRun.avaliacaoIniciadaEm`, migração `20261019000000`). Depende do navegador só na medida em que o lote final depende dele; o botão "Avaliar" continua existindo.

## Onde mora a regra de contato (`temContato`)

Em **dois lugares que devem mudar juntos**: a função SQL `company_set_tem_contato()` (criada em `prisma/migrations/20261017000000_company_tem_contato`, redefinida em `20261020000000_tem_contato_whitespace`, que é a versão vigente) e a função TypeScript pura `temContato()` em `lib/leads/contact.ts`. Mudar a regra = migração NOVA (`CREATE OR REPLACE FUNCTION` + backfill) + função TS + rodar `npm run test:int` (teste `tem-contato-trigger.int.test.ts`, só em `scitec_test`). Nunca editar migração antiga.

## Como validar

```bash
export PATH=$HOME/.local/bin:$PATH
npx prisma migrate deploy      # aplica as migrações novas (aditivas); as 20261019 e 20261020 NÃO foram aplicadas pelo agente
npx prisma generate
npx tsc --noEmit
npm test                       # offline; não usa RUN_DB_TESTS
npm run build
npm run dev                    # http://localhost:3000 (login de testes: joao.vaz@scitecjr.com)
```

Testes novos em `tests/lead-miner-ajustes/` (cancelamento, localidades, cascata do formulário, contato, resultados ao vivo, avaliação). As rotas novas também estão no teste de propriedade `routes-enrichment.p45` (401/403 sem efeitos).

Roteiro manual (Negócios, com `npm run dev`):

1. `/tools/lead-miner`: escolher UF, depois cidade (autocomplete), depois bairro; iniciar uma mineração e clicar em **Parar**.
2. `/tools/lead-miner/leads?runId=<id>` com a mineração rodando: lista atualizando a cada ~3 s, selo "analisando…", contadores ao vivo.
3. Abas **Com contato (N)** / **Sem contato (M)** e exportação CSV / mapa seguindo a aba.
4. Aba Sem contato: botão **Avaliar**; abrir a Ficha de um lead avaliado.

## Variáveis de ambiente

As mesmas do `.env.example`; nenhuma nova. Sem `GEMINI_API_KEY` a avaliação dos sem contato usa regras (rótulo "sem IA"). IBGE e Overpass não exigem chave. Nunca commitar `.env`.

## Pendente / próximos passos

- Abrir o PR de `etapa-3-melhorias` (base `etapa-2-paineis`) e fazer o `git push` quando o usuário autorizar.
- Decisões em aberto com o usuário:
  - e-mail de contato hoje vem só da tag OSM; extrair e-mail do site exige decidir sobre guardar dado pessoal (LGPD);
  - a mineração inteira depende do navegador do autor (ver "Como a mineração avança"); rodar sem ninguém na tela exige worker/cron (Etapa 4). A avaliação automática já é do servidor, mas só dispara quando o lote final chega;
  - se o lote final usar quase todo o orçamento de 60 s, a avaliação automática não tem tempo de chamar a IA e deixa os leads pendentes (não grava regras no lugar): use o botão "Avaliar".
- Etapa 4 (deploy) continua a fazer. Lembretes: limitadores em memória (Nominatim, BrasilAPI) e os caches de cidades/bairros são por instância (Cloud Run com `max-instances=1` ou mover para o banco); a purga do Cache_Google continua oportunista.
- **Migrações com data futura** (`20261015` a `20261020`, contra a regra de data real do `AGENTS.md`): NÃO renomear. Renomear só depois que o dono confirmar que nenhum banco compartilhado as aplicou; renomear uma já aplicada quebra o histórico do Prisma desse banco.
- Rodar `npm run test:int` num `scitec_test` (nada de integração foi executado nestas correções, incluindo o teste novo do trigger) e aplicar `npx prisma migrate deploy` nos bancos que o time usa.
- Limitações em `docs/PLANO-INTEGRACAO.md` 8.4.1 ("Limitações conhecidas e pendências"): aborto em multi-instância depende do fallback no banco, caches/limitadores por processo, e-mail do site (LGPD) sem decisão.
- Texto pronto do PR: `docs/PR-ETAPA-3.md` (o PR não foi aberto).

## Bloqueios

_Nenhum._

## Testes de integração e operações destrutivas

**Regra:** integração só contra `scitec_test`. Comando exato:

```bash
createdb scitec_test                   # uma vez; o nome do banco DEVE terminar em "_test"
cp .env.test.example .env.test         # ajuste TEST_DATABASE_URL (arquivo ignorado pelo git)
npm run test:int                       # = RUN_DB_TESTS=1 vitest run integration/
```

- Os testes usam só `TEST_DATABASE_URL`; sem ela são pulados com mensagem. `tests/setup/integration-env.ts` fixa `DATABASE_URL` nessa URL (ou num destino inalcançável) antes de qualquer módulo carregar o Prisma, então nem `new PrismaClient()` sem argumentos alcança o banco de desenvolvimento.
- `assertTestDatabase(url)` (`tests/support/assert-test-db.ts`) lança erro se o nome do banco não terminar em `_test` ou se a URL não tiver banco. Está no `beforeAll` de todos os testes de integração, em `tests/lead-tools-test.ts` e, via `prisma/seed-guard.ts`, no seed (que aceita `_test` ou `SEED_CONFIRM_DB=<nome>`).
- Histórico: na T1, execuções com `RUN_DB_TESTS=1` e um script de verificação rodaram `deleteMany` no banco de desenvolvimento local (`scitec_dev`), apagando linhas de `Company`, `CompanyAnalysis` e relacionadas. O que havia nelas não foi conferido nem recuperado. A causa era `reanalysis.int.test.ts` (`new PrismaClient()` com o `.env` + `deleteMany()` sem filtro) e o fallback para `DATABASE_URL` nos demais; ambos foram removidos.
- Os testes de integração **não foram executados** nesta rodada de correções (nem contra `scitec_test`). As alterações neles (trava, `migration.int` sem as migrações 16+ no banco intermediário, `reanalysis.int` com `beforeAll`) estão validadas só por `tsc`; rode `npm run test:int` num `scitec_test` antes de confiar nelas.

### Inventário de operações destrutivas (grep de `deleteMany`/`TRUNCATE`/`DROP`/`DELETE FROM`/SQL cru; nada foi executado)

| Local | Operação | Modelos afetados | Proteção |
|---|---|---|---|
| `prisma/seed.ts:9-21` | `deleteMany()` sem filtro | AuditLog, SectorMember, CardActivity, CardFieldValue, Card, Field, Phase, Pipe, CrossDeptRequest, FinancialTransaction, ProspectLead, Task, User | `seed-guard.ts` (`*_test` ou `SEED_CONFIRM_DB`) |
| `tests/lead-miner-enrichment/integration/reanalysis.int.test.ts` (`beforeEach`) | `deleteMany()` sem filtro | CompanyAnalysis, MiningRunCompany, CompanyAlias, GooglePlaceCache, ProspectLead, MiningRun, Company | `assertTestDatabase` + cliente só com `TEST_DATABASE_URL` |
| `tests/lead-miner/integration/db-helpers-repo.ts` (`cleanup`) | `deleteMany` por prefixo/autor | Company, MiningRun, User | idem |
| `tests/lead-miner/integration/routes.int.test.ts` (`afterAll`) | `deleteMany` por ids criados | AuditLog, Card, ProspectLead, MiningRun, Company | idem |
| `tests/lead-miner-enrichment/integration/repository-enrichment.int.test.ts` (`afterAll`) | `deleteMany` por mês/prefixo/autor | ApiUsage, Company, MiningRun, User | idem |
| `tests/dashboards/integration/dashboards.int.test.ts` (`afterAll`) | `deleteMany` por ids criados; `UPDATE "Task"` por ids (SQL cru) | Task, CrossDeptRequest, ProspectLead, Card, Pipe, AuditLog, User | idem |
| `tests/lead-miner-enrichment/integration/migration.int.test.ts` | `CREATE DATABASE`/`DROP DATABASE … WITH (FORCE)` do banco descartável `lmint_mig_*_test`; `INSERT`/`DELETE FROM "CompanyAnalysis"` nele | banco descartável inteiro | nome do servidor e do descartável passam por `assertTestDatabase` |
| `tests/lead-tools-test.ts` | `deleteMany`/`delete` do que o script criou | CardActivity, Card, ProspectLead | `assertTestDatabase` (só `TEST_DATABASE_URL`) |
| `lib/leads/repository.ts:512,517`, `lib/leads/google-cache.ts:143` | código da aplicação (poda de redes do Google; purga do cache) | MiningRunCompany, Company (órfãs), GooglePlaceCache | escopo por mineração/expiração; não é teste |
| `tests/lead-miner-ajustes/cancel*.test.ts`, `tests/lead-miner-enrichment/pipeline-sources.test.ts`, `support/fake-prisma-cache.ts` | `deleteMany` em **fakes** em memória | — | não tocam banco |

Sem `TRUNCATE`, `DROP TABLE`, `prisma migrate reset` ou `db push` em `scripts/` (`generate-test-sheet.js`, `remove-bg.js` não usam banco), `package.json` ou `tests/`.
