import { expect, it } from "vitest";

import { actorsFromKeys, classBar, failedAfterPayment, hasUnattributed, t9Status } from "./attribution";
import type { AccessKey, Reconciliation } from "./engine/types";

const key = (actorId: string, revokedAt: string | null): AccessKey => ({
  key_id: `key_${actorId}`,
  kind: "actor",
  actor_id: actorId,
  application_id: "default",
  permissions: ["jobs.run"],
  label: actorId,
  created_at: "2026-10-13T00:00:00Z",
  revoked_at: revokedAt,
});

it("lists actors that still have an active key", () => {
  expect(actorsFromKeys([key("ada", null), key("ada", "2026-10-13T01:00:00Z"), key("bev", "2026-10-13T01:00:00Z")])).toEqual([
    { actorId: "ada", applicationId: "default", activeKeys: 1 },
  ]);
});

it("stacks class amounts and switches to ETH when a USD price is missing", () => {
  const bar = classBar({
    delivered: { fee_eth: "1", fee_usd: "2", row_count: 1 },
    failed_after_payment: { fee_eth: "1", fee_usd: null, row_count: 1 },
    uncertain: { fee_eth: "0", fee_usd: "0", row_count: 0 },
    pending: { fee_eth: "0", fee_usd: "0", row_count: 0 },
  });
  expect(bar.unit).toBe("ETH");
  expect(bar.missingUsd).toBe(true);
  expect(bar.total).toBe("2");
  expect(bar.segments[0]?.width).toBe("50.00%");
});

const reconciliation = (overrides: Partial<Reconciliation>): Reconciliation => ({
  application_id: "default",
  actor_id: "ada",
  allocation_id: "alloc",
  provider_spent: { amount: "1", currency: "USD" },
  by_class: {},
  unattributed: { fee_eth: "0", fee_usd: "0", row_count: 0 },
  balanced: true,
  ...overrides,
});

it("passes T9 only when every actor is balanced and someone has spent", () => {
  expect(t9Status([])).toBe("waiting");
  expect(t9Status([reconciliation({ provider_spent: { amount: "0", currency: "USD" } })])).toBe("waiting");
  expect(t9Status([reconciliation({ balanced: false })])).toBe("fail");
  expect(t9Status([reconciliation({})])).toBe("pass");
});

it("treats a positive unattributed fee as shown live", () => {
  expect(hasUnattributed([reconciliation({})])).toBe(false);
  expect(
    hasUnattributed([
      reconciliation({ unattributed: { fee_eth: "0.01", fee_usd: null, row_count: 1 } }),
    ]),
  ).toBe(true);
  expect(
    failedAfterPayment([
      reconciliation({
        by_class: { failed_after_payment: { fee_eth: "0.5", fee_usd: "1", row_count: 2 } },
      }),
    ]),
  ).toEqual({ fee_eth: "0.5", fee_usd: "1", row_count: 2 });
});
