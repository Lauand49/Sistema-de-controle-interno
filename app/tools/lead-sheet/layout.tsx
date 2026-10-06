import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Ficha de leads' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
