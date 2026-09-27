import type { Metadata } from 'next';
import './globals.css';
import { ClientToaster } from '@/components/ui/ClientToaster';
import { ProfileProvider } from '@/contexts/ProfileContext';

export const metadata: Metadata = {
  title: 'Gestão de Processos & Vendas | Empresa Júnior',
  description: 'Sistema interno de gerenciamento de processos e funil de vendas (Pipefy style)',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="overflow-x-hidden max-w-full">
      <body className="antialiased bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 min-h-screen overflow-x-hidden max-w-full w-full">
        <ClientToaster />
        <ProfileProvider>{children}</ProfileProvider>
      </body>
    </html>
  );
}
