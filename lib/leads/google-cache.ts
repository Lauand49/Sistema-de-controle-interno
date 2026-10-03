/**
 * Cache_Google (Req. 6.1, 6.2, 6.8–6.10).
 *
 * Do Google guarda-se indefinidamente só o Place_ID (`Company.googlePlaceId`); todo o
 * Conteudo_Google vive em `GooglePlaceCache`, com `obtidoEm` e `expiraEm`. Toda gravação ou
 * remoção do cache recalcula `Company.nomeExibicao` na mesma transação (coluna de ordenação).
 *
 * Superfície Prisma usada (pequena, para ser fácil de simular nos testes):
 * `googlePlaceCache.upsert|deleteMany`, `company.findUnique|findMany|update`, `$queryRaw`
 * (só no DELETE … RETURNING da purga) e `$transaction(fn)` quando o cliente o oferece.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { GOOGLE_CACHE_DAYS } from './config';
import { isCacheValid, sortName, type GoogleCacheRow } from './display';
import { fetchPlaceDetails, type GooglePlacesDeps } from './sources/google-places';
import type { GooglePlace } from './types';

export { isCacheValid } from './display';

/** Cliente Prisma ou cliente de transação. */
export type Db = PrismaClient | Prisma.TransactionClient;

const DAY_MS = 86_400_000;

/** expiraEm = obtidoEm + Validade_Cache_Google (Req. 6.1). */
export const googleCacheExpiry = (obtidoEm: Date): Date => new Date(obtidoEm.getTime() + GOOGLE_CACHE_DAYS * DAY_MS);

/** Executa `fn` numa transação se `db` é o cliente raiz; dentro de uma transação, reutiliza-a. */
async function inTx<T>(db: Db, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const root = db as Partial<Pick<PrismaClient, '$transaction'>>;
  if (typeof root.$transaction === 'function') return (db as PrismaClient).$transaction(fn);
  return fn(db as Prisma.TransactionClient);
}

/** Recalcula `nomeExibicao` das Empresas a partir do estado atual (cache lido na mesma transação). */
export async function recomputeNomeExibicao(tx: Db, companyIds: readonly string[], now: Date): Promise<void> {
  if (companyIds.length === 0) return;
  const companies = await tx.company.findMany({
    where: { id: { in: [...companyIds] } },
    select: {
      id: true,
      nome: true,
      cnpjNomeFantasia: true,
      nomeExibicao: true,
      googleCache: { select: { nome: true, expiraEm: true } },
    },
  });
  for (const c of companies) {
    // sortName só lê `nome` e `expiraEm` do cache; o restante da linha não é necessário.
    const nomeExibicao = sortName({ ...c, googleCache: c.googleCache as GoogleCacheRow | null }, now);
    if (nomeExibicao !== c.nomeExibicao) {
      await tx.company.update({ where: { id: c.id }, data: { nomeExibicao } });
    }
  }
}

/**
 * Upsert do Cache_Google (obtidoEm = now, expiraEm = now + validade) e recálculo de
 * `Company.nomeExibicao`. Chame com o cliente de transação para manter ambos atômicos.
 */
export async function writeGoogleCache(
  tx: Db,
  companyId: string,
  place: Omit<GooglePlace, 'nicho'>,
  now: Date,
): Promise<void> {
  const content = {
    placeId: place.placeId,
    nome: place.nome,
    endereco: place.endereco,
    bairro: place.bairro,
    cidade: place.cidade,
    uf: place.uf,
    telefone: place.telefone,
    website: place.website,
    latitude: place.latitude,
    longitude: place.longitude,
    mapsUri: place.mapsUri,
    businessStatus: place.businessStatus,
    tipos: place.tipos,
    obtidoEm: now,
    expiraEm: googleCacheExpiry(now),
  };
  await tx.googlePlaceCache.upsert({
    where: { companyId },
    create: { companyId, ...content },
    update: content,
  });
  await recomputeNomeExibicao(tx, [companyId], now);
}

/**
 * Purga do Conteudo_Google expirado (Req. 6.2): um único DELETE … RETURNING dos caches com
 * `expiraEm <= now` e recálculo de `nomeExibicao` das Empresas afetadas, na mesma transação.
 * Devolve o nº de caches apagados. Reutilizável no agendamento da Etapa 4.
 */
export async function purgeExpiredGoogleCache(db: Db, now: Date = new Date()): Promise<number> {
  return inTx(db, async (tx) => {
    const rows = await tx.$queryRaw<{ companyId: string }[]>`
      DELETE FROM "GooglePlaceCache" WHERE "expiraEm" <= ${now} RETURNING "companyId"`;
    await recomputeNomeExibicao(
      tx,
      rows.map((r) => r.companyId),
      now,
    );
    return rows.length;
  });
}

/**
 * - `FRESH`: nada a atualizar (sem Place_ID ou cache ainda válido);
 * - `UPDATED`: cache regravado por Place Details;
 * - `UNAVAILABLE`: Google Places sem chave ou cota esgotada (Req. 6.9);
 * - `FAILED`: erro na chamada ou Empresa inexistente (Req. 6.9);
 * - `NOT_FOUND`: Place_ID inexistente no Google; cache apagado, Place_ID mantido (Req. 6.10).
 */
export type RefreshOutcome = 'FRESH' | 'UPDATED' | 'UNAVAILABLE' | 'FAILED' | 'NOT_FOUND';

/**
 * Ficha/Reanálise: se a Empresa tem Place_ID e o cache está ausente/expirado, chama
 * Place Details (New), que reserva 1 chamada no Portao_Uso (Req. 6.8–6.10).
 */
export async function refreshGoogleCache(db: Db, companyId: string, deps: GooglePlacesDeps): Promise<RefreshOutcome> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { googlePlaceId: true, googleCache: { select: { expiraEm: true } } },
  });
  if (!company) return 'FAILED';
  const placeId = company.googlePlaceId?.trim();
  if (!placeId) return 'FRESH';
  if (isCacheValid(company.googleCache, deps.now())) return 'FRESH';

  const res = await fetchPlaceDetails(placeId, deps);
  const now = deps.now();
  if (res.ok) {
    // O cache fica associado ao Place_ID guardado na Empresa.
    await inTx(db, (tx) => writeGoogleCache(tx, companyId, { ...res.place, placeId }, now));
    return 'UPDATED';
  }
  switch (res.kind) {
    case 'NOT_FOUND':
      await inTx(db, async (tx) => {
        await tx.googlePlaceCache.deleteMany({ where: { companyId } });
        await recomputeNomeExibicao(tx, [companyId], now);
      });
      return 'NOT_FOUND';
    case 'UNAVAILABLE':
    case 'QUOTA':
      return 'UNAVAILABLE';
    default:
      return 'FAILED';
  }
}
