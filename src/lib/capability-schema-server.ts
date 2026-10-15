import { createHash } from "node:crypto";

import {
  exampleFromSchema,
  registrationsFromDiscovery,
  requestSchema,
  schemaDocumentMatches,
  type Registration,
  type SchemaNode,
} from "@/lib/capability-schema";
import { runners, runJob } from "@/lib/engine/api";
import type { EngineCall } from "@/lib/engine/client";
import { EngineRequestError } from "@/lib/engine/errors";

export type CapabilityForm =
  | { readonly ok: true; readonly app: string; readonly required: readonly string[]; readonly schema: SchemaNode; readonly example: Record<string, unknown> }
  | { readonly ok: false; readonly status: number; readonly error: string };

const schemaBodies = new Map<string, string>();

type Sources = {
  readonly discoveryUrls: (app: string) => Promise<readonly string[]>;
  readonly readDiscovery: (url: string) => Promise<unknown>;
  readonly readSchema: (app: string, path: string) => Promise<string>;
};

export async function loadCapabilityForm(call: EngineCall, app: string): Promise<CapabilityForm> {
  return loadCapabilityFormFrom(app, {
    discoveryUrls: (name) => discoveryUrls(call, name),
    readDiscovery: readDiscovery,
    readSchema: (name, path) => readSchema(call, name, path),
  });
}

export async function loadCapabilityFormFrom(app: string, sources: Sources): Promise<CapabilityForm> {
  const urls = await sources.discoveryUrls(app);
  if (urls.length === 0) return { ok: false, status: 502, error: "discovery could not be read" };
  let sawDiscovery = false;
  let registration: Registration | null = null;
  for (const url of urls) {
    try {
      const body = await sources.readDiscovery(url);
      sawDiscovery = true;
      registration = registrationsFromDiscovery(body).find((item) => item.app === app) ?? null;
      if (registration) break;
    } catch {
      continue;
    }
  }
  if (!sawDiscovery) return { ok: false, status: 502, error: "discovery could not be read" };
  if (!registration) return { ok: false, status: 404, error: "no request schema" };
  const text = await schemaText(registration, sources);
  if (!text.ok) return text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.body) as unknown;
  } catch {
    return { ok: false, status: 422, error: "schema is not JSON" };
  }
  const request = requestSchema(parsed);
  if (!request.ok) return { ok: false, status: 422, error: request.error };
  const example = exampleFromSchema(request.schema);
  if (!example) return { ok: false, status: 422, error: "schema has no request object" };
  return { ok: true, app, required: registration.required, schema: request.schema, example };
}

async function schemaText(
  registration: Registration,
  sources: Sources,
): Promise<{ ok: true; body: string } | { ok: false; status: number; error: string }> {
  const cached = schemaBodies.get(registration.schemaSha256);
  if (cached && matches(cached, registration.schemaSha256)) return { ok: true, body: cached };
  try {
    const body = await sources.readSchema(registration.app, registration.schemaPath);
    if (!matches(body, registration.schemaSha256)) {
      return { ok: false, status: 422, error: "schema hash does not match discovery" };
    }
    schemaBodies.set(registration.schemaSha256, body);
    return { ok: true, body };
  } catch (error) {
    if (error instanceof EngineRequestError) return { ok: false, status: error.status, error: error.message };
    const message = error instanceof Error ? error.message : "schema could not be read";
    return { ok: false, status: 502, error: message };
  }
}

function matches(body: string, expected: string): boolean {
  return schemaDocumentMatches(body, expected, (value) => createHash("sha256").update(value).digest("hex"));
}

async function discoveryUrls(call: EngineCall, app: string): Promise<readonly string[]> {
  const urls: string[] = [];
  const configured = process.env.LPB_DISCOVERY_URL?.trim();
  if (configured) urls.push(configured);
  try {
    const rows = await runners(call, app);
    for (const row of rows) {
      if (row.orchestrator_url) urls.push(`${row.orchestrator_url.replace(/\/$/, "")}/discovery`);
    }
  } catch {
    // A configured discovery URL can still answer when the builder has no runners yet.
  }
  return [...new Set(urls.filter(isHttp))];
}

async function readDiscovery(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`discovery returned ${response.status}`);
  return response.json() as Promise<unknown>;
}

async function readSchema(call: EngineCall, app: string, path: string): Promise<string> {
  const run = await runJob(call, {
    app,
    path,
    method: "GET",
    mode: "immediate",
    payload: null,
    max_attempts: 1,
    timeout_s: 30,
  });
  return run.body;
}

function isHttp(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
