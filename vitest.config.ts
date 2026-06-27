import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["lib/**/*.test.ts", "lib/**/*.test.tsx"],
    exclude: ["node_modules", ".next", "cypress", "vitest.config.ts"],
    setupFiles: ["lib/test/setup.ts"],
    coverage: {
      reporter: ["text", "lcov"],
      include: ["lib/**/*.ts", "lib/**/*.tsx"],
      exclude: ["lib/test/**", "**/*.test.ts"],
    },
  },
});
