/**
 * GET /api/tools/lead-miner/localidades/bairros?uf=SP&cidade=Santos — bairros da cidade (T2).
 * Vêm do OpenStreetMap (`place=suburb|neighbourhood|quarter` dentro da área da cidade), pela
 * infraestrutura existente (Nominatim com limitador + Overpass), com cache em memória (7 dias).
 * UF/cidade inválidas → 400. Lista vazia ou falha → 200 (`indisponivel: true` só na falha): o
 * formulário permite digitar o bairro e a mineração nunca é bloqueada por isso.
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api';
import { requireNegocios, parseQuery } from '@/lib/leads/route-helpers';
import { getLocalidadesServices } from '@/lib/leads/deps';
import { bairrosQuerySchema } from '@/lib/leads/localidades';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Nominatim (com retentativas) + Overpass: dá folga ao limite de 60 s da plataforma.
export const maxDuration = 60;

export const GET = withAuth(async (req, { actor }) => {
  requireNegocios(actor);
  const { uf, cidade } = parseQuery(bairrosQuerySchema, req.url);
  const result = await getLocalidadesServices().bairros.list(uf, cidade);
  if (!result.ok) return NextResponse.json({ items: [], indisponivel: true });
  return NextResponse.json(
    { items: result.items },
    result.items.length > 0 ? { headers: { 'Cache-Control': 'private, max-age=3600' } } : undefined,
  );
});
