import { expect, it } from "vitest";

import { fieldsMismatch } from "./capability-schema";
import type { CostSummary, Job, JobCost } from "./engine/types";
import { failureCopy, formatJobCost, jobStateLabel, offeringCopy, periodSpendUsd, reconciliationCopy, readyCopy, tasksMatching } from "./job-copy";
import { filterJobs, paginate, readJobFilters } from "./job-history";

const job = (patch: Partial<Job>): Job => ({
  id: "job-1",
  actor_id: "ada",
  application_id: "default",
  app: "comfystream/ffmpeg-compose",
  attempts: [],
  capability: null,
  completed_at: null,
  created_at: "2026-10-14T22:41:00.000Z",
  failure: null,
  mode: "immediate",
  model: null,
  operation_ref: "probe-2c962d89",
  result: null,
  state: "queued",
  usage: null,
  ...patch,
});

it("labels job states without folding uncertain into queued", () => {
  expect(jobStateLabel("queued")).toBe("Queued");
  expect(jobStateLabel("uncertain")).toBe("Uncertain");
  expect(jobStateLabel("uncertain")).not.toBe(jobStateLabel("queued"));
});

it("names known tasks and title-cases the rest", () => {
  expect(offeringCopy("comfystream/ffmpeg-compose")).toEqual({
    name: "Compose media",
    description: "Combine tracks into one video.",
  });
  expect(offeringCopy("comfystream/fal-ffmpeg-compose").name).toBe("Compose media");
  expect(offeringCopy("comfystream/fal-bg-remove").name).toBe("Remove background");
  expect(offeringCopy("blueclaw/chat/qwen3-5-27b").name).toBe("Qwen3.5 27b");
  expect(offeringCopy("comfystream/fal-flux-schnell").name).toBe("Flux Schnell");
  expect(offeringCopy("comfystream/fal-flux-schnell").description).toBe("");
  expect(readyCopy(0, 2)).toContain("None of the 2 runners are ready");
});

it("filters tasks by name or identifier", () => {
  const offerings = [{ app: "comfystream/ffmpeg-compose" }, { app: "comfystream/fal-flux-schnell" }];
  expect(tasksMatching(offerings, "compose").map((item) => item.app)).toEqual(["comfystream/ffmpeg-compose"]);
  expect(tasksMatching(offerings, "FLUX").map((item) => item.app)).toEqual(["comfystream/fal-flux-schnell"]);
  expect(tasksMatching(offerings, "").map((item) => item.app)).toEqual(["comfystream/ffmpeg-compose", "comfystream/fal-flux-schnell"]);
});

it("says a failed job's run again can incur a new charge", () => {
  expect(failureCopy("runner_error").recovery).toContain("new charge");
  expect(failureCopy("payment").title).toContain("Payment");
});

it("explains a balanced reconciliation that still has unattributed cost", () => {
  const copy = reconciliationCopy(true);
  expect(copy.label).toBe("Balanced");
  expect(copy.detail).toContain("unattributed");
  expect(copy.detail).toContain("above zero");
});

it("shows awaiting cost separately from a known USD fee", () => {
  const pending: JobCost = {
    job_id: "job-1",
    status: "pending",
    fees: { fee_eth: "0", fee_usd: "0", row_count: 0 },
    attempts: [],
    first_observed_at: null,
    updated_at: null,
  };
  expect(formatJobCost(pending, "USD").text).toBe("Awaiting cost");
  expect(formatJobCost({ ...pending, status: "observed", fees: { fee_eth: "1", fee_usd: "2.96", row_count: 1 } }, "USD").text).toBe("$2.96");
  expect(
    formatJobCost(
      { ...pending, status: "observed", fees: { fee_eth: "4.10026156E-10", fee_usd: "9.97880655857E-7", row_count: 1 } },
      "USD",
    ).text,
  ).toBe("<$0.01");
});

it("sums period spend without the pending class", () => {
  const fees = { fee_usd: "1", fee_eth: "1", row_count: 1 };
  const summary: CostSummary = {
    by_class: {
      delivered: { ...fees, fee_usd: "2" },
      failed_after_payment: fees,
      uncertain: { ...fees, fee_usd: "0.5" },
      pending: { ...fees, fee_usd: "9" },
    },
    start: "2026-10-01T00:00:00.000Z",
    end: "2026-10-14T00:00:00.000Z",
    jobs_pending: 3,
    jobs_with_cost: 2,
  };
  expect(periodSpendUsd(summary)).toBe("3.5");
  expect(summary.jobs_pending).toBe(3);
});

it("filters, searches, and pages newest first", () => {
  const jobs = [
    job({ id: "old", created_at: "2026-10-01T00:00:00.000Z", state: "failed", operation_ref: "alpha" }),
    job({ id: "new", created_at: "2026-10-14T00:00:00.000Z", state: "succeeded", operation_ref: "beta-ref" }),
    job({ id: "mid", created_at: "2026-10-10T00:00:00.000Z", app: "other/task", state: "queued" }),
  ];
  const filters = readJobFilters(new URLSearchParams("q=beta&state=succeeded&page=1"));
  expect(filterJobs(jobs, filters).map((item) => item.id)).toEqual(["new"]);
  const page = paginate(filterJobs(jobs, readJobFilters(new URLSearchParams())), 1, 2);
  expect(page.items.map((item) => item.id)).toEqual(["new", "mid"]);
  expect(page.pages).toBe(2);
});

it("refuses fields when a number is nested", () => {
  const reason = fieldsMismatch({ type: "object", properties: { fps: { type: "number" } } }, { fps: { bad: true } });
  expect(reason).toContain("fps");
  expect(fieldsMismatch({ type: "object", properties: { fps: { type: "number" } } }, { fps: 4 })).toBeNull();
});
