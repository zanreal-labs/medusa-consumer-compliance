import { defineConfig } from "vitest/config";

/**
 * Integration tests run the module against a real Postgres through
 * `@medusajs/test-utils`' module runner, which expects Jest-style globals.
 * They need DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD and a database named
 * by DB_TEMP_NAME (CI creates it as a service container).
 */
export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    globals: true,
    setupFiles: ["./integration-tests/setup.cjs"],
    hookTimeout: 120_000,
    include: ["integration-tests/**/*.spec.ts"],
    exclude: ["integration-tests/app/**"],
    testTimeout: 120_000,
  },
});
