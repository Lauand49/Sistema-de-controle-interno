# Deploy no Cloud Run (Etapa 4)

Passo a passo para uma pessoa com acesso ao projeto do Google Cloud. **Nada aqui foi executado pelo agente** e os comandos são texto para copiar. Antes, leia `docs/DEPLOY-VARIAVEIS.md` (variáveis e segredos) e `docs/DEPLOY-BANCO.md` (Neon e migrações). O que só o Presidente pode fazer (projeto, OAuth, faturamento, chaves) está em `docs/DEPLOY-GUIA-PRESIDENTE.md`.

Convenções: `PROJECT_ID` (ID do projeto), `TAG` (ex.: `2026-10-20-1` ou o hash curto do commit), região `southamerica-east1` (**São Paulo**; confirmada na [tabela de preços do Cloud Run](https://cloud.google.com/run/pricing), que a lista como "Sao Paulo (southamerica-east1)").

## 1. Escolhas de configuração e por quê

| Tema | Escolha | Motivo |
|---|---|---|
| (a) Limitador do Nominatim por processo (PLANO 8.2) | **`max-instances = 1`** no nível do **serviço** | O limitador de 1 requisição por segundo vive na memória do processo. Com uma só instância o limite vale para o sistema inteiro (a política de uso do Nominatim é 1 req/s). O Google recomenda o teto no nível do serviço, que vale imediatamente e entre revisões. Ressalva: o Cloud Run informa que o teto "pode ser excedido por um breve período" (picos); a 1 req/s de margem isso é tolerável. Para escalar além de 1, o limitador tem de ir para o banco (mudança de código, fora desta etapa). |
| (b) Cancelamento em memória (`runId → AbortController`) | Sem ação extra com `max-instances = 1` | Com uma só instância o "Parar" sempre encontra a execução em curso e aborta a requisição em voo. Se um dia houver mais instâncias, vale o fallback no banco (vigia de 1,5 s + checagem do status entre nichos/páginas): funciona, só não é imediato. |
| (c) Avaliação automática pós-mineração | **Cobrança por requisição** (padrão, `cpu-throttling: true`); **não** usar `--no-cpu-throttling`; **`min-instances = 0`** | Verificado no código: a avaliação **não roda em segundo plano depois da resposta**; `app/api/tools/lead-miner/runs/[id]/batch/route.ts` a aguarda (`await`) **dentro** da requisição do lote final, com prazo de 57 s. Como há requisição ativa, o Cloud Run aloca CPU. Nenhum outro trabalho continua depois da resposta. **Se um dia alguém mover a avaliação para "disparar e esquecer" (sem `await`), a CPU é estrangulada depois da resposta e o trabalho para: aí seria preciso `--no-cpu-throttling`.** |
| (d) Timeout de requisição | **300 s** (padrão, explícito) | Os passos têm "orçamento" de 50 s (descoberta) e 55 s (lote), mas uma consulta ao Overpass pode durar até 60 s por tentativa, com até 3 tentativas (`OVERPASS_TIMEOUT_MS`, `RETRY_DELAYS_MS`), ou seja, um passo de descoberta pode passar de 3 minutos no pior caso. O `maxDuration = 60` exportado pelas rotas é configuração de plataformas serverless; **não conte com ele no Cloud Run**: o limite real é o timeout do serviço (padrão 5 min, máximo 60 min). Depois do timeout, o Cloud Run devolve 504 e o navegador retoma pelo mecanismo de retentativa do `driveRun`. |
| Recursos | 1 vCPU, 1 GiB, concorrência 80, `--cpu-boost` | Ponto de partida razoável (1 vCPU admite até 4 GiB). As requisições são quase só espera de rede. Meça e ajuste. `--cpu-boost` dá CPU extra durante a subida (você paga pela CPU extra durante a partida). |
| Sondas | Sonda de **inicialização TCP** na porta 8080; sem sonda de liveness | `GET /api/health` responde 401 sem sessão (o `middleware.ts` ainda não a torna pública) e o Cloud Run só considera sucesso em sondas HTTP as respostas 2XX/3XX (documentado). O Cloud Run usa as sondas configuradas no serviço (a documentação delas não menciona o `HEALTHCHECK` do Dockerfile, então não dependa dele). |

### Custo estimado (ordem de grandeza)

Usando a tabela pública do Cloud Run com preços de **Tier 1**, 1 vCPU e 1 GiB, mês de 30 dias (2.592.000 s). **São Paulo é Tier 2 (preço maior que estes)**; para o valor real use a [calculadora de preços](https://cloud.google.com/products/calculator).

| Cenário | Conta | ≈ US$/mês (Tier 1) |
|---|---|---|
| **Recomendado**: cobrança por requisição, `min-instances = 0` | só tempo com requisição: 1 vCPU × US$ 0,000024 + 1 GiB × US$ 0,0000025 = US$ 0,0000265/s ≈ US$ 0,095 por hora de atividade; uma equipe usando ~40 h/mês ≈ US$ 4 (dentro da franquia mensal: 180.000 vCPU-s e 360.000 GiB-s). | **0 a ~5** |
| Cobrança por requisição + `min-instances = 1` | instância ociosa: (US$ 0,0000025 + US$ 0,0000025) × 2.592.000 s = US$ 12,96, mais o tempo ativo | **~13 + ativo** |
| Cobrança por instância (`--no-cpu-throttling`) sempre ligada | (US$ 0,000018 + US$ 0,000002) × 2.592.000 s = US$ 51,84 | **~52** |

Fora disso: Artifact Registry (armazenamento das imagens), Cloud Build (minutos de build), Secret Manager (segredos e acessos), Neon (plano do banco) e, se usar domínio próprio com balanceador, o custo fixo do balanceador. O Cloud Run cobra 100 ms arredondados; requisições: US$ 0,40 por milhão (acima da franquia).

**Por que `min-instances = 0`:** ferramenta interna com uso esporádico; a primeira requisição depois de ociosidade paga uma partida a frio (o servidor standalone sobe em dezenas de milissegundos; o que pesa é o Neon acordar, que o `connect_timeout=15` da URL cobre). Perde-se o cache em memória de cidades/bairros, que se refaz. Se a latência da primeira requisição incomodar, use `--min-instances=1` (≈ US$ 13/mês no Tier 1) antes de pensar em instância sempre ativa.

## 2. Preparar o projeto (uma vez)

```bash
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com cloudbuild.googleapis.com
```

Repositório de imagens:

```bash
gcloud artifacts repositories create scitec \
  --repository-format=docker --location=southamerica-east1 \
  --description="Imagens do Sistema Interno SciTec jr."
```

Contas de serviço (privilégio mínimo; **não** use a conta padrão do Compute Engine):

```bash
gcloud iam service-accounts create scitec-app     --display-name="SciTec sistema (runtime)"
gcloud iam service-accounts create scitec-migrate --display-name="SciTec migracoes (job)"
```

## 3. Segredos (Secret Manager)

Crie os segredos pelo **console** (Segurança → Secret Manager) para não deixar valor no histórico do terminal, ou pela CLI lendo de um arquivo temporário que você apaga em seguida. **Nunca** cole segredo em comando com `echo` ou em chat/e-mail.

```bash
# Modelo (sem valor no comando); crie o arquivo com umask restritivo e apague depois
gcloud secrets create scitec-database-url --replication-policy=user-managed --locations=southamerica-east1 --data-file=/caminho/temporario
```

| Segredo | Variável | Quem lê |
|---|---|---|
| `scitec-database-url` | `DATABASE_URL` (com **pooler**) | serviço |
| `scitec-database-url-direct` | `DATABASE_URL` (**direta**) | job de migração |
| `scitec-auth-secret` | `AUTH_SECRET` | serviço |
| `scitec-auth-google-secret` | `AUTH_GOOGLE_SECRET` | serviço |
| `scitec-places-api-key`, `scitec-gemini-api-key`, `scitec-pagespeed-api-key` | chaves opcionais | serviço |

Permissão **por segredo** (não no projeto inteiro):

```bash
for S in scitec-database-url scitec-auth-secret scitec-auth-google-secret \
         scitec-places-api-key scitec-gemini-api-key scitec-pagespeed-api-key; do
  gcloud secrets add-iam-policy-binding "$S" \
    --member="serviceAccount:scitec-app@PROJECT_ID.iam.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor
done
gcloud secrets add-iam-policy-binding scitec-database-url-direct \
  --member="serviceAccount:scitec-migrate@PROJECT_ID.iam.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor
```

Rotação: segredos entram como variável de ambiente **na subida da instância**; depois de criar uma nova versão, publique uma nova revisão (ou use versões numeradas no lugar de `latest` para rastrear qual está em uso).

## 4. Imagens

```bash
# conferir que nenhum .env sobe para o Cloud Build (a saída deve ficar vazia):
gcloud meta list-files-for-upload | grep -i '\.env'

# app (estágio padrão "runner")
gcloud builds submit --region=southamerica-east1 --config=cloudbuild.yaml \
  --substitutions=_TARGET=runner,_IMAGE=southamerica-east1-docker.pkg.dev/PROJECT_ID/scitec/sistema:TAG .

# migrações (estágio "migrator")
gcloud builds submit --region=southamerica-east1 --config=cloudbuild.yaml \
  --substitutions=_TARGET=migrator,_IMAGE=southamerica-east1-docker.pkg.dev/PROJECT_ID/scitec/sistema-migrate:TAG .
```

Se o build falhar por permissão, conceda `roles/artifactregistry.writer` à conta de serviço que o Cloud Build usa no projeto. Com Docker instalado é possível testar local: `docker build -t scitec-sistema .` (o agente não tinha Docker; o `Dockerfile` foi validado por uma simulação do build sem `.env`).

## 5. Migrações

Antes de **cada** release, execute o job de migração (`docs/DEPLOY-BANCO.md`, seção 3). Se falhar, **não publique** o app.

## 6. Serviço

Opção A, com o arquivo versionado (preencha os placeholders antes):

```bash
gcloud run services replace cloudrun.service.yaml --region=southamerica-east1
```

Opção B, só com flags (equivalente):

```bash
gcloud run deploy scitec-sistema \
  --image=southamerica-east1-docker.pkg.dev/PROJECT_ID/scitec/sistema:TAG \
  --region=southamerica-east1 \
  --service-account=scitec-app@PROJECT_ID.iam.gserviceaccount.com \
  --max=1 --min-instances=0 --concurrency=80 --timeout=300 \
  --cpu=1 --memory=1Gi --cpu-boost --cpu-throttling \
  --ingress=all \
  --set-env-vars="AUTH_GOOGLE_ID=<id>.apps.googleusercontent.com,ALLOWED_EMAIL_DOMAIN=scitecjr.com,ADMIN_EMAILS=<email-do-presidente>@scitecjr.com" \
  --set-secrets="DATABASE_URL=scitec-database-url:latest,AUTH_SECRET=scitec-auth-secret:latest,AUTH_GOOGLE_SECRET=scitec-auth-google-secret:latest,GOOGLE_PLACES_API_KEY=scitec-places-api-key:latest,GEMINI_API_KEY=scitec-gemini-api-key:latest,PAGESPEED_API_KEY=scitec-pagespeed-api-key:latest"
```

Remova dos comandos as chaves opcionais que não for usar (o segredo citado precisa existir).

**Se o servidor não subir:** a revisão fica com falha e o Cloud Run mantém a anterior. Veja o motivo nos logs: `gcloud run services logs read scitec-sistema --region=southamerica-east1 --limit=50`. A validação de ambiente (`lib/env.ts`) imprime a lista de variáveis faltando **sem valores**.

## 7. Acesso, HTTPS e domínio

- **Invocação pública no IAM, autenticação no app.** O serviço precisa aceitar chamadas sem credencial do Google Cloud, porque o login é o do próprio sistema (Google Workspace, só `@scitecjr.com`, conferido no servidor). Comando: `gcloud run services add-iam-policy-binding scitec-sistema --region=southamerica-east1 --member=allUsers --role=roles/run.invoker`. Isso expõe o endereço na internet por desenho: o `middleware.ts` exige sessão em tudo, menos `/login`, `/api/auth/*` e `/api/dev/users` (que responde 404 em produção). Se a sua organização tiver a política "Domain restricted sharing" ativa, o `allUsers` pode ser bloqueado; peça ao Presidente/administrador para abrir a exceção para este serviço.
- **HTTPS:** o Cloud Run termina o TLS e entrega um endereço `https://scitec-sistema-<número>.southamerica-east1.run.app` (ver a URL com `gcloud run services describe scitec-sistema --region=southamerica-east1 --format='value(status.url)'`). O contêiner não trata TLS. O Auth.js roda atrás desse proxy com `trustHost: true` (já no código).
- **URI de redirecionamento do OAuth** (no cliente OAuth criado pelo Presidente): `https://<domínio-ou-endereço-run.app>/api/auth/callback/google`. Precisa coincidir **exatamente** com o endereço que o usuário usa.
- **Domínio próprio** (ex.: `sistema.scitecjr.com`), três caminhos, conforme a [documentação](https://docs.cloud.google.com/run/docs/mapping-custom-domains):
  1. **Balanceador de carga HTTP(S) externo global** (recomendado pelo Google): tem custo fixo mensal; permite domínio próprio, certificado gerenciado e, depois, Cloud Armor. Com ele, mude o `ingress` para `internal-and-cloud-load-balancing`, de modo que a URL `run.app` deixe de responder diretamente.
  2. **Mapeamento de domínio do Cloud Run**: está em *preview*, **não é recomendado para produção** e **não está disponível em `southamerica-east1`** (as regiões listadas são `asia-east1`, `asia-northeast1`, `asia-southeast1`, `europe-north1`, `europe-west1`, `europe-west4`, `us-central1`, `us-east1`, `us-east4` e `us-west1`). Não use.
  3. **Firebase Hosting à frente do Cloud Run**: **desaconselhado aqui**. Relatos da própria equipe do Firebase indicam que o Hosting repassa ao Cloud Run **apenas o cookie `__session`**; o Auth.js usa cookies próprios (`authjs.session-token` etc.), e o login quebraria. Não verificado na documentação atual; trate como incompatível até testar.
  - Sem domínio próprio o endereço `run.app` funciona, é gratuito e já tem HTTPS: é a opção mais simples para começar.

## 8. Verificação depois do deploy

1. Abra a URL, entre com uma conta `@scitecjr.com` (a do `ADMIN_EMAILS` vira Presidente/ATIVO).
2. Logado como Presidente/Vice: `GET /api/health?deep=1` deve devolver `{"status":"ok","database":"ok"}`. Use o tempo da resposta para avaliar a latência Cloud Run → Neon.
3. Faça uma mineração pequena; confira "Parar", o ranking ao vivo, as abas Com/Sem contato e a avaliação dos sem contato ao concluir.
4. Confira os logs: sem erros de variáveis, sem avisos inesperados (`gcloud run services logs read ...`).

Reverter uma versão ruim do app (rápido, sem perder dados): `gcloud run services update-traffic scitec-sistema --region=southamerica-east1 --to-revisions=<REVISÃO-ANTERIOR>=100` (lista: `gcloud run revisions list --service=scitec-sistema --region=southamerica-east1`). Lembre que **migrações não voltam** (`DEPLOY-BANCO.md`).

## 9. Pendências conhecidas para o deploy

- **`/api/health` pública:** para sondas HTTP e monitores externos é preciso incluir `/api/health` em `isPublicPath` do `middleware.ts` (uma linha). O agente **não alterou** o middleware sem autorização do dono; registrado no `HANDOFF.md`.
- **Mais de uma instância:** exige mover o limitador do Nominatim (e, idealmente, o do BrasilAPI) para o banco.
- **Mineração sem navegador aberto:** continua dependendo da aba do autor (PLANO 8.4.1); um worker/cron seria outra etapa.
- **Purga do Cache_Google:** continua oportunista (PLANO 8.4). Um agendamento (Cloud Scheduler) seria opcional.
- **Alertas de orçamento e cotas das chaves:** ver `DEPLOY-GUIA-PRESIDENTE.md`.

Fontes consultadas: [Cloud Run — contrato do contêiner](https://docs.cloud.google.com/run/docs/container-contract), [timeout de requisição](https://docs.cloud.google.com/run/docs/configuring/request-timeout) (padrão 300 s, máximo 3600 s), [instâncias máximas](https://docs.cloud.google.com/run/docs/configuring/max-instances), [CPU e startup CPU boost](https://docs.cloud.google.com/run/docs/configuring/services/cpu), [cobrança/CPU](https://docs.cloud.google.com/run/docs/configuring/cpu-allocation), [segredos](https://docs.cloud.google.com/run/docs/configuring/services/secrets), [ingress](https://docs.cloud.google.com/run/docs/securing/ingress), [domínios](https://docs.cloud.google.com/run/docs/mapping-custom-domains), [preços](https://cloud.google.com/run/pricing).
