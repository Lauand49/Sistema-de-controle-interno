# Guia do Presidente: o que só você pode fazer para colocar o sistema no ar

Este guia é para quem administra o Google Workspace da SciTec jr. (`scitecjr.com`). Não precisa saber programar. Cada passo diz **onde clicar**, **o que anotar** e **o que NÃO compartilhar**. O trabalho técnico (instalar o sistema) fica com a pessoa da equipe que vai fazer o deploy; ela usa os guias `DEPLOY-CLOUD-RUN.md`, `DEPLOY-BANCO.md` e `DEPLOY-VARIAVEIS.md`.

Os nomes dos menus do Google mudam de vez em quando. Se um nome não aparecer igual, procure o parecido na barra de busca do console (`console.cloud.google.com`).

## Regra de ouro sobre segredos

**Segredo é tudo que dá acesso: senhas, chaves de API, "client secret", endereço do banco de dados que contém senha.** Esses valores:

- **nunca** vão por WhatsApp, Telegram, Discord, e-mail, Google Chat, comentário de documento, print de tela ou qualquer mensagem;
- entram **direto** no **Secret Manager** do Google Cloud (passo 9), digitados ou colados por quem os gerou. Assim o valor não passa por outra pessoa;
- se um segredo vazar (por exemplo, colado num chat sem querer): avise a equipe na hora. Ele será **trocado** (gerar outro e apagar o antigo). Não adianta apagar a mensagem.

Não é segredo (pode ir por chat da equipe): ID do projeto, número do projeto, nome do domínio, "Client ID" do login do Google, lista de e-mails de administradores.

## Checklist

Marque conforme fizer. A ordem importa.

- [ ] 1. Conferir quem faz o quê e ativar verificação em duas etapas
- [ ] 2. Criar o projeto no Google Cloud dentro da organização `scitecjr.com`
- [ ] 3. Vincular o faturamento
- [ ] 4. Criar o orçamento e os alertas de gasto
- [ ] 5. Dar acesso temporário à pessoa técnica
- [ ] 6. Configurar a tela de login do Google como **Interna**
- [ ] 7. Criar o cliente de login (OAuth) com o endereço de produção
- [ ] 8. Criar as chaves de API (Places, PageSpeed, Gemini), restringir e limitar
- [ ] 9. Criar o banco (Neon) e guardar os segredos no Secret Manager
- [ ] 10. Decidir o endereço do sistema e os administradores
- [ ] 11. Combinar quem recebe os alertas e a rotina mensal
- [ ] 12. Devolver as informações (lista no fim)

---

### 1. Conferir pessoas e segurança

- **Onde:** `admin.google.com` (console de administração do Workspace).
- **Faça:** confirme que **duas pessoas** (você e mais uma de confiança, por exemplo a Vice) são administradoras da organização e do faturamento. Se só uma pessoa tiver acesso e sair da empresa júnior, ninguém mais consegue administrar o sistema. Ative a **verificação em duas etapas** nas contas administradoras.
- **Anote:** os dois e-mails administradores.
- **Não compartilhe:** senhas nem códigos de verificação.

### 2. Criar o projeto dentro da organização

- **Onde:** `console.cloud.google.com`. No seletor de projetos (topo), escolha a organização **scitecjr.com** e clique em **Novo projeto**.
- **Faça:** nome `SciTec Sistema` (ou parecido); em **Organização/Local** deixe **scitecjr.com**. O projeto **precisa** ficar dentro da organização: só assim a tela de login pode ser "Interna" (passo 6).
- **Se não aparecer a opção de criar projeto:** sua conta pode não ter o papel de criar projetos na organização. Em *IAM e administrador → IAM*, no nível da **organização**, dê a você mesmo o papel **Criador de projetos** (`Project Creator`) ou **Administrador da organização**.
- **Anote:** o **ID do projeto** (ex.: `scitec-sistema-123456`) e o **número do projeto**.
- **Não compartilhe:** nada secreto aqui; o ID e o número podem ir por chat.

### 3. Vincular o faturamento

- **Onde:** menu ☰ → **Faturamento** → **Vincular uma conta de faturamento** ao projeto (ou criar uma, com cartão ou outra forma de pagamento aceita).
- **Por quê:** o Cloud Run, o Secret Manager e as APIs pagas exigem faturamento ativo. O uso previsto é pequeno, mas o faturamento precisa existir.
- **Anote:** o nome da conta de faturamento e quem são os administradores dela.
- **Não compartilhe:** dados do cartão com ninguém (digite você mesmo).

