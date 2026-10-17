import { beforeEach, expect, it, vi } from "vitest";

type FundGrant = (call: unknown, grantId: string, amount: string, operationRef: string) => Promise<void>;

const fundGrant = vi.hoisted(() => vi.fn<FundGrant>(async () => undefined));

vi.mock("@/lib/engine/api", () => ({ fundGrant }));
vi.mock("@/lib/engine/server", () => ({ adminCall: () => ({}) }));
vi.mock("@/lib/http", () => ({
  readBody: async (request: Request) => {
    try {
      return await request.json();
    } catch {
      return null;
    }
  },
  withOperator: async (handler: () => Promise<Response>) => handler(),
}));

import { POST } from "./route";

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/operator/grants/fund", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  fundGrant.mockClear();
});

it("rejects a blank grant before funding", async () => {
  const response = await post({ grantId: "  ", amount: "50" });
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "choose a grant" });
  expect(fundGrant).not.toHaveBeenCalled();
});

it("funds the grant named in the request", async () => {
  const response = await post({ grantId: " grant-1 ", amount: "50" });
  expect(response.status).toBe(204);
  expect(fundGrant).toHaveBeenCalledWith(expect.anything(), "grant-1", "50", expect.any(String));
});
