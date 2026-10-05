# Variáveis de ambiente — produção (Etapa 4)

Este guia lista todas as variáveis do app, onde guardá-las e o que acontece se vazarem. Nenhum valor real aparece aqui.

## Regras gerais

1. **Segredos ficam no Secret Manager** do Google Cloud e entram no Cloud Run como variável de ambiente ligada ao segredo (ver `docs/DEPLOY-CLOUD-RUN.md`). Nunca em arquivo `.env` dentro da imagem (o `.dockerignore` barra `.env*`), nunca no Git, nunca em chat ou e-mail.
2. **Nenhuma chave vai ao navegador.** O código não usa nenhuma variável `NEXT_PUBLIC_*`. As chaves do Gemini, Places e PageSpeed são lidas só em `lib/leads/deps.ts` (que importa `server-only`) e enviadas no cabeçalho `x-goog-api-key`, nunca na URL. `GET /api/tools/lead-miner/config` devolve só "tem chave / não tem" (booleanos). Conferido no build: o bundle do cliente (`.next/static`) não contém os nomes `GEMINI_API_KEY`, `GOOGLE_PLACES_API_KEY`, `PAGESPEED_API_KEY`, `AUTH_SECRET`, `DATABASE_URL`; a tela de login cita apenas os *nomes* `AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET` numa mensagem de ajuda (sem valores).
3. **O servidor valida o ambiente ao subir** (`lib/env.ts`, chamado por `instrumentation.ts`). Se faltar algo obrigatório ou houver algo perigoso, o processo imprime a lista (só nomes, nunca valores) e encerra com código 1; o Cloud Run então mantém a revisão anterior no ar. A validação só roda com `NODE_ENV=production` ou dentro do Cloud Run (`K_SERVICE` definida); não roda no `next build` nem em desenvolvimento.
4. O **job de migração** (`prisma migrate deploy`) precisa só de `DATABASE_URL` (conexão direta). Ver `docs/DEPLOY-BANCO.md`.

## Variáveis do app

Legenda de **Onde**: **SM** = Secret Manager (segredo); **VC** = variável comum (não secreta).

| Variável | Obrigatória? | Onde | Como gerar / obter | Risco se vazar |
|---|---|---|---|---|
| `DATABASE_URL` | **Sim** (o app não sobe sem ela) | SM | Painel do Neon → *Connection string* **com pooler** (host com `-pooler`) e `?sslmode=require`. Ver `DEPLOY-BANCO.md`. | **Crítico**: leitura e escrita de todos os dados (pessoas, leads, auditoria). Rotacionar a senha no Neon e publicar nova versão do segredo. |
| `AUTH_SECRET` | **Sim**, mínimo 32 caracteres | SM | `openssl rand -base64 33` (ou `npx auth secret`). Um valor novo por ambiente. | **Crítico**: permite forjar sessões (JWT) e entrar como qualquer pessoa, inclusive Presidente. Rotacionar derruba todas as sessões (todos precisam entrar de novo). |
| `AUTH_GOOGLE_ID` | **Sim** | VC (não é segredo por si só) ou SM por conveniência | Console do Google Cloud → APIs e serviços → Credenciais → Cliente OAuth. Termina em `.apps.googleusercontent.com`. | Baixo sozinho (é público no fluxo de login), mas junto com o segredo permite se passar pelo app. |
| `AUTH_GOOGLE_SECRET` | **Sim** | SM | Mesmo cliente OAuth. | **Alto**: alguém pode se passar pelo app no Google. Girar o segredo no console e atualizar o SM. |
| `ALLOWED_EMAIL_DOMAIN` | Não (padrão `scitecjr.com`) | VC | Domínio do Google Workspace, sem `@`. | Nenhum (não é segredo). Valor errado = ninguém entra ou domínio indevido entra; o servidor também confere o `hd` do Google. |
| `ADMIN_EMAILS` | Recomendada no primeiro acesso (aviso se vazia) | VC | E-mails, separados por vírgula, que entram direto como Presidente/ATIVO (ex.: `joao.vaz@scitecjr.com`). | Médio: quem estiver na lista vira Presidente. Mantenha só o necessário; depois do primeiro acesso dá para esvaziar e gerir pela tela de equipe. |
| `GOOGLE_PLACES_API_KEY` | Não (vazia = Google Places desligado, cai para OpenStreetMap) | SM | Console do Google Cloud → Credenciais → Chave de API, **restrita à Places API (New)** e com cota diária. Guia: `DEPLOY-GUIA-PRESIDENTE.md`. | **Custo**: uso indevido gera cobrança. A restrição por API e a cota diária limitam o estrago. |
| `PLACES_MONTHLY_LIMIT` | Não (padrão 1000) | VC | Inteiro positivo. Teto mensal do próprio app (tabela `ApiUsage`). | Nenhum. Valor inválido impede a subida (não cai em silêncio no padrão). |
| `GEMINI_API_KEY` | Não (vazia = sem IA: análise por regras e "sem IA") | SM | Google AI Studio / Console, **restrita à API Generative Language** e com cota. | **Custo**: idem Places. Também expõe o conteúdo dos prompts se houver log do provedor. |
| `GEMINI_MONTHLY_LIMIT` | Não (padrão 1000) | VC | Inteiro positivo. Cada lote de avaliação e cada mensagem de abordagem conta 1. | Nenhum. |
| `GEMINI_MODEL` | Não (padrão `gemini-2.0-flash`) | VC | Nome do modelo. **Confira na documentação do Gemini se o padrão ainda está disponível** antes do deploy. | Nenhum. |
| `PAGESPEED_API_KEY` | Não (vazia = cota reduzida do Google, com aviso na tela) | SM | Console do Google Cloud → Chave de API restrita à PageSpeed Insights API. | **Custo/cota**: baixo. |
| `PAGESPEED_MONTHLY_LIMIT` | Não (padrão 5000) | VC | Inteiro positivo. | Nenhum. |
| `AUTH_URL` | Não (o Auth.js v5 infere o host dos cabeçalhos da requisição) | VC | URL pública completa, `https://…`, se quiser fixá-la (ex.: `https://sistema.scitecjr.com`). Se definida e não for `https://`, o servidor não sobe. | Nenhum (não é segredo). Valor errado quebra o retorno do login. |
| `AUTH_TRUST_HOST` | **Não é necessária**: `auth.config.ts` já define `trustHost: true`, que o Auth.js documenta como equivalente para rodar atrás de proxy/Docker. | — | Só adicione `AUTH_TRUST_HOST=true` se um dia remover `trustHost` do código. | — |

