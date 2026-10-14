import createClient, { type Client } from "openapi-fetch";

import type { paths } from "./schema";

export type EngineClient = Client<paths>;

export type EngineCall = {
  readonly client: EngineClient;
  readonly baseUrl: string;
  readonly token: string | null;
};

export function createEngineCall(baseUrl: string, token: string | null): EngineCall {
  const normalized = baseUrl.replace(/\/$/, "");
  return {
    baseUrl: normalized,
    token,
    client: createClient<paths>({
      baseUrl: normalized,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  };
}

export async function engineFetch(call: EngineCall, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (call.token) headers.set("authorization", `Bearer ${call.token}`);
  return fetch(new URL(path, `${call.baseUrl}/`), { ...init, headers });
}