### 4. Orçamento e alertas de gasto (comece baixo)

- **Onde:** ☰ → **Faturamento** → **Orçamentos e alertas** → **Criar orçamento**.
- **Importante:** o orçamento **só avisa, não bloqueia** o gasto. Por isso existem também os limites por API dos passos 8 e 9 e os limites do próprio sistema.
- **Sugestão inicial (baixa, ajuste depois de 2 meses de uso real):**
  - escopo: apenas o projeto `SciTec Sistema`;
  - valor: **R$ 150 por mês** (ou o equivalente na moeda da conta);
  - alertas: **50 %, 90 % e 100 %** do gasto real, e **100 % do previsto**.
- **Quem recebe:** por padrão, os administradores e usuários da conta de faturamento. Acrescente um endereço de **grupo** da diretoria (ex.: `diretoria@scitecjr.com`) para que mais de uma pessoa receba (o Google permite incluir e-mails extras por um canal do Cloud Monitoring).
- **Anote:** o valor escolhido e quem recebe.
- **Não compartilhe:** nada secreto.

### 5. Acesso temporário à pessoa técnica

- **Onde:** ☰ → **IAM e administrador** → **IAM** → **Conceder acesso** (no projeto, não na organização).
- **Para a pessoa que fará o deploy, conceda:** Administrador do Cloud Run, Editor do Cloud Build, Administrador do Artifact Registry, Administrador do Secret Manager, Administrador de contas de serviço, Usuário de conta de serviço, Administrador do Service Usage e Administrador de IAM do projeto. (Em inglês: Cloud Run Admin, Cloud Build Editor, Artifact Registry Administrator, Secret Manager Admin, Service Account Admin, Service Account User, Service Usage Admin, Project IAM Admin.)
- **Quando terminar o deploy:** **remova** esses papéis (ou troque por "Visualizador"). Deixe acesso amplo só pelo tempo necessário.
- **Anote:** o e-mail da pessoa técnica e a data em que o acesso foi concedido e retirado.
- **Não compartilhe:** sua senha. Nunca entregue sua conta de administrador para outra pessoa usar.

### 6. Tela de login do Google: **Interna**

- **Onde:** ☰ → **APIs e serviços** → **Tela de consentimento OAuth** (no console novo aparece como **Google Auth Platform**, com as abas *Branding* e *Público/Audience*).
- **Faça:**
  - **Tipo de usuário / Público: Interno.** Isso só aparece se o projeto está dentro da organização (passo 2). Com "Interno", **só contas `@scitecjr.com`** conseguem entrar e não há processo de verificação do Google;
  - nome do app: `Sistema Interno SciTec jr.`;
  - e-mail de suporte e e-mail de contato do desenvolvedor: um endereço de **grupo** da diretoria (não pessoal);
  - escopos: deixe só os básicos (`openid`, `email`, `profile`). Não adicione outros.
- **Anote:** confirmação de que ficou "Interno".
- **Não compartilhe:** nada secreto.

### 7. Cliente de login (OAuth) com o endereço de produção

- **Antes:** o endereço do sistema precisa estar decidido (passo 10). Com endereço `run.app` do Cloud Run, ele só é conhecido depois do primeiro deploy: nesse caso, faça este passo **depois** que a pessoa técnica criar o serviço e passar o endereço.
- **Onde:** ☰ → **APIs e serviços** → **Credenciais** → **Criar credenciais** → **ID do cliente OAuth** → tipo **Aplicativo da Web** (no console novo: *Google Auth Platform → Clientes → Criar cliente*).
- **Faça:**
  - nome: `Sistema SciTec (producao)`;
  - **URIs de redirecionamento autorizados:** exatamente `https://ENDEREÇO-DO-SISTEMA/api/auth/callback/google` (troque `ENDEREÇO-DO-SISTEMA`; sem barra no final). Só o endereço de produção, nada de `localhost`. Para desenvolvimento a equipe usa outro cliente;
  - "Origens JavaScript autorizadas": pode deixar em branco;
  - o Google avisa que a mudança pode levar de minutos a algumas horas para valer.
- **Anote:** o **ID do cliente** (termina em `.apps.googleusercontent.com`). Ele **não é secreto**: pode ir por chat da equipe.
- **Segredo do cliente ("client secret"): É SEGREDO.** Copie **direto** para o Secret Manager (passo 9), no segredo `scitec-auth-google-secret`. Não envie a ninguém, não salve em arquivo, não tire print.
- Se precisar mudar o endereço depois, edite o cliente e troque o URI de redirecionamento (senão ninguém consegue entrar).

