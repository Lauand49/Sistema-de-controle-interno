# Texto do PR — Etapa 4 (Deploy: Docker, Cloud Run, Neon)

> Rascunho pronto para colar. O PR **não foi aberto** e nada foi enviado ao remoto.
> Branch: `etapa-4-deploy`, criada a partir de `etapa-3-melhorias`. **Base sugerida: `etapa-3-melhorias`** (as PRs das Etapas 0–3 ainda não foram mergeadas; retargetar para `main` depois, na ordem).

## Título

```
Etapa 4: build standalone, Dockerfile, guias de deploy (Cloud Run + Neon)
```

## Resumo

Esta etapa entrega **arquivos e guias**. **Nada foi implantado**, nenhum recurso de nuvem foi criado, nenhum `gcloud`/`terraform` foi executado e nenhum segredo real foi usado.

- **Build de produção:** `output: 'standalone'`; `Dockerfile` multi-stage (`deps` → `build` → `runner`, com alvo extra `migrator`), usuário não-root, `PORT` por variável; `.dockerignore` que barra `.env*`; Prisma com `binaryTargets = ["native", "debian-openssl-3.0.x"]` (imagem `node:24-bookworm-slim`).
- **`GET /api/health`:** caminho simples sem banco; `?deep=1` (banco) restrito a Presidente/Vice.
- **Variáveis e segurança:** `docs/DEPLOY-VARIAVEIS.md` (tabela completa: obrigatória?, onde fica, como gerar, risco se vazar). Novo `lib/env.ts` + `instrumentation.ts`: em produção o servidor valida o ambiente ao subir e **recusa subir** (código 1, mensagem sem valores) se faltar algo obrigatório, se `DEV_LOGIN=true`, se `AUTH_SECRET` for curto etc. Revisado: `DEV_LOGIN` não funciona em produção (sem brecha); nenhuma variável `NEXT_PUBLIC_*`; chaves só no servidor.
- **Banco:** `docs/DEPLOY-BANCO.md` (Neon `aws-sa-east-1`; URL com pooler para o app; URL **direta** para migrações; `prisma migrate deploy` em job separado, fora do startup; checklist de renomear migrações). O schema **não** ganhou `directUrl`.
- **Cloud Run:** `docs/DEPLOY-CLOUD-RUN.md`, `cloudrun.service.yaml` (só placeholders) e `cloudbuild.yaml`. `max-instances=1` (limitador do Nominatim por processo e cancelamento em memória), cobrança por requisição, `min-instances=0`, timeout 300 s, segredos via Secret Manager, conta de serviço de privilégio mínimo.
- **Guia do Presidente:** `docs/DEPLOY-GUIA-PRESIDENTE.md`, em português simples, com o que só ele faz (projeto na organização, OAuth **Interno**, faturamento e alertas, chaves restritas e limitadas, segredos sem passar por chat).
- **CI mínimo:** `.github/workflows/ci.yml` (`npm ci`, `prisma generate`, `tsc`, `npm test` offline, `npm run build`); sem segredos e sem banco.
- **Registro:** `docs/PLANO-INTEGRACAO.md` seção 8.5 e `docs/HANDOFF.md`.

Arquivos de código tocados: `next.config.js`, `prisma/schema.prisma` (só o bloco `generator`), `app/api/health/route.ts`, `lib/env.ts`, `instrumentation.ts`, `instrumentation-node.ts`, `.env.example` (comentários), testes em `tests/deploy/`. Nenhuma migração nova; nenhuma migração existente foi alterada ou renomeada; `lib/permissions.ts`, `auth.ts`, `auth.config.ts` e `middleware.ts` **não foram tocados**.

## Como testar

```bash
export PATH=$HOME/.local/bin:$PATH
npx prisma generate
npx tsc --noEmit
npm test            # offline
npm run build       # gera .next/standalone/server.js
```

Imagem (precisa de Docker; não foi executado por quem escreveu):

```bash
docker build -t scitec-sistema .
docker build --target migrator -t scitec-sistema-migrate .
docker run --rm -p 8080:8080 scitec-sistema   # sem variáveis: deve recusar subir e listar o que falta (código 1)
```

Teste rápido do servidor standalone sem Docker (valores fictícios, só local):

