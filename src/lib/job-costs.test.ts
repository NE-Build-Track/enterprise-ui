import { expect, it } from "vitest";

import type { JobCost } from "./engine/types";
import { nextJobCost } from "./job-costs";

const cost = (jobId: string, status: JobCost["status"]): JobCost =>
  ({
    attempts: [],
    fees: { fee_eth: "0", fee_usd: null, row_count: 0 },
    first_observed_at: null,
    job_id: jobId,
    status,
    updated_at: null,
  }) as JobCost;

it("keeps a known cost when a later read fails", () => {
  const pending = cost("job-1", "pending");
  expect(nextJobCost(pending, null)).toBe(pending);
  expect(nextJobCost(null, null)).toBeNull();
  expect(nextJobCost(pending, cost("job-1", "observed"))?.status).toBe("observed");
});
