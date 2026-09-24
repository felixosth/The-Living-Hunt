import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Small viewport: CI renders WebGL in software, where cost scales with pixels.
        viewport: { width: 960, height: 540 },
        launchOptions: {
          // Software WebGL for headless runs.
          args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
          // Lets a pre-installed browser be used when its revision differs from Playwright's.
          executablePath: process.env.PW_CHROMIUM_PATH || undefined,
        },
      },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