### 8. Chaves de API (Places, PageSpeed, Gemini): restringir e limitar

As chaves são **opcionais**: sem elas o sistema funciona (sem Google Places; sem IA; PageSpeed com cota menor). Crie só as que a diretoria quiser usar. **Uma chave para cada API, nunca uma chave única para tudo.**

**Para cada chave:**

1. **Ativar a API** em ☰ → *APIs e serviços* → *Biblioteca*: **Places API (New)**, **PageSpeed Insights API**. Para o Gemini, crie a chave no **Google AI Studio** (`aistudio.google.com`) vinculada a este mesmo projeto.
2. **Criar a chave** em *APIs e serviços → Credenciais → Criar credenciais → Chave de API*. Dê um nome claro (`places-producao`, `pagespeed-producao`).
3. **Restringir por API** (*Restrições de API → Restringir chave*): escolha **só** a API daquela chave. Uma chave de Places que não serve para mais nada vale pouco se vazar. Sobre "restrição de aplicativo": o sistema chama as APIs a partir do servidor no Cloud Run, que **não tem IP fixo** por padrão; por isso não use restrição por IP nem por site (referenciador). A restrição por API é a que vale.
4. **Limite diário** (*APIs e serviços → [a API] → Cotas e limites do sistema*): reduza a cota diária para um valor baixo. O Google permite definir limites diários por API (o limite é um teto rígido: ao atingi-lo, a API para de responder até o dia seguinte). Sugestão inicial, a ajustar com o uso:
   - Places API (New): **100 requisições/dia** (o sistema já tem teto próprio de 1.000 por mês);
   - PageSpeed Insights: **500 requisições/dia** (teto próprio de 5.000 por mês);
   - Gemini: no **AI Studio**, defina um **teto de gasto mensal do projeto** (recurso de "spend cap" anunciado pelo Google em 2026; confira o nome atual da opção) e mantenha o teto do próprio sistema (1.000 chamadas por mês). As chaves criadas no AI Studio hoje já vêm restritas à API Gemini; o Gemini rejeita chaves "soltas" sem restrição.
5. **Guardar a chave** direto no Secret Manager (passo 9). Não cole em lugar nenhum.

**Cuidados:**

- Há relatos públicos de contas que receberam cobrança alta porque uma chave **sem restrição** passou a funcionar também na API de IA quando ela foi ativada no projeto. Por isso: chaves restritas, uma por API, e só ative APIs que o sistema usa.
- Se uma chave vazar: *Credenciais → a chave → Excluir* (ou gerar nova), atualizar o segredo e avisar a pessoa técnica.
- **Não compartilhe:** o valor das chaves.

### 9. Banco de dados (Neon) e Secret Manager

**9.1 Neon (banco de dados).** A pessoa técnica pode orientar, mas a **conta e o pagamento** são da SciTec jr., então o dono da conta deve ser você (ou a diretoria), não uma pessoa de passagem.

- **Onde:** `neon.com` → criar conta com e-mail da diretoria → criar projeto → **região: AWS São Paulo (`aws-sa-east-1`)** (a região não pode ser mudada depois) → nome do banco `scitec`.
- **Faça:** copie **duas** strings de conexão (botão **Connect**): uma **com** "Connection pooling" ligado (para o sistema) e outra **sem** (para as migrações). Ver `DEPLOY-BANCO.md`.
- **Anote:** nome do projeto Neon, região e plano escolhido. Confira no painel do Neon o prazo de recuperação de dados do plano.
- **Essas strings têm senha: são SEGREDO.** Cole-as direto no Secret Manager (abaixo).

**9.2 Secret Manager.**

- **Onde:** ☰ → **Segurança** → **Secret Manager** → **Criar segredo**.
- **Crie estes segredos (nomes exatos) e cole o valor em cada um:**

| Nome do segredo | O que colar | Quem gera |
|---|---|---|
| `scitec-database-url` | string do Neon **com** pooler | você, do painel do Neon |
| `scitec-database-url-direct` | string do Neon **sem** pooler | você, do painel do Neon |
| `scitec-auth-secret` | texto aleatório de 32+ caracteres | a pessoa técnica gera no computador dela (`openssl rand -base64 33`) e **cola no Secret Manager ao seu lado**, ou você gera com o Cloud Shell e cola |
| `scitec-auth-google-secret` | "client secret" do passo 7 | você, do console do Google |
| `scitec-places-api-key` (opcional) | chave do passo 8 | você |
| `scitec-gemini-api-key` (opcional) | chave do passo 8 | você |
| `scitec-pagespeed-api-key` (opcional) | chave do passo 8 | você |

