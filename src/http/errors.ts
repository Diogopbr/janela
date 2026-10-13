import type { ErrorRequestHandler } from 'express';
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfter?: number,
    public readonly details?: {
      conflicts?: unknown[];
      current?: unknown;
      fields?: Record<string, string>;
    },
  ) {
    super(message);
  }
}
export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof HttpError) {
    if (error.retryAfter) response.set('Retry-After', String(error.retryAfter));
    response
      .status(error.status)
      .json({ error: { code: error.code, message: error.message, ...error.details } });
    return;
  }
  response
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a operação.' } });
};
