import { makePool } from '../src/db/pool.js';
import { readConfig } from '../src/config.js';
import { cleanupBatch } from '../src/access/cleanup.js';
const limit = Number(process.argv[2] ?? 100);
const pool = makePool(readConfig());
try {
  let total = 0;
  for (;;) {
    const count = await cleanupBatch(pool, limit);
    total += count;
    if (count < limit) break;
  }
  console.log(
    `Ambientes encerrados removidos: ${total}. Ambientes bloqueados serão tratados em execução posterior.`,
  );
} finally {
  await pool.end();
}
