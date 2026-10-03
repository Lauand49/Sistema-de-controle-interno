/**
 * Cliente falso do PageSpeed Insights v5 por roteiro — contrato `PageSpeedHttp` do design
 * (`pagespeed.ts`): `run(query, timeoutMs)` resolve `{ status, json }`; rejeita em rede/timeout.
 */
import { scriptRunner, type ScriptStep, type Sleep } from './scripted';

export interface PageSpeedHttpLike {
  run(query: URLSearchParams, timeoutMs: number): Promise<{ status: number; json: unknown }>;
}

export interface PageSpeedCall {
  query: URLSearchParams;
  timeoutMs: number;
}

export interface FakePageSpeed extends PageSpeedHttpLike {
  calls: PageSpeedCall[];
  remaining(): number;
}

/** @param log recebe `pagespeed:<url>` a cada chamada. */
export function fakePageSpeed(
  script: ReadonlyArray<ScriptStep<PageSpeedCall>>,
  opts: { sleep?: Sleep; log?: string[] } = {},
): FakePageSpeed {
  const runner = scriptRunner<PageSpeedCall>('fakePageSpeed', script, opts.sleep);
  return {
    calls: runner.calls,
    remaining: runner.remaining,
    run(query, timeoutMs) {
      opts.log?.push(`pagespeed:${query.get('url') ?? ''}`);
      return runner.run({ query: new URLSearchParams(query), timeoutMs }, timeoutMs);
    },
  };
}

export interface LighthouseValues {
  /** Notas 0–1 (como a API devolve); `null` omite a categoria. */
  performance?: number | null;
  accessibility?: number | null;
  bestPractices?: number | null;
  seo?: number | null;
  lcp?: number | null;
  cls?: number | null;
  tbt?: number | null;
  fcp?: number | null;
}

/** Corpo JSON no formato `lighthouseResult` da API v5. */
export function lighthouseJson(v: LighthouseValues = {}): unknown {
  const values = {
    performance: 0.42, accessibility: 0.9, bestPractices: 0.8, seo: 0.75,
    lcp: 4200.4, cls: 0.1234, tbt: 350.6, fcp: 1800.2,
    ...v,
  };
  const categories: Record<string, { score: number }> = {};
  if (values.performance != null) categories.performance = { score: values.performance };
  if (values.accessibility != null) categories.accessibility = { score: values.accessibility };
  if (values.bestPractices != null) categories['best-practices'] = { score: values.bestPractices };
  if (values.seo != null) categories.seo = { score: values.seo };
  const audits: Record<string, { numericValue: number }> = {};
  if (values.lcp != null) audits['largest-contentful-paint'] = { numericValue: values.lcp };
  if (values.cls != null) audits['cumulative-layout-shift'] = { numericValue: values.cls };
  if (values.tbt != null) audits['total-blocking-time'] = { numericValue: values.tbt };
  if (values.fcp != null) audits['first-contentful-paint'] = { numericValue: values.fcp };
  return { lighthouseResult: { categories, audits } };
}
