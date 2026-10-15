import { define, html, outputs, prop, type Next } from "@gyral/core";
import { request, type HttpError } from "@gyral/http";
import { delay } from "@gyral/time";

import {
  alignMediaType,
  coerceField,
  formFields,
  missingRequired,
  schemaAt,
  writePath,
  type FormField,
  type SchemaNode,
} from "@/lib/capability-schema";
import { isRecord, isJob } from "@/lib/engine/errors";
import { examplePayload } from "@/lib/example-payload";
import type { JobRequest, Offering } from "@/lib/engine/types";

import { isOffering, listOf, sameJson } from "./guards";
import { widgetStyles } from "./styles";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];

export type JobRunnerOutput =
  | { readonly _tag: "AppSelected"; readonly app: string }
  | { readonly _tag: "OfferingRemembered"; readonly app: string }
  | { readonly _tag: "JobCompleted"; readonly jobId: string | null; readonly conflict: boolean; readonly operationRef: string };

type Props = {
  readonly offerings: readonly Offering[];
  /** `null` until the page has read the last offering. An empty string means nothing was saved. */
  readonly remembered: string | null;
};

export type RunnerState = {
  readonly app: string;
  readonly path: string;
  readonly method: Method;
  readonly payloadText: string;
  readonly prefilled: boolean;
  readonly editor: "fields" | "json";
  readonly schemaPhase: "idle" | "loading" | "ready" | "absent" | "blocked";
  readonly schemaJson: string;
  readonly requiredKeys: readonly string[];
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
  /** Set when the user picks an offering, including clearing it. */
  readonly offeringChosen: boolean;
};

type Msg =
  | { readonly _tag: "App"; readonly value: string }
  | { readonly _tag: "Path"; readonly value: string }
  | { readonly _tag: "Method"; readonly value: Method }
  | { readonly _tag: "Payload"; readonly value: string }
  | { readonly _tag: "Editor"; readonly value: "fields" | "json" }
  | { readonly _tag: "Field"; readonly path: string; readonly value: string }
  | { readonly _tag: "SchemaReady"; readonly app: string; readonly schema: SchemaNode; readonly example: Record<string, unknown>; readonly required: readonly string[] }
  | { readonly _tag: "SchemaAbsent"; readonly app: string }
  | { readonly _tag: "SchemaBlocked"; readonly app: string; readonly message: string }
  | { readonly _tag: "Attempts"; readonly value: string }
  | { readonly _tag: "Timeout"; readonly value: string }
  | { readonly _tag: "Capability"; readonly value: string }
  | { readonly _tag: "Model"; readonly value: string }
  | { readonly _tag: "Run" }
  | { readonly _tag: "Retry" }
  | { readonly _tag: "Submit"; readonly body: JobRequest }
  | { readonly _tag: "Finished"; readonly status: number; readonly contentType: string; readonly body: string; readonly jobId: string | null }
  | { readonly _tag: "Failed"; readonly status: number; readonly message: string; readonly jobId: string | null; readonly retryAfter: number | null; readonly conflict: boolean }
  | { readonly _tag: "Tick" }
  | { readonly _tag: "View" };

const emit = outputs<JobRunnerOutput>();

const COMPOSE_OFFERING = "comfystream/ffmpeg-compose";

export function chooseOffering(offerings: readonly { readonly app: string }[], remembered: string): string {
  if (remembered && offerings.some((item) => item.app === remembered)) return remembered;
  if (offerings.some((item) => item.app === COMPOSE_OFFERING)) return COMPOSE_OFFERING;
  return offerings[0]?.app ?? "";
}

