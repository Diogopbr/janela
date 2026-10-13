import { readConfig } from '../src/config.js';
import { makePool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
const pool = makePool(readConfig());
try { await migrate(pool); console.log('Migrations aplicadas.'); }
finally { await pool.end(); }
