import { define, each, html, outputs, prop, type TemplateResult } from "@gyral/core";

import type { Attempt, Job, JobCost } from "@/lib/engine/types";
import {
  failureCopy,
  formatDuration,
  formatJobCost,
  formatSubmitted,
  jobStateLabel,
  jobStateTone,
  lastUpdate,
  type BillingCurrency,
} from "@/lib/job-copy";
import { formatEth, formatTime, formatUsd } from "@/lib/money";

import { isJob, isJobCost, orNull, sameJson } from "./guards";
import { widgetStyles } from "./styles";

export type TimelineOutput =
  | { readonly _tag: "ReportUsage"; readonly quantities: Readonly<Record<string, number>> }
  | { readonly _tag: "RunAgain" };

type Props = {
  readonly job: Job | null;
  readonly cost: JobCost | null;
  readonly error: string;
  readonly usageError: string;
  readonly currency: BillingCurrency;
  readonly repeat: boolean;
  readonly repeating: boolean;
};

type State = { readonly name: string; readonly amount: string; readonly formError: string };

type Msg =
  | { readonly _tag: "Name"; readonly value: string }
  | { readonly _tag: "Amount"; readonly value: string }
  | { readonly _tag: "Invalid"; readonly message: string }
  | { readonly _tag: "Report"; readonly quantities: Readonly<Record<string, number>> }
  | { readonly _tag: "Again" };

const emit = outputs<TimelineOutput>();

function isCurrency(value: unknown): value is BillingCurrency {
  return value === "USD" || value === "ETH";
}

const AttemptRow = (attempt: Attempt): TemplateResult => html`
  <tr>
    <td>${attempt.number}</td>
    <td>${attempt.outcome}</td>
    <td>${attempt.orchestrator_url ?? ""}</td>
    <td>${attempt.payment_sent ? "yes" : "no"}</td>
    <td>${attempt.status_code ?? ""}</td>
  </tr>
`;

const TechnicalRow = (attempt: Attempt): TemplateResult => html`
  <tr>
    <td>${attempt.number}</td>
    <td>${attempt.runner_url ?? ""}</td>
    <td>${attempt.manifest_id ?? ""}</td>
    <td>${attempt.auth_ids.join(", ")}</td>
  </tr>
`;

