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

## 🔐 Hierarquia de Cargos & Permissões

- **Presidente:** Visão global e controle total sobre todos os setores, chamados, membros e ferramentas.
- **Gerentes:** Gestão de processos, atribuição de cards/leads e aprovações do seu respectivo setor.
- **Assessores:** Execução focada com permissões de alteração restritas ao seu setor de atuação, mantendo visualização institucional segura.

---

## 🛠️ Tecnologias Utilizadas

- **Framework:** [Next.js 14](https://nextjs.org/) (App Router, Server Components & Route Handlers)
- **Linguagem:** [TypeScript](https://www.typescriptlang.org/)
- **Estilização:** [Tailwind CSS](https://tailwindcss.com/)
- **Banco de Dados & ORM:** [Prisma ORM](https://www.prisma.io/) com SQLite
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

### 3. Configurar variáveis de ambiente
Crie um arquivo `.env` na raiz do projeto (ou copie do exemplo):
```bash
cp .env.example .env
```
O conteúdo padrão será:
```env
DATABASE_URL="file:./dev.db"
```

### 4. Inicializar o banco de dados e popular dados iniciais
```bash
# Aplica o schema Prisma no SQLite
npx prisma db push

# Popula o banco com os dados e membros da hierarquia SciTec jr.
npm run db:seed
```

### 5. Iniciar o servidor de desenvolvimento
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
- `npm run prisma:push`: Sincroniza o schema com o banco de dados.
- `npm run db:seed`: Popula pipes, usuários e cargos iniciais.

---

Desenvolvido para a **SciTec jr.** 🚀
