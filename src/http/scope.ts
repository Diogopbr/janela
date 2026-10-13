import type { Request } from 'express';
import type { Scope } from '../access/scope.js';
import { HttpError } from './errors.js';
export function requiredScope(request: Request): Scope {
  const scope = request.session.scope;
  const expected = request.get('X-Janela-Workspace');
  if (!scope || (expected && expected !== scope.id)) {
    throw new HttpError(404, 'NOT_FOUND', 'Ambiente não encontrado ou encerrado.');
  }
  return scope;
}
