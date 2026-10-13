import type { RequestHandler } from 'express';
import { isIP } from 'node:net';
import { HttpError } from './errors.js';
export function gateway(config: { vercelIngress: boolean; vercelRuntime: boolean }): RequestHandler {
  return (request, _response, next) => {
    delete request.headers['x-forwarded-host'];
    delete request.headers['x-forwarded-port'];
    delete request.headers.forwarded;
    if (!config.vercelIngress) {
      delete request.headers['x-forwarded-for'];
      delete request.headers['x-forwarded-proto'];
      next();
      return;
    }
    if (!config.vercelRuntime) return next(new HttpError(503, 'UNAVAILABLE', 'Serviço indisponível.'));
    const ip = request.headers['x-vercel-forwarded-for'];
    if (typeof ip !== 'string' || !isIP(ip) || request.headers['x-forwarded-proto'] !== 'https') {
      return next(new HttpError(400, 'INVALID_GATEWAY', 'Origem da requisição inválida.'));
    }
    request.headers['x-forwarded-for'] = ip;
    next();
  };
}
