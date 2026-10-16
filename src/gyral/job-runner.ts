import { define, html, outputs, prop, type Next } from "@gyral/core";
import { request, type HttpError } from "@gyral/http";
import { delay } from "@gyral/time";

import {
  alignMediaType,
  coerceField,
  fieldsMismatch,
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
import { inputSummary, offeringCopy, readyCopy, tasksMatching } from "@/lib/job-copy";

import { isOffering, listOf, sameJson } from "./guards";
import { widgetStyles } from "./styles";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];

export type JobRunnerOutput =
  | { readonly _tag: "AppSelected"; readonly app: string }
  | { readonly _tag: "OfferingRemembered"; readonly app: string }
  | {
      readonly _tag: "JobCompleted";
      readonly jobId: string | null;
      readonly conflict: boolean;
      readonly failed: boolean;
      readonly operationRef: string;
      readonly request: JobRequest | null;
      readonly result: { readonly body: string; readonly contentType: string } | null;
    };

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
  readonly editorChosen: boolean;
  readonly editorNote: string;
  readonly fieldErrors: Readonly<Record<string, string>>;
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
  readonly query: string;
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
  | { readonly _tag: "Query"; readonly value: string }
  | { readonly _tag: "Run" }
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

export function jobBody(state: RunnerState): { ok: true; value: JobRequest } | { ok: false; message: string; fields: Readonly<Record<string, string>> } {
  const fail = (message: string, fields: Readonly<Record<string, string>> = {}) => ({ ok: false as const, message, fields });
  if (!state.app) return fail("Choose a task.");
  if (state.path !== "" && !state.path.startsWith("/")) return fail("Path must start with /.");
  if (state.schemaPhase === "loading") return fail("The request schema is still loading.");
  if (state.schemaPhase === "blocked") {
    return fail(state.error || "The request schema could not be loaded.");
  }
  const payload = parsePayload(state.payloadText);
  if (!payload.ok) return fail(payload.message);
  const missing = missingRequired(payload.value, state.requiredKeys);
  if (missing.length > 0) {
    const fields = Object.fromEntries(missing.map((key) => [key, `${key} is required`]));
    const message = missing.length === 1 ? `${missing[0]} is required` : `${missing.join(", ")} are required`;
    return fail(message, fields);
  }
  const maxAttempts = Number(state.maxAttempts);
  const timeout = Number(state.timeoutS);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    return fail("Max attempts must be a whole number from 1 to 10.");
  }
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 3600) {
    return fail("Timeout must be between 0 and 3600 seconds.");
  }
  if (state.operationRef.length > 200) return fail("Operation ref must be 200 characters or fewer.");
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
    <legend>Inputs</legend>
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
    ${state.editorNote ? html`<p role="status">${state.editorNote}</p>` : ""}
    ${fields ? fieldsPanel(state, fieldIntent) : jsonPanel(state, payloadIntent)}
  </fieldset>`;
}

function fieldsPanel(state: RunnerState, intent: string) {
  if (state.schemaPhase === "loading") return html`<p role="status">Loading request schema…</p>`;
  const schema = state.schemaPhase === "ready" ? readSchema(state.schemaJson) : null;
  const fields = schema ? formFields(schema, parsedPayload(state.payloadText)) : [];
  if (!schema || fields.length === 0) return html`<p>No field form for this task. Use JSON.</p>`;
  return html`${renderTree(fields, intent, state.fieldErrors)}
    <p>Fields from this task's schema. Extra JSON keys are kept.</p>`;
}

function jsonPanel(state: RunnerState, intent: string) {
  return html`<label>
      Payload <abbr title="JavaScript Object Notation">JSON</abbr> (optional)
      <textarea data-intent=${intent} spellcheck="false">${state.payloadText}</textarea>
    </label>
    ${
      state.schemaPhase === "absent" && state.prefilled
        ? html`<p>Example inputs for this single-shot app. Replace placeholder URLs before you run it.</p>`
        : state.schemaPhase === "ready"
          ? html`<p>This JSON is the request generated from the capability schema.</p>`
          : ""
    }`;
}

function parsedPayload(text: string): Record<string, unknown> | null {
  const parsed = parsePayload(text);
  return parsed.ok ? parsed.value : null;
}

function renderTree(fields: readonly FormField[], intent: string, errors: Readonly<Record<string, string>>) {
  return html`<ul class="tree">${fields.map((field) => renderNode(field, intent, errors))}</ul>`;
}

function fieldMessage(field: FormField, errors: Readonly<Record<string, string>>): string {
  if (field.kind === "group") return errors[field.label] ?? "";
  return errors[field.path] ?? errors[field.path.split(".")[0] ?? ""] ?? "";
}

