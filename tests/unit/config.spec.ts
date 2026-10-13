import { expect, test } from 'vitest';
import { readConfig } from '../../src/config.js';
import { poolOptionsFromURL } from '../../src/db/pool.js';
const production = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://fixture:fixture@db.example/janela',
  SESSION_SECRET: 'fixture-only-secret-that-is-32-characters',
  APP_URL: 'https://janela.example',
};
test('production requires TLS, HTTPS and a stable explicit signing secret', () => {
  expect(() => readConfig({ ...production, DB_TLS: 'false' })).toThrow('TLS');
  expect(() => readConfig({ ...production, APP_URL: 'http://janela.example' })).toThrow('HTTPS');
  expect(() => readConfig({ ...production, SESSION_SECRET: '' })).toThrow('SESSION_SECRET');
  expect(readConfig(production).tls).toBe(true);
});
test('URL SSL parameters cannot silently disable verified TLS in the pg driver', () => {
  const options = poolOptionsFromURL(
    'postgresql://fixture:fixture@db.example/janela?sslmode=disable',
    true,
  );
  expect(options.ssl).toEqual({ rejectUnauthorized: true });
  expect(options.connectionString).toBeUndefined();
  expect(options.host).toBe('db.example');
  expect(options.max).toBe(4);
});
test('database URL errors do not include credentials in diagnostics', () => {
  expect(() => poolOptionsFromURL('https://fixture:fixture@db.example/janela', true)).toThrow(
    'PostgreSQL',
  );
});
test('deployment ingress reads the documented project variable', () => {
  expect(
    readConfig({ ...production, VERCEL: '1', JANELA_VERCEL_INGRESS: 'true' }).vercelIngress,
  ).toBe(true);
});
