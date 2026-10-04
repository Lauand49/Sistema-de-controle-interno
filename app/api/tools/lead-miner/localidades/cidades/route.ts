/**
 * GET /api/tools/lead-miner/localidades/cidades?uf=SP — cidades da UF (T2).
 * O servidor consulta a API de Localidades do IBGE e guarda o resultado em memória (24 h).
 * UF inválida → 400 `{ error, fields }`. Falha do IBGE não é erro: 200 com `indisponivel: true`
 * e lista vazia, para o formulário cair na digitação livre (nunca bloqueia a mineração).
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api';
import { requireNegocios, parseQuery } from '@/lib/leads/route-helpers';
import { getLocalidadesServices } from '@/lib/leads/deps';
import { cidadesQuerySchema } from '@/lib/leads/localidades';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async (req, { actor }) => {
  requireNegocios(actor);
  const { uf } = parseQuery(cidadesQuerySchema, req.url);
  const result = await getLocalidadesServices().cities.list(uf);
  if (!result.ok) return NextResponse.json({ items: [], indisponivel: true });
  return NextResponse.json({ items: result.items }, { headers: { 'Cache-Control': 'private, max-age=3600' } });
});
