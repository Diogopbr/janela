import type { ReservationProjection } from '../../src/reservations/projection';
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly conflicts?: Array<{
      id: string;
      startsAt: string;
      endsAt: string;
      purpose: string;
    }>,
    public readonly current?: ReservationProjection,
  ) {
    super(message);
  }
}
async function decode<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      body && typeof body === 'object' && 'error' in body
        ? (body as { error: Record<string, unknown> }).error
        : null;
    if (error && typeof error.code === 'string' && typeof error.message === 'string')
      throw new ApiError(
        response.status,
        error.code,
        error.message,
        error.conflicts as ApiError['conflicts'],
        error.current as ReservationProjection | undefined,
      );
    throw new ApiError(
      response.status,
      'UNAVAILABLE',
      'O serviço não respondeu como esperado. Tente novamente em instantes.',
    );
  }
  if (body === null)
    throw new ApiError(
      response.status,
      'UNAVAILABLE',
      'Não foi possível ler a resposta do serviço.',
    );
  return body as T;
}
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  expectedWorkspace?: string,
): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (expectedWorkspace) headers.set('X-Janela-Workspace', expectedWorkspace);
  try {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrf = await decode<{ token: string }>(
        await fetch('/api/csrf', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: init.signal,
        }),
      );
      headers.set('X-CSRF-Token', csrf.token);
      headers.set('Content-Type', 'application/json');
    }
    return await decode<T>(
      await fetch(`/api${path}`, {
        ...init,
        method,
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
      }),
    );
  } catch (error) {
    if (error instanceof ApiError || (error instanceof DOMException && error.name === 'AbortError'))
      throw error;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Não foi possível conectar. Confira sua conexão e tente novamente.',
    );
  }
}
