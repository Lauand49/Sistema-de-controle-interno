# Auditoria de acesso, dados e painéis

Revisão da Etapa 5 (branch `etapa-5-revisao-acesso`). Fonte das regras: `docs/PLANO-INTEGRACAO.md` seções 4, 7, 8.1 e 8.3. Fonte única das permissões: `lib/permissions.ts`.

Este arquivo é atualizado a cada fase. **Fase 1 (inventário)**: lista de tudo que existe e como cada item é protegido hoje. Achados, correções e decisões pendentes entram nas seções finais, conforme as fases 2 a 6 avançam.

## Como ler

**Camadas de proteção**

1. `middleware.ts` (Edge): exige sessão (JWT) em tudo, exceto `/login`, `/api/auth/*` e `/api/dev/users` (este responde 404 fora do desenvolvimento). Sem sessão: `401 JSON` nas APIs, redirecionamento para `/login` nas páginas. **Não consulta o banco**, só o cookie.
2. `withAuth` (`lib/api.ts`), em toda rota de API: lê a sessão, **recarrega o usuário do banco a cada requisição** (`findUserDTO`), e devolve `401` sem usuário, `403` se `PENDENTE`/`INATIVO` (salvo `allowInactive`, usado só por `/api/me`).
3. Regra da rota: helpers de `lib/permissions.ts` (`canViewUnit`, `canEditUnit`, `canUseNegociosTools`, `progressScope`, ...), em geral após carregar o **objeto** (card, tarefa, funil, solicitação, lead) para checar a unidade a que ele pertence.
4. Páginas são componentes de cliente; a interface só **esconde** ações. O servidor é quem nega.

**Colunas da tabela**

- **Escopo:** Pública · Sessão (qualquer autenticado ativo) · Unidade · Papel · Objeto (checa a unidade/dono do objeto carregado por id).
- **Verificação:** o helper ou a lógica aplicada.

## Páginas (`app/**/page.tsx`)

| Página | Escopo | Verificação na página | Observação |
|---|---|---|---|
| `/login` | Pública | servidor: se já há sessão (`auth()`), `redirect(callbackUrl)` | Não chama APIs protegidas. Ver Fase 2 (laço). |
| `/` | Sessão | `useProfile`; o middleware barra anônimos | Início. |
| `/pipe` | Unidade | `canEditUnit` esconde botões; dados vêm de `/api/pipes` (servidor filtra) | Modo leitura quando não participa. |
| `/setores/[dept]` | Unidade | `canEditUnit`, `canViewUnitDashboard`, `canUseNegociosTools` (UI); dados por API | Parâmetro de URL `dept`: quem não participa recebe 403 nas APIs. |
| `/tasks` | Sessão | UI mostra filtros por papel; API filtra por visibilidade | |
| `/requests` | Sessão | API filtra por solicitante/responsável/departamentos | |
| `/team` | Papel | `canViewPendingUsers`, `canViewAudit`, `canManage*` (UI) | Ações no servidor em `/api/users/*`, `/api/units/*`. |
| `/paineis` | Sessão | `/api/dashboards` lista só o que o ator pode abrir | |
| `/paineis/unidades/[code]` | Unidade | `canViewUnitDashboard` (UI) + `getUnitDashboard` (servidor) | |
| `/paineis/membros/[userId]` | Objeto (pessoa) | `getMemberDashboard` (servidor) | |
| `/tools` | Sessão | `canUseNegociosTools`, `canViewUnit` (UI) | Catálogo de ferramentas. |
| `/tools/pricing` | Papel (Negócios) | **página sem checagem de perfil** | `POST` exige Negócios; `GET` (tabelas de taxas) está aberto a qualquer ativo. Ver achado A-01. |
| `/tools/lead-sheet` | Papel (Negócios) | `canUseNegociosTools`, `canAssignLeads` (UI) | API exige Negócios. |
| `/tools/lead-filter` | Papel (Negócios) | `canUseNegociosTools` (UI) | API exige Negócios. |
| `/tools/lead-miner` | Papel (Negócios) | `LeadMinerGate` (UI) | Todas as APIs `requireNegocios`. |
| `/tools/lead-miner/runs` | Papel (Negócios) | `LeadMinerGate` | |
| `/tools/lead-miner/leads` | Papel (Negócios) | `LeadMinerGate` | |
| `/tools/lead-miner/leads/[id]` | Papel (Negócios) + Objeto | `LeadMinerGate` + API | Base de empresas é compartilhada em Negócios (sem dono por unidade). |

