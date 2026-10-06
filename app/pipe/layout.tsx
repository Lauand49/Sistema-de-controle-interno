import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Funil de Negócios' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
