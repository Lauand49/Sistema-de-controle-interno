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
| 2 — Painéis | Departamento, setor e membro | a fazer |
| 3 — Melhorias | Google Places + fallback OSM; PageSpeed Insights; enriquecimento CNPJ (BrasilAPI); detecção Instagram/WhatsApp/tecnologias; mensagem de abordagem por IA | a fazer |
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

---

## 9. Pendências com o usuário

- O **Presidente** administra o Google Workspace. Na Etapa 4 ele precisa:
  - criar o projeto GCP dentro da organização `scitecjr.com`;
  - configurar o OAuth consent screen como **Internal**;
  - vincular a conta de faturamento com alerta de orçamento.

  Entregar a ele um guia passo a passo.
- O app de integração GitHub do Kiro precisa ter acesso a `Lauand49/Sistema-de-controle-interno` para permitir push/PR.
