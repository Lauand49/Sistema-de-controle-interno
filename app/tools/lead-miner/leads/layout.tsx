import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Ranking de empresas' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
