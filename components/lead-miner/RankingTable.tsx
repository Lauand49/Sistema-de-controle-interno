'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { AtSign, Globe, Loader2, Lock, Mail, MessageCircle, Unlock } from 'lucide-react';
import { CATEGORY_LABEL, NICHES } from '@/lib/leads/config';
import type { CompanyRow } from '@/lib/leads/client-api';
import { PriorityBadge } from './PriorityBadge';
import { EvaluationView } from './EvaluationView';
import { GoogleAttribution } from './GoogleAttribution';
import { situacaoAlert } from './enrichment-helpers';
import { LEAD_STATUS_LABEL, formatDate, isAnalyzing, pageSelectionState } from './ranking-helpers';

const NICHE_LABEL = new Map(NICHES.map((n) => [n.id, n.label]));

const CHECKBOX =
  'h-4 w-4 rounded border-slate-600 bg-slate-900 accent-purple-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500';

interface RankingTableProps {
  rows: CompanyRow[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onTogglePage: () => void;
  /** Posição do primeiro item da página (para a coluna "#"). */
  offset: number;
  /** T3: mineração filtrada ainda em andamento; linhas sem análise mostram "analisando…". */
  live?: boolean;
  /** T5: aba "Sem contato" — mostra a avaliação básica (resumo + sugestão) de cada lead. */
  showEvaluation?: boolean;
}

function place(r: CompanyRow): string {
  const cidadeUf = [r.cidade, r.uf].filter(Boolean).join('/');
  return [r.bairro, cidadeUf].filter(Boolean).join(', ') || '—';
}

/** Telefone e canais conhecidos (OSM/Google/análise); "—" quando não há nenhum. */
const ContactCell: React.FC<{ row: CompanyRow }> = ({ row }) => {
  const badges: Array<{ key: string; label: string; Icon: typeof Mail }> = [];
  if (row.contatoWhatsapp) badges.push({ key: 'wa', label: 'WhatsApp', Icon: MessageCircle });
  if (row.contatoInstagram) badges.push({ key: 'ig', label: 'Instagram', Icon: AtSign });
  if (row.contatoEmail) badges.push({ key: 'em', label: 'E-mail', Icon: Mail });
  if (!row.telefone && badges.length === 0) return <span className="text-slate-500">—</span>;
  return (
    <div className="space-y-1">
      {row.telefone && <p className="whitespace-nowrap text-slate-200">{row.telefone}</p>}
      {badges.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Canais de contato">
          {badges.map(({ key, label, Icon }) => (
            <li
              key={key}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-300"
            >
              <Icon className="h-3 w-3" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Listagem do ranking com seleção por linha (Req. 12.1, 12.5, 19.7). */
export const RankingTable: React.FC<RankingTableProps> = ({ rows, selected, onToggle, onTogglePage, offset, live = false, showEvaluation = false }) => {
  const headerRef = useRef<HTMLInputElement>(null);
  const pageState = pageSelectionState(
    selected,
    rows.map((r) => r.id),
  );

  useEffect(() => {
    if (headerRef.current) headerRef.current.indeterminate = pageState === 'some';
  }, [pageState]);

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
      <table className="w-full min-w-[960px] text-left text-sm">
        <caption className="sr-only">Empresas ordenadas por score</caption>
        <thead className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th scope="col" className="w-10 px-4 py-3">
              <input
                ref={headerRef}
                type="checkbox"
                className={CHECKBOX}
                checked={pageState === 'all'}
                onChange={onTogglePage}
                aria-label="Selecionar todas as empresas desta página"
              />
            </th>
            <th scope="col" className="w-10 px-2 py-3">
              #
            </th>
            <th scope="col" className="px-3 py-3">
              Empresa
            </th>
            <th scope="col" className="px-3 py-3">
              Local
            </th>
            <th scope="col" className="px-3 py-3">
              Contato
            </th>
            <th scope="col" className="px-3 py-3">
              Site
            </th>
            {showEvaluation && (
              <th scope="col" className="px-3 py-3">
                Avaliação
              </th>
            )}
            <th scope="col" className="px-3 py-3">
              Categoria
            </th>
            <th scope="col" className="px-3 py-3 text-right">
              Score
            </th>
            <th scope="col" className="px-3 py-3">
              Prioridade
            </th>
            <th scope="col" className="px-3 py-3">
              Responsável
            </th>
            <th scope="col" className="px-3 py-3">
              Triagem
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((r, i) => {
            const isSelected = selected.has(r.id);
            return (
              <tr key={r.id} className={isSelected ? 'bg-purple-950/30' : 'hover:bg-slate-800/40'}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    className={CHECKBOX}
                    checked={isSelected}
                    onChange={() => onToggle(r.id)}
                    aria-label={`Selecionar ${r.nome}`}
                  />
                </td>
                <td className="px-2 py-3 text-xs text-slate-500">{offset + i + 1}</td>
                <td className="px-3 py-3">
                  <Link
                    href={`/tools/lead-miner/leads/${encodeURIComponent(r.id)}`}
                    className="rounded font-semibold text-white hover:text-purple-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                  >
                    {r.nome}
                  </Link>
                  <p className="text-xs text-slate-500">{NICHE_LABEL.get(r.nicho) ?? r.nicho}</p>
                  {(() => {
                    const sit = situacaoAlert(r.situacaoCadastral);
                    return sit && sit.alerta ? (
                      <span className={`mt-0.5 inline-block text-[11px] font-semibold ${sit.className}`}>{sit.label}</span>
                    ) : null;
                  })()}
                  {/* Nome/campos vindos do Cache_Google exigem a Atribuicao_Google na mesma célula (Req. 6.4). */}
                  {r.googleFields.length > 0 && <GoogleAttribution className="mt-0.5" />}
                </td>
                <td className="px-3 py-3 text-xs text-slate-300">{place(r)}</td>
                <td className="px-3 py-3 text-xs text-slate-300">
                  <ContactCell row={r} />
                </td>
                <td className="px-3 py-3 text-xs text-slate-300">
                  {r.hasSite === false || (!r.website && r.hasSite !== true) ? (
                    <span className="text-slate-500">Sem site</span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                      {r.isHttps === true ? (
                        <>
                          <Lock className="h-3.5 w-3.5 text-green-400" aria-hidden="true" /> HTTPS
                        </>
                      ) : r.isHttps === false ? (
                        <>
                          <Unlock className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" /> Sem HTTPS
                        </>
                      ) : (
                        'Não analisado'
                      )}
                    </span>
                  )}
                </td>
                {showEvaluation && (
                  <td className="min-w-[260px] max-w-sm px-3 py-3">
                    <EvaluationView avaliacao={r.avaliacao} />
                  </td>
                )}
                <td className="px-3 py-3 text-xs text-slate-300">{r.categoria ? CATEGORY_LABEL[r.categoria] : '—'}</td>
                <td className="px-3 py-3 text-right font-mono font-semibold text-white">
                  {isAnalyzing(r, live) ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-purple-800/60 bg-purple-950/40 px-2 py-0.5 font-sans text-[11px] font-semibold text-purple-200">
                      <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      analisando…
                    </span>
                  ) : (
                    (r.scoreFinal ?? '—')
                  )}
                </td>
                <td className="px-3 py-3">
                  <PriorityBadge prioridade={r.prioridade} />
                </td>
                <td className="px-3 py-3 text-xs text-slate-300">
                  {r.assignedUser?.name ?? <span className="text-slate-500">Sem responsável</span>}
                </td>
                <td className="px-3 py-3 text-xs text-slate-300">
                  {LEAD_STATUS_LABEL[r.prospectLead?.status ?? 'NONE'] ?? r.prospectLead?.status}
                  {r.lastAnalyzedAt && (
                    <p className="text-[11px] text-slate-500">Analisada em {formatDate(r.lastAnalyzedAt)}</p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default RankingTable;
