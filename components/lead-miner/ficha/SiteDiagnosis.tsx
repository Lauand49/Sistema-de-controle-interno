import React from 'react';
import { CheckCircle2, Globe, XCircle } from 'lucide-react';
import type { CompanyAnalysis } from '@/lib/leads/client-api';
import { Field, Muted, Section } from './Section';
import { NO_SITE, NOT_INFORMED, categoryLabel, failureLabel, sslProblemLabel } from './ficha-helpers';

const YesNo: React.FC<{ ok: boolean; yes: string; no: string }> = ({ ok, yes, no }) => (
  <span className={`inline-flex items-center gap-1 ${ok ? 'text-green-300' : 'text-red-300'}`}>
    {ok ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
    {ok ? yes : no}
  </span>
);

/** Diagnóstico do site da análise mais recente (Req. 14.2). */
export const SiteDiagnosis: React.FC<{ analysis: CompanyAnalysis; companyHasWebsite: boolean }> = ({
  analysis: a,
  companyHasWebsite,
}) => {
  const noSite = !a.hasSite || !companyHasWebsite;
  const ssl = sslProblemLabel(a.sslProblem);

  return (
    <Section id="ficha-diagnostico" title="Diagnóstico do site" icon={<Globe className="h-5 w-5 text-purple-400" aria-hidden="true" />}>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {noSite ? (
          <Field label="Site">
            <span className="font-semibold text-amber-300">{NO_SITE}</span>
          </Field>
        ) : (
          <>
            <Field label="Disponibilidade">
              <YesNo ok={a.online} yes="online" no="offline" />
            </Field>
            {!a.online && <Field label="Motivo da falha">{failureLabel(a.motivoFalha)}</Field>}
            <Field label="Status HTTP">{a.statusCode ?? <Muted>{NOT_INFORMED}</Muted>}</Field>
            <Field label="HTTPS">
              <YesNo ok={a.isHttps} yes="usa HTTPS" no="sem HTTPS" />
            </Field>
            <Field label="Certificado SSL">
              <YesNo ok={a.sslValid} yes="válido" no={ssl ? `inválido (${ssl})` : 'inválido ou ausente'} />
            </Field>
            <Field label="Tempo de resposta">
              {a.responseTime !== null ? (
                <>
                  {a.responseTime} ms{a.lento && <span className="ml-1 text-amber-300">(lento)</span>}
                </>
              ) : (
                <Muted>{NOT_INFORMED}</Muted>
              )}
            </Field>
          </>
        )}
        <Field label="Categoria">
          <span className="font-semibold text-purple-200">{categoryLabel(a.categoria)}</span>
        </Field>
      </dl>
      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Motivos do classificador</h3>
        {a.motivos.length > 0 ? (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-200">
            {a.motivos.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm">
            <Muted>{NOT_INFORMED}</Muted>
          </p>
        )}
      </div>
    </Section>
  );
};

export default SiteDiagnosis;
