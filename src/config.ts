export interface AppConfig {
  databaseUrl: string; sessionSecret: string; appUrl: string; port: number;
  production: boolean; tls: boolean; vercelIngress: boolean; vercelRuntime: boolean;
  demoEnabled: boolean; loginEnabled: boolean;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env.NODE_ENV === 'production';
  const boolean = (name: string, fallback: boolean): boolean => {
    const value = env[name];
    if (value === undefined) return fallback;
    if (value !== 'true' && value !== 'false') throw new Error(`${name} must be true or false`);
    return value === 'true';
  };
  const tls = boolean('DB_TLS', production);
  if (production && !tls) throw new Error('Production requires verified database TLS');
  const sessionSecret = env.SESSION_SECRET ?? '';
  if (sessionSecret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  let appUrl: URL;
  try { appUrl = new URL(env.APP_URL ?? ''); }
  catch { throw new Error('APP_URL must be a valid absolute URL'); }
  if (!['http:', 'https:'].includes(appUrl.protocol) || appUrl.username || appUrl.password || appUrl.pathname !== '/' || appUrl.search || appUrl.hash) {
    throw new Error('APP_URL must identify an HTTP origin');
  }
  if (production && appUrl.protocol !== 'https:') throw new Error('Production requires HTTPS');
  const databaseUrl = env.DATABASE_URL ?? '';
  let database: URL;
  try { database = new URL(databaseUrl); }
  catch { throw new Error('DATABASE_URL must be a PostgreSQL URL'); }
  if (!['postgres:', 'postgresql:'].includes(database.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL URL');
  const port = Number(env.PORT ?? 5091);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
  return { databaseUrl, sessionSecret, appUrl: appUrl.origin, port, production, tls,
    vercelIngress: boolean('VERCEL_INGRESS', false), vercelRuntime: env.VERCEL === '1',
    demoEnabled: boolean('JANELA_DEMO_ENABLED', false), loginEnabled: boolean('JANELA_LOGIN_ENABLED', false) };
}
