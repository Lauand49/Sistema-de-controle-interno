import React from 'react';
import { Gauge } from 'lucide-react';
import type { PageSpeedAbsence, PageSpeedResult } from '@/lib/leads/types';
import { Muted, Section } from './Section';
import { pageSpeedAbsenceLabel, pageSpeedBand } from '@/components/lead-miner/enrichment-helpers';

/**
 * Seção "Desempenho (PageSpeed)" (Req. 17.2): quatro notas com rótulo de faixa em texto
 * ("Bom" ≥ 90, "Precisa melhorar" 50–89, "Ruim" < 50) e as métricas LCP, CLS, TBT e FCP;
 * sem resultado, exibe o motivo da ausência.
 */
export interface PageSpeedCardProps {
  pagespeed: PageSpeedResult | null;
  motivo: PageSpeedAbsence | null;
}

const SCORES: { key: keyof PageSpeedResult; label: string }[] = [
  { key: 'desempenho', label: 'Desempenho' },
  { key: 'acessibilidade', label: 'Acessibilidade' },
  { key: 'boasPraticas', label: 'Boas práticas' },
  { key: 'seo', label: 'SEO' },
];

function fmtMs(v: number | null): string {
  return v === null ? '—' : `${(v / 1000).toFixed(2)} s`;
}
function fmtCls(v: number | null): string {
  return v === null ? '—' : v.toFixed(3);
}

export const PageSpeedCard: React.FC<PageSpeedCardProps> = ({ pagespeed, motivo }) => (
  <Section
    id="ficha-pagespeed"
    title="Desempenho (PageSpeed)"
    icon={<Gauge className="h-5 w-5 text-purple-400" aria-hidden="true" />}
  >
    {pagespeed ? (
      <>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SCORES.map(({ key, label }) => {
            const value = pagespeed[key] as number | null;
            const band = pageSpeedBand(value);
            return (
              <li key={key} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className={`mt-1 text-2xl font-black ${band?.className ?? 'text-slate-400'}`}>
                  {value === null ? '—' : value}
                </p>
                <p className={`text-xs font-semibold ${band?.className ?? 'text-slate-500'}`}>
                  {band ? band.label : 'não avaliado'}
                </p>
              </li>
            );
          })}
        </ul>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">LCP</dt>
            <dd className="mt-0.5 text-slate-200">{fmtMs(pagespeed.lcpMs)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">CLS</dt>
            <dd className="mt-0.5 text-slate-200">{fmtCls(pagespeed.cls)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">TBT</dt>
            <dd className="mt-0.5 text-slate-200">{fmtMs(pagespeed.tbtMs)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">FCP</dt>
            <dd className="mt-0.5 text-slate-200">{fmtMs(pagespeed.fcpMs)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate-500">Estratégia mobile · PageSpeed Insights.</p>
      </>
    ) : (
      <p className="text-sm">
        <Muted>{pageSpeedAbsenceLabel(motivo)}</Muted>
      </p>
    )}
  </Section>
);

export default PageSpeedCard;
