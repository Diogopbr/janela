import { createApp } from './http/app.js';
import { localAssets } from './http/local-assets.js';
import { makePool } from './db/pool.js';
import { readConfig } from './config.js';
const config = readConfig();
const pool = makePool(config);
const app = createApp({ pool, config, assets: localAssets() });
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log('Janela: servidor local iniciado.');
});
const shutdown = (): void => {
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
