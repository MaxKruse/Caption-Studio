import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Production build: Next dev (Turbopack) serves broken hydration state on
    // the second page load within a worker on this setup, which fails any
    // test queued behind another. `next start` is deterministic.
    // Build is required - Playwright waits for the port after the full command.
    command: "bun run build && bun run start",
    port: 3000,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