function isRemembered(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

const props = {
  offerings: prop.value(listOf(isOffering), { default: [], equals: sameJson }),
  remembered: prop.value(isRemembered, { default: null }),
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
  if (state.schemaPhase === "loading") return { ok: false, message: "The request schema is still loading." };
  if (state.schemaPhase === "blocked") {
    return { ok: false, message: state.error || "The request schema could not be loaded." };
  }
  const payload = parsePayload(state.payloadText);
  if (!payload.ok) return payload;
  const missing = missingRequired(payload.value, state.requiredKeys);
  if (missing.length === 1) return { ok: false, message: `${missing[0]} is required` };
  if (missing.length > 1) return { ok: false, message: `${missing.join(", ")} are required` };
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

function statusView(state: RunnerState, viewIntent: string) {
  const countdown = state.countdown !== null && state.countdown > 0 ? `Retry after ${state.countdown}s.` : "";
  const http = state.conflict
    ? `Conflict ${state.httpStatus ?? ""}: the existing job was kept.`
    : state.httpStatus
      ? `HTTP ${state.httpStatus}.`
      : "";
  const running = state.phase === "running";
  if (!running && !http && !state.jobId && !countdown) return "";
  return html`
    <div class="cluster">
      <p role="status">
        ${running ? "Running…" : ""}
        ${http}
        ${state.jobId ? html`Job <code>${state.jobId}</code>.` : ""}
        ${countdown}
      </p>
      ${state.jobId ? html`<button type="button" class="quiet" data-intent=${viewIntent}>View job</button>` : ""}
    </div>
  `;
}

function schemaRequest(app: string) {
  return request(
    { url: `/api/capability-schema?app=${encodeURIComponent(app)}`, method: "GET" },
    {
      onSuccess: (body) => schemaReady(app, body),
      onFailure: (error) => schemaFailure(app, error),
    },
  );
}

function schemaReady(app: string, body: unknown): Msg {
  if (!isRecord(body) || !isRecord(body.schema) || !isRecord(body.example) || !Array.isArray(body.required)) {
    return { _tag: "SchemaBlocked", app, message: "The request schema could not be read." };
  }
  const required = body.required.filter((item): item is string => typeof item === "string");
  return { _tag: "SchemaReady", app, schema: body.schema as SchemaNode, example: body.example, required };
}

function schemaFailure(app: string, error: HttpError): Msg {
  if (error._tag === "HttpStatusError" && error.status === 404) return { _tag: "SchemaAbsent", app };
  if (error._tag === "HttpStatusError" && isRecord(error.body) && typeof error.body.error === "string") {
    return { _tag: "SchemaBlocked", app, message: error.body.error };
  }
  const message = error._tag === "HttpNetworkError" ? error.message : "The request schema could not be loaded.";
  return { _tag: "SchemaBlocked", app, message };
}

function readSchema(text: string): SchemaNode | null {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? (parsed as SchemaNode) : null;
  } catch {
    return null;
  }
}

function isEditor(value: string | undefined): value is "fields" | "json" {
  return value === "fields" || value === "json";
}

function requestEditor(state: RunnerState, fieldIntent: string, payloadIntent: string, editorIntent: string) {
  const fields = state.editor === "fields";
  return html`<fieldset class="request-editor">
    <legend>Request</legend>
    <div class="request-tabs">
      <label>
        <input type="radio" name="request-editor" value="fields" ?checked=${fields} data-intent=${editorIntent} />
        Fields
      </label>
      <label>
        <input type="radio" name="request-editor" value="json" ?checked=${!fields} data-intent=${editorIntent} />
        <abbr title="JavaScript Object Notation">JSON</abbr>
      </label>
    </div>
    ${fields ? fieldsPanel(state, fieldIntent) : jsonPanel(state, payloadIntent)}
  </fieldset>`;
}

function fieldsPanel(state: RunnerState, intent: string) {
  if (state.schemaPhase === "loading") return html`<p role="status">Loading request schema…</p>`;
  const schema = state.schemaPhase === "ready" ? readSchema(state.schemaJson) : null;
  const fields = schema ? formFields(schema, parsedPayload(state.payloadText)) : [];
  if (!schema || fields.length === 0) return html`<p>No field form for this offering. Use JSON.</p>`;
  return html`${renderTree(fields, intent)}
    <p>Fields from this app's schema. Extra JSON keys are kept.</p>`;
}

function jsonPanel(state: RunnerState, intent: string) {
  return html`<label>
      Payload <abbr title="JavaScript Object Notation">JSON</abbr> (optional)
      <textarea data-intent=${intent} spellcheck="false">${state.payloadText}</textarea>
    </label>
    ${
      state.prefilled
        ? html`<p>Example inputs for this single-shot app. Replace placeholder URLs before you run it.</p>`
        : ""
    }`;
}

function parsedPayload(text: string): Record<string, unknown> | null {
  const parsed = parsePayload(text);
  return parsed.ok ? parsed.value : null;
}

function renderTree(fields: readonly FormField[], intent: string) {
  return html`<ul class="tree">${fields.map((field) => renderNode(field, intent))}</ul>`;
}

function renderNode(field: FormField, intent: string): ReturnType<typeof html> {
  if (field.kind === "group") {
    return html`<li>
      <details open>
        <summary>${field.label}</summary>
        <ul>
          ${field.fields.map((child) => renderNode(child, intent))}
        </ul>
      </details>
    </li>`;
  }
  if (field.kind === "enum") {
    return html`<li>
      <label>
        ${field.label}
        <select data-intent=${intent} data-path=${field.path} title=${field.title}>
          ${field.options.map((option) => html`<option value=${option} ?selected=${option === field.value}>${option}</option>`)}
        </select>
      </label>
    </li>`;
  }
  return html`<li>
    <label>
      ${field.label}
      <input
        inputmode=${field.kind === "number" ? "decimal" : "text"}
        value=${field.value}
        data-intent=${intent}
        data-path=${field.path}
        title=${field.title}
        spellcheck="false"
      />
    </label>
  </li>`;
}

function completed(state: RunnerState, jobId: string | null, conflict: boolean) {
  return emit({ _tag: "JobCompleted", jobId, conflict, operationRef: state.operationRef });
}

function openOffering(state: RunnerState, app: string, offeringChosen: boolean): Next<RunnerState, Msg> {
  const next = {
    ...state,
    app,
    payloadText: "",
    prefilled: false,
    schemaPhase: app ? ("loading" as const) : ("idle" as const),
    schemaJson: "",
    requiredKeys: [],
    error: "",
    offeringChosen,
  };
  const commands = [
    ...(offeringChosen ? [emit({ _tag: "OfferingRemembered" as const, app })] : []),
    emit({ _tag: "AppSelected" as const, app }),
    ...(app ? [schemaRequest(app)] : []),
  ];
  return [next, commands];
}

function blankRunner(): RunnerState {
  return {
    app: "",
    path: "",
    method: "POST",
    payloadText: "",
    prefilled: false,
    editor: "fields",
    schemaPhase: "idle",
    schemaJson: "",
    requiredKeys: [],
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
    offeringChosen: false,
  };
}

export const JobRunner = define<RunnerState, Msg, Props, JobRunnerOutput>()("lp-job-runner", {
  props,
  styles: widgetStyles,
  init: (initial) => {
    const state = blankRunner();
    if (initial.remembered === null) return state;
    const app = chooseOffering(initial.offerings, initial.remembered);
    return app ? openOffering(state, app, false) : state;
  },
  intent: {
    App: ({ value }) => ({ _tag: "App", value: value ?? "" }),
    Path: ({ value }) => ({ _tag: "Path", value: value ?? "" }),
    Method: ({ value }) => (isMethod(value) ? { _tag: "Method", value } : undefined),
    Payload: ({ value }) => ({ _tag: "Payload", value: value ?? "" }),
    Editor: ({ value }) => (isEditor(value) ? { _tag: "Editor", value } : undefined),
    Field: ({ value, target }) => {
      const path = target.getAttribute("data-path");
      if (!path) return undefined;
      return { _tag: "Field", path, value: value ?? "" };
    },
    Attempts: ({ value }) =>
      value !== undefined && /^\d+$/.test(value) ? { _tag: "Attempts", value } : undefined,
    Timeout: ({ value }) =>
      value !== undefined && /^\d+(\.\d+)?$/.test(value) ? { _tag: "Timeout", value } : undefined,
    Capability: ({ value }) => ({ _tag: "Capability", value: value ?? "" }),
    Model: ({ value }) => ({ _tag: "Model", value: value ?? "" }),
    Run: true,
    Retry: true,
    View: true,
  },
  update: {
    App: (s, m) => openOffering(s, m.value, true),
    PropsChanged: (s, m) => {
      if (s.offeringChosen || s.app || m.props.remembered === null) return s;
      const app = chooseOffering(m.props.offerings, m.props.remembered);
      return app ? openOffering(s, app, false) : s;
    },
    SchemaReady: (s, m) => {
      if (s.app !== m.app) return s;
      return {
        ...s,
        schemaPhase: "ready",
        schemaJson: JSON.stringify(m.schema),
        requiredKeys: m.required,
        payloadText: JSON.stringify(m.example, null, 2),
        prefilled: true,
        error: "",
      };
    },
    SchemaAbsent: (s, m, ctx) => {
      if (s.app !== m.app) return s;
      const offering = ctx.props.offerings.find((item) => item.app === m.app);
      const example = offering ? examplePayload(offering.app, offering.modes) : "";
      return {
        ...s,
        schemaPhase: "absent",
        schemaJson: "",
        requiredKeys: [],
        payloadText: example,
        prefilled: example !== "",
        error: "",
      };
    },
    SchemaBlocked: (s, m) => {
      if (s.app !== m.app) return s;
      return {
        ...s,
        schemaPhase: "blocked",
        schemaJson: "",
        requiredKeys: [],
        payloadText: "",
        prefilled: false,
        error: m.message,
      };
    },
    Path: (s, m) => ({ ...s, path: m.value }),
    Method: (s, m) => ({ ...s, method: m.value }),
    Payload: (s, m) => ({ ...s, payloadText: m.value, prefilled: false }),
    Editor: (s, m) => ({ ...s, editor: m.value }),
    Field: (s, m) => {
      const parsed = parsePayload(s.payloadText);
      if (!parsed.ok) return { ...s, error: parsed.message };
      if (!parsed.value) return { ...s, error: "Payload must be a JSON object." };
      const schema = readSchema(s.schemaJson);
      const path = m.path.split(".");
      const written = alignMediaType(writePath(parsed.value, path, coerceField(schema ? schemaAt(schema, path) : null, m.value)), path);
      if (!isRecord(written)) return s;
      return { ...s, payloadText: JSON.stringify(written, null, 2), prefilled: false, error: "" };
    },
    Attempts: (s, m) => ({ ...s, maxAttempts: m.value }),
    Timeout: (s, m) => ({ ...s, timeoutS: m.value }),
    Capability: (s, m) => ({ ...s, capability: m.value }),
    Model: (s, m) => ({ ...s, model: m.value }),
    Run: (s) => {
      const operationRef = nextOperationRef();
      const built = jobBody({ ...s, operationRef });
      if (!built.ok) return { ...s, error: built.message, phase: "failed" as const };
      return [
        { ...s, phase: "running" as const, error: "", conflict: false, operationRef },
        [emit({ _tag: "OfferingRemembered", app: s.app }), post(built.value)],
      ];
    },
    View: (s) => [s, s.jobId ? [completed(s, s.jobId, s.conflict)] : []],
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
      ${requestEditor(s, i.Field, i.Payload, i.Editor)}
      ${
        s.operationRef
          ? html`<label>
              Operation ref <input value=${s.operationRef} readonly spellcheck="false" />
            </label>`
          : ""
      }
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
        <button type="submit" ?disabled=${s.phase === "running" || s.schemaPhase === "loading" || s.schemaPhase === "blocked"}>
          Run job
        </button>
        <button type="button" class="quiet" data-intent=${i.Retry} ?disabled=${s.phase === "running" || !s.operationRef}>
          Retry last job
        </button>
      </div>
      <p class="muted">Retry last job sends the same request again instead of starting a new one.</p>
    </form>
    ${statusView(s, i.View)}
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
