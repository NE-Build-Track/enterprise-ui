import { expect, it } from "vitest";

import type { JobCost } from "@/lib/engine/types";

import { costPollDelay, mergeJobCosts } from "./use-console";

const cost = (status: JobCost["status"], feeUsd = "0"): JobCost => ({
  job_id: "job-1",
  status,
  fees: { fee_eth: "0", fee_usd: feeUsd, row_count: 1 },
  attempts: [],
  first_observed_at: null,
  updated_at: null,
});

it("polls every 30 seconds while priced jobs remain mounted", () => {
  expect(costPollDelay([])).toBeNull();
  expect(costPollDelay(["job-1"])).toBe(30_000);
});

it("replaces an observed cost with a later correction", () => {
  const observed = cost("observed", "1");
  const corrected = cost("corrected", "2");
  const next = mergeJobCosts(new Map([["job-1", observed]]), [["job-1", corrected]], new Set(["job-1"]));

  expect(next.get("job-1")).toBe(corrected);
});
