import React from 'react';
import { CheckCircle2, KeyRound, Gauge, type LucideIcon } from 'lucide-react';
import type { ServicesStatus } from '@/lib/leads/client-api';
import { unavailableLabel, usageSummary } from './enrichment-helpers';

/**
 * Estado dos Servicos_Externos na Tela_Minerar (Req. 2.6, 2.7): Google Places, PageSpeed
 * Insights e IA (Gemini), cada um com ícone, texto de estado ("disponível" / "chave não
 * configurada" / "cota mensal esgotada") e "N de M chamadas" do mês.
 */
export interface ServiceStatusPanelProps {
  services: ServicesStatus | null;
  loading?: boolean;
  className?: string;
}

interface Line {
  nome: string;
  icon: LucideIcon;
  available: boolean;
  motivo: 'SEM_CHAVE' | 'COTA_ESGOTADA' | null;
  usados: number;
  limite: number;
  /** PageSpeed funciona sem chave, com cota reduzida (Req. 2.7). */
  nota?: string;
}

export const ServiceStatusPanel: React.FC<ServiceStatusPanelProps> = ({ services, loading, className = '' }) => {
  if (loading) {
    return (
      <div className={`rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400 ${className}`}>
        Verificando os serviços externos…
      </div>
    );
  }
  if (!services) return null;

  const lines: Line[] = [
    { nome: 'Google Places', icon: Gauge, ...pick(services.places) },
    {
      nome: 'PageSpeed Insights',
      icon: Gauge,
      ...pick(services.pagespeed),
      nota: services.pagespeed.semChave ? 'Sem chave: usa a cota reduzida do Google' : undefined,
    },
    { nome: 'IA (Gemini)', icon: Gauge, ...pick(services.gemini) },
  ];

  return (
    <section
      aria-label="Estado dos serviços externos"
      className={`rounded-2xl border border-slate-800 bg-slate-900/60 p-4 ${className}`}
    >
      <h3 className="mb-3 text-sm font-semibold text-slate-200">Serviços externos</h3>
      <ul className="space-y-2">
        {lines.map((l) => {
          const Icon = l.available ? CheckCircle2 : KeyRound;
          const estado = l.available ? 'disponível' : unavailableLabel(l.motivo);
          return (
            <li key={l.nome} className="flex items-start justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-slate-300">
                <Icon
                  className={`h-4 w-4 shrink-0 ${l.available ? 'text-emerald-400' : 'text-amber-400'}`}
                  aria-hidden="true"
                />
                <span>
                  {l.nome}
                  {l.nota ? <span className="block text-xs text-slate-400">{l.nota}</span> : null}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className={l.available ? 'text-emerald-400' : 'text-amber-400'}>{estado}</span>
                <span className="block text-xs text-slate-400">{usageSummary(l.usados, l.limite)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

function pick(s: ServicesStatus['places']): Pick<Line, 'available' | 'motivo' | 'usados' | 'limite'> {
  return { available: s.available, motivo: s.motivo, usados: s.usados, limite: s.limite };
}

export default ServiceStatusPanel;