function renderNode(field: FormField, intent: string, errors: Readonly<Record<string, string>>): ReturnType<typeof html> {
  const message = fieldMessage(field, errors);
  if (field.kind === "group") {
    return html`<li>
      <details open>
        <summary>${field.label}</summary>
        ${message ? html`<p role="alert">${message}</p>` : ""}
        <ul>
          ${field.fields.map((child) => renderNode(child, intent, errors))}
        </ul>
      </details>
    </li>`;
  }
  if (field.kind === "enum") {
    return html`<li>
      <label>
        ${field.label}
        <select data-intent=${intent} data-path=${field.path} title=${field.title} aria-invalid=${message ? "true" : "false"}>
          ${field.options.map((option) => html`<option value=${option} ?selected=${option === field.value}>${option}</option>`)}
        </select>
      </label>
      ${message ? html`<p role="alert">${message}</p>` : ""}
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
        aria-invalid=${message ? "true" : "false"}
      />
    </label>
    ${message ? html`<p role="alert">${message}</p>` : ""}
  </li>`;
}

function completed(
  state: RunnerState,
  jobId: string | null,
  conflict: boolean,
  result: { readonly body: string; readonly contentType: string } | null = null,
  failed = false,
) {
  const built = jobBody(state);
  return emit({
    _tag: "JobCompleted",
    jobId,
    conflict,
    failed,
    operationRef: state.operationRef,
    request: built.ok ? built.value : null,
    result: result?.body ? result : null,
  });
}

function withoutFieldError(errors: Readonly<Record<string, string>>, path: string): Readonly<Record<string, string>> {
  const root = path.split(".")[0] ?? path;
  if (!errors[path] && !errors[root]) return errors;
  const next = { ...errors };
  delete next[path];
  delete next[root];
  return next;
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
    editorChosen: false,
    editorNote: "",
    fieldErrors: {},
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
    query: "",
  };
}

