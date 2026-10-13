import app, { pool } from './index.js';
import { readConfig } from './config.js';
const server = app.listen(readConfig().port, '127.0.0.1', () => {
  console.log('Janela: servidor local iniciado.');
});
const shutdown = (): void => {
  server.close(() => { void pool.end().then(() => process.exit(0)); });
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