## Rotas de API (`app/api/**/route.ts`)

### Autenticação e saúde

| Rota | Método | Escopo | Verificação | Observação |
|---|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | Pública | Auth.js | Login Google; provedor `dev-login` só com `NODE_ENV=development` e `DEV_LOGIN=true`. |
| `/api/dev/users` | GET | Pública | `DEV_LOGIN_ENABLED` | 404 fora do desenvolvimento. |
| `/api/health` | GET | Sessão (pelo middleware) | simples: nenhuma; `?deep=1`: `isGlobal` | Decisão pendente do dono: tornar pública. **Não alterar nesta etapa.** |
| `/api/me` | GET | Sessão (`allowInactive`) | devolve o próprio usuário | Único que aceita `PENDENTE`/`INATIVO`. |

### Pessoas, unidades e auditoria

| Rota | Método | Escopo | Verificação | Observação |
|---|---|---|---|---|
| `/api/users` | GET | Papel | `ATIVO`: qualquer ativo; `PENDENTE`: `canViewPendingUsers`; `INATIVO`: Presidência ou Gerente do depto | Devolve e-mail, cargo, último login e contagens a qualquer ativo. Ver Fase 4. |
| `/api/users/[id]` | GET | Objeto (pessoa) | `PENDENTE`: `canViewPendingUsers` ou o próprio; `progressScope` decide o progresso | Perfil básico de qualquer pessoa (inclusive `INATIVO`) é devolvido a qualquer ativo. Ver Fase 4. |
| `/api/users/[id]` | PATCH | Objeto (pessoa) | `canEditProfile`; `cargo` só `isGlobal` | |
| `/api/users/[id]/hierarchy` | POST | Papel + Objeto | `canApproveUserInto`, `canChangeDepartment`, `canManageVice`, `canDeactivate` | Ações: aprovar, trocar depto, nomear/remover Vice, desativar, reativar. Auditado. |
| `/api/units` | GET | Sessão | nenhuma além de ativo | Lista unidades, gerente e nº de membros. |
| `/api/units/[code]/members` | GET | Unidade | `canViewUnit` | Membros ativos da unidade (DTO completo). |
| `/api/units/[code]/members` | POST | Unidade | `canManageSectorMembers` | |
| `/api/units/[code]/members/[userId]` | DELETE | Unidade | `canManageSectorMembers`; remover Gerente: `canManageManagers` | |
| `/api/units/[code]/manager` | PUT/DELETE | Papel | `canManageManagers` (Presidente e Vice) | Substituição com confirmação; auditado. |
| `/api/audit` | GET | Papel | `canViewAudit`; escopo: Presidência tudo; Gerente de depto, seu depto; Gerente de setor, seus setores | |

### Funis, cards, campos, tarefas, solicitações, financeiro

| Rota | Método | Escopo | Verificação | Observação |
|---|---|---|---|---|
| `/api/pipes` | GET | Unidade | sem filtro: `visibleUnitCodes`; com `department`: `canViewUnit` | |
| `/api/pipes` | POST | Unidade | `canEditUnit` | |
| `/api/pipes/[id]` | GET | Objeto | `canViewUnit(unit do funil)` | |
| `/api/cards` | POST | Unidade | `canEditUnit(unit do funil)` | |
| `/api/cards/[id]` | GET | Objeto | `canViewUnit(unit do card)` | |
| `/api/cards/[id]` | PATCH/DELETE | Objeto | `canEditUnit(unit do card)` | |
| `/api/cards/[id]/move` | PATCH | Objeto | `canEditUnit(unit do card)` | Fase destino é buscada pelo id. |
| `/api/fields` | POST | Unidade | `canEditUnit` | |
| `/api/fields/[id]` | DELETE | Objeto | `canEditUnit(unit do funil do campo)` | |
| `/api/tasks` | GET | Papel/Unidade | filtro de visibilidade (responsável, unidades visíveis, dept do Gerente) + `canViewUnit` em `department=` | |
| `/api/tasks` | POST | Unidade | `canEditUnit`; tarefa geral vai ao autor | |
| `/api/tasks/[id]` | PATCH/DELETE | Objeto | `canEditTask` (responsável ou membro da unidade; Presidência) | Não há GET por id. |
| `/api/requests` | GET | Papel | filtro: próprio solicitante/responsável, ou depto de origem/destino; Presidência tudo | |
| `/api/requests` | POST | Papel | precisa de departamento (ou Presidência) | |
| `/api/requests/[id]` | PATCH | Objeto | `canViewRequest` + `canHandleRequest`/`canEditRequestContent` | |
| `/api/requests/[id]` | DELETE | Objeto | `canDeleteRequest` | |
| `/api/finance` | GET/POST | Unidade | `canAccessFinance` (= `canViewUnit('ADMJURFIN')`) | |

