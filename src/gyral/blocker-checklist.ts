import { define, html, outputs, prop } from "@gyral/core";
import { get, request, type HttpError } from "@gyral/http";

import { failedAfterPayment, hasUnattributed, t9Status } from "@/lib/attribution";
import { isJob, isRecord } from "@/lib/engine/errors";
import type { EngineHealth, Job, Reconciliation } from "@/lib/engine/types";
import type { ReservedProbe } from "@/lib/engine/api";
import { formatEth, formatUsd } from "@/lib/money";
import { baselinePins } from "@/lib/pins";
import { probeRow, type ProbeRow } from "@/lib/probe";

import { isReconciliation, listOf, orNull, sameJson } from "./guards";
import { widgetStyles } from "./styles";

export type BlockerOutput = {
  readonly _tag: "Download";
  readonly probe: readonly ProbeRow[];
  readonly repeat: {
    readonly operationRef: string;
    readonly firstStatus: number | null;
    readonly secondStatus: number | null;
    readonly spendBefore: string | null;
    readonly spendAfter: string | null;
  };
};

type ActorCheck = {
  readonly actorId: string;
  readonly reconciliation: Reconciliation | null;
  readonly error: string;
};

type Props = {
  readonly health: EngineHealth | null;
  readonly healthError: string;
  readonly actors: readonly ActorCheck[];
  readonly reserved: readonly ReservedProbe[];
  readonly probeNonce: string;
  readonly repeatRef: string;
  readonly repeatApp: string;
};

type State = {
  readonly probePhase: "idle" | "running" | "done" | "failed";
  readonly queue: readonly string[];
  readonly rows: readonly ProbeRow[];
  readonly probeError: string;
  readonly repeatPhase: "idle" | "running" | "done" | "failed";
  readonly firstStatus: number | null;
  readonly secondStatus: number | null;
  readonly spendBefore: string | null;
  readonly spendAfter: string | null;
  readonly repeatError: string;
};

type Msg =
  | { readonly _tag: "Probe" }
  | { readonly _tag: "Repeat" }
  | { readonly _tag: "Offerings"; readonly apps: readonly string[] }
  | { readonly _tag: "Probed"; readonly app: string; readonly status: number; readonly job: Job | null }
  | { readonly _tag: "ProbeFailed"; readonly message: string }
  | { readonly _tag: "SpendBefore"; readonly amount: string | null }
  | { readonly _tag: "RepeatStatus"; readonly which: "first" | "second"; readonly status: number }
  | { readonly _tag: "SpendAfter"; readonly amount: string | null }
  | { readonly _tag: "RepeatFailed"; readonly message: string }
  | { readonly _tag: "Download" };

const emit = outputs<BlockerOutput>();

function isHealth(value: unknown): value is EngineHealth {
  return isRecord(value) && typeof value.ready === "boolean" && typeof value.version === "string";
}

function isActorCheck(value: unknown): value is ActorCheck {
  if (!isRecord(value) || typeof value.actorId !== "string" || typeof value.error !== "string") return false;
  return value.reconciliation === null || isReconciliation(value.reconciliation);
}

function isReserved(value: unknown): value is ReservedProbe {
  return isRecord(value) && typeof value.route === "string" && typeof value.status === "number";
}

function httpMessage(error: HttpError): string {
  if (error._tag === "HttpStatusError") {
    return isRecord(error.body) && typeof error.body.error === "string" ? error.body.error : `HTTP ${error.status}`;
  }
  if (error._tag === "HttpNetworkError") return error.message;
  return "request failed";
}

function jobFrom(body: unknown): Job | null {
  if (!isRecord(body)) return null;
  if (isJob(body.job)) return body.job;
  return isJob(body) ? body : null;
}

function spentAmount(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.spent) || typeof body.spent.amount !== "string") return null;
  return body.spent.amount;
}

function repeatJob(app: string, operationRef: string, which: "first" | "second") {
  return request(
    {
      url: "/api/jobs",
      method: "POST",
      body: {
        app,
        path: "",
        method: "POST",
        mode: "immediate",
        max_attempts: 1,
        timeout_s: 30,
        operation_ref: operationRef,
        payload: {},
      },
    },
    {
      onSuccess: (): Msg => ({ _tag: "RepeatStatus", which, status: 200 }),
      onFailure: (error): Msg =>
        error._tag === "HttpStatusError"
          ? { _tag: "RepeatStatus", which, status: error.status }
          : { _tag: "RepeatFailed", message: httpMessage(error) },
    },
  );
}

