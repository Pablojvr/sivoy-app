import { defineConfig } from '@playwright/test';

const viewports = [
  { name: 'mobile-386', viewport: { width: 386, height: 912 } },
  { name: 'tablet-768', viewport: { width: 768, height: 1024 } },
  { name: 'desktop-1024', viewport: { width: 1024, height: 768 } },
  { name: 'desktop-1440', viewport: { width: 1440, height: 900 } }
];

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.pw.spec.ts',
  fullyParallel: false,
  workers: process.env['CI'] ? 1 : undefined,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4303',
    colorScheme: 'light',
    locale: 'es-SV',
    timezoneId: 'America/El_Salvador',
    reducedMotion: 'reduce',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: viewports.map(({ name, viewport }) => ({
    name,
    use: { browserName: 'chromium', viewport, deviceScaleFactor: 1 }
  })),
  webServer: [
    {
      name: 'fixture-api',
      command: 'node e2e/fixture-api.cjs',
      url: 'http://localhost:3000/api/locations',
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000
    },
    {
      name: 'frontend',
      command: 'npm run start -- --host 127.0.0.1 --port 4303',
      url: 'http://127.0.0.1:4303/#/',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000
    }
  ]
});
