import { readConfig } from '../src/config.js';
import { makePool } from '../src/db/pool.js';
import { installUser } from '../src/access/installation.js';
if (process.stdin.isTTY)
  throw new Error('Provide installation JSON through stdin, never command-line credentials.');
let body = '';
for await (const chunk of process.stdin) {
  body += String(chunk);
  if (Buffer.byteLength(body) > 4096) throw new Error('Installation input too large');
}
const input: unknown = JSON.parse(body);
if (!input || typeof input !== 'object') throw new Error('Installation JSON required');
const fields = input as Record<string, unknown>;
if (
  typeof fields.email !== 'string' ||
  typeof fields.name !== 'string' ||
  typeof fields.password !== 'string'
)
  throw new Error('email, name and password required');
const pool = makePool(readConfig());
try {
  await installUser(pool, { email: fields.email, name: fields.name, password: fields.password });
  console.log('Usuário instalado. Sessões anteriores da instalação foram invalidadas.');
} finally {
  await pool.end();
}
