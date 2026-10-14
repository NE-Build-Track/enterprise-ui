import { isRecord } from "./engine/errors";

export type ApiResult = { readonly ok: true; readonly body: unknown } | { readonly ok: false; readonly status: number; readonly error: string; readonly body: unknown };

export async function api(path: string, init?: RequestInit): Promise<ApiResult> {
  const response = await fetch(path, init);
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 401 && !path.startsWith("/api/session") && !path.startsWith("/api/signup")) {
    window.dispatchEvent(new Event("lp-unauthorized"));
  }
  if (!response.ok) {
    const error = isRecord(body) && typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
    return { ok: false, status: response.status, error, body };
  }
  return { ok: true, body };
}

export function errorText(body: unknown): string {
  return isRecord(body) && typeof body.error === "string" ? body.error : "request failed";
}
