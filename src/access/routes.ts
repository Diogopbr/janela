import session from 'express-session';
import { Router, type Request, type RequestHandler } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import type { AppConfig } from '../config.js';
import { PostgresSessionStore } from './sessions.js';
import { DemoService, type DemoWorkspace } from './demo.js';
import { withWorkspace, type Scope } from './scope.js';
import { HttpError } from '../http/errors.js';
import { opportunisticCleanup } from './cleanup.js';
import { verifyPassword } from './passwords.js';
import { consumeLimit } from './limits.js';
import { reservationRoutes } from '../reservations/routes.js';
import { requiredScope } from '../http/scope.js';
export type AccessConfig = Pick<
  AppConfig,
  'sessionSecret' | 'appUrl' | 'production' | 'demoEnabled' | 'loginEnabled'
>;
const missing = () => new HttpError(404, 'NOT_FOUND', 'Ambiente não encontrado ou encerrado.');
function visitorToken(request: Request): string | undefined {
  const cookie = request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('janela_visitor='))
    ?.slice('janela_visitor='.length);
  return cookie && /^[a-f0-9]{64}$/.test(cookie) ? cookie : undefined;
}
async function save(request: Request): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    request.session.save((error) => (error ? reject(error) : resolve())),
  );
}
async function establish(request: Request, data: DemoWorkspace): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    request.session.regenerate((error) => (error ? reject(error) : resolve())),
  );
  request.session.scope = data.scope;
  request.session.csrf = randomBytes(32).toString('hex');
  await save(request);
}
function projection(data: DemoWorkspace) {
  return { workspace: { ...data.scope, expiresAt: data.expiresAt } };
}
export function accessRoutes(pool: Pool, config: AccessConfig): Router {
  const router = Router();
  const demo = new DemoService(pool);
  router.use(async (_request, _response, next) => {
    await opportunisticCleanup(pool);
    next();
  });
  router.use(
    session({
      name: 'janela_session',
      secret: config.sessionSecret,
      store: new PostgresSessionStore(pool),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: config.production,
        sameSite: 'lax',
        maxAge: 24 * 3600000,
        path: '/',
      },
    }),
  );
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/csrf', async (request, response) => {
    request.session.csrf ??= randomBytes(32).toString('hex');
    await save(request);
    response.json({ token: request.session.csrf });
  });
  const csrf: RequestHandler = (request, _response, next) => {
    const supplied = request.get('X-CSRF-Token');
    const expected = request.session.csrf;
    if (
      request.get('Origin') !== config.appUrl ||
      !supplied ||
      !expected ||
      !/^[a-f0-9]{64}$/.test(supplied) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      next(
        new HttpError(
          419,
          'CSRF_MISMATCH',
          'A sessão de segurança mudou. Atualize e tente novamente.',
        ),
      );
      return;
    }
    next();
  };
  router.use((request, response, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) next();
    else csrf(request, response, next);
  });
  router.get('/auth', async (request, response) => {
    if (!request.session.scope) {
      response.json({
        workspace: null,
        demoEnabled: config.demoEnabled,
        loginEnabled: config.loginEnabled,
      });
      return;
    }
    const scope = requiredScope(request);
    const workspace = await withWorkspace(pool, scope, async (client) => {
      const result = await client.query('SELECT expires_at FROM workspaces WHERE id=$1', [
        scope.id,
      ]);
      return { ...scope, expiresAt: result.rows[0].expires_at?.toISOString() ?? null };
    });
    response.json({
      workspace,
      demoEnabled: config.demoEnabled,
      loginEnabled: config.loginEnabled,
    });
  });
  router.post('/demo/start', async (request, response) => {
    if (!config.demoEnabled) throw missing();
    const token = visitorToken(request) ?? randomBytes(32).toString('hex');
    const data = await demo.start(token, request.ip ?? 'unknown');
    if (request.session.scope?.id !== data.scope.id) await establish(request, data);
    response.cookie('janela_visitor', token, {
      httpOnly: true,
      secure: config.production,
      sameSite: 'lax',
      maxAge: 365 * 24 * 3600000,
      path: '/',
    });
    response.json(projection(data));
  });
  router.post('/demo/reset', async (request, response) => {
    if (!config.demoEnabled) throw missing();
    const scope = requiredScope(request);
    const token = visitorToken(request);
    if (!token) throw missing();
    const data = await demo.reset(scope, token, request.ip ?? 'unknown');
    await establish(request, data);
    response.json(projection(data));
  });
  router.get('/resources', async (request, response) => {
    const resources = await withWorkspace(
      pool,
      requiredScope(request),
      async (client) =>
        (
          await client.query(
            'SELECT id,name,timezone AS "timeZone" FROM resources WHERE workspace_id=$1 ORDER BY name',
            [request.session.scope!.id],
          )
        ).rows,
    );
    response.json({ resources });
  });
  router.post('/login', async (request, response) => {
    if (!config.loginEnabled) throw missing();
    const input = request.body as unknown;
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new HttpError(422, 'INVALID_INPUT', 'Informe e-mail e senha.');
    const fields = input as Record<string, unknown>;
    if (
      Object.keys(fields).some((key) => !['email', 'password'].includes(key)) ||
      typeof fields.email !== 'string' ||
      typeof fields.password !== 'string' ||
      fields.email.length > 254 ||
      Buffer.byteLength(fields.password) > 1024
    )
      throw new HttpError(422, 'INVALID_INPUT', 'Informe e-mail e senha válidos.');
    const client = await pool.connect();
    try {
      await consumeLimit(client, `login:ip:${request.ip ?? 'unknown'}`, 60, 10);
    } finally {
      client.release();
    }
    const account = await pool.query(
      `SELECT u.id,u.workspace_id,u.password_hash FROM users u JOIN workspaces w ON w.id=u.workspace_id WHERE w.kind='normal' AND w.revoked_at IS NULL AND u.email=$1`,
      [fields.email.trim().toLowerCase()],
    );
    const user = account.rows[0];
    const dummy = `scrypt$32768$8$1$${'0'.repeat(32)}$${'0'.repeat(128)}`;
    const valid = await verifyPassword(fields.password, user?.password_hash ?? dummy);
    if (!user || !valid)
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.');
    const scope: Scope = {
      id: user.workspace_id,
      userId: user.id,
      kind: 'normal',
      visitorId: null,
    };
    await withWorkspace(pool, scope, async () => undefined);
    await new Promise<void>((resolve, reject) =>
      request.session.regenerate((error) => (error ? reject(error) : resolve())),
    );
    request.session.scope = scope;
    request.session.csrf = randomBytes(32).toString('hex');
    await save(request);
    response.json({ workspace: { ...scope, expiresAt: null } });
  });
  router.post('/logout', async (request, response) => {
    await new Promise<void>((resolve, reject) =>
      request.session.destroy((error) => (error ? reject(error) : resolve())),
    );
    response.clearCookie('janela_session', {
      path: '/',
      httpOnly: true,
      secure: config.production,
      sameSite: 'lax',
    });
    response.json({ workspace: null });
  });
  router.use(reservationRoutes(pool));
  return router;
}
