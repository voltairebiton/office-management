import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://localhost:3107";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run start -- --port 3107",
    url: `${baseURL}/setup`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      WORKOS_CLIENT_ID: "",
      WORKOS_COOKIE_PASSWORD: "",
      WORKOS_API_KEY: "",
      NEXT_PUBLIC_WORKOS_REDIRECT_URI: "",
    },
  },
});
