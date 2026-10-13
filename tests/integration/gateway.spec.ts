import { afterAll, expect, test } from 'vitest';
import express from 'express';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { request as httpRequest } from 'node:http';
import { gateway } from '../../src/http/gateway.js';
import { errorHandler } from '../../src/http/errors.js';
const servers: Server[] = [];
afterAll(async () => {
  await Promise.all(
    servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});
async function start(ingress: boolean, runtime: boolean) {
  const app = express();
  app.set('trust proxy', ingress && runtime ? (_ip: string, hop: number) => hop === 0 : false);
  app.use(gateway({ vercelIngress: ingress, vercelRuntime: runtime }));
  app.get('/inspect', (request, response) =>
    response.json({ ip: request.ip, secure: request.secure, host: request.hostname }),
  );
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  const bound = server.address();
  if (!bound || typeof bound === 'string') throw new Error('HTTP server did not bind');
  return `http://127.0.0.1:${bound.port}/inspect`;
}
test('gateway uses the platform IP and HTTPS while refusing forwarded host', async () => {
  const address = await start(true, true);
  const response = await new Promise<{ status: number | undefined; json: () => Promise<unknown> }>(
    (resolve, reject) => {
      const request = httpRequest(
        address,
        {
          headers: {
            Host: 'request.example',
            'X-Vercel-Forwarded-For': '203.0.113.19',
            'X-Forwarded-For': '198.51.100.1',
            'X-Forwarded-Proto': 'https',
            'X-Forwarded-Host': 'attacker.example',
          },
        },
        (incoming) => {
          let body = '';
          incoming.setEncoding('utf8');
          incoming.on('data', (chunk) => {
            body += chunk;
          });
          incoming.on('end', () =>
            resolve({ status: incoming.statusCode, json: async () => JSON.parse(body) as unknown }),
          );
          incoming.on('error', reject);
        },
      );
      request.on('error', reject);
      request.end();
    },
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    ip: '203.0.113.19',
    secure: true,
    host: 'request.example',
  });
});
test('direct development ignores forged proxy headers', async () => {
  const response = await fetch(await start(false, false), {
    headers: {
      'X-Vercel-Forwarded-For': '203.0.113.19',
      'X-Forwarded-Proto': 'https',
      'X-Forwarded-Host': 'attacker.example',
    },
  });
  expect(await response.json()).toEqual({ ip: '127.0.0.1', secure: false, host: '127.0.0.1' });
});
test('gateway configuration without the Vercel marker is unavailable', async () => {
  const response = await fetch(await start(true, false));
  expect(response.status).toBe(503);
});
test('multiple platform IPs and plaintext cannot become a trusted identity', async () => {
  const address = await start(true, true);
  expect(
    (
      await fetch(address, {
        headers: {
          'X-Vercel-Forwarded-For': '203.0.113.19, 198.51.100.1',
          'X-Forwarded-Proto': 'https',
        },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await fetch(address, {
        headers: { 'X-Vercel-Forwarded-For': '203.0.113.19', 'X-Forwarded-Proto': 'http' },
      })
    ).status,
  ).toBe(400);
});
