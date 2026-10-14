import { createApp } from '../src/http/app.js';
import { readConfig } from '../src/config.js';
import { makePool } from '../src/db/pool.js';
import { localAssets } from '../src/http/local-assets.js';
const config = readConfig();
const url = new URL(config.databaseUrl);
if (
  url.pathname !== '/janela_test' ||
  url.username !== 'janela_test' ||
  !['127.0.0.1', 'localhost'].includes(url.hostname) ||
  config.production
)
  throw new Error('Local E2E server requires the isolated janela_test database and role');
const pool = makePool(config);
const server = createApp({ pool, config, assets: localAssets() }).listen(5093, '127.0.0.1');
const stop = () =>
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