function taskChoices(offerings: readonly Offering[], tasks: readonly Offering[], app: string, intent: string) {
  if (offerings.length === 0) return html`<p role="status">No tasks are available.</p>`;
  if (tasks.length === 0) return html`<p role="status">No tasks match this search.</p>`;
  return tasks.map((offering) => {
    const task = offeringCopy(offering.app);
    return html`<label>
      <input type="radio" name="task" value=${offering.app} ?checked=${app === offering.app} data-intent=${intent} />
      <span class="task-name">
        <strong>${task.name}</strong>
        ${task.description ? html`<span class="muted">${task.description}</span>` : ""}
        <code title=${offering.app}>${offering.app}</code>
      </span>
    </label>`;
  });
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
    Query: ({ value }) => ({ _tag: "Query", value: value ?? "" }),
    Run: true,
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
        editor: s.editorChosen ? s.editor : "fields",
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
        editor: s.editorChosen ? s.editor : "json",
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
    Editor: (s, m) => {
      if (m.value === "json") return { ...s, editor: "json", editorChosen: true, editorNote: "" };
      const schema = readSchema(s.schemaJson);
      const parsed = parsePayload(s.payloadText);
      const payload = parsed.ok ? parsed.value : null;
      const fields = schema ? formFields(schema, payload) : [];
      if (!parsed.ok) {
        return { ...s, editor: "json", editorChosen: true, editorNote: "This JSON cannot be shown as fields until it is a valid object." };
      }
      if (!schema || fields.length === 0) {
        return { ...s, editor: "json", editorChosen: true, editorNote: "No field form for this task. JSON stays selected." };
      }
      const mismatch = fieldsMismatch(schema, payload);
      if (mismatch) return { ...s, editor: "json", editorChosen: true, editorNote: mismatch };
      return { ...s, editor: "fields", editorChosen: true, editorNote: "" };
    },
    Field: (s, m) => {
      const parsed = parsePayload(s.payloadText);
      if (!parsed.ok) return { ...s, error: parsed.message, fieldErrors: withoutFieldError(s.fieldErrors, m.path) };
      if (!parsed.value) return { ...s, error: "Payload must be a JSON object." };
      const schema = readSchema(s.schemaJson);
      const path = m.path.split(".");
      const written = alignMediaType(writePath(parsed.value, path, coerceField(schema ? schemaAt(schema, path) : null, m.value)), path);
      if (!isRecord(written)) return s;
      return {
        ...s,
        payloadText: JSON.stringify(written, null, 2),
        prefilled: false,
        error: "",
        fieldErrors: withoutFieldError(s.fieldErrors, m.path),
      };
    },
    Attempts: (s, m) => ({ ...s, maxAttempts: m.value }),
    Timeout: (s, m) => ({ ...s, timeoutS: m.value }),
    Capability: (s, m) => ({ ...s, capability: m.value }),
    Model: (s, m) => ({ ...s, model: m.value }),
    Query: (s, m) => ({ ...s, query: m.value }),
    Run: (s) => {
      if (s.phase === "running") return s;
      const operationRef = nextOperationRef();
      const built = jobBody({ ...s, operationRef });
      if (!built.ok) return { ...s, error: built.message, fieldErrors: built.fields, phase: "failed" as const };
      return [
        { ...s, phase: "running" as const, error: "", fieldErrors: {}, editorNote: "", conflict: false, operationRef },
        [emit({ _tag: "OfferingRemembered", app: s.app }), post(built.value)],
      ];
    },
    View: (s) => [s, s.jobId ? [completed(s, s.jobId, s.conflict)] : []],
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
      [completed(s, m.jobId, false, { body: m.body, contentType: m.contentType })],
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
      const commands = [completed(s, m.jobId, m.conflict, null, true)];
      return m.retryAfter && m.retryAfter > 0 ? [next, [...commands, delay(1000, { _tag: "Tick" })]] : [next, commands];
    },
    Tick: (s) => {
      if (s.countdown === null || s.countdown <= 1) return { ...s, countdown: 0 };
      return [{ ...s, countdown: s.countdown - 1 }, [delay(1000, { _tag: "Tick" })]];
    },
  },
  view: (s, i, ctx) => {
    const selected = ctx.props.offerings.find((item) => item.app === s.app);
    const copy = selected ? offeringCopy(selected.app) : null;
    const parsed = parsePayload(s.payloadText);
    const matched = tasksMatching(ctx.props.offerings, s.query);
    const tasks = selected && !matched.some((item) => item.app === selected.app) ? [selected, ...matched] : matched;
    return html`
    <div class="job-form">
      <fieldset class="tasks">
        <legend>Task</legend>
        <label class="task-search">
          Search tasks
          <input type="search" value=${s.query} data-intent=${i.Query} placeholder="Name or identifier" spellcheck="false" />
        </label>
        <div class="task-list">
          ${taskChoices(ctx.props.offerings, tasks, s.app, i.App)}
        </div>
      </fieldset>
      <form class="job-controls" data-intent=${i.Run}>
      <section class="check">
        <h2>Check and run</h2>
        <dl>
          <dt>Task</dt>
          <dd>${copy ? copy.name : "None selected"}</dd>
          <dt>Inputs</dt>
          <dd>${inputSummary(parsed.ok ? parsed.value : null, !parsed.ok)}</dd>
          <dt>Availability</dt>
          <dd>${selected ? readyCopy(selected.ready_count, selected.runner_count) : "Choose a task."}</dd>
          <dt>Estimated cost</dt>
          <dd>Estimate unavailable</dd>
        </dl>
        <button type="submit" ?disabled=${s.phase === "running" || s.schemaPhase === "loading" || s.schemaPhase === "blocked"}>
          Run job
        </button>
      </section>
      ${requestEditor(s, i.Field, i.Payload, i.Editor)}
      <details>
        <summary>Advanced options</summary>
        <fieldset>
          <legend>Request details</legend>
          <p>Method, path, and routing are filled in. Change them only when the task needs a different request.</p>
          <div class="cluster">
            <label>
              Method
              <select data-intent=${i.Method}>
                ${METHODS.map((method) => html`<option value=${method} ?selected=${s.method === method}>${method}</option>`)}
              </select>
            </label>
            <label>Path <input value=${s.path} data-intent=${i.Path} spellcheck="false" /></label>
            <label>Max attempts <input inputmode="numeric" value=${s.maxAttempts} data-intent=${i.Attempts} /></label>
            <label>Timeout seconds <input inputmode="decimal" value=${s.timeoutS} data-intent=${i.Timeout} /></label>
            <label>Capability <input value=${s.capability} data-intent=${i.Capability} /></label>
            <label>Model <input value=${s.model} data-intent=${i.Model} /></label>
          </div>
          ${
            s.operationRef
              ? html`<label>
                  Operation ref <input value=${s.operationRef} readonly spellcheck="false" />
                </label>`
              : ""
          }
        </fieldset>
      </details>
      </form>
    </div>
    ${statusView(s, i.View)}
    ${s.error ? html`<p role="alert">${s.error}</p>` : ""}
  `;
  },
});

declare global {
  interface HTMLElementTagNameMap {
    "lp-job-runner": InstanceType<typeof JobRunner>;
  }
}
