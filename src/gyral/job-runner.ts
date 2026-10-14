import { define, html, outputs, prop } from "@gyral/core";
import { request, type HttpError } from "@gyral/http";
import { delay } from "@gyral/time";

import { isRecord, isJob } from "@/lib/engine/errors";
import { examplePayload } from "@/lib/example-payload";
import type { JobRequest, Offering } from "@/lib/engine/types";

import { isOffering, listOf, sameJson } from "./guards";
import { widgetStyles } from "./styles";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];

export type JobRunnerOutput =
  | { readonly _tag: "AppSelected"; readonly app: string }
  | { readonly _tag: "JobCompleted"; readonly jobId: string | null; readonly conflict: boolean; readonly operationRef: string };

type Props = {
  readonly offerings: readonly Offering[];
};

export type RunnerState = {
  readonly app: string;
  readonly path: string;
  readonly method: Method;
  readonly payloadText: string;
  readonly prefilled: boolean;
  readonly operationRef: string;
  readonly maxAttempts: string;
  readonly timeoutS: string;
  readonly capability: string;
  readonly model: string;
  readonly phase: "idle" | "running" | "done" | "failed";
  readonly httpStatus: number | null;
  readonly retryAfter: number | null;
  readonly countdown: number | null;
  readonly resultBody: string;
  readonly contentType: string;
  readonly error: string;
  readonly jobId: string | null;
  readonly conflict: boolean;
};

type Msg =
  | { readonly _tag: "App"; readonly value: string }
  | { readonly _tag: "Path"; readonly value: string }
  | { readonly _tag: "Method"; readonly value: Method }
  | { readonly _tag: "Payload"; readonly value: string }
  | { readonly _tag: "Attempts"; readonly value: string }
  | { readonly _tag: "Timeout"; readonly value: string }
  | { readonly _tag: "Capability"; readonly value: string }
  | { readonly _tag: "Model"; readonly value: string }
  | { readonly _tag: "Run" }
  | { readonly _tag: "Retry" }
  | { readonly _tag: "Submit"; readonly body: JobRequest }
  | { readonly _tag: "Finished"; readonly status: number; readonly contentType: string; readonly body: string; readonly jobId: string | null }
  | { readonly _tag: "Failed"; readonly status: number; readonly message: string; readonly jobId: string | null; readonly retryAfter: number | null; readonly conflict: boolean }
  | { readonly _tag: "Tick" };

const emit = outputs<JobRunnerOutput>();

const props = {
  offerings: prop.value(listOf(isOffering), { default: [], equals: sameJson }),
};

function nextOperationRef(): string {
  return `job-${crypto.randomUUID()}`;
}

function isMethod(value: string | undefined): value is Method {
  return METHODS.some((method) => method === value);
}

export function parsePayload(text: string): { ok: true; value: Record<string, unknown> | null } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: null };
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isRecord(parsed)) return { ok: false, message: "Payload must be a JSON object." };
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, message: "Payload is not valid JSON." };
  }
}

export function jobBody(state: RunnerState): { ok: true; value: JobRequest } | { ok: false; message: string } {
  if (!state.app) return { ok: false, message: "Choose an offering." };
  if (state.path !== "" && !state.path.startsWith("/")) return { ok: false, message: "Path must start with /." };
  const payload = parsePayload(state.payloadText);
  if (!payload.ok) return payload;
  const maxAttempts = Number(state.maxAttempts);
  const timeout = Number(state.timeoutS);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    return { ok: false, message: "Max attempts must be a whole number from 1 to 10." };
  }
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 3600) {
    return { ok: false, message: "Timeout must be between 0 and 3600 seconds." };
  }
  if (state.operationRef.length > 200) return { ok: false, message: "Operation ref must be 200 characters or fewer." };
  return {
    ok: true,
    value: {
      app: state.app,
      path: state.path,
      method: state.method,
      mode: "immediate",
      payload: payload.value,
      operation_ref: state.operationRef.trim() || null,
      max_attempts: maxAttempts,
      timeout_s: timeout,
      capability: state.capability.trim() || null,
      model: state.model.trim() || null,
    },
  };
}

function post(body: JobRequest) {
  return request(
    { url: "/api/jobs", method: "POST", body },
    {
      onSuccess: (response) => finished(response),
      onFailure: (error) => failed(error),
    },
  );
}

