import { join } from "node:path";
import { defineConfig, loadEnv } from "@medusajs/framework/utils";

loadEnv("test", process.cwd());

/**
 * A minimal Medusa application that loads this plugin from the repository
 * root (its built `.medusa/server`), for the HTTP integration suite. The
 * database URL is injected by `@medusajs/test-utils`.
 */
module.exports = defineConfig({
  admin: { disable: true },
  modules: [
    {
      // The acknowledgement goes out on the "email" channel; the local provider logs it instead of sending.
      options: {
        providers: [{ id: "local", options: { channels: ["email"] }, resolve: "@medusajs/medusa/notification-local" }],
      },
      resolve: "@medusajs/medusa/notification",
    },
  ],
  plugins: [
    {
      options: {
        withdrawal: {
          seller: { address: "ul. Testowa 1, 00-001 Warszawa", email: "sklep@example.com", name: "Sklep Testowy" },
        },
      },
      resolve: join(__dirname, "../.."),
    },
  ],
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      adminCors: "*",
      authCors: "*",
      cookieSecret: "test",
      jwtSecret: "test",
      storeCors: "*",
    },
  },
});