function probeJob(app: string, operationRef: string) {
  return request(
    {
      url: "/api/jobs",
      method: "POST",
      body: {
        app,
        path: "",
        method: "POST",
        mode: "immediate",
        max_attempts: 1,
        timeout_s: 30,
        operation_ref: operationRef,
        payload: {},
      },
    },
    {
      onSuccess: (body) => ({ _tag: "Probed" as const, app, status: 200, job: jobFrom(body) }),
      onFailure: (error) =>
        error._tag === "HttpStatusError"
          ? { _tag: "Probed" as const, app, status: error.status, job: jobFrom(error.body) }
          : { _tag: "ProbeFailed" as const, message: httpMessage(error) },
    },
  );
}

function continueProbe(state: State, rows: readonly ProbeRow[], queue: readonly string[], nonce: string) {
  const [app, ...rest] = queue;
  if (!app) return { ...state, probePhase: "done" as const, rows, queue: [] };
  return [
    { ...state, probePhase: "running" as const, rows, queue: rest },
    [probeJob(app, `${nonce}:${rows.length}`)],
  ] as const;
}

export const BlockerChecklist = define<State, Msg, Props, BlockerOutput>()("lp-blocker-checklist", {
  props: {
    health: prop.value(orNull(isHealth), { default: null, equals: sameJson }),
    healthError: prop.string({ default: "" }),
    actors: prop.value(listOf(isActorCheck), { default: [], equals: sameJson }),
    reserved: prop.value(listOf(isReserved), { default: [], equals: sameJson }),
    probeNonce: prop.string({ default: "" }),
    repeatRef: prop.string({ default: "" }),
    repeatApp: prop.string({ default: "" }),
  },
  styles: widgetStyles,
  init: () => ({
    probePhase: "idle",
    queue: [],
    rows: [],
    probeError: "",
    repeatPhase: "idle",
    firstStatus: null,
    secondStatus: null,
    spendBefore: null,
    spendAfter: null,
    repeatError: "",
  }),
  intent: {
    Probe: true,
    Repeat: true,
    Download: true,
  },
  update: {
    Probe: (s) => [
      { ...s, probePhase: "running", probeError: "", rows: [], queue: [] },
      [
        get("/api/offerings", {
          onSuccess: (body): Msg => ({
            _tag: "Offerings" as const,
            apps: Array.isArray(body) ? body.flatMap((item) => (isRecord(item) && typeof item.app === "string" ? [item.app] : [])) : [],
          }),
          onFailure: (error): Msg => ({ _tag: "ProbeFailed", message: httpMessage(error) }),
        }),
      ],
    ],
    Offerings: (s, m, ctx) => continueProbe(s, [], m.apps, ctx.props.probeNonce),
    Probed: (s, m, ctx) => continueProbe(s, [...s.rows, probeRow(m.app, m.job, m.status)], s.queue, ctx.props.probeNonce),
    ProbeFailed: (s, m) => ({ ...s, probePhase: "failed", probeError: m.message }),
    Repeat: (s) => [
      { ...s, repeatPhase: "running", repeatError: "", firstStatus: null, secondStatus: null, spendBefore: null, spendAfter: null },
      [
        get("/api/allowance", {
          onSuccess: (body): Msg => ({ _tag: "SpendBefore", amount: spentAmount(body) }),
          onFailure: (error): Msg => ({ _tag: "RepeatFailed", message: httpMessage(error) }),
        }),
      ],
    ],
    SpendBefore: (s, m, ctx) =>
      ctx.props.repeatApp
        ? [{ ...s, spendBefore: m.amount }, [repeatJob(ctx.props.repeatApp, ctx.props.repeatRef, "first")]]
        : { ...s, repeatPhase: "failed", repeatError: "Choose an offering on the dashboard before the repeat check.", spendBefore: m.amount },
    RepeatStatus: (s, m, ctx) => {
      if (m.which === "first") {
        return [
          { ...s, firstStatus: m.status },
          [repeatJob(ctx.props.repeatApp, ctx.props.repeatRef, "second")],
        ] as const;
      }
      return [
        { ...s, secondStatus: m.status },
        [
          get("/api/allowance", {
            onSuccess: (body): Msg => ({ _tag: "SpendAfter", amount: spentAmount(body) }),
            onFailure: (error): Msg => ({ _tag: "RepeatFailed", message: httpMessage(error) }),
          }),
        ],
      ] as const;
    },
    SpendAfter: (s, m) => ({ ...s, repeatPhase: "done", spendAfter: m.amount }),
    RepeatFailed: (s, m) => ({ ...s, repeatPhase: "failed", repeatError: m.message }),
    Download: (s, _m, ctx) => [
      s,
      [
        emit({
          _tag: "Download",
          probe: s.rows,
          repeat: {
            operationRef: ctx.props.repeatRef,
            firstStatus: s.firstStatus,
            secondStatus: s.secondStatus,
            spendBefore: s.spendBefore,
            spendAfter: s.spendAfter,
          },
        }),
      ],
    ],
  },
  view: (s, i, ctx) => {
    const reconciliations = ctx.props.actors.flatMap((actor) => (actor.reconciliation ? [actor.reconciliation] : []));
    const t9 = t9Status(reconciliations);
    const rejected = failedAfterPayment(reconciliations);
    const health = ctx.props.health;
    return html`
      <h2>ISS-04 checks</h2>
      <p>
        Pinned engine <code>${baselinePins.engine}</code>, <abbr title="software development kit">SDK</abbr>
        <code>${baselinePins.sdk}</code>, Batteries <code>${baselinePins.batteries}</code>, signer
        <code>${baselinePins.signer}</code>.
      </p>
      <dl>
        <dt>SDK PR 5 / T1</dt>
        <dd>
          ${
            health
              ? `${health.version}, ${health.allocation_mode}, discovery ${health.discovery_fresh ? "fresh" : "stale"} ${health.discovery_error ?? ""}`
              : ctx.props.healthError || "Health has not loaded."
          }
        </dd>
        <dt>T9 clean pass</dt>
        <dd>
          <strong class="chip" data-tone=${t9 === "pass" ? "ok" : t9 === "fail" ? "bad" : "wait"}>${t9}</strong>
        </dd>
        <dt>Forged manifest</dt>
        <dd>${hasUnattributed(reconciliations) ? "Unattributed fees are showing." : "Not shown live. Unattributed fees are zero."}</dd>
        <dt>Rejected ticket</dt>
        <dd>${formatUsd(rejected.fee_usd)} · ${formatEth(rejected.fee_eth)} across ${rejected.row_count} rows.</dd>
      </dl>
      <h2>T10 probe</h2>
      <p>Each probe runs one job per offering with a single attempt. It can spend if an orchestrator accepts payment. The engine chooses the orchestrator.</p>
      <button type="button" data-intent=${i.Probe} ?disabled=${s.probePhase === "running"}>Probe offerings</button>
      <p role="status">${s.probeError}</p>
      <ul>
        ${s.rows.map(
          (row) => html`<li>
            <code>${row.app}</code>: ${row.verdict} via ${row.orchestratorUrl ?? "no orchestrator"} (${row.outcome ?? row.failureKind ?? ""})
          </li>`,
        )}
      </ul>
      <h2>Repeat command</h2>
      <p>Sends the same operation ref twice, then compares Batteries spent.</p>
      <button type="button" data-intent=${i.Repeat} ?disabled=${s.repeatPhase === "running" || !ctx.props.repeatRef}>
        Run repeat check
      </button>
      <p role="status">
        ${s.firstStatus ?? ""} ${s.secondStatus ?? ""}
        ${s.spendBefore ?? ""} → ${s.spendAfter ?? ""}
        ${s.repeatError}
      </p>
      <h2>Reserved features</h2>
      <ul>
        ${ctx.props.reserved.map(
          (row) => html`<li>
            <code>${row.route}</code>: <abbr title="Hypertext Transfer Protocol">HTTP</abbr> ${row.status}
            ${row.milestone ?? ""} ${row.ticket ?? ""} ${row.error ?? ""}
          </li>`,
        )}
      </ul>
      <button type="button" data-intent=${i.Download}>Download evidence</button>
    `;
  },
});

declare global {
  interface HTMLElementTagNameMap {
    "lp-blocker-checklist": InstanceType<typeof BlockerChecklist>;
  }
}
