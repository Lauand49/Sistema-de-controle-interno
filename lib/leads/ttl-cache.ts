/**
 * Carregador com cache em memória (TTL), deduplicação de chamadas simultâneas e cache negativo
 * curto para falhas (T2). Genérico e puro: o relógio é injetável. Serve às listas de cidades
 * (IBGE) e de bairros (OpenStreetMap), que mudam raramente e têm limite de uso.
 */
export type LoadResult<V> = { ok: true; value: V } | { ok: false };

export interface CachedLoaderOptions {
  /** Validade de um resultado bem-sucedido. */
  ttlMs: number;
  /** Validade de uma falha (evita martelar o serviço externo). */
  negativeTtlMs: number;
  /** Nº máximo de chaves guardadas (descarta a mais antiga ao estourar). */
  maxEntries?: number;
  now?: () => number;
}

interface Entry<V> {
  at: number;
  result: LoadResult<V>;
}

export function createCachedLoader<V>(
  load: (key: string) => Promise<LoadResult<V>>,
  opts: CachedLoaderOptions,
): (key: string) => Promise<LoadResult<V>> {
  const now = opts.now ?? Date.now;
  const max = opts.maxEntries ?? 500;
  const cache = new Map<string, Entry<V>>();
  const inflight = new Map<string, Promise<LoadResult<V>>>();

  return async (key) => {
    const hit = cache.get(key);
    if (hit) {
      const ttl = hit.result.ok ? opts.ttlMs : opts.negativeTtlMs;
      if (now() - hit.at < ttl) return hit.result;
      cache.delete(key);
    }
    const running = inflight.get(key);
    if (running) return running;

    const p = (async () => {
      let result: LoadResult<V>;
      try {
        result = await load(key);
      } catch {
        result = { ok: false };
      }
      cache.delete(key); // reinsere no fim (ordem de inserção = mais recente)
      cache.set(key, { at: now(), result });
      while (cache.size > max) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
      }
      return result;
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
}