### Negócios: leads e precificação

| Rota | Método | Escopo | Verificação | Observação |
|---|---|---|---|---|
| `/api/tools/leads` | GET/POST | Papel | `canUseNegociosTools` | |
| `/api/tools/leads/[id]` | PATCH | Objeto | `canEditLead` (dono ou gerência) | |
| `/api/tools/leads/[id]` | DELETE | Papel | `canDeleteLead` (= `canAssignLeads`) | |
| `/api/tools/leads/[id]/convert` | POST | Objeto | `canEditLead` + `canEditUnit('NEGOCIOS')` | |
| `/api/tools/pricing` | GET | **Sessão** | **nenhuma checagem de departamento** | Expõe tabelas de taxas. Achado A-01. |
| `/api/tools/pricing` | POST | Papel | `canUseNegociosTools` | |

### Minerador de leads (`/api/tools/lead-miner/**`)

Todas chamam `requireNegocios(actor)` (= `canUseNegociosTools`) **antes** de qualquer leitura. Regras adicionais:

| Rota | Método | Regra adicional |
|---|---|---|
| `assignees` | GET | `canAssignLeads` |
| `companies` (lista), `companies/map`, `companies/export` | GET/POST | só Negócios/Presidência; base compartilhada |
| `companies/[id]` | GET | Negócios |
| `companies/[id]/claim` | POST | `canChangeLeadAssignee(actor, null, actor.id)` |
| `companies/assign` | POST | `canAssignLeads`, `canBeLeadAssignee(destino)`, `canChangeLeadAssignee` por empresa |
| `companies/[id]/approach`, `cnpj`, `reanalyze`, `companies/evaluate`, `companies/triage` | POST/PUT/DELETE | Negócios |
| `runs` (GET/POST), `runs/active`, `runs/lookup`, `runs/[id]` | GET/POST | Negócios (qualquer autor pode ver o andamento) |
| `runs/[id]/discover`, `runs/[id]/batch` | POST | Negócios **e** ser o autor da mineração (`403` se não for) |
| `runs/[id]/cancel` | POST | autor, gerência de Negócios ou Presidência/Vice (`canCancelRun`) |
| `runs/[id]/evaluate` | POST | Negócios |
| `config`, `localidades/cidades`, `localidades/bairros` | GET | Negócios |

### Painéis

| Rota | Método | Escopo | Verificação | Observação |
|---|---|---|---|---|
| `/api/dashboards` | GET | Papel | `getHub` lista só o que o ator abre | |
| `/api/dashboards/units/[code]` | GET | Unidade | `getUnitDashboard` (serviço) | A revisar na Fase 5. |
| `/api/dashboards/members/[userId]` | GET | Objeto (pessoa) | `getMemberDashboard` (serviço) | A revisar na Fase 5. |

## Achados preliminares da Fase 1 (a confirmar com testes nas fases seguintes)

| Id | Severidade prévia | Onde | Resumo |
|---|---|---|---|
| A-01 | média | `GET /api/tools/pricing` | A rota de leitura das tabelas de precificação não exige `canUseNegociosTools`, embora o plano trate a precificação como ferramenta exclusiva de Negócios/Presidência. |
| A-02 | baixa | rotas por id (`cards`, `pipes`, `requests`, `tasks`) | Objeto inexistente responde `404`; objeto existente de outra unidade responde `403`. Permite distinguir "existe" de "não existe" a quem souber o id (ids são UUID). Política de resposta não definida no plano. |
| A-03 | a definir | `GET /api/users`, `GET /api/users/[id]` | Qualquer ativo recebe e-mail, cargo, último login e contagens de outras pessoas. O plano não define o que o diretório expõe. |

As demais rotas seguem o padrão "carrega o objeto, checa a unidade dele, nega com 403". Os testes das Fases 2 a 5 confirmam ou refutam cada linha acima.
