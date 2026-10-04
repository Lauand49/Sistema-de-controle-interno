# Plano de Integração — Sistema Interno SciTec jr. + Minerador de Leads

Documento de continuidade: registra o que foi analisado e decidido para que qualquer sessão
de desenvolvimento retome o trabalho sem perder contexto. Itens marcados **[a confirmar]**
têm um padrão já definido, que pode ser ajustado pelo usuário.

---

## 1. Objetivo

Unir ao Sistema Interno (este repositório) a funcionalidade do
[Projeto-Lead-Manager](https://github.com/brinelso/Projeto-Lead-Manager) — minerador de leads
B2B com auditoria de site, classificação e Lead Score — e transformar o sistema em um **site
acessível apenas com e-mail `@scitecjr.com` (Google Workspace)**, com hierarquia real e
permissões verificadas no servidor.

Usuário de referência para testes/bootstrap: **joao.vaz@scitecjr.com** (entra como Presidente).

---

## 2. Estado atual do sistema (diagnóstico)

- Next.js 14 (App Router) + TypeScript + Tailwind + Prisma (**SQLite**). Tudo `'use client'`,
  dados buscados via `fetch('/api/...')`.
- 4 departamentos: NEGOCIOS, ADMJURFIN, GENTE, MIDIAS. Página por departamento em
  `app/setores/[dept]/page.tsx` com abas KANBAN / LEADS (só Negócios) / TOOLS / REQUESTS.
- Fluxo de leads existente: importação de planilha → `RAW` → Triagem Rápida
  (`/tools/lead-filter`) → `PENDING` → Planilha de Leads (`/tools/lead-sheet`) → conversão em
  card na fase **"Reunião marcada"** do "Funil de Vendas & Negociação"
  (`/api/tools/leads/[id]/convert`).

### Problemas encontrados

| Problema | Onde |
|---|---|
| **Sem autenticação real**: login = escolher perfil; id salvo no `localStorage` | `contexts/ProfileContext.tsx`, `app/login/page.tsx` |
| **Nenhuma API verifica usuário/permissão** (qualquer um lê/edita/apaga tudo) | `app/api/**` (não há `middleware.ts`) |
| Permissões só na interface | `setores/[dept]`, `lead-sheet`, `lead-filter` |
| Código `ADMJUR` em vez de `ADMJURFIN` (atalho cai em Negócios) | `app/page.tsx:350`, `app/tools/page.tsx:56-59` |
| Status `RAW` usado mas ausente do tipo `LeadProspectStatus` | `types/index.ts` |
| Páginas de lead não buscam dados se o perfil carregar depois (F5) | `lead-filter` (`useCallback([])`), `lead-sheet` (deps do effect) |
| `contains` sem `mode: 'insensitive'` (vira case-sensitive no Postgres) | `api/tools/leads/route.ts`, `api/tasks/route.ts` |
| Seeds usam `@scitecjr.com.br`; domínio correto é **`@scitecjr.com`** | `prisma/seed*.ts` |
| `tsconfig` inclui `prisma/seed*.ts` e `tests/*.ts` no type-check do build | `tsconfig.json` |

---

## 3. Decisões técnicas

| Tema | Decisão |
|---|---|
| Minerador | **Reescrever em TypeScript dentro do Next.js** (mesmo banco, mesmo deploy) |
| Banco | **Postgres no Neon** (free: 0,5 GB, scale-to-zero, sem cartão) |
| Login | **Auth.js + Google**, `hd=scitecjr.com` + verificação no servidor de `email_verified` e sufixo do e-mail; sessão JWT |
| Proteção | `middleware.ts` em todas as rotas e APIs + helpers de permissão no servidor em cada rota |
| Hospedagem | **Google Cloud Run** (container Next.js `output: 'standalone'`), mesmo projeto GCP do OAuth, Places e Gemini. Consent screen **Internal** (projeto dentro da organização scitecjr.com). Alertas de orçamento + quotas diárias |
| Dev local | Login de desenvolvimento habilitado **somente** com `NODE_ENV=development` e `DEV_LOGIN=true` |
| Mineração longa | Execução em etapas persistidas no banco (`Mineracao` com status/progresso), retomável se a aba fechar |

Variáveis de ambiente previstas: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, `ALLOWED_EMAIL_DOMAIN=scitecjr.com`,
`ADMIN_EMAILS=joao.vaz@scitecjr.com`, `DEV_LOGIN`, `GOOGLE_PLACES_API_KEY`,
`PLACES_MONTHLY_LIMIT`, `GEMINI_API_KEY`, `PAGESPEED_API_KEY`.

---

## 4. Hierarquia e permissões

### Estrutura

- **Departamentos** (cada pessoa pertence a **exatamente um**): Negócios, AdmJurFin, Gente, Mídias.
- **Setores** (cada pessoa pode participar de **vários**): Tecnologia e Software, Engenharia e
  Inovação, Design e Concepção, Ciência e Consultoria, Dados e Inteligência.
- **5 tipos de pessoa**: Presidente, Vice-presidente, Gerente de Departamento, Gerente de
  Setor, Assessor.
  - Presidente e Vice são cargos globais.
  - "Gerente de Departamento" = gerente do seu único departamento.
  - "Gerente de Setor" = gerente de um ou mais setores dos quais participa.
  - Assessor = demais membros.
  - O "tipo" exibido é o mais alto que a pessoa tem.

Regras confirmadas:

- Uma pessoa **pode acumular** Gerente de Departamento + Gerente de Setor.
- Presidente e Vice **não têm departamento** e acessam **tudo**. Podem entrar em qualquer projeto, funil, setor ou tarefa como participantes, sem restrição.
- **Apenas um gerente por departamento e um por setor.** Nomear um novo gerente rebaixa o anterior a Assessor/Membro, com confirmação e registro em `AuditLog`. Garantir no banco com índice único parcial.
- O Gerente de Setor vê o progresso dos membros **somente nas atividades ligadas ao setor** (cards/tarefas/projetos com `unitId` do setor), mesmo que o membro seja de outro departamento.

### Matriz de permissões

| Ação | Presidente | Vice | Gerente Depto | Gerente Setor | Assessor |
|---|---|---|---|---|---|
| Nomear/remover Vice | ✅ | ❌ | ❌ | ❌ | ❌ |
| Nomear/remover Gerentes (depto e setor) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Aprovar novo usuário e colocá-lo no departamento | ✅ | ✅ | ✅ (o seu) | ❌ | ❌ |
| Adicionar/remover membros de um setor | ✅ | ✅ | ❌ | ✅ (os seus) | ❌ |
| Desativar conta | ✅ | ✅ | ✅ (do seu depto) | ❌ | ❌ |
| Ver painel do departamento | todos | todos | o seu | o seu | o seu |
| Ver painel do setor | todos | todos | ❌* | os seus | os seus |
| Ver progresso individual de membros | todos | todos | do seu depto | dos seus setores (só atividades do setor) | só o próprio |
| Entrar/participar de qualquer projeto, funil ou setor | ✅ | ✅ | ❌ | ❌ | ❌ |
| Minerador de leads | ✅ | ✅ | se Negócios | se Negócios | se Negócios |
| Atribuir leads a outras pessoas | ✅ | ✅ | se Negócios | ❌ | assumir lead sem dono |

\* exceto setores dos quais participa.

A matriz deve viver em **um único arquivo** (`lib/permissions.ts`) usado pelo servidor e pela interface.

### Fluxo de acesso

1. Primeiro login Google com `@scitecjr.com` → usuário criado com status **PENDENTE** (não vê nada além da tela "Aguardando aprovação").
2. E-mails em `ADMIN_EMAILS` entram direto como **Presidente/ATIVO** (bootstrap).
3. Gerente de Departamento (ou Presidência) aprova o pendente colocando-o no seu departamento → **ATIVO**.
4. Gerentes de Setor adicionam membros ativos aos seus setores.
5. Toda mudança de cargo/vínculo gera registro em `AuditLog` (quem, o quê, quando, antes/depois).
6. Contas saem via **desativação** (não exclusão); o gerente redistribui leads/tarefas/cards.

---

## 5. Modelo de dados (Postgres)

```prisma
// Hierarquia
User           { ..., globalRole (PRESIDENTE | VICE_PRESIDENTE | null), status (PENDENTE | ATIVO | INATIVO),
                 departmentId?, departmentRole (GERENTE | ASSESSOR)? }   // remove role/primaryDept
Unit           { id, code, name, type (DEPARTAMENTO | SETOR) }
SectorMember   { userId, unitId(SETOR), role (GERENTE | MEMBRO), @@unique([userId, unitId]) }
AuditLog       { id, actorId, action, targetUserId?, unitId?, before Json?, after Json?, createdAt }

// Funis e tarefas passam a pertencer a uma unidade (departamento OU setor)
Pipe.department -> Pipe.unitId ; Task.department -> Task.unitId

// Minerador (cumulativo)
Company        { id, googlePlaceId? @unique, osmId? @unique, cnpj? @unique, nome, nicho, endereco, bairro,
                 cidade, uf, telefone, website, latitude, longitude, marcaRede, fonte,
                 // snapshot atual desnormalizado para ranking/filtros:
                 categoria, scoreFinal, prioridade, hasSite, isHttps, lastAnalyzedAt }
CompanyAnalysis{ id, companyId, statusCode, isHttps, sslValid, responseTime, categoria, motivos,
                 scoreObjetivo, scoreIa, scoreFinal, prioridade, oportunidadeIa, justificativaIa,
                 pagespeed Json?, tecnologias Json?, createdAt }
MiningRun      { id, bairro, cidade, uf, nichos Json, excluirRedes, iaEnabled, fonte (GOOGLE | OSM | MISTA),
                 status (PENDENTE | EM_ANDAMENTO | CONCLUIDA | ERRO), total, processados, createdById, createdAt }
MiningRunCompany { runId, companyId, isNew }
ApiUsage       { provider, month, count }   // cota Places/Gemini -> fallback automático
ProspectLead   { ..., companyId? }          // liga o fluxo de triagem existente à empresa minerada
```

Regras de dados:

- **Places ToS**: só `place_id` pode ser guardado indefinidamente; latitude/longitude no máximo 30 dias. Para empresas vindas do Google, guardar `place_id` + dados próprios (auditoria, score, CNPJ, anotações) e reatualizar nome/endereço/coordenadas ao abrir a ficha ou remineirar. Dados do OSM podem ser guardados (exigem atribuição ODbL na interface).
- Deduplicação por `googlePlaceId` / `osmId` / `cnpj` e, como fallback, nome normalizado + coordenadas próximas.

---

## 6. Minerador (porte do Lead Manager para TypeScript) — `lib/leads/`

| Módulo Python | Destino TS | Observação |
|---|---|---|
| `config/settings.py` | `lib/leads/config.ts` | nichos (22, em 3 tiers), presets (icp/produto/servico/todos), thresholds (timeout 10s, lento > 2,5s, erro ≥ 400), categorias |
| `overpass_client.py` | `lib/leads/sources/osm.ts` | Nominatim (1 req/s, User-Agent identificável) + Overpass por nicho |
| — | `lib/leads/sources/google-places.ts` | Places API (New) Text/Nearby Search; contador em `ApiUsage`; **esgotou → OSM** |
| `site_analyzer.py` | `lib/leads/site-analyzer.ts` | disponibilidade, status HTTP, HTTPS/SSL, latência |
| `lead_classifier.py` | `lib/leads/classifier.ts` | sem site → "Criar Site do Zero"; erro/sem HTTPS/lento/offline → "Otimização / Segurança"; senão → "Análise de Dados / BI" |
| `lead_scorer.py` | `lib/leads/scorer.ts` | pesos 40 (presença digital) / 25 (ICP) / 35 (IA); prioridade Alta ≥ 70, Média ≥ 40; sem IA → reescala objetivo para 0–100 |
| `ai_analyzer.py` + `prompts.py` | `lib/leads/ai.ts` | Gemini; falha/cota → segue sem IA |
| `pipeline.py` | `lib/leads/pipeline.ts` | processa em lotes persistidos em `MiningRun` |

---

## 7. Telas (estilo visual existente: `bg-slate-950`, roxo/índigo, cards `rounded-2xl`, lucide-react, sonner)

Em Negócios → Ferramentas, o card **"Minerador de Leads"** substitui o placeholder "Enriquecedor B2B".

1. `/tools/lead-miner` — **Minerar**: bairro, cidade, UF, preset/nichos, excluir redes, IA; aviso "bairro já minerado em DD/MM por Fulano (N leads) — ver ou remineirar"; progresso.
2. `/tools/lead-miner/runs` — **Minerações**: histórico pesquisável (bairro, cidade, data, autor, fonte).
3. `/tools/lead-miner/leads` — **Ranking**: base inteira ordenada por score; filtros: cidade, bairro, UF, nicho, categoria, prioridade, faixa de score, tem site/HTTPS, fonte, responsável, status, data da análise; busca; ações em lote (enviar p/ triagem, atribuir, exportar CSV).
4. **Mapa** (Leaflet + tiles OSM) dos leads filtrados, cor por prioridade.
5. **Ficha da empresa**: diagnóstico, detalhamento do score, IA, mensagem de abordagem sugerida, histórico de análises, "assumir lead".
6. Gestão de pessoas (`/team`): pendentes de aprovação, departamento/setores/cargos conforme matriz, auditoria.
7. Painéis: departamento, setor e membro (tarefas abertas/atrasadas/concluídas, cards por fase, solicitações, e em Negócios leads por status/conversão).

---

## 8. Etapas

| Etapa | Conteúdo | Status |
|---|---|---|
| 0 — Fundação | Postgres; Auth.js Google + login dev; middleware; hierarquia (seção 4/5) com permissões no servidor em **todas** as APIs; gestão de pessoas; correção dos problemas da seção 2 | concluída na branch `etapa-0-fundacao` (PR pendente; login Google real depende das credenciais OAuth — ver 8.1) |
| 1 — Minerador | Porte TS, persistência cumulativa, telas Minerar/Minerações/Ranking/Ficha/Mapa, integração com triagem existente | concluída em 2026-09-29 na branch `etapa-1-minerador` (PR pendente; ver 8.2) |
| 2 — Painéis | Departamento, setor e membro | concluída em 2026-10-01 na branch `etapa-2-paineis` (PR pendente; ver 8.3) |
| 3 — Melhorias | Google Places + fallback OSM; PageSpeed Insights; enriquecimento CNPJ (BrasilAPI); detecção Instagram/WhatsApp/tecnologias; mensagem de abordagem por IA | concluída em 2026-10-04 na branch `etapa-3-melhorias` (PR pendente; ver 8.4); ajustes pós-etapa 3 (parar mineração, localização em cascata, abas com/sem contato, resultados progressivos, avaliação dos sem contato) na mesma branch (ver 8.4.1) |
| 4 — Deploy | Dockerfile standalone, Cloud Run, Neon, OAuth Internal, orçamento/quotas, guia passo a passo | a fazer |

Cada etapa: branch própria a partir desta, PR para `main`, `npm run build` passando antes de entregar.

### 8.1 Registro da Etapa 0

Implementado:

- Postgres com migração versionada (`prisma/migrations/20260929000000_init`): enums, `Unit` (4 departamentos + 5 setores inseridos pela migração), `SectorMember`, `AuditLog`, `Pipe.unitId`, `Task.unitId`; índices únicos parciais (um gerente por departamento/setor) e CHECKs (Presidente/Vice sem departamento).
- Auth.js v5: `auth.config.ts` (edge, usado pelo `middleware.ts`) + `auth.ts` (verificação de `email_verified`, claim `hd` e sufixo do e-mail; bootstrap de `ADMIN_EMAILS`; novos usuários PENDENTE). Login dev (provider `dev-login`) só existe com `NODE_ENV=development` e `DEV_LOGIN=true`.
- `lib/permissions.ts` (matriz única, isomórfica), `lib/api.ts` (`withAuth`: sessão + status lido do banco a cada requisição) aplicados em todas as rotas. Autor de atividades/solicitações sempre vem da sessão.
- Novas APIs: `/api/me`, `/api/units`, `/api/units/[code]/members[/userId]`, `/api/units/[code]/manager` (409 + `confirmReplace` para substituir), `/api/users/[id]/hierarchy` (APPROVE, SET_DEPARTMENT, SET_VICE, REMOVE_VICE, DEACTIVATE, REACTIVATE), `/api/audit`.
- Tela `/team` com abas Membros, Pendentes, Inativos, Departamentos e setores, Auditoria; tela "Aguardando aprovação"; login novo.
- Correções da seção 2 aplicadas (ADMJURFIN, `RAW`, recarga das páginas de lead, `mode: 'insensitive'`, seeds `@scitecjr.com`, tsconfig).

Decisões tomadas na implementação (ajustáveis em `lib/permissions.ts`):

- Funis, tarefas e ferramentas de um departamento/setor ficam **visíveis apenas para seus membros e a Presidência** (antes havia modo "somente leitura" para outros departamentos). Para voltar a permitir leitura, altere `canViewUnit`.
- Solicitações intersetoriais: visíveis para quem solicitou, o responsável e os departamentos de origem/destino; o departamento de destino atende.
- Desativar conta libera cargos (gerência vira Assessor/Membro; Vice perde o cargo). A resposta informa quantos cards/tarefas/leads precisam ser redistribuídos.
- Quem troca de departamento entra como Assessor. Excluir leads: só gerência de Negócios e Presidência.
- Não há mais cadastro manual de membros: o usuário nasce no primeiro login Google.

Para testar o login Google real antes da Etapa 4 (sem depender do Presidente): criar um OAuth Client (Aplicativo da Web) em qualquer projeto GCP, consent screen **External** em modo de teste com as contas `@scitecjr.com` como test users, redirect `http://localhost:3000/api/auth/callback/google`, e preencher `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`. A restrição de domínio continua valendo porque é verificada no servidor.


### 8.2 Registro da Etapa 1

Spec completa em `.kiro/specs/lead-miner/` (requisitos, design e tarefas). Pontos operacionais:

- **Limitação conhecida — limitador do Nominatim por processo.** A fila de 1 req/s (`lib/leads/sources/rate-limit.ts`) vive na memória do processo. Com mais de uma instância o limite global da política do Nominatim pode ser excedido. Na Etapa 4: Cloud Run com `max-instances=1` ou mover o limitador para o banco (tabela de lease).
- **IA opcional.** A chave do Gemini é lida de `GEMINI_API_KEY` (`lib/leads/deps.ts`; opcionais `GEMINI_MODEL` e `GEMINI_MONTHLY_LIMIT`). Sem chave, as minerações rodam normalmente sem análise por IA e ficam com `iaDisabledReason = 'SEM_CHAVE'`.
- **Testes.** `npm test` (Vitest) roda offline: o setup bloqueia qualquer acesso à rede. Os testes de integração com Postgres só rodam com `RUN_DB_TESTS=1` (banco em `DATABASE_URL_TEST` ou `DATABASE_URL`).
- **Lint.** O ESLint não está configurado no projeto; `npm run lint` (`next lint`) abre o assistente interativo de configuração. A verificação usada foi `npm run build` + `npm test`.

### 8.3 Registro da Etapa 2

Spec completa em `.kiro/specs/dashboards/` (requisitos, design e tarefas). Decisões confirmadas:

- **Rotas novas, não abas:** `/paineis` (hub), `/paineis/unidades/[code]` e `/paineis/membros/[userId]`. A página do departamento ganha só o link "Ver painel".
- **Atrasada** = aberta (TODO/IN_PROGRESS) com prazo em dia anterior a hoje (fuso de São Paulo). Vencendo hoje não é atrasada; canceladas não contam em nada.
- **`Task.completedAt`:** nova coluna, com backfill a partir de `updatedAt` para as tarefas já concluídas (migração `20261010000000_paineis`). "Concluídas no período" não muda quando alguém edita uma tarefa antiga.
- **Períodos:** 7/30/90 dias ou "todo o período" (padrão 30). Afeta só concluídas, solicitações concluídas e conversão; abertas, atrasadas, cards por fase e leads por status são sempre a foto atual.
- **Taxa de conversão** por coorte de criação: leads criados no período que viraram card ÷ leads criados no período que já saíram de `RAW` (o `ProspectLead` não tem data de conversão).
- **Solicitações só em departamento** (`CrossDeptRequest` não tem setor). No painel de membro: solicitações em que a pessoa é responsável.
- **Resumos por membro** seguem o `progressScope`: só aparecem as linhas que o usuário pode ver naquela unidade (Assessor vê só a própria; Gerente de Setor não vê linhas no painel do departamento).
- **Gerente de Departamento com escopo total** sobre os membros do seu departamento, inclusive cards/tarefas em setores dos quais ele não participa (sem limitar pelo `canViewUnit`).
- **Inativos** não aparecem no hub nem nos resumos, mas o painel da conta desativada continua acessível pela URL para quem tem escopo.
- **Página inicial** (`app/page.tsx`) inalterada; só a navegação ganha "Painéis".
- **Desempenho:** agregação no banco (contagens/agrupamentos), sem carregar registros inteiros.
- **PR** com base `etapa-1-minerador` (as PRs das Etapas 0 e 1 ainda não foram mergeadas); retargetar para `main` depois.

Pontos operacionais:

- **Prazo pela data UTC.** O dia do prazo é a parte de data em UTC de `dueDate` (`dueDayKey`), tratada como data sem horário (a hora gravada não altera o dia). Ler no fuso de São Paulo jogaria prazos gravados à meia-noite UTC para o dia anterior. Já "hoje" e as janelas de período usam o fuso de São Paulo.
- **Horário de verão histórico.** Em dias antigos de início do horário de verão a meia-noite local não existe; `startOfSaoPauloDay` devolve o primeiro instante do dia (01:00 local) em vez de cair no dia anterior.
- **Testes.** `npm test` roda offline. Os testes de integração (`tests/dashboards/integration/`) só rodam com `RUN_DB_TESTS=1`; eles aplicam `prisma migrate deploy` e criam/apagam linhas, então use um banco descartável em `DATABASE_URL_TEST` (sem ela, caem no `DATABASE_URL` do `.env`). Exemplo: `RUN_DB_TESTS=1 DATABASE_URL_TEST=postgres://... npm test`.

### 8.4 Registro da Etapa 3

Spec completa em `.kiro/specs/lead-miner-enrichment/` (requisitos, design e tarefas). Migração `prisma/migrations/20261015000000_lead_miner_enrichment`.

**Decisões confirmadas:**

- **Google Places.** Cache_Google válido por 30 dias; só o Place_ID fica guardado em definitivo. A triagem recebe o Nome_Exibicao e o link do Google Maps, nunca o telefone/site vindos do Google. Rede = o mesmo Nome_Normalizado em 3 ou mais lugares do Google; a poda roda no fim da descoberta. `MISTA` é a fonte padrão; com o Google indisponível, cai para `OSM`.
- **PageSpeed.** Só a nota de desempenho abaixo de 50 (Desempenho_Ruim) afeta o score: +7 pontos na presença digital, com `Versao_Score` 2. Análises `Versao_Score` 1 (Etapa 1) não são recalculadas. O PageSpeed roda em paralelo com a IA.
- **CNPJ.** CNPJ alfanumérico (formato vigente a partir de julho/2026) é validado; a BrasilAPI pode ainda não responder para ele. Um CNPJ de outra UF não é aplicado automaticamente (vira CNPJ_Candidato `UF_DIVERGENTE`). A razão social é guardada mas **nunca** enviada ao Gemini; QSA, e-mail e telefone da Receita não são guardados.
- **Reanálise** por empresa, sob demanda, com lease atômico (barra nova reanálise se a última análise tem menos de 10 minutos ou se outra está em curso).

**Variáveis de ambiente** (documentadas no `.env.example`; chaves só no servidor, enviadas no cabeçalho `x-goog-api-key`, nunca em URL/erro/log):

- `GOOGLE_PLACES_API_KEY` (vazia → Google Places indisponível, cai para OSM).
- `PLACES_MONTHLY_LIMIT` (padrão 1.000) e `PAGESPEED_MONTHLY_LIMIT` (padrão 5.000).
- `PAGESPEED_API_KEY` (vazia → PageSpeed usa a cota reduzida do Google, com aviso na Tela_Minerar).
- Gemini: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_MONTHLY_LIMIT` (já da Etapa 1).

**Cotas** por provedor no `ApiUsage` (`places`, `pagespeed`, `gemini`), reservadas por requisição (inclusive nas retentativas); esgotou → o serviço fica indisponível no mês.

**Termos do Google:** cache de 30 dias, purga oportunista (sem agendador nesta etapa); nenhum Conteudo_Google aparece no Leaflet nem no CSV (só coordenadas/campos próprios + "Link Google Maps"); Conteudo_Google expirado é omitido de toda resposta e tela mesmo antes da purga; a Atribuicao_Google ("Google Maps", `translate="no"`) acompanha o conteúdo exibido.

**Limitações conhecidas:**

- O limitador da BrasilAPI (1 req/s) é por processo; com várias instâncias no Cloud Run a taxa agregada pode passar disso.
- A purga do Cache_Google é oportunista; o agendamento externo (Cloud Scheduler) fica para a Etapa 4.
- A BrasilAPI pode não responder a CNPJ alfanumérico enquanto não suportar o novo formato; o CNPJ é mantido sem Dados_CNPJ.
- Com PageSpeed habilitado, cada empresa reserva ~42 s de margem no Lote, então cabem cerca de 3 empresas por passo de 50 s.

**Pontos operacionais:**

- **Fuso no lease da reanálise.** `CompanyAnalysis.createdAt` e `Company.reanaliseAte` são `timestamp` sem fuso; comparar com `now()` (timestamptz) é sensível ao fuso da sessão do Postgres. O lease usa cortes UTC naïve calculados no processo (`naiveUtc`), não `now()`. Bug pego pelos testes de integração com `RUN_DB_TESTS=1`.
- **PR encadeado** com base `etapa-2-paineis` (as PRs das Etapas 0–2 ainda não foram mergeadas); retargetar para `main` depois.
- **Testes.** `npm test` roda offline (sem rede e sem chaves). Integração: `RUN_DB_TESTS=1 npx vitest run tests/lead-miner/integration tests/lead-miner-enrichment/integration` num banco descartável; cobre a migração, o Portao_Uso de `places`/`pagespeed`, a unicidade de CNPJ e a concorrência da reanálise.

### 8.4.1 Ajustes pós-etapa 3

Cinco ajustes feitos na branch `etapa-3-melhorias` depois da Etapa 3, sem spec própria (um commit `[kiro] T<n>: ...` por ajuste). Migrações novas, todas aditivas: `20261016000000_mining_run_cancelada`, `20261017000000_company_tem_contato`, `20261018000000_company_avaliacao`. Ordem em que foram feitos: T1, T2, T4, T3, T5.

**T1 — Parar mineração**

- Status novo `CANCELADA` e rota `POST /api/tools/lead-miner/runs/[id]/cancel`. Idempotente (repetir devolve 200), 404 se não existe, 409 se a mineração já terminou (`CONCLUIDA`/`ERRO`).
- Permissão no servidor, compondo helpers que já existem em `lib/permissions.ts` (`canUseNegociosTools` + `canAssignLeads`): quem iniciou, gerência de Negócios e Presidência/Vice. A matriz em `lib/permissions.ts` não foi alterada.
- Botão "Parar" com confirmação nas telas Minerar e Minerações, visível em `PENDENTE` (descoberta) e `EM_ANDAMENTO`. O card mostra "Cancelada (N de M processados)".
- O cancelamento vale no banco (fonte da verdade) e aborta as requisições da análise em curso (`AbortSignal` em site, PageSpeed, BrasilAPI e Gemini) na instância que recebeu o pedido; outras instâncias percebem por um vigia de 1,5 s. Análise abortada **não** é gravada (nem como falha). Empresas e análises já salvas ficam.
- Limitação: a **descoberta** confere o cancelamento entre nichos e páginas, mas não interrompe uma requisição ao Nominatim/Overpass/Places que já esteja em voo (termina e o resultado é descartado).

**T2 — Localização em cascata UF → Cidade → Bairro**

- Campos na ordem UF, Cidade, Bairro; cada um só habilita depois do anterior; trocar a UF limpa cidade e bairro, trocar a cidade limpa o bairro. UF continua sendo o `<select>` com as 27 UFs (estática). Cidade e Bairro são comboboxes acessíveis (teclado, `aria-*`), com busca sem acento e sem diferenciar maiúsculas.
- Cidades: `GET /api/tools/lead-miner/localidades/cidades?uf=` consulta o servidor do IBGE (`https://servicodados.ibge.gov.br/api/v1/localidades/estados/{UF}/municipios?orderBy=nome`). Bairros: `GET .../localidades/bairros?uf=&cidade=` geocodifica a cidade no Nominatim (mesmo limitador de 1 req/s) e lista `place=suburb|neighbourhood|quarter` no Overpass.
- Cache **em memória do processo**: cidades 24 h (falha 60 s), bairros 7 dias (falha 2 min). Não há tabela nova. Bairros só são buscados depois que a cidade é confirmada (escolha, Enter ou sair do campo) e não são buscados para cidade que o IBGE não lista.
- Lista vazia ou falha (IBGE/OSM fora do ar, timeout) nunca bloqueia: as rotas respondem 200 com `indisponivel` e o campo vira digitação livre. UF inválida é rejeitada no servidor. Mensagens de validação e o aviso "bairro já minerado em DD/MM" foram mantidos.
- Limitação: a cobertura de bairros no OpenStreetMap varia muito (cidades pequenas costumam voltar vazias); o cache é por instância.

**T4 — Abas "Com contato" / "Sem contato"**

- `temContato` = telefone **ou** WhatsApp **ou** e-mail **ou** Instagram. Coluna persistida `Company.temContato`, mantida por um **trigger do Postgres** (`BEFORE INSERT OR UPDATE`) que espelha `computeTemContato` (`lib/leads/contact.ts`); assim nenhum ponto de escrita precisa lembrar de recalcular. A migração faz o backfill e cria o índice `(temContato, scoreFinal DESC)`.
- Fontes de contato: `telefone` e tags OSM (`whatsappOsm`, `instagramOsm`, novo `emailOsm`), mais os snapshots `temWhatsapp`/`temInstagram` da análise. **E-mail só vem da tag OSM** `contact:email`/`email`; não há extração de e-mail do site nesta entrega. Empresas já gravadas só ganham `emailOsm` quando forem reencontradas.
- O telefone do Cache_Google não é guardado na empresa (vale 30 dias); por isso a consulta (`contatoWhere`) também conta o telefone do Cache_Google **ainda válido**, e "Sem contato" é o complemento exato. Todo lead cai em exatamente uma aba.
- Filtro `contato=com|sem` em `GET /companies`, `/companies/map` e `/companies/export` (sem o parâmetro, a API não restringe). A Tela_Ranking sempre o envia, com "Com contato" como padrão; CSV e mapa seguem a aba. `GET /companies` devolve `contatoCounts {com, sem}` calculados com os demais filtros ativos (a aba em si não entra na contagem).

**T3 — Resultados progressivos**

- As duas fases já existiam na pipeline: a descoberta grava cada empresa (com telefone e tags de contato) assim que a encontra, e a análise grava cada empresa ao terminar. O que mudou foi a tela.
- Com `?runId=` de uma mineração `PENDENTE`/`EM_ANDAMENTO`, a Tela_Ranking consulta `GET /runs/[id]` a cada 3 s (pausa com a aba oculta), recarrega a lista sem piscar, ordena por **mais recentes** (`ordem=recentes`, por `updatedAt`) e mostra o selo "analisando…" no lugar do score. Ao terminar, volta à ordem por score. Painel com contadores ao vivo: encontradas, com contato, analisadas (`comContato` novo em `GET /runs/[id]`).
- Nova coluna "Contato" na lista (telefone + WhatsApp/Instagram/E-mail conhecidos desde a descoberta). O card de progresso ganha o link "Ver resultados ao vivo".
- Limitações: "mais recentes" é por atividade (`updatedAt`), não por data de descoberta; empresa que já tinha análise antiga mantém o score anterior até a nova ser gravada; cada aba aberta faz 2 consultas a cada 3 s.

**T5 — Avaliação básica dos "Sem contato"**

- Campos novos em `Company`: `avaliacaoResumo`, `sugestaoAcao`, `avaliadoEm`, `fonteAvaliacao` (`IA` | `REGRA`). Aparecem na aba "Sem contato" (coluna "Avaliação") e na Ficha ("Avaliação básica").
- Gemini em **lote** (até 10 leads por chamada), uma reserva no `ApiUsage` (`gemini`) por chamada, respeitando `GEMINI_MONTHLY_LIMIT`; timeout de 25 s; prompt em português; resposta validada com zod (item inválido cai em regras só para ele). Ao Gemini vão apenas nome próprio, nicho, bairro/cidade, site, HTTPS e nota de desempenho; nenhum conteúdo do Google Places entra no prompt nem no texto guardado.
- Sem chave, sem cota, timeout ou resposta inválida: texto de reserva por regras determinísticas, rotulado "Avaliação por regras (sem IA)". Nunca quebra a mineração.
- Automático ao fim da mineração (`POST /runs/[id]/evaluate`, até 30 leads por mineração, idempotente), disparado pelo navegador que acompanha a mineração; o restante, e qualquer lead avaliado só por regras, pode ser avaliado pelo botão "Avaliar" (`POST /companies/evaluate`, até 30 por clique; o servidor só avalia quem está mesmo em "Sem contato").
- Limitações: se ninguém estiver com a tela aberta quando a mineração concluir, a avaliação automática não roda (use o botão); o teto de 30 conta leads avaliados desde o início da mineração (`avaliadoEm >= createdAt`), inclusive os avaliados pelo botão.

---

## 9. Pendências com o usuário

- O **Presidente** administra o Google Workspace. Na Etapa 4 ele precisa:
  - criar o projeto GCP dentro da organização `scitecjr.com`;
  - configurar o OAuth consent screen como **Internal**;
  - vincular a conta de faturamento com alerta de orçamento.

  Entregar a ele um guia passo a passo.
- O app de integração GitHub do Kiro precisa ter acesso a `Lauand49/Sistema-de-controle-interno` para permitir push/PR.
