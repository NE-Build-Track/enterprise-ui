import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

import { DEFERRED_ROUTE_PREFIX, engineHandlers } from "./api";

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

it("implements every OpenAPI route except the deferred allocation commands", () => {
  const spec = JSON.parse(
    readFileSync(path.join(process.cwd(), "openapi/engine.openapi.json"), "utf8"),
  ) as { paths: Record<string, Record<string, unknown>> };
  const missing: string[] = [];
  for (const [route, operations] of Object.entries(spec.paths)) {
    if (route.startsWith(DEFERRED_ROUTE_PREFIX)) continue;
    for (const method of METHODS) {
      if (method in operations) {
        const key = `${method.toUpperCase()} ${route}`;
        if (!(key in engineHandlers)) missing.push(key);
      }
    }
  }
  expect(missing).toEqual([]);
});