export const JobTimeline = define<State, Msg, Props, TimelineOutput>()("lp-job-timeline", {
  props: {
    job: prop.value(orNull(isJob), { default: null, equals: sameJson }),
    cost: prop.value(orNull(isJobCost), { default: null, equals: sameJson }),
    error: prop.string({ default: "" }),
    usageError: prop.string({ default: "" }),
    currency: prop.value(isCurrency, { default: "USD" }),
    repeat: prop.boolean({ default: false }),
    repeating: prop.boolean({ default: false }),
  },
  styles: widgetStyles,
  init: () => ({ name: "", amount: "", formError: "" }),
  intent: {
    Name: ({ value }) => ({ _tag: "Name", value: value ?? "" }),
    Amount: ({ value }) =>
      value === undefined || value === "" || /^\d+$/.test(value) ? { _tag: "Amount", value: value ?? "" } : undefined,
    Send: (_input, ctx) => {
      const name = ctx.state.name.trim();
      if (!name || ctx.state.amount === "") {
        return { _tag: "Invalid", message: "Enter a quantity name and a whole number." };
      }
      return { _tag: "Report", quantities: { [name]: Number(ctx.state.amount) } };
    },
    Again: true,
  },
  update: {
    Name: (s, m) => ({ ...s, name: m.value }),
    Amount: (s, m) => ({ ...s, amount: m.value }),
    Invalid: (s, m) => ({ ...s, formError: m.message }),
    Report: (s, m) => [{ ...s, formError: "" }, [emit({ _tag: "ReportUsage", quantities: m.quantities })]],
    Again: (s) => [s, [emit({ _tag: "RunAgain" })]],
  },
  view: (s, intents, ctx) => {
    const job = ctx.props.job;
    if (!job) return html`<p role="status">${ctx.props.error || "This job is not loaded."}</p>`;
    const amount = formatJobCost(ctx.props.cost, ctx.props.currency);
    const updated = lastUpdate(job);
    return html`
      <p>
        <strong class="chip" data-tone=${jobStateTone(job.state)}>${jobStateLabel(job.state)}</strong>
        <span title=${amount.exact}>${amount.text}</span>
      </p>
      ${outcome(job, ctx.props.repeat, ctx.props.repeating, intents.Again)}
      <p>
        Submitted <time datetime=${job.created_at}>${formatSubmitted(job.created_at)}</time>. Duration
        ${formatDuration(job.created_at, job.completed_at)}.
        ${job.state === "running" || job.state === "queued" ? html`Last update <time datetime=${updated}>${formatSubmitted(updated)}</time>.` : ""}
      </p>
      <details>
        <summary>Technical details</summary>
        <p class="muted">Job <code>${job.id}</code></p>
        ${job.operation_ref ? html`<p class="muted">Operation ref <code>${job.operation_ref}</code></p>` : ""}
        ${job.failure?.body ? html`<pre><samp>${job.failure.body}</samp></pre>` : ""}
        <table>
          <caption>Attempts for this job</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Outcome</th>
              <th scope="col">Orchestrator</th>
              <th scope="col">Paid</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            ${each(job.attempts, (attempt) => attempt.number, AttemptRow)}
          </tbody>
        </table>
        ${
          job.attempts.length > 0
            ? html`<table>
                <caption>Runner, manifest, and payment session for each attempt</caption>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Runner</th>
                    <th scope="col">Manifest</th>
                    <th scope="col">Payment session</th>
                  </tr>
                </thead>
                <tbody>
                  ${each(job.attempts, (attempt) => attempt.number, TechnicalRow)}
                </tbody>
              </table>`
            : ""
        }
        ${costView(ctx.props.cost)}
      </details>
      ${
        job.usage
          ? html`<p>
              Usage <code>${job.usage.source}</code> at
              <time datetime=${job.usage.reported_at}>${formatTime(job.usage.reported_at)}</time>:
              <code>${JSON.stringify(job.usage.quantities)}</code>
            </p>`
          : ""
      }
      ${
        job.state === "succeeded" && job.usage === null
          ? html`<form data-intent=${intents.Send}>
              <fieldset>
                <legend>Report usage</legend>
                <div class="cluster">
                  <label>Name (required) <input name="name" value=${s.name} data-intent=${intents.Name} required /></label>
                  <label>
                    Amount (required)
                    <input name="amount" inputmode="numeric" value=${s.amount} data-intent=${intents.Amount} required />
                  </label>
                  <button type="submit">Report</button>
                </div>
              </fieldset>
              ${s.formError || ctx.props.usageError ? html`<p role="alert">${s.formError || ctx.props.usageError}</p>` : ""}
            </form>`
          : ""
      }
    `;
  },
});

function outcome(job: Job, repeat: boolean, repeating: boolean, again: string) {
  if (job.state === "succeeded") return "";
  if (job.state === "failed") {
    const copy = failureCopy(job.failure?.kind);
    return html`
      <p role="alert">${copy.title} ${job.failure?.message ?? ""}</p>
      <p>${copy.recovery}</p>
      ${
        repeat
          ? html`<p>
              <button type="button" data-intent=${again} ?disabled=${repeating}>Run again</button>
            </p>`
          : ""
      }
    `;
  }
  if (job.state === "uncertain") {
    return html`<p>The outcome of this job is uncertain.</p>`;
  }
  return html`<p>This job is ${jobStateLabel(job.state).toLowerCase()}. Progress percentage is not available.</p>`;
}

function costView(cost: JobCost | null) {
  if (!cost) return "";
  return html`
    <p class="muted">
      Cost ${cost.status}. First observed
      ${cost.first_observed_at ? html`<time datetime=${cost.first_observed_at}>${formatTime(cost.first_observed_at)}</time>` : "not yet"}.
      Updated ${cost.updated_at ? html`<time datetime=${cost.updated_at}>${formatTime(cost.updated_at)}</time>` : "not yet"}.
    </p>
    <ul>
      ${cost.attempts.map(
        (attempt) =>
          html`<li>
            Attempt ${attempt.attempt_number}: ${attempt.cost_class}, ${formatUsd(attempt.fees.fee_usd)} ·
            ${formatEth(attempt.fees.fee_eth)}
          </li>`,
      )}
    </ul>
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "lp-job-timeline": InstanceType<typeof JobTimeline>;
  }
}
