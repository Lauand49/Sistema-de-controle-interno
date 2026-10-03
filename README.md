# 🚀 SciTec jr. - Sistema Operacional Integrado

Sistema interno completo de gestão operacional, funis de processos (estilo Pipefy) e ferramentas setoriais integradas da **SciTec jr.**

---

## 🏢 Visão Geral & Diretorias

O sistema atende as 4 diretorias da Empresa Júnior em um ambiente unificado, com auditoria compartilhada e controle de permissões:

1. **💼 Negócios (Comercial, Prospecção e CRM):**
   - Funis comerciais de vendas e diagnóstico.
   - Painel interno exclusivo de **Leads Designados** com distribuição por consultor.
   - **Ferramentas de Negócios:** Motor de Simulação & Precificação Científica de Projetos (com modificadores de complexidade, urgência e porte), Triagem Rápida de Leads (aprovação ágil) e Planilha Dinâmica de Importação/Anotação (Excel/CSV).

2. **⚖️ AdmJurFin (Administrativo, Jurídico e Financeiro):**
   - Gestão de contratos, minutas e fluxo financeiro da EJ.
   - **Ferramentas de AdmJurFin:** Painel Financeiro & Extrato Operacional em tempo real, Gerador de Minutas Contratuais (Prestação de Serviços, Voluntariado, NDA), Emissor de Faturas/Recibos PJ e Simulador Tributário.

3. **👥 Gente (Gestão de Pessoas, RH e Desempenho):**
   - Funil de Recrutamento & Seleção e Onboarding de novos membros.
   - **Quadro Livre de Tarefas:** Gestão flexível em formato visual de cartões sem obrigatoriedade de etapas de funil.
   - **Ferramentas de Gente:** Painel de Ocupação & PDI, Calculadora de Banco de Horas, Matriz de Avaliação 360° e Emissor de Certificados de Membro.

4. **🎨 Mídias (Marketing, Produção de Conteúdo e Design):**
   - Funil de criação de artes, briefings e aprovação de posts.
   - **Ferramentas de Mídias:** Calendário Editorial de Publicações (Instagram, LinkedIn, Blog), Brand Kit Oficial com ativos visuais, Gerador de Briefings & Copywriting AI e Central de Campanhas.

---

## 🔐 Acesso, Hierarquia & Permissões

- **Login somente com Google Workspace `@scitecjr.com`** (Auth.js). O domínio é verificado no servidor (`email_verified` + claim `hd` + sufixo do e-mail); o parâmetro `hd` do Google é só uma dica visual.
- **Primeiro acesso = PENDENTE**: a pessoa só vê "Aguardando aprovação" até um Gerente de Departamento (ou a Presidência) aprová-la no seu departamento. E-mails em `ADMIN_EMAILS` entram direto como Presidente.
- **Estrutura**: cada pessoa pertence a **um departamento** (Negócios, AdmJurFin, Gente, Mídias) e pode participar de **vários setores** (Tecnologia e Software, Engenharia e Inovação, Design e Concepção, Ciência e Consultoria, Dados e Inteligência).
- **Tipos**: Presidente, Vice-presidente, Gerente de Departamento, Gerente de Setor e Assessor. Um gerente por departamento e um por setor (garantido no banco).
- **Permissões verificadas no servidor em todas as APIs**. A matriz vive em um único arquivo, `lib/permissions.ts`, usado pelo servidor e pela interface.
- Mudanças de cargo/vínculo/status ficam no **AuditLog** (Equipe → Auditoria). Contas saem por desativação, não exclusão.

---

## 🛠️ Tecnologias Utilizadas

- **Framework:** [Next.js 14](https://nextjs.org/) (App Router, Server Components & Route Handlers)
- **Linguagem:** [TypeScript](https://www.typescriptlang.org/)
- **Estilização:** [Tailwind CSS](https://tailwindcss.com/)
- **Banco de Dados & ORM:** [Prisma ORM](https://www.prisma.io/) com PostgreSQL (Neon em produção)
- **Autenticação:** [Auth.js](https://authjs.dev/) (NextAuth v5) com Google
- **Drag & Drop:** [@dnd-kit](https://dndkit.com/)
- **Ícones & UI:** [Lucide React](https://lucide.dev/), [Sonner](https://sonner.emilkowal.ski/)
- **Planilhas:** [XLSX (SheetJS)](https://sheetjs.com/)

---

## 📦 Como Instalar e Rodar Localmente

### 1. Clonar o repositório
```bash
git clone https://github.com/SEU_USUARIO/scitec-jr-os.git
cd scitec-jr-os
```

### 2. Instalar dependências
```bash
npm install
```

### 3. Subir um Postgres local
Qualquer Postgres 14+ serve. Exemplo com Homebrew (macOS):
```bash
brew install postgresql@16
brew services start postgresql@16
/opt/homebrew/opt/postgresql@16/bin/createdb scitec_dev
```

### 4. Configurar variáveis de ambiente
```bash
cp .env.example .env
```
Preencha `DATABASE_URL` e `AUTH_SECRET` (`npx auth secret`). Para testar sem Google, use `DEV_LOGIN="true"`: no modo desenvolvimento aparece um login que aceita qualquer e-mail `@scitecjr.com` sem senha. Ele não existe no build de produção.

### 5. Criar as tabelas e popular dados de exemplo
```bash
npm run db:setup   # prisma migrate deploy + seed
```
O seed cria o Presidente de referência (`joao.vaz@scitecjr.com`), uma Vice, gerentes, assessores e um usuário pendente.

> Mudou o `schema.prisma`? Gere a migração com `npm run db:migrate:dev -- --name descricao` e confira se o SQL não remove os índices parciais `User_one_manager_per_department` e `SectorMember_one_manager_per_sector` (ver comentário no topo do schema).

### 6. Iniciar o servidor de desenvolvimento
```bash
npm run dev
```

Acesse no navegador: **[http://localhost:3000](http://localhost:3000)**

---

## 📜 Scripts Disponíveis

- `npm run dev`: Inicia o servidor Next.js em modo desenvolvimento.
- `npm run build`: Gera o build otimizado de produção.
- `npm run start`: Executa o servidor compilado em produção.
- `npm run prisma:generate`: Regenera os tipos do Prisma Client.
- `npm run db:migrate`: Aplica as migrações pendentes (`prisma migrate deploy`).
- `npm run db:migrate:dev`: Cria uma nova migração a partir do schema.
- `npm run db:seed`: Recria os dados de exemplo (apaga os dados atuais).
- `npm run db:setup`: Migrações + seed.
- `npm test`: Roda os testes (Vitest), sem acesso à rede.
- `npm run test:watch`: Testes em modo observação.

---

## ⛏️ Minerador de Leads

Em **Ferramentas → Minerador de Leads** (Negócios e Presidência): busca empresas por bairro/cidade/UF e nicho no OpenStreetMap, analisa o site de cada uma, calcula um score e acumula tudo numa base única com ranking, mapa, ficha, atribuição de responsável, envio para a triagem e exportação CSV.

- `GEMINI_API_KEY` (opcional): ativa a análise por IA. Sem ela, as minerações rodam sem IA. `GEMINI_MODEL` e `GEMINI_MONTHLY_LIMIT` também são opcionais (ver `.env.example`).
- Testes de integração com Postgres: `RUN_DB_TESTS=1 npm test` (usa `DATABASE_URL_TEST` ou `DATABASE_URL`).
- Detalhes e limitações: `docs/PLANO-INTEGRACAO.md` (seção 8.2) e `.kiro/specs/lead-miner/`.

---

Desenvolvido para a **SciTec jr.** 🚀
