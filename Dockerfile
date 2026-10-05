# syntax=docker/dockerfile:1
#
# Imagem de produção do Sistema Interno SciTec jr. (Next.js 14 standalone + Prisma).
#
# Estágios: base -> deps -> build -> runner (padrão, a imagem do app)
#                               \-> migrator (alvo opcional: job de `prisma migrate deploy`)
#
#   Imagem do app:        docker build -t scitec-sistema .
#   Imagem das migrações: docker build --target migrator -t scitec-sistema-migrate .
#
# Nada de segredo entra na imagem: .env* fica fora pelo .dockerignore e todas as variáveis chegam
# em tempo de execução (ver docs/DEPLOY-VARIAVEIS.md). O build não precisa de DATABASE_URL.
#
# Base: Debian 12 (bookworm) + OpenSSL 3  =>  binaryTarget do Prisma "debian-openssl-3.0.x"
# (prisma/schema.prisma). Se trocar para Alpine, troque também o binaryTarget (linux-musl-openssl-3.0.x).
# Node 24 é o LTS ativo; para fixar o digest da imagem: docker buildx imagetools inspect node:24-bookworm-slim

ARG NODE_VERSION=24

# ── base: Node + bibliotecas que o Prisma e o TLS exigem em imagem "slim" ─────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ── deps: todas as dependências (inclui as de desenvolvimento, necessárias para o build) ──────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ── build: prisma generate + next build (output standalone) ───────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `npm run build` = prisma generate && next build. NODE_ENV=production é definido pelo próprio next build.
RUN npm run build

# ── migrator (alvo opcional): roda `prisma migrate deploy` FORA do startup do app ─────────────────
# Use como Cloud Run Job / passo de deploy, com DATABASE_URL apontando para a conexão DIRETA do
# banco (sem pooler). Ver docs/DEPLOY-BANCO.md.
FROM base AS migrator
ENV NODE_ENV=production
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node prisma ./prisma
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ── runner (último estágio = alvo padrão): só o necessário para servir o app ──────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0
# server.js, node_modules mínimos (inclui @prisma/client e o engine) e o código compilado.
COPY --from=build --chown=node:node /app/.next/standalone ./
# O servidor standalone não copia estes dois diretórios sozinho.
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Usuário não-root (já existe na imagem oficial do Node).
USER node
EXPOSE 8080
# O Cloud Run ignora HEALTHCHECK (usa sondas próprias, ver docs/DEPLOY-CLOUD-RUN.md); vale para
# `docker run` e Docker Compose. Qualquer resposta HTTP < 500 prova que o servidor está de pé: sem
# sessão o middleware responde 401 em /api/health (ver app/api/health/route.ts).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