- **Depois de criar:** a pessoa técnica autoriza as contas do sistema a **ler** cada segredo (comandos em `DEPLOY-CLOUD-RUN.md`); ela **não precisa ver os valores**.
- **Anote:** só a lista de nomes criados e a data.
- **Não compartilhe:** os valores, nem por print da tela de criação.

### 10. Endereço do sistema e administradores

- **Decida:**
  - **Opção simples:** usar o endereço gratuito do Cloud Run (`https://...run.app`), com HTTPS automático. Serve para começar.
  - **Endereço próprio** (ex.: `sistema.scitecjr.com`): exige um balanceador de carga do Google (tem custo mensal fixo) e um registro no DNS do domínio `scitecjr.com`, que **só o administrador do domínio pode criar** (você). A pessoa técnica informa o valor do registro a criar.
- **Administradores iniciais (`ADMIN_EMAILS`):** os e-mails que entrarão direto como Presidente (por exemplo o seu). Depois do primeiro acesso, os demais são aprovados pela tela de equipe do próprio sistema.
- **Anote:** o endereço escolhido e a lista de e-mails administradores.
- **Não compartilhe:** nada secreto.

### 11. Alertas e rotina mensal

- Escolha **duas pessoas** para receber os alertas de orçamento (passo 4) e para olhar o custo uma vez por mês: *Faturamento → Relatórios*. Se o gasto passar do esperado, veja primeiro os limites das chaves (passo 8).
- Combine quem **troca segredos** se alguém sair da diretoria (chaves, senha do banco, "client secret"): toda saída de pessoa que teve acesso é motivo para trocar.
- **Anote:** nomes e e-mails das duas pessoas.

### 12. O que devolver para a pessoa técnica (e por qual canal)

**Pode ir pelo chat da equipe ou documento interno (não são segredos):**

| Item | Exemplo |
|---|---|
| ID e número do projeto | `scitec-sistema-123456` / `123456789012` |
| Confirmação: faturamento vinculado e orçamento criado | sim/não, valor do orçamento |
| Confirmação: tela de login "Interna" | sim/não |
| Client ID do login do Google | `...apps.googleusercontent.com` |
| Endereço escolhido (`run.app` ou domínio) | `https://sistema.scitecjr.com` |
| Lista de `ADMIN_EMAILS` | `voce@scitecjr.com` |
| Nomes dos segredos criados no Secret Manager | `scitec-database-url`, `scitec-auth-secret`, ... |
| Região do Neon e plano | `aws-sa-east-1`, plano X |
| Quem recebe alertas | dois e-mails |

**NÃO devolver por chat, e-mail ou print (vão só para o Secret Manager, digitados por você):** senha do banco e strings de conexão, `AUTH_SECRET`, "client secret" do Google, chaves de API do Places, PageSpeed e Gemini.

**Canal seguro, em ordem de preferência:**

1. **Direto no Secret Manager**, por você (nenhuma pessoa recebe o valor);
2. gerenciador de senhas da diretoria com compartilhamento controlado;
3. pessoalmente, digitado na hora, sem registrar em lugar nenhum.

**Depois do deploy, confirme:** o acesso temporário da pessoa técnica (passo 5) foi removido e o teste de login funcionou com uma conta `@scitecjr.com` (e **não** funcionou com uma conta de fora, como `@gmail.com`).

---

Fontes conferidas para este guia: documentação do Google sobre [orçamentos e alertas do Cloud Billing](https://cloud.google.com/billing/docs/how-to/budgets) (orçamentos avisam, não limitam o uso; destinatários padrão e e-mails extras via canal do Monitoring), [limitar o uso de APIs](https://support.google.com/googleapi/answer/7035610) (limites diários por API), [chaves da API Gemini](https://ai.google.dev/gemini-api/docs/api-key) (chaves do AI Studio restritas à API Gemini; chaves sem restrição são rejeitadas), [tela de consentimento OAuth "Interno"](https://developers.google.com/workspace/guides/configure-oauth-consent) (exige projeto dentro de uma organização) e [regiões do Neon](https://neon.com/docs/introduction/regions). Nomes de menus e valores sugeridos (R$ 150, 100/dia, 500/dia) são pontos de partida, não exigências.