```bash
cd .next/standalone && cp -R ../static .next/static && cp -R ../../public public
NODE_ENV=production PORT=8080 HOSTNAME=127.0.0.1 \
  DATABASE_URL='postgresql://u:p@localhost:5432/fake' AUTH_SECRET='<32+ caracteres de teste>' \
  AUTH_GOOGLE_ID='1.apps.googleusercontent.com' AUTH_GOOGLE_SECRET='fake' node server.js
```

O que foi verificado por quem escreveu: o build e o servidor standalone numa **cópia do projeto sem `.env`**; o engine do Prisma para Debian entra no standalone; sem variáveis o servidor sai com código 1; `DEV_LOGIN=true` é recusado; `tsc` e 191 arquivos / 1234 testes offline passam. Para o deploy real, siga `docs/DEPLOY-CLOUD-RUN.md`.

## Limitações conhecidas

- **`docker build` não foi executado** (sem Docker na máquina); o workflow de CI não rodou no GitHub (os mesmos passos rodaram localmente).
- **`/api/health` responde 401 sem sessão**, porque o `middleware.ts` ainda não a lista como pública. Por isso o Cloud Run usa sonda de inicialização TCP (sondas HTTP só aceitam 2XX/3XX) e um monitor externo não enxerga 200.
- **Uma instância só** (`max-instances=1`): limitadores de taxa (Nominatim, BrasilAPI) e caches são em memória por processo. Escalar exige mover o limitador para o banco.
- **A mineração depende do navegador do autor** (descoberta e análise avançam por chamadas da tela aberta); worker/cron fica para outra etapa. A avaliação automática dos leads sem contato roda dentro da requisição do lote final.
- Custos citados são **ordem de grandeza com preços Tier 1**; São Paulo é Tier 2 e custa mais. Confira na calculadora do Google.
- Domínio próprio exige balanceador de carga (custo fixo): o mapeamento de domínio do Cloud Run é preview e não existe em `southamerica-east1`; Firebase Hosting à frente é desaconselhado (só repassaria o cookie `__session`; não verificado na documentação atual).
- Aviso de build `jose`/`CompressionStream` no Edge Runtime: já existia (vem do Auth.js no middleware), não é desta etapa.
- Testes de integração não foram executados (só com `npm run test:int` em `scitec_test`). As migrações `20261019` e `20261020` não foram aplicadas a nenhum banco.

## Pendências

**Dono do repositório (decisões):**

1. **Autorizar a mudança de uma linha no `middleware.ts`** para tornar `/api/health` pública (`pathname === '/api/health'` em `isPublicPath`). Depois disso dá para trocar a sonda TCP por `httpGet /api/health` e usar monitoramento externo.
2. **Renomear ou não** as migrações `20261015`–`20261020` (data à frente do calendário; `20261010_paineis` também). Só renomear se **nenhum banco compartilhado** as aplicou (checklist em `DEPLOY-BANCO.md`, seção 6).
3. **E-mail extraído do site (LGPD):** decisão pendente desde a Etapa 3.
4. A nova trava do seed (`SEED_CONFIRM_DB`) e a regra "integração só em `scitec_test`" (vindas das correções da Etapa 3).

**Presidente:** o checklist de 12 passos de `docs/DEPLOY-GUIA-PRESIDENTE.md` (projeto GCP na organização `scitecjr.com`, faturamento, orçamento e alertas, OAuth **Interno**, cliente OAuth com o URI de produção, chaves de API restritas por API e com cota diária, Neon, segredos direto no Secret Manager, endereço, administradores, acesso temporário da pessoa técnica).

**Pessoa técnica:** rodar `docker build`; construir as imagens; criar contas de serviço e permissões por segredo; executar o job de migração; publicar o serviço; verificar com `GET /api/health?deep=1`; rodar `npm run test:int` num `scitec_test`.

## Pedido de revisão ao dono

Peço a revisão do dono do repositório (`.github/CODEOWNERS`: `@Lauand49` ou `@brinelso`). Este PR toca caminhos protegidos:

- `/.github/` (novo `workflows/ci.yml`);
- `/prisma/` (`schema.prisma`: apenas `binaryTargets` no bloco `generator`; sem migração nova).

Atenção especial a: (1) a decisão sobre `middleware.ts` acima; (2) as escolhas do Cloud Run (`max-instances=1`, cobrança por requisição, `allUsers` como invocador porque o login é do próprio app); (3) o `allUsers` pode ser bloqueado pela política "Domain restricted sharing" da organização.

Detalhes: `docs/PLANO-INTEGRACAO.md` seção 8.5 e `docs/HANDOFF.md`.
