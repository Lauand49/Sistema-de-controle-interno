'use client';

/**
 * Listas de cidades (por UF) e de bairros (por cidade confirmada) do formulário de mineração (T2).
 * Falha, lista vazia ou resposta `indisponivel` viram o estado `unavailable`: o formulário então
 * aceita digitação livre e a mineração nunca é bloqueada por isso. Sucessos ficam em cache de
 * memória da sessão para não repetir consultas ao alternar campos.
 */
import { useEffect, useState } from 'react';
import { leadMinerApi } from '@/lib/leads/client-api';

export type ListStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export interface ListState {
  status: ListStatus;
  items: string[];
}

const IDLE: ListState = { status: 'idle', items: [] };

const citiesCache = new Map<string, string[]>();
const bairrosCache = new Map<string, string[]>();

/** Só para testes. */
export function clearLocalidadesCache(): void {
  citiesCache.clear();
  bairrosCache.clear();
}

function isAbort(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'AbortError';
}

/** Carrega `fetcher` quando `key` não é vazia; cancela a requisição anterior ao mudar a chave. */
function useList(key: string, cache: Map<string, string[]>, fetcher: (signal: AbortSignal) => Promise<{ items: string[]; indisponivel?: boolean }>): ListState {
  const [state, setState] = useState<ListState>(IDLE);

  useEffect(() => {
    if (key === '') {
      setState(IDLE);
      return;
    }
    const cached = cache.get(key);
    if (cached) {
      setState({ status: 'ready', items: cached });
      return;
    }
    const ac = new AbortController();
    setState({ status: 'loading', items: [] });
    fetcher(ac.signal)
      .then((res) => {
        if (ac.signal.aborted) return;
        if (res.indisponivel || res.items.length === 0) {
          setState({ status: 'unavailable', items: [] });
          return;
        }
        cache.set(key, res.items);
        setState({ status: 'ready', items: res.items });
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted || isAbort(e)) return;
        setState({ status: 'unavailable', items: [] });
      });
    return () => ac.abort();
    // `fetcher` é recriado a cada render; a chave identifica a consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

/** Cidades da UF escolhida (`uf` vazia → ocioso). */
export function useCities(uf: string): ListState {
  return useList(uf, citiesCache, async (signal) => {
    const res = await leadMinerApi.listCities(uf, { signal });
    return { items: res.items.map((c) => c.nome), indisponivel: res.indisponivel };
  });
}

/** Bairros da cidade confirmada (`cidade` vazia → ocioso). */
export function useNeighborhoods(uf: string, cidade: string): ListState {
  const key = uf !== '' && cidade.trim() !== '' ? JSON.stringify([uf, cidade.trim().toLowerCase()]) : '';
  return useList(key, bairrosCache, (signal) => leadMinerApi.listNeighborhoods(uf, cidade.trim(), { signal }));
}
