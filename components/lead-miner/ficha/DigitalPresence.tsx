import React from 'react';
import { Instagram, MessageCircle, Cpu } from 'lucide-react';
import type { SinaisDigitais } from '@/lib/leads/types';
import { Field, Muted, Section } from './Section';
import { formatWhatsapp } from '@/components/lead-miner/enrichment-helpers';

/**
 * Seção "Presença digital" (Req. 17.1): Instagram (link), WhatsApp (número formatado) e
 * tecnologias agrupadas, com a origem de cada sinal; "não encontrado" para sinais ausentes.
 */
export interface DigitalPresenceProps {
  sinais: SinaisDigitais | null;
}

const SIGNAL_ORIGIN_LABEL: Record<string, string> = {
  SITE: 'site',
  OSM: 'OpenStreetMap',
};

function originNote(origem: string | null | undefined): string {
  return origem ? ` (via ${SIGNAL_ORIGIN_LABEL[origem] ?? origem.toLowerCase()})` : '';
}

/** Link de perfil do Instagram a partir do handle/URL guardado nos sinais. */
function instagramHref(value: string): string | null {
  const v = value.trim();
  if (v === '') return null;
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, '');
  return /^[A-Za-z0-9_.]+$/.test(handle) ? `https://instagram.com/${handle}` : null;
}

export const DigitalPresence: React.FC<DigitalPresenceProps> = ({ sinais }) => {
  const instagram = sinais?.instagram ?? null;
  const igHref = instagram ? instagramHref(instagram) : null;
  const whats = formatWhatsapp(sinais?.whatsapp);
  const tecnologias = sinais?.tecnologias ?? [];

  // Agrupa as tecnologias por grupo, preservando a ordem recebida.
  const grupos = new Map<string, string[]>();
  for (const t of tecnologias) {
    const list = grupos.get(t.group) ?? [];
    list.push(t.label);
    grupos.set(t.group, list);
  }

  return (
    <Section
      id="ficha-presenca"
      title="Presença digital"
      icon={<Cpu className="h-5 w-5 text-purple-400" aria-hidden="true" />}
    >
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Instagram">
          <span className="inline-flex items-center gap-1.5">
            <Instagram className="h-4 w-4 text-pink-400" aria-hidden="true" />
            {instagram ? (
              igHref ? (
                <a
                  href={igHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded text-purple-300 underline hover:text-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                >
                  {instagram}
                  <span className="sr-only"> (abre em nova aba)</span>
                </a>
              ) : (
                <span>{instagram}</span>
              )
            ) : (
              <Muted>não encontrado</Muted>
            )}
            {instagram && <span className="text-xs text-slate-400">{originNote(sinais?.instagramOrigem)}</span>}
          </span>
        </Field>
        <Field label="WhatsApp">
          <span className="inline-flex items-center gap-1.5">
            <MessageCircle className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            {whats ? <span>{whats}</span> : <Muted>não encontrado</Muted>}
            {whats && <span className="text-xs text-slate-400">{originNote(sinais?.whatsappOrigem)}</span>}
          </span>
        </Field>
      </dl>

      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tecnologias</h3>
        {grupos.size === 0 ? (
          <p className="mt-1 text-sm">
            <Muted>Nenhuma tecnologia detectada</Muted>
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {Array.from(grupos.entries()).map(([grupo, labels]: [string, string[]]) => (
              <li key={grupo}>
                <span className="text-xs font-semibold text-slate-400">{grupo}: </span>
                <span className="flex flex-wrap gap-1.5 pt-1">
                  {labels.map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-xs text-slate-200"
                    >
                      {label}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-400">Tecnologias detectadas no site da empresa.</p>
      </div>
    </Section>
  );
};

export default DigitalPresence;
