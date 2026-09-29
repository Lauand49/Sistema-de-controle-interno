import React from 'react';
import { Building2 } from 'lucide-react';
import type { CompanyDetail } from '@/lib/leads/client-api';
import { PriorityBadge } from '@/components/lead-miner/PriorityBadge';
import { Field, Muted } from './Section';
import { NOT_INFORMED, NOT_IN_TRIAGE, leadStatusText, nicheInfo, orNotInformed } from './ficha-helpers';

const SOURCE_LABEL: Record<string, string> = { OSM: 'OpenStreetMap', GOOGLE: 'Google', MISTA: 'Mista' };

/** Valor textual; marcadores de ausência aparecem apagados. */
const Val: React.FC<{ v: string | null | undefined }> = ({ v }) => {
  const t = orNotInformed(v);
  return t === NOT_INFORMED ? <Muted>{t}</Muted> : <>{t}</>;
};

/** Link seguro para o website (só http/https viram link). */
function websiteHref(url: string): string | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Cabeçalho da Ficha: dados cadastrais, Responsável e triagem (Req. 14.1). */
export const CompanyHeader: React.FC<{ company: CompanyDetail; claimSlot?: React.ReactNode }> = ({
  company,
  claimSlot,
}) => {
  const niche = nicheInfo(company.nicho);
  const website = company.website?.trim() || null;
  const href = website ? websiteHref(website) : null;
  const status = leadStatusText(company.prospectLead);

  return (
    <section
      aria-labelledby="ficha-nome"
      className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-950/60 to-purple-950/70 p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white">
            <Building2 className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <h1 id="ficha-nome" className="break-words text-2xl font-black tracking-tight text-white">
              {company.nome}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span>{niche.label}</span>
              {niche.tier !== null && (
                <span className="rounded-full border border-purple-700/60 bg-purple-950/70 px-2 py-0.5 font-semibold text-purple-300">
                  Tier {niche.tier}
                </span>
              )}
              <PriorityBadge prioridade={company.prioridade} />
              {company.scoreFinal !== null && (
                <span className="font-semibold text-slate-200">Score {company.scoreFinal}/100</span>
              )}
            </div>
          </div>
        </div>
        {claimSlot}
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Endereço">
          <Val v={company.endereco} />
        </Field>
        <Field label="Bairro">
          <Val v={company.bairro} />
        </Field>
        <Field label="Cidade">
          <Val v={company.cidade} />
        </Field>
        <Field label="UF">
          <Val v={company.uf} />
        </Field>
        <Field label="Telefone">
          {company.telefone?.trim() ? (
            <a
              href={`tel:${company.telefone.replace(/[^\d+]/g, '')}`}
              className="rounded text-purple-300 underline hover:text-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            >
              {company.telefone.trim()}
            </a>
          ) : (
            <Muted>{NOT_INFORMED}</Muted>
          )}
        </Field>
        <Field label="Website">
          {website && href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded text-purple-300 underline hover:text-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            >
              {website}
              <span className="sr-only"> (abre em nova aba)</span>
            </a>
          ) : (
            <Val v={website} />
          )}
        </Field>
        <Field label="Nicho">
          {niche.label}
          {niche.tier !== null ? ` (Tier ${niche.tier})` : ''}
        </Field>
        <Field label="Fonte">{SOURCE_LABEL[company.fonte] ?? company.fonte}</Field>
        {company.marcaRede?.trim() && <Field label="Marca / rede">{company.marcaRede.trim()}</Field>}
        <Field label="Responsável">
          <span aria-live="polite">
            {company.assignedUser ? company.assignedUser.name || NOT_INFORMED : <Muted>{NOT_INFORMED}</Muted>}
          </span>
        </Field>
        <Field label="Status na triagem">{status === NOT_IN_TRIAGE ? <Muted>{status}</Muted> : status}</Field>
      </dl>
    </section>
  );
};

export default CompanyHeader;