function finished(response: unknown): Msg {
  if (!isRecord(response)) {
    return { _tag: "Failed", status: 200, message: "Unexpected response", jobId: null, retryAfter: null, conflict: false };
  }
  return {
    _tag: "Finished",
    status: typeof response.status === "number" ? response.status : 200,
    contentType: typeof response.contentType === "string" ? response.contentType : "",
    body: typeof response.body === "string" ? response.body : "",
    jobId: typeof response.jobId === "string" ? response.jobId : null,
  };
}

function failed(error: HttpError): Msg {
  if (error._tag !== "HttpStatusError") {
    const message = error._tag === "HttpNetworkError" ? error.message : "The job request failed.";
    return { _tag: "Failed", status: 0, message, jobId: null, retryAfter: null, conflict: false };
  }
  const body = isRecord(error.body) ? error.body : {};
  const job = isJob(body.job) ? body.job : null;
  const retryAfter = retrySeconds(body.retryAfter);
  return {
    _tag: "Failed",
    status: error.status,
    message: typeof body.error === "string" ? body.error : `The engine returned ${error.status}.`,
    jobId: typeof body.jobId === "string" ? body.jobId : job?.id ?? null,
    retryAfter,
    conflict: error.status === 409,
  };
}

function retrySeconds(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function completed(state: RunnerState, jobId: string | null, conflict: boolean) {
  return emit({ _tag: "JobCompleted", jobId, conflict, operationRef: state.operationRef });
}

export const JobRunner = define<RunnerState, Msg, Props, JobRunnerOutput>()("lp-job-runner", {
  props,
  styles: widgetStyles,
  init: () => ({
    app: "",
    path: "",
    method: "POST",
    payloadText: "",
    prefilled: false,
    operationRef: "",
    maxAttempts: "1",
    timeoutS: "30",
    capability: "",
    model: "",
    phase: "idle",
    httpStatus: null,
    retryAfter: null,
    countdown: null,
    resultBody: "",
    contentType: "",
    error: "",
    jobId: null,
    conflict: false,
  }),
  intent: {
    App: ({ value }) => ({ _tag: "App", value: value ?? "" }),
    Path: ({ value }) => ({ _tag: "Path", value: value ?? "" }),
    Method: ({ value }) => (isMethod(value) ? { _tag: "Method", value } : undefined),
    Payload: ({ value }) => ({ _tag: "Payload", value: value ?? "" }),
    Attempts: ({ value }) =>
      value !== undefined && /^\d+$/.test(value) ? { _tag: "Attempts", value } : undefined,
    Timeout: ({ value }) =>
      value !== undefined && /^\d+(\.\d+)?$/.test(value) ? { _tag: "Timeout", value } : undefined,
    Capability: ({ value }) => ({ _tag: "Capability", value: value ?? "" }),
    Model: ({ value }) => ({ _tag: "Model", value: value ?? "" }),
    Run: true,
    Retry: true,
  },
  update: {
    App: (s, m, ctx) => {
      const offering = ctx.props.offerings.find((item) => item.app === m.value);
      const example = offering ? examplePayload(offering.app, offering.modes) : "";
      return [
        { ...s, app: m.value, payloadText: example, prefilled: example !== "" },
        [emit({ _tag: "AppSelected", app: m.value })],
      ];
    },
    Path: (s, m) => ({ ...s, path: m.value }),
    Method: (s, m) => ({ ...s, method: m.value }),
    Payload: (s, m) => ({ ...s, payloadText: m.value, prefilled: false }),
    Attempts: (s, m) => ({ ...s, maxAttempts: m.value }),
    Timeout: (s, m) => ({ ...s, timeoutS: m.value }),
    Capability: (s, m) => ({ ...s, capability: m.value }),
    Model: (s, m) => ({ ...s, model: m.value }),
    Run: (s) => {
      const operationRef = nextOperationRef();
      const built = jobBody({ ...s, operationRef });
      if (!built.ok) return { ...s, error: built.message, phase: "failed" as const };
      return [{ ...s, phase: "running" as const, error: "", conflict: false, operationRef }, [post(built.value)]];
    },
    Retry: (s) => {
      if (!s.operationRef.trim()) {
        return { ...s, error: "Run a job before retrying with the same operation ref.", phase: "failed" as const };
      }
      const built = jobBody(s);
      if (!built.ok) return { ...s, error: built.message, phase: "failed" as const };
      return [{ ...s, phase: "running" as const, error: "", conflict: false }, [post(built.value)]];
    },
    Submit: (s, m) => [{ ...s, phase: "running", error: "", conflict: false }, [post(m.body)]],
    Finished: (s, m) => [
      {
        ...s,
        phase: "done",
        httpStatus: m.status,
        contentType: m.contentType,
        resultBody: m.body,
        jobId: m.jobId,
        countdown: null,
        conflict: false,
        error: "",
      },
      [completed(s, m.jobId, false)],
    ],
    Failed: (s, m) => {
      const next = {
        ...s,
        phase: "failed" as const,
        httpStatus: m.status,
        error: m.message,
        jobId: m.jobId,
        conflict: m.conflict,
        retryAfter: m.retryAfter,
        countdown: m.retryAfter,
        resultBody: "",
      };
      const commands = [completed(s, m.jobId, m.conflict)];
      return m.retryAfter && m.retryAfter > 0 ? [next, [...commands, delay(1000, { _tag: "Tick" })]] : [next, commands];
    },
    Tick: (s) => {
      if (s.countdown === null || s.countdown <= 1) return { ...s, countdown: 0 };
      return [{ ...s, countdown: s.countdown - 1 }, [delay(1000, { _tag: "Tick" })]];
    },
  },
  view: (s, i, ctx) => html`
    <p>A failed payment is a result. Retrying with the same operation ref must not create a second job.</p>
    <form data-intent=${i.Run}>
      <label>
        Offering (required)
        <select data-intent=${i.App} required>
          <option value="">Choose an offering</option>
          ${ctx.props.offerings.map(
            (offering) => html`
              <option value=${offering.app} ?selected=${s.app === offering.app}>
                ${offering.app} (${offering.ready_count}/${offering.runner_count} ready)
              </option>
            `,
          )}
        </select>
      </label>
      <label>Path (optional) <input value=${s.path} data-intent=${i.Path} spellcheck="false" /></label>
      <label>
        Method
        <select data-intent=${i.Method}>
          ${METHODS.map((method) => html`<option value=${method} ?selected=${s.method === method}>${method}</option>`)}
        </select>
      </label>
      <label>
        Payload <abbr title="JavaScript Object Notation">JSON</abbr> (optional)
        <textarea data-intent=${i.Payload} spellcheck="false">${s.payloadText}</textarea>
      </label>
      ${
        s.prefilled
          ? html`<p>Example inputs for this single-shot app. Replace placeholder URLs before you run it.</p>`
          : ""
      }
      <label>
        Operation ref
        <input value=${s.operationRef} readonly placeholder="Assigned when you run" spellcheck="false" />
      </label>
      <details>
        <summary>Advanced</summary>
        <fieldset>
          <legend>Limits and routing</legend>
          <div class="cluster">
            <label>Max attempts <input inputmode="numeric" value=${s.maxAttempts} data-intent=${i.Attempts} /></label>
            <label>Timeout seconds <input inputmode="decimal" value=${s.timeoutS} data-intent=${i.Timeout} /></label>
            <label>Capability <input value=${s.capability} data-intent=${i.Capability} /></label>
            <label>Model <input value=${s.model} data-intent=${i.Model} /></label>
          </div>
        </fieldset>
      </details>
      <div class="cluster">
        <button type="submit" ?disabled=${s.phase === "running"}>Run job</button>
        <button type="button" data-intent=${i.Retry} ?disabled=${s.phase === "running"}>Retry with same operation ref</button>
      </div>
    </form>
    <p role="status">
      ${s.phase === "running" ? "Running…" : ""}
      ${s.conflict ? `Conflict ${s.httpStatus}: the existing job was kept.` : ""}
      ${s.countdown && s.countdown > 0 ? `Retry after ${s.countdown}s.` : ""}
      ${s.httpStatus ? html`<abbr title="Hypertext Transfer Protocol">HTTP</abbr> ${s.httpStatus}.` : ""}
      ${s.jobId ? html`Job <code>${s.jobId}</code>.` : ""}
    </p>
    ${s.error ? html`<p role="alert">${s.error}</p>` : ""}
    ${
      s.resultBody
        ? html`<figure>
            <figcaption>${s.contentType}</figcaption>
            <pre><samp>${s.resultBody.slice(0, 4000)}</samp></pre>
          </figure>`
        : ""
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    "lp-job-runner": InstanceType<typeof JobRunner>;
  }
}
