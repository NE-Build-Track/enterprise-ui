import { expect, it } from "vitest";

import type { JobCost } from "@/lib/engine/types";

import { costSettled } from "./use-console";

const cost = (status: JobCost["status"]): JobCost => ({
  job_id: "job-1",
  status,
  fees: { fee_eth: "0", fee_usd: "0", row_count: 0 },
  attempts: [],
  first_observed_at: null,
  updated_at: null,
});

it("keeps polling while a cost is missing, none, or pending", () => {
  expect(costSettled(null)).toBe(false);
  expect(costSettled(cost("none"))).toBe(false);
  expect(costSettled(cost("pending"))).toBe(false);
  expect(costSettled(cost("observed"))).toBe(true);
  expect(costSettled(cost("corrected"))).toBe(true);
});
