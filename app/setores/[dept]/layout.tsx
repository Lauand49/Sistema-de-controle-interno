import type { Metadata } from 'next';
import { isUnitCode, unitName } from '@/lib/permissions';

export async function generateMetadata({ params }: { params: { dept: string } }): Promise<Metadata> {
  const code = String(params.dept ?? '').toUpperCase();
  return { title: isUnitCode(code) ? unitName(code) : 'Setor' };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
