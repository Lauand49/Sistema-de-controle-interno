# Texto do PR — Etapa 5 (Revisão de acesso, dados e painéis + laço ao deslogar)

> Rascunho pronto para colar. O PR **não foi aberto** e nada foi enviado ao remoto.
> Branch: `etapa-5-revisao-acesso`, criada a partir de `etapa-4-deploy`. **Base sugerida: `etapa-4-deploy`** (as PRs das Etapas 0–4 ainda não foram mergeadas; retargetar para `main` depois, na ordem).

## Título
```
Etapa 5: revisão de acesso e painéis; corrige laço de recarga ao deslogar
```

## Resumo
Revisão de todas as páginas e rotas de API contra o plano (seções 4, 7, 8.1 e 8.3), mais a correção do laço de recarga infinita ao deslogar. Nada foi aberto: cada correção só **fecha** acesso ou corrige exibição. Relatório completo em `docs/AUDITORIA-ACESSO.md`.

**Causa do laço (L-01, alta).** O cliente decide "estou logado" pelo `/api/me` (banco); o servidor decide pelo cookie (middleware e `/login`, que redireciona quem tem cookie). Quando o cliente achava que não havia sessão e mandava para `/login` com o cookie ainda válido, o servidor devolvia para `/` e o ciclo recomeçava. Gatilhos: `logout()` limpava o perfil antes do cookie sumir; `/api/me` com 500 (banco fora); usuário sem registro.

**Correções**
- `contexts/ProfileContext.tsx`: `endSession()` único (marca `signingOut` antes do `signOut`, não limpa o perfil, libera nova tentativa se falhar), usado pelo botão Sair e pelo 401 do `/api/me`.
- `app/login/page.tsx`: só redireciona se o usuário da sessão existe no banco (erro de banco mostra o formulário).
- A-01 (média): `GET /api/tools/pricing` passa a exigir Negócios/Presidência, como o `POST`.
- A-04 (baixa): `POST /api/requests` só aceita `linkedCardId` de unidade que o solicitante enxerga.
- A-05 (baixa): `lastLoginAt` só vai para o próprio, a Presidência e o Gerente do departamento (`canSeeLastLogin`). Nenhuma tela usava o campo.
- A-06 (baixa): prazos de tarefas e solicitações apareciam com um dia a menos em São Paulo (`formatDueDate`).

**Decisões pendentes do dono** (D-01 a D-08 no relatório): 403 × 404 por id; diretório de pessoas (e-mail, cargo e contagens para qualquer ativo); vínculos `cardId`/`leadId` em tarefas; ordem das validações em `hierarchy`; página `/tools/pricing` aberta (servidor nega); dados individuais no painel de unidade; prazo com hora enviado por API externa; `/api/health` pública (exige mudança no `middleware.ts`, não feita).

## Arquivos sensíveis tocados (revisão de CODEOWNERS)
- `lib/permissions.ts`: **+8 linhas**, uma função nova `canSeeLastLogin(actor, target)` = `progressScope(actor, target) === 'ALL'`. Nenhuma regra existente mudou.
- `middleware.ts`, `auth.ts`, `auth.config.ts`: **não foram tocados**.
- `prisma/`: **não foi tocado** (nenhuma migração).
- Também relevantes para acesso: `app/login/page.tsx` (+ validação do usuário no banco), `contexts/ProfileContext.tsx`, `lib/users.ts` (`forViewer`), rotas `app/api/users`, `app/api/users/[id]`, `app/api/units/[code]/members`, `app/api/tools/pricing`, `app/api/requests`.
- `vitest.config.ts`: `server.deps.inline: ['next-auth']` (para rodar o middleware real nos testes).

## Testes novos (offline)
- `tests/auth/middleware.test.ts`: middleware real com JWT assinado (anônimo, lixo, expirado, válido, rotas públicas).
- `tests/auth/logout-loop.test.tsx`: harness de ponta a ponta (middleware, página `/login`, `/api/me`, `ProfileProvider` e `AccountStatusScreen` reais; banco, cookie, roteador e `signOut` simulados). Falhava antes da correção.
- `tests/access/matrix.test.ts`: 12 personas × 43 rotas/métodos, acesso por objeto, listas filtradas; "permitidos" escritos à mão a partir do plano.
- `tests/access/person-data.test.ts`: campos por papel, mudanças de hierarquia valendo na requisição seguinte, identidade sempre da sessão.
- `tests/dashboards/f5-numeros-e-acesso.test.ts`: repositório Prisma real + duplo em memória: números, fuso, escopo por papel, vazios, sem N+1.

## Como testar
```bash
export PATH=$HOME/.local/bin:$PATH
npx tsc --noEmit
npm run typecheck:tests
npm test
npm run build
```

## Não verificado
- O roteador do Next no navegador: o harness simula `router.replace` e o `signOut` do next-auth; teste manual: entrar, clicar em Sair (conta ativa e conta pendente/desativada) e confirmar que não há recarga em laço.
- Contagens dos painéis em Postgres real (`npm run test:int` com `TEST_DATABASE_URL` de um banco `*_test`); nenhum teste de integração foi executado.
- Nenhum `git push` foi feito.
