import { Pool, type PoolConfig } from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import type { AppConfig } from '../config.js';

export function poolOptionsFromURL(input: string, tls: boolean): PoolConfig {
  try {
    const url = new URL(input);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new Error();
    // Explicit fields prevent URL sslmode parameters from overriding verified TLS.
    return { host: url.hostname, port: Number(url.port || 5432),
      user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
      ssl: tls ? { rejectUnauthorized: true } : false,
      max: 4, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 };
  } catch { throw new Error('Invalid PostgreSQL connection URL'); }
}

export function makePool(config: AppConfig): Pool {
  const pool = new Pool(poolOptionsFromURL(config.databaseUrl, config.tls));
  if (config.vercelRuntime) attachDatabasePool(pool);
  return pool;
}
