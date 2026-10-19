import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The OpenAPI file is the frontend contract. Every store route file must be
 * documented in it, and every documented path must exist (or be Medusa's own
 * cart completion), so the two cannot drift apart.
 */
const ROOT = join(__dirname, "../../../..");
const STORE = join(ROOT, "src/api/store");
const spec = JSON.parse(readFileSync(join(ROOT, "openapi/consumer-compliance.openapi.json"), "utf8")) as {
  paths: Record<string, Record<string, unknown>>;
};

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return routes(path);
    }
    return name === "route.ts" ? [path] : [];
  });
}

function toOpenApi(file: string): string {
  const route = relative(STORE, file).replace(/\/route\.ts$/u, "");
  return `/store/${route.replace(/\[(\w+)\]/gu, "{$1}")}`;
}

describe("OpenAPI contract", () => {
  it("documents every store route with its methods", () => {
    for (const file of routes(STORE)) {
      const path = toOpenApi(file);
      const source = readFileSync(file, "utf8");
      const methods = [...source.matchAll(/export async function (GET|POST|DELETE)\b/gu)].map((match) => match[1].toLowerCase());
      expect(spec.paths[path], path).toBeDefined();
      for (const method of methods) {
        expect(spec.paths[path][method], `${method} ${path}`).toBeDefined();
      }
    }
  });

  it("documents nothing that does not exist", () => {
    for (const path of Object.keys(spec.paths)) {
      if (path === "/store/carts/{id}/complete") {
        continue;
      }
      const file = join(STORE, path.replace(/^\/store\//u, "").replace(/\{(\w+)\}/gu, "[$1]"), "route.ts");
      expect(existsSync(file), path).toBe(true);
    }
  });

  it("lists the machine-readable error codes", () => {
    const text = JSON.stringify(spec);
    for (const code of ["consent_required", "consent_version_outdated", "external_marketplace_order"]) {
      expect(text).toContain(code);
    }
  });
});
