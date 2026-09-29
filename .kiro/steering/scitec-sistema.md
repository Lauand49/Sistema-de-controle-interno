---
inclusion: always
---

# Sistema Interno SciTec jr. — diretrizes do projeto

- O plano mestre de evolução do sistema está em #[[file:docs/PLANO-INTEGRACAO.md]]. Siga-o; ao concluir uma etapa, atualize a coluna "Status" da seção 8.
- Stack: Next.js 14 (App Router) + TypeScript + Tailwind + Prisma. Banco alvo: Postgres (Neon). Minerador de leads em TypeScript em `lib/leads/`.
- Acesso somente com e-mail `@scitecjr.com` (Google Workspace). Usuário de testes/bootstrap: `joao.vaz@scitecjr.com` (Presidente).
- Toda API deve verificar sessão e permissão **no servidor** usando `lib/permissions.ts` (fonte única da matriz de permissões). Nunca confiar em ids de usuário enviados pelo cliente.
- Manter o estilo visual existente: fundo `bg-slate-950`, destaques roxo/índigo (`from-purple-600 to-indigo-600`), cards `rounded-2xl` com `border-slate-800`, ícones `lucide-react`, toasts `sonner`. Textos da interface em português.
- Buscas textuais no Prisma devem usar `mode: 'insensitive'`.
- Antes de entregar qualquer etapa: `npm run build` deve passar. Trabalhe em branch própria e abra PR para `main`.
