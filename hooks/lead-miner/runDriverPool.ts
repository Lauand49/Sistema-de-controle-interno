/**
 * Conjunto de drivers, um por mineração (mapa `runId → driver`), sem React.
 *
 * Garante no máximo um laço — e portanto uma requisição — por mineração, permitindo várias
 * minerações em paralelo (Req. 8.15). Minerações que terminam saem do mapa de drivers, mas o
 * último estado continua disponível para exibição até `remove`.
 */
import type { RunProgress } from '@/lib/leads/client-api';
import { driveRun, isActiveStatus, type DriveResult, type DriveRunOptions, type RunDriverApi } from './driveRun';
import { applyDriveResult, initialRunState, type RunDriverState } from './runState';

export interface RunDriverPoolOptions {
  api: RunDriverApi;
  sleep?: DriveRunOptions['sleep'];
  onChange?: (states: RunDriverState[]) => void;
  /** Término observado; `sawActive` indica se a mineração esteve ativa durante o acompanhamento. */
  onOutcome?: (result: DriveResult, sawActive: boolean) => void;
}

export class RunDriverPool {
  private readonly opts: RunDriverPoolOptions;
  private order: string[] = [];
  private readonly states = new Map<string, RunDriverState>();
  private readonly drivers = new Map<string, AbortController>();
  private readonly sawActive = new Set<string>();
  private stopped = false;

  constructor(opts: RunDriverPoolOptions) {
    this.opts = opts;
  }

  /** Estados em ordem de exibição (mais recentes primeiro). */
  list(): RunDriverState[] {
    return this.order.map((id) => this.states.get(id)!).filter(Boolean);
  }

  /** Quantos laços estão em curso (útil em testes). */
  runningCount(): number {
    return this.drivers.size;
  }

  isRunning(runId: string): boolean {
    return this.drivers.has(runId);
  }

  /** Adiciona uma mineração (ex.: recém-criada ou `runId` de um 409) no topo da lista. */
  add(run: string | RunProgress): void {
    const id = typeof run === 'string' ? run : run.id;
    const progress = typeof run === 'string' ? null : run;
    const current = this.states.get(id);
    if (current && !current.done) {
      if (progress && !current.progress) this.setState(id, { ...current, progress });
      this.start(id);
      return;
    }
    this.order = [id, ...this.order.filter((x) => x !== id)];
    this.setState(id, initialRunState(id, progress));
    this.start(id);
  }

  /** Inclui (ao final) as minerações ativas ainda não acompanhadas, sem duplicar. */
  sync(runs: readonly RunProgress[]): void {
    let changed = false;
    for (const r of runs) {
      if (this.states.has(r.id)) continue;
      this.order.push(r.id);
      this.states.set(r.id, initialRunState(r.id, r));
      changed = true;
    }
    if (changed) this.emit();
    for (const r of runs) this.start(r.id);
  }

  /** Para o driver e tira a mineração da lista. */
  remove(runId: string): void {
    this.drivers.get(runId)?.abort();
    this.drivers.delete(runId);
    this.states.delete(runId);
    this.sawActive.delete(runId);
    this.order = this.order.filter((x) => x !== runId);
    this.emit();
  }

  /** Cancela todos os laços (unmount). `resume` os retoma. */
  stopAll(): void {
    this.stopped = true;
    this.drivers.forEach((ac) => ac.abort());
    this.drivers.clear();
    this.states.forEach((s, id) => {
      if (s.reconnecting) this.states.set(id, { ...s, reconnecting: false });
    });
  }

  resume(): void {
    this.stopped = false;
    for (const id of this.order) this.start(id);
  }

  /**
   * Aplica um progresso vindo de fora (ex.: resposta de `POST /cancel`). Se já não está ativo,
   * encerra o laço desta mineração e marca o card como concluído.
   */
  applyProgress(progress: RunProgress): void {
    const s = this.states.get(progress.id);
    if (!s) return;
    if (isActiveStatus(progress.status)) {
      this.setState(progress.id, { ...s, progress });
      return;
    }
    this.drivers.get(progress.id)?.abort();
    this.drivers.delete(progress.id);
    this.setState(progress.id, applyDriveResult({ ...s, progress }, { kind: 'finished', progress }));
  }

  private start(id: string): void {
    const state = this.states.get(id);
    if (this.stopped || !state || state.done || this.drivers.has(id)) return;
    const ac = new AbortController();
    this.drivers.set(id, ac);
    if (state.progress && isActiveStatus(state.progress.status)) this.sawActive.add(id);

    void driveRun(id, {
      api: this.opts.api,
      signal: ac.signal,
      sleep: this.opts.sleep,
      initial: state.progress,
      onProgress: (p) => {
        if (ac.signal.aborted) return;
        if (isActiveStatus(p.status)) this.sawActive.add(id);
        this.patch(id, { progress: p });
      },
      onReconnecting: (reconnecting) => {
        if (!ac.signal.aborted) this.patch(id, { reconnecting });
      },
    }).then((result) => {
      if (this.drivers.get(id) === ac) this.drivers.delete(id);
      if (ac.signal.aborted) return;
      const s = this.states.get(id);
      if (s) this.setState(id, applyDriveResult(s, result));
      this.opts.onOutcome?.(result, this.sawActive.has(id));
    });
  }

  private patch(id: string, partial: Partial<RunDriverState>): void {
    const s = this.states.get(id);
    if (s) this.setState(id, { ...s, ...partial });
  }

  private setState(id: string, s: RunDriverState): void {
    this.states.set(id, s);
    this.emit();
  }

  private emit(): void {
    this.opts.onChange?.(this.list());
  }
}
