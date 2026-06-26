import { defineConfig } from "cypress";

export default defineConfig({
  retries: {
    runMode: 2,
    openMode: 0,
  },
  e2e: {
    baseUrl: "http://localhost:3000",
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 12000,
    pageLoadTimeout: 120000,
    requestTimeout: 30000,
    responseTimeout: 120000,
    viewportWidth: 1280,
    viewportHeight: 800,
  },
  // Credentials are NOT committed. Provide them locally via cypress.env.json (gitignored,
  // see cypress.env.example.json), or in CI via CYPRESS_* environment variables.
});
