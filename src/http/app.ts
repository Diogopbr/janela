import express, { type Express, type RequestHandler } from 'express';
import type { Pool } from 'pg';
import { createRequire } from 'node:module';
import { LATEST_MIGRATION } from '../db/version.js';
import { gateway } from './gateway.js';
import { errorHandler } from './errors.js';
import { accessRoutes, type AccessConfig } from '../access/routes.js';
// Helmet's CommonJS entry is callable; resolve it explicitly across Node builders.
const helmet = createRequire(import.meta.url)('helmet') as typeof import('helmet').default;
export function createApp(dependencies: {
  pool: Pool;
  assets?: RequestHandler;
  config?: { vercelIngress: boolean; vercelRuntime: boolean } & Partial<AccessConfig>;
}): Express {
  const app = express();
  const config = dependencies.config ?? { vercelIngress: false, vercelRuntime: false };
  app.disable('x-powered-by');
  app.set(
    'trust proxy',
    config.vercelIngress && config.vercelRuntime ? (_ip: string, hop: number) => hop === 0 : false,
  );
  app.use(helmet());
  app.use(gateway(config));
  app.use(express.json({ limit: '16kb' }));
  app.get('/health/ready', async (_request, response) => {
    try {
      const metadata = await dependencies.pool.query(
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='schema_migrations') AS present",
      );
      if (!metadata.rows[0].present) {
        response.status(503).json({ status: 'unavailable' });
        return;
      }
      const migration = await dependencies.pool.query(
        'SELECT 1 FROM schema_migrations WHERE version=$1',
        [LATEST_MIGRATION],
      );
      response
        .status(migration.rowCount ? 200 : 503)
        .json({ status: migration.rowCount ? 'ready' : 'unavailable' });
    } catch {
      response.status(503).json({ status: 'unavailable' });
    }
  });
  if (config.sessionSecret && config.appUrl)
    app.use('/api', accessRoutes(dependencies.pool, config as AccessConfig));
  if (dependencies.assets) app.use(dependencies.assets);
  app.use((_request, response) => {
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' } });
  });
  app.use(errorHandler);
  return app;
}