### Definidas pela plataforma ou pela imagem (não configure)

| Variável | Quem define | Observação |
|---|---|---|
| `NODE_ENV=production` | Dockerfile | **Não sobrescreva.** Fora de `production`, o login de desenvolvimento poderia ser ativado (ver abaixo). Com `K_SERVICE` presente e `NODE_ENV` diferente, o servidor não sobe. |
| `PORT` | Cloud Run (a imagem usa 8080 por padrão) | O servidor lê `PORT`. |
| `HOSTNAME=0.0.0.0` | Dockerfile | Necessário para o servidor standalone aceitar conexões externas. |
| `K_SERVICE`, `K_REVISION`, `K_CONFIGURATION` | Cloud Run (serviços) | Documentado no contrato de contêiner do Cloud Run. Usamos `K_SERVICE` só para saber que estamos lá. |
| `NEXT_TELEMETRY_DISABLED=1` | Dockerfile | Desliga a telemetria do Next.js. |

### Nunca em produção

| Variável | Para que serve | Por quê |
|---|---|---|
| `DEV_LOGIN` | Login sem Google, só desenvolvimento | Ver "DEV_LOGIN" abaixo. Se estiver `true`, o servidor não sobe. |
| `TEST_DATABASE_URL`, `RUN_DB_TESTS`, `SEED_CONFIRM_DB` | Testes de integração e seed | Pertencem a máquinas de desenvolvimento/CI; o seed apaga dados. |

## DEV_LOGIN não funciona em produção (verificado no código)

- `auth.config.ts`: `DEV_LOGIN_ENABLED = NODE_ENV === 'development' && DEV_LOGIN === 'true'`. O provedor `dev-login` só é adicionado à lista quando isso é verdadeiro.
- `auth.ts` (callback `signIn`): se `account.provider === 'dev-login'` e `DEV_LOGIN_ENABLED` for falso, retorna `false` (login negado). Qualquer provedor que não seja Google nem `dev-login` também é negado.
- `app/api/dev/users/route.ts`: responde 404 quando `DEV_LOGIN_ENABLED` é falso.
- `middleware.ts` só libera `/login`, `/api/auth/*` e `/api/dev/users` (que devolve 404 fora do desenvolvimento).
- A imagem define `NODE_ENV=production`. Camada extra desta etapa: `lib/env.ts` recusa subir com `DEV_LOGIN=true` e recusa `NODE_ENV` diferente de `production` quando o Cloud Run está presente.

Não encontrei brecha. Único ponto de atenção: alguém rodar o contêiner com `NODE_ENV=development` e `DEV_LOGIN=true` **fora do Cloud Run** (ex.: na própria máquina apontando para o banco de produção). Isso é prevenido por processo (nunca usar a URL de produção em desenvolvimento), não por código.

## Checklist antes do primeiro deploy

- [ ] `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_SECRET` (e as chaves de API que forem usadas) criados no Secret Manager, sem passar por chat ou e-mail.
- [ ] `AUTH_GOOGLE_ID`, `ALLOWED_EMAIL_DOMAIN`, `ADMIN_EMAILS` e os limites mensais definidos como variáveis comuns.
- [ ] Nenhuma variável `DEV_LOGIN`, `TEST_DATABASE_URL` ou `NEXT_PUBLIC_*` no serviço.
- [ ] Chaves de API restritas por API e com cota diária (ver `DEPLOY-GUIA-PRESIDENTE.md`).
- [ ] URI de redirecionamento do OAuth: `https://<domínio>/api/auth/callback/google`.

Fontes consultadas: [Auth.js — Deployment](https://authjs.dev/getting-started/deployment) (`AUTH_SECRET` é a única variável estritamente obrigatória; `AUTH_TRUST_HOST`/`trustHost` atrás de proxy e Docker; `AUTH_URL` dispensável na v5), [Cloud Run — contrato do contêiner](https://docs.cloud.google.com/run/docs/container-contract) (`PORT`, `K_SERVICE`), [Next.js 14 — instrumentation](https://nextjs.org/docs/14/app/building-your-application/optimizing/instrumentation) (`experimental.instrumentationHook`).
