# Banco de dados e migrações em produção (Etapa 4)

Postgres no **Neon**, app no **Cloud Run**. Este guia é para quem executa o deploy; nada aqui foi executado pelo agente. Comandos são texto para copiar. Substitua `PROJECT_ID`, `TAG` e os nomes entre `<>`.

## 1. Região

- O Neon oferece a região **AWS São Paulo (`aws-sa-east-1`)**; a região de um projeto Neon **não pode ser mudada depois** (só criando outro projeto e migrando os dados). Escolha-a ao criar o projeto. ([regiões do Neon](https://neon.com/docs/introduction/regions): as regiões Azure estão descontinuadas; só AWS.)
- O Cloud Run roda na região `southamerica-east1` (São Paulo, Google Cloud). Neon (AWS) e Cloud Run (Google) são nuvens diferentes, mas ficam na mesma cidade; a conexão sai pela internet, sempre com TLS (`sslmode=require`). Meça depois do deploy (ver `GET /api/health?deep=1` em `DEPLOY-CLOUD-RUN.md`) em vez de assumir a latência.
- Não use lista de IPs permitidos no Neon: o Cloud Run não tem IP de saída fixo sem configurar Cloud NAT.

## 2. Duas URLs: pooler para o app, conexão direta para migrações

| Uso | Endereço no Neon | Variável/segredo | Por quê |
|---|---|---|---|
| App (Cloud Run, serviço) | **com pooler** (host com `-pooler`) | `DATABASE_URL` ← segredo `scitec-database-url` | O Neon usa PgBouncer em modo transação (até 10.000 conexões de cliente). Vários contêineres e requisições simultâneas não esgotam o `max_connections` do Postgres. |
| Migrações (Cloud Run, job) | **direta** (host **sem** `-pooler`) | `DATABASE_URL` do job ← segredo `scitec-database-url-direct` | O Prisma Migrate usa uma única conexão e advisory lock de sessão; o Prisma documenta que ele não funciona atrás do PgBouncer (erro `prepared statement "s0" already exists`), e o Neon lista "advisory locks de sessão" entre o que o pooler não suporta. |

Onde copiar as strings: Console do Neon → **Connect** → escolha branch, banco e papel → ligue **Connection pooling** para a URL do app e desligue para a URL direta. Formato (valores fictícios):

```text
# app (pooled)
postgresql://USUARIO:SENHA@ep-xxxx-pooler.sa-east-1.aws.neon.tech/scitec?sslmode=require&connect_timeout=15
# migrações (direta)
postgresql://USUARIO:SENHA@ep-xxxx.sa-east-1.aws.neon.tech/scitec?sslmode=require&connect_timeout=15
```

- `connect_timeout=15`: o Neon pode escalar o computador a zero por inatividade; a primeira conexão leva alguns segundos para acordar (documentado pelo Neon para o erro `P1001`). Sem isso, a primeira requisição depois de ociosidade pode falhar.
- `pgbouncer=true` **não é necessário** com o Neon: o Prisma só o exige para PgBouncer anterior à 1.21, e o PgBouncer do Neon suporta prepared statements de protocolo (`max_prepared_statements=1000`). Se aparecerem erros como `prepared statement "s..." already exists` no app, acrescente `&pgbouncer=true` à URL do app.
- `connection_limit` do Prisma: padrão `núm. de CPUs × 2 + 1` por instância. Com poucas instâncias não precisa mexer. Se aumentar `max-instances`, lembre que o total de conexões ao pooler é instâncias × `connection_limit` (o pooler aguenta 10.000).

### `directUrl` no schema do Prisma: não adotado

O Prisma 5 permite `directUrl = env("...")` no bloco `datasource` para o CLI usar a conexão direta. **Não foi adicionado**, porque exigiria que `DIRECT_URL` existisse em todo ambiente (desenvolvimento, CI, contêiner) e mexeria no `schema.prisma`. Em vez disso o job de migração recebe a URL **direta** na própria variável `DATABASE_URL` (segredo diferente), o que dispensa qualquer alteração de schema. Se o dono preferir `directUrl`, o diff seria:

```diff
 datasource db {
   provider = "postgresql"
   url      = env("DATABASE_URL")
+  directUrl = env("DIRECT_URL")
 }
```

(e `DIRECT_URL` passaria a ser obrigatória em todos os ambientes que rodam o CLI do Prisma). Decisão do dono; não aplicar sem combinar.

## 3. Migrações FORA do startup do app

O app **nunca** roda migração ao subir. Um Cloud Run Job dedicado roda `prisma migrate deploy` antes de cada versão nova do app.

Motivos: várias instâncias subindo juntas disputariam o advisory lock do Prisma (as perdedoras estouram o tempo e o Cloud Run considera a revisão com falha); o app em execução não precisa de permissão de DDL; e a falha de uma migração não deve derrubar o serviço.

### 3.1 Construir a imagem do job (alvo `migrator` do Dockerfile)

O `cloudbuild.yaml` da raiz constrói qualquer estágio do Dockerfile (`_TARGET`). Para o job:

```bash
gcloud builds submit --region=southamerica-east1 --config=cloudbuild.yaml \
  --substitutions=_TARGET=migrator,_IMAGE=southamerica-east1-docker.pkg.dev/PROJECT_ID/scitec/sistema-migrate:TAG .
```

(O repositório do Artifact Registry e as permissões do Cloud Build estão em `docs/DEPLOY-CLOUD-RUN.md`, seção "Imagens".)

### 3.2 Criar o job (uma vez)

```bash
gcloud run jobs create scitec-migrate \
  --region=southamerica-east1 \
  --image=southamerica-east1-docker.pkg.dev/PROJECT_ID/scitec/sistema-migrate:TAG \
  --service-account=scitec-migrate@PROJECT_ID.iam.gserviceaccount.com \
  --set-secrets=DATABASE_URL=scitec-database-url-direct:latest \
  --max-retries=0 \
  --task-timeout=600s
```

- `--max-retries=0`: o padrão são 3 tentativas; uma migração que falhou precisa de olho humano, não de repetição automática.
- `--task-timeout=600s` (10 min, o padrão do Cloud Run): suficiente para migrações aditivas.
- A conta de serviço do job só precisa ler o segredo da URL direta (`roles/secretmanager.secretAccessor` nesse segredo).

### 3.3 Executar a cada release

```bash
# 1) imagem do job com a MESMA tag do app que será publicado
gcloud run jobs update scitec-migrate --region=southamerica-east1 \
  --image=southamerica-east1-docker.pkg.dev/PROJECT_ID/scitec/sistema-migrate:TAG
# 2) rodar e esperar terminar (falha = pare aqui e não publique o app)
gcloud run jobs execute scitec-migrate --region=southamerica-east1 --wait
# 3) só então publicar a nova revisão do app (ver DEPLOY-CLOUD-RUN.md)
```

Boas práticas:

- **Migrações só aditivas** (colunas novas nulas/com padrão, tabelas novas, índices): a revisão antiga do app continua funcionando enquanto a nova sobe. Remover/renomear coluna exige duas releases (expandir, depois contrair).
- `prisma migrate deploy` aplica só as migrações pendentes, é idempotente e **não usa banco sombra**. Nunca use `migrate dev`, `migrate reset` ou `db push` contra produção.
- **Rodar duas execuções ao mesmo tempo não é um problema de dados** (o advisory lock serializa), mas a segunda espera e pode estourar o tempo; evite.
- **Não existe migração de volta.** Para desfazer: restauração do Neon (ver seção 5) ou migração corretiva nova.
- As migrações preservam os **índices parciais** e os `CHECK` criados à mão (`User_one_manager_per_department`, `SectorMember_one_manager_per_sector`, `MiningRun_one_active_per_author_params`). Ao gerar migração nova em desenvolvimento, remova do SQL qualquer `DROP INDEX` desses índices (aviso no topo de `prisma/schema.prisma`).

## 4. Primeiro deploy do banco

1. Criar o projeto no Neon (região `aws-sa-east-1`), o banco `scitec` e a URL **direta** e **pooled**.
2. Guardar as duas URLs no Secret Manager (`scitec-database-url` e `scitec-database-url-direct`) **sem passar por chat ou e-mail**.
3. Executar o job de migração (seção 3.3). Ele cria tabelas, enums, triggers e as unidades iniciais (4 departamentos e 5 setores, inseridos pela própria migração `init`).
4. **Não rodar o seed em produção.** O `prisma/seed.ts` apaga usuários, funis, tarefas e leads; o guarda (`prisma/seed-guard.ts`) o recusa com `NODE_ENV=production` e exige confirmação em qualquer banco que não termine em `_test`. Os dados de exemplo são só para desenvolvimento.
5. O primeiro Presidente entra pelo login do Google: defina `ADMIN_EMAILS` (ver `DEPLOY-VARIAVEIS.md`). Os demais entram como `PENDENTE` e são aprovados pela tela de equipe.
6. Verificar: `GET /api/health?deep=1` logado como Presidente/Vice deve responder `{"status":"ok","database":"ok"}`.

### Papéis do banco (endurecimento opcional)

Por padrão o Neon cria um papel dono do banco. Mais seguro: dois papéis, o **migrador** (dono, com DDL) usado só no job, e o **app** (apenas DML) usado no serviço. Modelo (ajuste nomes; rode como dono, depois da primeira migração, e repita o `GRANT` para novas tabelas via `ALTER DEFAULT PRIVILEGES`):

```sql
CREATE ROLE scitec_app LOGIN PASSWORD '<gere-uma-senha-forte>';
GRANT CONNECT ON DATABASE scitec TO scitec_app;
GRANT USAGE ON SCHEMA public TO scitec_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO scitec_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO scitec_app;
```

Cuidado: o trigger `company_set_tem_contato` roda com os privilégios de quem escreve, sem precisar de permissões extras (só altera a própria linha). Teste em um branch do Neon antes de usar em produção.

## 5. Backup e recuperação

- O Neon mantém histórico para restauração a um instante anterior (*restore*/branch a partir de um ponto no tempo). **A janela de retenção depende do plano**; confira no console o valor do plano contratado antes de confiar nela (não foi verificado aqui).
- Antes de uma migração arriscada, crie um **branch** do Neon a partir de produção (cópia instantânea) e ensaie a migração nele apontando `scitec-database-url-direct` de teste para esse branch.
- Backup lógico (`pg_dump`) deve usar a **conexão direta** (o `pg_dump` usa `SET`, que o pooler não suporta).
- Exercício de restauração: o dono deve testar uma restauração em um branch antes de depender dela.

## 6. Checklist: renomear as migrações `20261015`–`20261018` (decisão do dono)

Contexto: as migrações `20261015000000_lead_miner_enrichment`, `20261016000000_mining_run_cancelada`, `20261017000000_company_tem_contato` e `20261018000000_company_avaliacao` (e as posteriores `20261019…` e `20261020…`) têm data à frente do calendário, contra a regra de `AGENTS.md` (data real do dia). Observação: `20261010000000_paineis` também é posterior a 4/out/2026 (data do sistema quando este guia foi escrito); inclua-a na mesma decisão.

**Regra de ouro: só renomear se NENHUM banco compartilhado as aplicou.** O Prisma identifica a migração pelo nome (coluna `migration_name` de `_prisma_migrations`). Em um banco que já aplicou a migração com o nome antigo, o novo nome aparece como "pendente" e o antigo como "ausente": `migrate deploy` tenta reaplicar o SQL (e falha, por exemplo em `CREATE TYPE` repetido) ou acusa divergência.

Passos para o dono:

1. [ ] Listar todos os bancos que existem além do seu computador: produção (ainda não existe se este deploy é o primeiro), homologação, bancos locais de outros membros, branches do Neon, bancos de CI.
2. [ ] Em cada um, **somente leitura**, conferir o que foi aplicado:
   ```sql
   SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY migration_name;
   ```
3. [ ] Se **algum banco compartilhado** aparecer com `20261015…` ou posteriores: **não renomear**. Mantenha os nomes (a ordem lexicográfica continua correta; o único custo é estético).
4. [ ] Se **nenhum** compartilhado aplicou (só bancos locais descartáveis, que cada pessoa recria):
   - [ ] combinar uma data e avisar o time (cada banco local precisará ser recriado ou ter `_prisma_migrations` ajustada);
   - [ ] renomear as pastas com `git mv`, preservando a ordem relativa e mantendo todas **depois** de `20261010000000_paineis` (ou renomeando essa também, com a mesma lógica);
   - [ ] não alterar o conteúdo de nenhuma migração;
   - [ ] rodar `npx prisma migrate deploy` em um banco novo e vazio (`scitec_test`) e `npm run test:int`;
   - [ ] atualizar as referências nos documentos (`docs/PLANO-INTEGRACAO.md`, `docs/HANDOFF.md`, comentários em `lib/leads/contact.ts` e nos testes que leem os arquivos de migração: `tests/lead-miner-ajustes/contato.test.ts`).
5. [ ] Depois do primeiro deploy em produção, **congele**: a partir daí nunca renomeie migração.

Alternativa para banco que já aplicou e não pode ser recriado (não recomendada): com backup e acesso do dono, atualizar `migration_name` em `_prisma_migrations` para o novo nome **antes** de publicar o código renomeado. Risco alto; só com janela de manutenção.

Fontes: [Neon — regiões](https://neon.com/docs/introduction/regions), [Neon — connection pooling](https://neon.com/docs/connect/connection-pooling), [Neon — Prisma](https://neon.com/docs/guides/prisma) (pooled para o app, direta para o CLI, `connect_timeout`, `directUrl` no Prisma 4.10+), [Prisma — PgBouncer](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer) (Migrate não funciona atrás do PgBouncer; `pgbouncer=true` só para versões < 1.21), [Cloud Run — jobs](https://docs.cloud.google.com/run/docs/configuring/max-retries) (`max-retries` padrão 3; timeout padrão de tarefa 10 min).
