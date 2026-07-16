import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 30_000,
  // The movement smokes drive the player frame-by-frame and are sensitive to
  // frame-rate starvation; running serially keeps them reliably green.
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    // On Windows, headless Chromium falls back to SwiftShader software WebGL,
    // which starves Phaser's frame rate and breaks the movement smokes; these
    // flags restore the real GPU (D3D11) in headless mode.
    launchOptions:
      process.platform === 'win32'
        ? { args: ['--enable-gpu', '--use-angle=d3d11'] }
        : {},
  },
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
