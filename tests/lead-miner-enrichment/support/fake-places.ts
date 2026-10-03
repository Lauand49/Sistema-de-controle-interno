/**
 * Cliente falso da Places API (New) por roteiro — contrato `PlacesHttp` do design
 * (`sources/google-places.ts`): resolve `{ status, json }` para qualquer status HTTP e
 * rejeita só em rede/timeout.
 */
import type { PlacesHttp, PlacesRequest } from '@/lib/leads/sources/google-places';
import { scriptRunner, type ScriptStep, type Sleep } from './scripted';

export type { PlacesRequest };
export type PlacesHttpLike = PlacesHttp;

export interface FakePlaces extends PlacesHttpLike {
  calls: PlacesRequest[];
  remaining(): number;
}

/** @param log recebe `places:<path>` a cada chamada (para conferir a ordem reserva → envio). */
export function fakePlaces(
  script: ReadonlyArray<ScriptStep<PlacesRequest>>,
  opts: { sleep?: Sleep; log?: string[] } = {},
): FakePlaces {
  const runner = scriptRunner<PlacesRequest>('fakePlaces', script, opts.sleep);
  return {
    calls: runner.calls,
    remaining: runner.remaining,
    request(req) {
      opts.log?.push(`places:${req.path}`);
      return runner.run(req, req.timeoutMs);
    },
  };
}

/** Lugar cru no formato da resposta da Places API (New), com valores padrão sobrescrevíveis. */
export function rawPlace(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ChIJ-teste-1',
    displayName: { text: 'Clínica Sorriso', languageCode: 'pt-BR' },
    formattedAddress: 'Rua das Flores, 100 - Vila Mariana, São Paulo - SP, 04000-000, Brasil',
    addressComponents: [
      { longText: 'Vila Mariana', shortText: 'Vila Mariana', types: ['sublocality_level_1', 'sublocality'] },
      { longText: 'São Paulo', shortText: 'São Paulo', types: ['administrative_area_level_2'] },
      { longText: 'São Paulo', shortText: 'SP', types: ['administrative_area_level_1'] },
    ],
    location: { latitude: -23.5889, longitude: -46.6388 },
    nationalPhoneNumber: '(11) 3333-4444',
    websiteUri: 'https://clinicasorriso.com.br/',
    googleMapsUri: 'https://maps.google.com/?cid=1',
    businessStatus: 'OPERATIONAL',
    types: ['dentist', 'health'],
    ...over,
  };
}

/** Resposta 200 da Text Search. */
export function searchPage(places: unknown[], nextPageToken?: string): { status: number; json: unknown } {
  return { status: 200, json: nextPageToken ? { places, nextPageToken } : { places } };
}
