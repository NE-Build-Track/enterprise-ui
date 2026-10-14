import { expect, it } from "vitest";

import { engineErrorFrom } from "./errors";

it("reads the engine problem body, job, and retry header", () => {
  const error = engineErrorFrom(
    503,
    { error: "no capacity", milestone: "M3", ticket: "ISS-26", job: { id: "job-1", state: "failed" } },
    new Headers({ "retry-after": "5", "livepeer-job-id": "job-1" }),
  );
  expect(error.status).toBe(503);
  expect(error.message).toBe("no capacity");
  expect(error.retryAfter).toBe("5");
  expect(error.jobId).toBe("job-1");
  expect(error.milestone).toBe("M3");
  expect(error.ticket).toBe("ISS-26");
  expect(error.job?.id).toBe("job-1");
});

it("turns FastAPI validation details into one message", () => {
  const error = engineErrorFrom(422, { detail: [{ loc: ["body", "app"], msg: "field required" }] }, new Headers());
  expect(error.message).toBe("body.app: field required");
});
