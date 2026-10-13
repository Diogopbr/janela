import 'express';
import { readConfig } from './config.js';
import { makePool } from './db/pool.js';
import { createApp } from './http/app.js';
const config = readConfig();
export const pool = makePool(config);
export default createApp({ pool, config });
