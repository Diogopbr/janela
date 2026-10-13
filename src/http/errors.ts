import type { ErrorRequestHandler } from 'express';
export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a operação.' } });
};
