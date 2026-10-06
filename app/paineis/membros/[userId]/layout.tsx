import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Painel do membro' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
