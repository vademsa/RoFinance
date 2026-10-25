import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: './character',
  outputDir: './artifacts/results',
  timeout: 60000,
  // The automatic ten-second reel can take longer on a throttled CI renderer:
  // stalled frames are capped to preserve every consecutive centre card.
  expect: { timeout: 30000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5179',
    timezoneId: 'Asia/Ho_Chi_Minh',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-dark', use: { viewport: { width: 1280, height: 900 }, colorScheme: 'dark' } },
    { name: 'phone-light', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, colorScheme: 'light' } },
  ],
  webServer: {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    command: 'npm run dev -- --host 127.0.0.1 --port 5179 --strictPort',
    url: 'http://127.0.0.1:5179',
    // HMR/file watching are disabled below: reusing a server after source edits
    // would exercise its cached old catalogue instead of the current code.
    reuseExistingServer: false,
    env: { DISABLE_HMR: 'true' },
  },
});
