# Implementation Plan: Painéis de departamento, setor e membro (Etapa 2)

## Overview

Implementação incremental em TypeScript (Next.js 14 App Router + Prisma/Postgres), seguindo o `design.md`. Ordem: branch → schema e migração (`Task.completedAt`) → regras de acesso em `lib/permissions.ts` → módulos puros de `lib/dashboards/` (período, Calculadora_Metricas, filtros, formatação) com testes → `completedAt` na API_Tarefas → repositório Prisma e serviço → rotas `/api/dashboards/**` → telas `/paineis/**`, navbar e link "Ver painel" → registro da Etapa 2 no plano mestre e PR. Cada tarefa termina integrada à anterior.

Convenções:
- Testes em `tests/dashboards/`. Unitários em `{modulo}.test.ts`; cada propriedade do design em arquivo próprio `{modulo}.p{N}.property.test.ts`, com `fc.assert(..., { numRuns: 100 })` e o comentário `// Feature: dashboards, Property {N}: {título}`.
- Geradores e dependências falsas em `tests/dashboards/support/` (um arquivo por área, para evitar conflitos entre tarefas paralelas).
- Testes de componentes com `// @vitest-environment jsdom` na primeira linha; integração em `tests/dashboards/integration/*.int.test.ts`, pulada sem `RUN_DB_TESTS=1`.
- Toda rota nova: `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, só `GET`, `withAuth`; permissão sempre decidida em `service.ts` com `lib/permissions.ts`.

## Tasks

- [x] 1. Branch da Etapa 2
  - [x] 1.1 Criar a branch `etapa-2-paineis` a partir de `etapa-1-minerador`
    - `git switch etapa-1-minerador && git pull --ff-only && git switch -c etapa-2-paineis` (as alterações locais em `.kiro/specs/` acompanham a troca)
    - Rodar `npm test` e `npm run build` para registrar a linha de base verde antes de alterar código
    - _Requirements: 12.6, 12.8_

- [x] 2. Modelo de dados e migração
  - [x] 2.1 Atualizar `prisma/schema.prisma`
    - `Task.completedAt DateTime?` com comentário; índices `@@index([unitId, status])` e `@@index([completedAt])` em `Task`, `@@index([handlerId])` em `CrossDeptRequest`, `@@index([createdAt])` em `ProspectLead`
    - _Requirements: 3.8, 3.10_
  - [x] 2.2 Gerar e revisar `prisma/migrations/20261010000000_paineis/migration.sql`
    - `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script`; remover qualquer `DROP INDEX` dos índices parciais listados no topo do schema
    - Inserir, logo após o `ALTER TABLE`, `UPDATE "Task" SET "completedAt" = "updatedAt" WHERE "status" = 'DONE' AND "completedAt" IS NULL;`
    - Rodar `npx prisma generate`; em `types/index.ts` acrescentar `completedAt?: string | null` ao tipo `Task`
    - _Requirements: 3.10_

- [x] 3. Regras de acesso na matriz única
  - [x] 3.1 Acrescentar a `lib/permissions.ts` as funções `canViewUnitDashboard`, `canViewMemberDashboard` e `canSeeMemberSummary`
    - Composição de `isUnitCode`, `canViewUnit` e `progressScope`, sem alterar funções existentes (código do design)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 7.3, 7.4_
  - [x] 3.2 Escrever testes unitários das permissões dos painéis
    - Criar `tests/dashboards/support/arb-person.ts` (`arbPerson`, `arbActivePerson`, `arbUnitCodeish` com códigos válidos, variações de caixa e strings arbitrárias; ids de um conjunto pequeno)
    - `tests/dashboards/permissions.test.ts`: Presidente, Vice, Gerente de Departamento, Gerente de Setor, Assessor com e sem setor; GD de Negócios sem acesso a `TEC_SOFTWARE` sem vínculo; GS com escopo `['TEC_SOFTWARE']` sobre membro de outro departamento; PENDENTE e INATIVO sem acesso; Assessor vê só o próprio resumo; GS sem resumos no painel de departamento
    - _Requirements: 12.3, 1.3, 1.4, 1.5, 1.6, 1.7, 7.4_
  - [x] 3.3 Escrever property test do acesso ao painel de unidade
    - **Property 1: Acesso ao painel de unidade**
    - **Validates: Requirements 1.1, 1.3, 1.4, 1.5**
  - [x] 3.4 Escrever property test do acesso ao painel de membro
    - **Property 2: Acesso ao painel de membro e Escopo_Progresso**
    - **Validates: Requirements 1.2, 1.3, 1.6**
  - [x] 3.5 Escrever property test de conta não ativa
    - **Property 3: Conta não ativa não vê painel**
    - **Validates: Requirements 1.7**
  - [x] 3.6 Escrever property test da visibilidade do Resumo_Membro
    - **Property 4: Visibilidade do Resumo_Membro**
    - **Validates: Requirements 7.3, 7.4**

- [x] 4. Período e fuso
  - [x] 4.1 Implementar `lib/dashboards/period.ts`
    - `PERIODS`, `DEFAULT_PERIODO`, `PERIOD_DAYS`, `TIME_ZONE`, `parsePeriodo`, `saoPauloDayKey` (`Intl.DateTimeFormat('en-CA', { timeZone })`), `dueDayKey` (data UTC), `addDays`, `startOfSaoPauloDay` (deslocamento por `formatToParts`, com segunda passada), `periodWindow`, `buildMetricContext` (`overdueCutoff` = meia-noite UTC do Dia_Referencia), `inWindow`
    - Sem imports de Node, Prisma ou `server-only`
    - _Requirements: 2.6, 2.7, 2.9, 3.5, 10.3_
  - [x] 4.2 Escrever testes unitários de `period.ts`
    - Criar `tests/dashboards/support/arb-facts.ts` (`arbNow` com viés para 00:00–03:00 UTC, `arbPeriodo`, `arbTaskFact`, `arbRequestFact`, `arbLeadFact` com bordas de prazo e de janela ±1 ms)
    - `tests/dashboards/period.test.ts`: `startOfSaoPauloDay('2026-10-05')` = `2026-10-05T03:00:00.000Z`; `7d` começa 6 dias antes; `parsePeriodo('')` = `'30d'`, `parsePeriodo('30D')` = `null`; resultados iguais com `process.env.TZ` = `UTC` e `Asia/Tokyo`
    - _Requirements: 12.1, 2.6, 2.7_
  - [x] 4.3 Escrever property test de Periodo e janela
    - **Property 5: Periodo e janela**
    - **Validates: Requirements 2.6, 2.7, 10.3**
  - [x] 4.4 Escrever property test do dia de São Paulo
    - **Property 6: Dia de São Paulo (round-trip)**
    - **Validates: Requirements 3.5, 12.1**

- [x] 5. Calculadora_Metricas
  - [x] 5.1 Implementar `lib/dashboards/metrics.ts` e `lib/dashboards/types.ts`
    - `metrics.ts`: fatos de entrada, `isOpenTask`, `isOverdueTask`, `isDoneInPeriod`, `computeTaskCounts`, `tasksInScope`, `sumRows`, `rowsToMap`, `buildMemberSummaries`, `summarizeTasksByMember`, `phaseCounts`, constantes de status, `countRequestsByStatus`, `statusRowsToCounts`, `isOverdueRequest`, `countLeadsByStatus`, `conversionFromCounts` (arredondamento meio para cima só com inteiros), `computeConversion`, `leadsByAssignee` (linha `null` por último)
    - `types.ts`: DTOs `PersonBrief`, `UnitRef`, `PeriodDTO`, `OverdueTaskDTO`, `PhaseCountDTO`, `PipeCountDTO`, `MemberCardGroupDTO`, `MemberSummaryDTO`, `UnitDashboardDTO`, `MemberDashboardDTO`, `HubDTO` (isomórfico)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.2, 4.3, 4.4, 4.6, 5.2, 6.1, 6.2, 6.3, 7.1, 7.2, 8.1, 8.2, 2.10_
  - [x] 5.2 Escrever testes unitários da Calculadora_Metricas
    - `tests/dashboards/metrics.test.ts` com `now = 2026-10-05T15:00:00Z`: prazo ontem → atrasada; hoje → não; sem prazo → não; `dueDate = 2026-10-05T00:00:00Z` → não (também com `now = 2026-10-06T01:00:00Z`); concluída 1 ms antes de `from` → fora, em `from` → dentro; CANCELLED ignorada; conversão 0 de 0 → `null`, 1 de 8 → 13, 1 de 3 → 33, 2 de 3 → 67
    - _Requirements: 12.1, 3.4, 3.5, 6.2_
  - [x] 5.3 Escrever property test da classificação de tarefas
    - **Property 9: Classificação de tarefas segue o modelo**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
  - [x] 5.4 Escrever property test de atrasadas ≤ abertas
    - **Property 10: Atrasadas nunca excedem abertas**
    - **Validates: Requirements 3.6**
  - [x] 5.5 Escrever property test da monotonicidade do Periodo
    - **Property 11: Concluídas crescem com o Periodo**
    - **Validates: Requirements 3.7**
  - [x] 5.6 Escrever property test dos Resumos_Membro
    - **Property 12: Resumos_Membro somam no máximo o total**
    - **Validates: Requirements 7.1, 7.2, 7.6**
  - [x] 5.7 Escrever property test do escopo de setores
    - **Property 13: Escopo de setores nunca amplia as contagens**
    - **Validates: Requirements 8.9, 8.1, 8.2**
  - [x] 5.8 Escrever property test de cards por fase
    - **Property 14: Cards por fase**
    - **Validates: Requirements 4.2, 5.2**
  - [x] 5.9 Escrever property test de solicitações por status
    - **Property 15: Solicitações por status**
    - **Validates: Requirements 4.3, 4.6**
  - [x] 5.10 Escrever property test da soma de leads por status
    - **Property 16: Leads por status somam o total**
    - **Validates: Requirements 6.1, 6.4**
  - [x] 5.11 Escrever property test dos limites da Taxa_Conversao
    - **Property 17: Taxa_Conversao limitada e bem arredondada**
    - **Validates: Requirements 6.2, 6.5**
  - [x] 5.12 Escrever property test da invariância a leads RAW
    - **Property 18: Leads RAW não alteram a Taxa_Conversao**
    - **Validates: Requirements 6.6**
  - [x] 5.13 Escrever property test de leads por responsável
    - **Property 19: Leads por responsável**
    - **Validates: Requirements 6.3**

- [x] 6. Filtros de agregação
  - [x] 6.1 Implementar `lib/dashboards/filters.ts` e o interpretador de testes
    - `taskOpenWhere`, `taskOverdueWhere`, `taskDoneWhere`, `taskScopeWhere`, `requestStatusWhere`, `requestOverdueWhere`, `leadCohortWhere` (só `import type { Prisma }`; status sempre por lista explícita `in`)
    - Criar `tests/dashboards/support/where-eval.ts`: avaliador em memória dos operadores usados (`AND`, `OR`, `in`, `not`, `lt`, `gte`, `lte`, igualdade, `unit.code`), lançando erro para operador desconhecido
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 4.4, 4.6, 6.2, 8.1, 8.2_
  - [x] 6.2 Escrever property test dos filtros de tarefas
    - **Property 7: Filtros de tarefas equivalem à Calculadora_Metricas**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 4.1, 5.1, 8.1, 8.2**
  - [x] 6.3 Escrever property test dos filtros de solicitações e leads
    - **Property 8: Filtros de solicitações e leads equivalem à Calculadora_Metricas**
    - **Validates: Requirements 4.4, 4.6, 6.2**

- [x] 7. Formatação
  - [x] 7.1 Implementar `lib/dashboards/format.ts`
    - `REQUEST_STATUS_LABEL`, `LEAD_STATUS_LABEL`, `PERIOD_LABEL`, `formatDayKey`, `formatInt` (`Intl.NumberFormat('pt-BR')`), `formatConversion`, `matchesMemberSearch` (reusa `normalizeText` de `lib/leads/text.ts`)
    - _Requirements: 4.3, 4.5, 6.1, 6.2, 9.3, 10.1, 11.2_
  - [x] 7.2 Escrever testes unitários de `format.ts`
    - Rótulos exatos de solicitação, lead e período; `formatDayKey('2026-10-01')` = `'01/10/2026'`; `formatConversion` com "—"
    - _Requirements: 4.3, 6.1, 6.2, 10.1, 11.2_
  - [x] 7.3 Escrever property test da formatação
    - **Property 21: Formatação de datas e números**
    - **Validates: Requirements 4.5, 5.3, 8.8, 11.2**
  - [x] 7.4 Escrever property test da busca de membros
    - **Property 22: Busca de membros sem caixa e acentos**
    - **Validates: Requirements 9.3**

- [x] 8. Data_Conclusao na API_Tarefas
  - [x] 8.1 Implementar `lib/task-completion.ts` e usá-lo nas rotas de tarefas
    - `completedAtUpdate(prev, next, now)` conforme o design
    - `app/api/tasks/route.ts` (POST): `completedAt: completedAtUpdate(null, validated.status, new Date())`
    - `app/api/tasks/[id]/route.ts` (PATCH): `loadTask` seleciona `status`; aplica `completedAt` apenas quando o retorno não é `undefined`
    - _Requirements: 3.8, 3.9_
  - [x] 8.2 Escrever property test das transições de Data_Conclusao
    - **Property 20: Transições de Data_Conclusao**
    - **Validates: Requirements 3.8, 3.9**

- [x] 9. Checkpoint — módulos puros
  - Rodar `npm test` e `npm run build`; ensure all tests pass, ask the user if questions arise.

- [x] 10. Repositório e serviço
  - [x] 10.1 Implementar `lib/dashboards/repository.ts`
    - `import 'server-only'`; interface `DashboardRepository` e `prismaDashboardRepository(db)` com as consultas da tabela do design (`groupBy`/`count` com os `where` de `filters.ts`; `findMany` com `take: 10` e `orderBy` `[dueDate, createdAt, id]` para atrasadas; `select` mínimo, sem `description`, `CardFieldValue`, `contactInfo`, `contactName` ou `email`)
    - Membros ativos por departamento (`departmentId`) e por setor (`sectorMemberships.some`), gerente do setor, funis com fases ordenadas, cards do Alvo por escopo
    - _Requirements: 2.8, 2.10, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 6.1, 6.3, 7.1, 7.2, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.8_
  - [x] 10.2 Implementar `lib/dashboards/service.ts`
    - `getHub`, `getUnitDashboard`, `getMemberDashboard` recebendo `repo`, `actor` e `now`
    - Ordem: `parsePeriodo` (400) → `isUnitCode` após `toUpperCase`/`findUnit`/`findPerson` (404) → permissão (403 "Você não tem permissão para ver este painel.") → consultas em `Promise.all`
    - Resumos filtrados por `canSeeMemberSummary` e ordenados por nome (`localeCompare('pt-BR')`); totais por `sumRows`; `requests` só em departamento, `sector` só em setor, `leads` só em `NEGOCIOS`; Painel_Membro com `scope`, `requests`/`leads` nulos em escopo de setores e `leads` nulo sem leads; `referenceDate` e `period` em todas as respostas; hub com `members = null` para quem não é Presidência nem gerente
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 2.9, 2.10, 4.7, 5.4, 5.5, 7.1, 7.2, 7.3, 7.4, 8.5, 8.6, 8.7, 8.10, 9.1, 9.2, 9.3_
  - [x] 10.3 Escrever testes unitários do serviço
    - Criar `tests/dashboards/support/fake-repo.ts` (`DashboardRepository` em memória que registra cada chamada)
    - `tests/dashboards/service.test.ts`: 400 (período inválido), 404 (código e alvo inexistentes), 403 sem chamadas de métrica; Assessor vê só a própria linha; GS no painel do departamento recebe `members` vazio; `requests`/`sector`/`leads` presentes conforme o tipo de Unidade
    - _Requirements: 12.4, 2.3, 2.4, 2.5, 2.6, 7.3, 4.7, 5.5_
  - [x] 10.4 Escrever property test da ordem das respostas de erro
    - **Property 23: Ordem das respostas de erro sem consultas**
    - **Validates: Requirements 2.1, 2.3, 2.4, 2.5, 2.6**
  - [x] 10.5 Escrever property test dos Resumos_Membro no servidor
    - **Property 24: Resumos_Membro filtrados pelo servidor**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.6**
  - [x] 10.6 Escrever property test da forma do Painel_Membro
    - **Property 25: Forma do Painel_Membro segue o Escopo_Progresso**
    - **Validates: Requirements 8.2, 8.4, 8.5, 8.6, 8.7**
  - [x] 10.7 Escrever property test das respostas sem dados sensíveis
    - **Property 26: Respostas sem dados sensíveis**
    - **Validates: Requirements 2.9, 2.10**
  - [x] 10.8 Escrever property test do hub
    - **Property 27: Hub lista só o que o ator pode abrir**
    - **Validates: Requirements 9.1, 9.3**

- [x] 11. Rotas `/api/dashboards/**`
  - [x] 11.1 Criar as rotas GET
    - `app/api/dashboards/route.ts`, `app/api/dashboards/units/[code]/route.ts`, `app/api/dashboards/members/[userId]/route.ts`: `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, somente `export const GET = withAuth(...)`, `periodo` da query string, `new Date()` uma vez por requisição, `prismaDashboardRepository(prisma)`
    - _Requirements: 2.1, 2.2, 2.7, 2.8, 2.9_
  - [x] 11.2 Escrever testes das rotas com dependências falsas
    - `tests/dashboards/routes.test.ts`: `vi.mock('server-only')`, `vi.mock('@/auth')` (sessão nula → 401), `findUserDTO` de `@/lib/users` devolvendo o ator falso (usado pelo `withAuth` real), `@/lib/dashboards/repository` devolvendo o fake repo; 401, 403, 404, 400, 200 sem Resumos_Membro não autorizados; os módulos exportam apenas `GET`
    - _Requirements: 12.4, 2.2, 2.3, 2.4, 2.6, 2.8, 7.3_
  - [x] 11.3 Escrever testes de integração (Postgres)
    - `tests/dashboards/integration/dashboards.int.test.ts` com `RUN_DB_TESTS=1`, `DATABASE_URL_TEST` e `prisma migrate deploy`, no padrão de `tests/lead-miner/integration/` (prefixo único, limpeza no `afterAll`, `@/auth` via `AsyncLocalStorage`)
    - Repositório ≡ Calculadora sobre dados semeados; lista de atrasadas com 12 itens → 10 ordenadas; rotas 401/403/404/400/200 por tipo de pessoa sem alterar `Task`, `Card`, `CrossDeptRequest`, `ProspectLead` e `AuditLog`; respostas sem `email`/`description`/`contactInfo`; POST/PATCH de tarefas gravam e apagam `completedAt`; backfill da migração com `updatedAt` inalterado
    - _Requirements: 2.8, 2.10, 3.8, 3.9, 3.10, 4.1, 4.5, 5.3, 6.1, 6.3, 8.3, 8.4, 8.8, 12.5_

- [x] 12. Checkpoint — backend completo
  - Rodar `npm test` e `npm run build`; ensure all tests pass, ask the user if questions arise.

- [x] 13. Interface
  - [x] 13.1 Criar a base das telas em `lib/dashboards/client-api.ts` e `components/dashboards/`
    - `client-api.ts` (URLs e `fetch` tipado); `useDashboard` (`cache: 'no-store'`, `AbortController`, estados `loading`/`ok`/`denied`/`notFound`/`error`, `toast.error` do `sonner`); `DashboardStates` ("Carregando painel" em `role="status"`, acesso negado, "Painel não encontrado" com link para `/paineis`, erro com "Tentar novamente"); `PeriodSelector` (`<label>` "Período", 4 opções, `router.replace('?periodo=…')`, valor inválido corrigido para `30d`); `DashboardShell` (navbar, `h1`, seletor)
    - Estilo: `bg-slate-950`, cards `rounded-2xl border border-slate-800 bg-slate-900/60`, destaque `from-purple-600 to-indigo-600`, ícones `lucide-react`, `focus-visible:ring-2 ring-purple-500`
    - _Requirements: 9.6, 9.7, 10.1, 10.2, 10.3, 11.1, 11.2, 11.3, 11.4, 11.7, 11.8_
  - [x] 13.2 Criar os componentes de seção
    - `TaskMetrics` ("no período" nas concluídas), `OverdueTaskList` (título, responsável ou Unidade/"Geral", DD/MM/AAAA), `PipePhases` (barras `aria-hidden` + número e nome em texto), `RequestsSummary` (recebidas/enviadas com rótulos, atrasadas, "no período" em concluídas), `LeadsSummary` (por status, conversão "25% (5 de 20)" no período, por responsável com "Sem responsável"), `MemberSummaryTable` (nome como `<Link>` para `/paineis/membros/{id}`), `MemberHeader` (avatar com `alt`, título, "Conta desativada", aviso "Exibindo apenas atividades dos setores: {nomes}"), `MemberSearchList` (`<label>` "Buscar membro", `matchesMemberSearch`); estados vazios por seção
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.3, 6.1, 6.2, 6.3, 7.5, 8.7, 8.8, 8.10, 9.3, 10.4, 11.5, 11.6, 11.7, 11.8_
  - [x] 13.3 Implementar a Tela_Hub `app/paineis/page.tsx`
    - `h1` "Painéis"; atalho "Meu painel" para `/paineis/membros/{me.id}`; `h2` "Departamentos" e "Setores" com cards-link; `h2` "Membros" com `MemberSearchList` quando `members !== null`
    - _Requirements: 9.1, 9.2, 9.3, 11.8_
  - [x] 13.4 Implementar `app/paineis/unidades/[code]/page.tsx`
    - `isUnitCode` falso → "Painel não encontrado" sem fetch; `!canViewUnitDashboard(currentProfile, code)` → acesso negado sem fetch; senão `DashboardShell` com `TaskMetrics`, `OverdueTaskList`, `PipePhases`, `RequestsSummary` (departamento), bloco do setor (gerente e membros ativos), `LeadsSummary` (Negócios) e `MemberSummaryTable`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 7.1, 7.2, 7.4, 9.6, 9.7, 10.1, 10.2, 10.3_
  - [x] 13.5 Implementar `app/paineis/membros/[userId]/page.tsx`
    - `MemberHeader`, aviso de escopo de setores, `TaskMetrics`, `OverdueTaskList` com Unidade/"Geral", cards por funil/fase, solicitações e leads quando `scope.kind = 'ALL'`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.10, 9.6, 9.7, 10.1, 10.2, 10.3_
  - [x] 13.6 Integrar a navegação
    - `components/navigation/SciTecNavbar.tsx`: item "Painéis" (`LayoutDashboard`) no `nav` desktop e no grid móvel, ativo quando `pathname.startsWith('/paineis')`
    - `app/setores/[dept]/page.tsx`: link "Ver painel" no banner quando `canViewUnitDashboard(currentProfile, currentSector.code)`
    - _Requirements: 9.4, 9.5_
  - [x] 13.7 Escrever testes de componentes (jsdom)
    - `tests/dashboards/components/*.test.tsx` com `// @vitest-environment jsdom`, `@testing-library/react`, `fetch` falso e `next/navigation` mockado: estados de `useDashboard`/`DashboardStates` (carregando, negado sem métricas, não encontrado com link, erro refazendo o fetch); `PeriodSelector` (4 opções, `30d`, rótulo, `router.replace`); `MemberSummaryTable` (link e vazio); `PipePhases`/`LeadsSummary` (número e rótulo em texto, "no período"); `MemberHeader` ("Conta desativada", aviso de setores); `MemberSearchList` (busca sem acento/caixa); `h1`/`h2`
    - _Requirements: 7.5, 8.7, 8.10, 9.6, 9.7, 10.1, 10.2, 10.4, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_

- [x] 14. Checkpoint final
  - Rodar `npm test` (zero falhas, sem rede) e `npm run build` (sem erros); ensure all tests pass, ask the user if questions arise.
  - _Requirements: 12.5, 12.6_

- [x] 15. Registro da entrega e PR
  - [x] 15.1 Atualizar `docs/PLANO-INTEGRACAO.md`
    - Seção 8: linha "2 — Painéis" com "concluída em {data} na branch `etapa-2-paineis` (PR pendente; ver 8.3)"
    - Nova subseção "8.3 Registro da Etapa 2": spec em `.kiro/specs/dashboards/`; as 12 decisões confirmadas (rotas `/paineis/**`, definição de atrasada, `Task.completedAt` com backfill, períodos, taxa de conversão por coorte de criação, solicitações só em departamento, Resumos_Membro pelo `progressScope`, GD com escopo total, inativos, home inalterada, agregação no banco, PR com base `etapa-1-minerador`); leitura de `dueDate` pela data UTC; como rodar os testes de integração (`RUN_DB_TESTS=1`)
    - _Requirements: 12.7_
  - [x] 15.2 Commitar, enviar e abrir o PR
    - Stage de arquivos específicos (spec, `prisma/`, `lib/`, `app/`, `components/`, `tests/dashboards/`, `types/index.ts`, `docs/PLANO-INTEGRACAO.md`; nunca `.env`); commit em português
    - `git push -u origin etapa-2-paineis`; como o `gh` não está instalado, abrir o PR pela URL impressa pelo `git push`, com base `etapa-1-minerador` (retargetar para `main` depois do merge das Etapas 0 e 1); descrição com resumo, resultado de `npm test`/`npm run build`, checklist do Req. 12 e roteiro manual de estilo e acessibilidade
    - _Requirements: 12.6, 12.7, 12.8_

## Notes

- Tarefas com `*` são opcionais. Os testes exigidos pelo Requisito 12 não são opcionais: 3.2 (12.3), 4.2 e 5.2 (12.1), 5.4, 5.5, 5.6, 5.7, 5.10, 5.11 e 5.12 (propriedades de 3.6, 3.7, 7.6, 8.9, 6.4, 6.5 e 6.6 — 12.2), 10.3 e 11.2 (12.4).
- Cada propriedade das Correctness Properties tem sub-tarefa e arquivo próprios (`{modulo}.p{N}.property.test.ts`).
- A integração com Postgres (11.3) fica pulada sem `RUN_DB_TESTS=1` e exige um banco descartável.
- Validação completa de WCAG exige teste manual com tecnologias assistivas; o roteiro fica no PR.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.2", "5.1"] },
    { "id": 3, "tasks": ["3.3", "3.4", "3.5", "3.6", "4.3", "4.4", "5.2", "6.1", "7.1", "8.1"] },
    { "id": 4, "tasks": ["5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "5.9", "5.10", "5.11", "5.12", "5.13", "6.2", "6.3", "7.2", "7.3", "7.4", "8.2", "10.1"] },
    { "id": 5, "tasks": ["10.2"] },
    { "id": 6, "tasks": ["10.3", "11.1"] },
    { "id": 7, "tasks": ["10.4", "10.5", "10.6", "10.7", "10.8", "11.2", "13.1"] },
    { "id": 8, "tasks": ["11.3", "13.2"] },
    { "id": 9, "tasks": ["13.3", "13.4", "13.5", "13.6"] },
    { "id": 10, "tasks": ["13.7"] },
    { "id": 11, "tasks": ["15.1"] },
    { "id": 12, "tasks": ["15.2"] }
  ]
}
```
