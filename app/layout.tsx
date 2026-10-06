import type { Metadata } from 'next';
import './globals.css';
import { ClientToaster } from '@/components/ui/ClientToaster';
import { ProfileProvider } from '@/contexts/ProfileContext';

export const metadata: Metadata = {
  title: { default: 'Início · SciTec Jr. OS', template: '%s · SciTec Jr. OS' },
  description: 'Sistema interno da SciTec Jr.: funis, tarefas, solicitações, painéis e ferramentas de Negócios.',
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
