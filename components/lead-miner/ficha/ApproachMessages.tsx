'use client';
import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, MessageSquarePlus, Send } from 'lucide-react';
import {
  isLeadMinerApiError,
  leadMinerApi,
  type ApproachChannel,
  type ApproachMessageDto,
} from '@/lib/leads/client-api';
import { Muted, Section } from './Section';
import { fallbackLabel } from '@/components/lead-miner/enrichment-helpers';
import { formatDateTime } from './ficha-helpers';

/**
 * Seção "Mensagens de abordagem" (Req. 15). Visível quando há Analise. Seletor de canal, botão
 * "Gerar mensagem de abordagem" desabilitado durante a geração (`useRef` + estado), mensagem
 * exibida com "Copiar" e histórico (canal/origem/autor/data), "Abrir no WhatsApp" e a nota de
 * fallback quando a mensagem veio do modelo padrão.
 */
export interface ApproachMessagesProps {
  companyId: string;
  initialMessages: ApproachMessageDto[];
}

const CHANNEL_LABEL: Record<ApproachChannel, string> = { WHATSAPP: 'WhatsApp', EMAIL: 'E-mail' };

export const ApproachMessages: React.FC<ApproachMessagesProps> = ({ companyId, initialMessages }) => {
  const [canal, setCanal] = useState<ApproachChannel>('WHATSAPP');
  const [messages, setMessages] = useState<ApproachMessageDto[]>(initialMessages);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const generate = async () => {
    if (busyRef.current) return; // cliques repetidos → uma só requisição (Req. 15.9)
    busyRef.current = true;
    setBusy(true);
    try {
      const { message } = await leadMinerApi.generateApproach(companyId, canal);
      setMessages((prev) => [message, ...prev]);
      toast.success('Mensagem gerada');
    } catch (e) {
      if (isLeadMinerApiError(e) && e.status === 409) {
        toast.info('Empresa ainda não analisada');
      } else {
        toast.error('Não foi possível gerar a mensagem', {
          description: isLeadMinerApiError(e) ? e.message : 'Tente novamente.',
        });
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const copy = async (m: ApproachMessageDto) => {
    const texto = m.assunto ? `${m.assunto}\n\n${m.texto}` : m.texto;
    try {
      await navigator.clipboard.writeText(texto);
      toast.success('Mensagem copiada');
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  return (
    <Section
      id="ficha-abordagem"
      title="Mensagens de abordagem"
      icon={<MessageSquarePlus className="h-5 w-5 text-purple-400" aria-hidden="true" />}
      actions={
        <div className="flex items-center gap-2">
          <label htmlFor="approach-canal" className="sr-only">
            Canal da mensagem
          </label>
          <select
            id="approach-canal"
            value={canal}
            onChange={(e) => setCanal(e.target.value as ApproachChannel)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <option value="WHATSAPP">WhatsApp</option>
            <option value="EMAIL">E-mail</option>
          </select>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy}
            aria-busy={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />}
            {busy ? 'Gerando…' : 'Gerar mensagem de abordagem'}
          </button>
        </div>
      }
    >
      {messages.length === 0 ? (
        <p className="text-sm">
          <Muted>Nenhuma mensagem gerada ainda.</Muted>
        </p>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => {
            const fb = fallbackLabel(m.fallback);
            return (
              <li key={m.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-slate-700 px-2 py-0.5 font-semibold text-slate-300">
                      {CHANNEL_LABEL[m.canal]}
                    </span>
                    <span>{m.origem === 'IA' ? 'Gerada por IA' : 'Modelo padrão'}</span>
                    <span>· {m.author.name || 'autor desconhecido'}</span>
                    <span>· {formatDateTime(m.createdAt) ?? '—'}</span>
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void copy(m)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 font-semibold text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copiar
                    </button>
                    {m.canal === 'WHATSAPP' && m.whatsappLink && (
                      <a
                        href={m.whatsappLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-2 py-1 font-semibold text-emerald-300 hover:bg-emerald-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                      >
                        <Send className="h-3.5 w-3.5" aria-hidden="true" /> Abrir no WhatsApp
                        <span className="sr-only"> (abre em nova aba)</span>
                      </a>
                    )}
                  </span>
                </div>
                {m.assunto && <p className="mb-1 text-sm font-semibold text-slate-200">Assunto: {m.assunto}</p>}
                <p className="whitespace-pre-wrap text-sm text-slate-200">{m.texto}</p>
                {fb && <p className="mt-2 text-xs text-amber-400/90">{fb}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
};

export default ApproachMessages;
