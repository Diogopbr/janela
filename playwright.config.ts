import { defineConfig } from '@playwright/test';
const hosted = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: hosted ?? 'http://127.0.0.1:5093',
    viewport: { width: 1440, height: 1000 },
    locale: 'pt-BR',
    trace: 'retain-on-failure',
  },
  ...(hosted
    ? {}
    : {
        webServer: {
          command: 'node --import tsx scripts/e2e-server.ts',
          url: 'http://127.0.0.1:5093/health/ready',
          reuseExistingServer: false,
          timeout: 30000,
        },
      }),
});
