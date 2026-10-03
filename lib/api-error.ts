/**
 * Erro HTTP das rotas de API, sem dependências de Next/auth. Fica separado de `lib/api.ts`
 * para que módulos de domínio (ex.: `lib/leads/pipeline.ts`) possam lançá-lo e ser testados
 * fora do runtime do Next.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>
  ) {
    super(message);
  }
}

export const forbidden = (message = 'Você não tem permissão para esta ação.') =>
  new ApiError(403, message);
export const notFound = (message = 'Registro não encontrado.') => new ApiError(404, message);
export const badRequest = (message: string) => new ApiError(400, message);
