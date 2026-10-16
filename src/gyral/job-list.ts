import { define, each, html, prop, type Stateless, type TemplateResult } from "@gyral/core";

import type { Job, JobCost } from "@/lib/engine/types";
import { formatDuration, formatJobCost, formatSubmitted, jobStateLabel, jobStateTone, jobTitle, type BillingCurrency } from "@/lib/job-copy";

import { isJob, isJobCost, listOf, sameJson } from "./guards";
import { widgetStyles } from "./styles";

type Props = {
  readonly jobs: readonly Job[];
  readonly error: string;
  readonly currency: BillingCurrency;
  readonly costs: readonly JobCost[];
};

function isCurrency(value: unknown): value is BillingCurrency {
  return value === "USD" || value === "ETH";
}

const Row = (job: Job, cost: JobCost | null, currency: BillingCurrency): TemplateResult => {
  const title = jobTitle(job);
  const amount = cost ? formatJobCost(cost, currency) : { text: "Awaiting cost", exact: "" };
  const action = job.result ? "View result" : "View details";
  return html`
    <tr>
      <th scope="row">
        <a href=${`/jobs/${job.id}`}>${title.name}</a>
        <span class="muted">${title.detail}</span>
      </th>
      <td class="state"><strong class="chip" data-tone=${jobStateTone(job.state)}>${jobStateLabel(job.state)}</strong></td>
      <td class="when">
        ${job.created_at ? html`<time datetime=${job.created_at}>${formatSubmitted(job.created_at)}</time>` : ""}
      </td>
      <td>${formatDuration(job.created_at, job.completed_at)}</td>
      <td title=${amount.exact}>${amount.text}</td>
      <td><a class="action" href=${job.result ? `/jobs/${job.id}#result` : `/jobs/${job.id}`}>${action}</a></td>
    </tr>
  `;
};

export const JobList = define<Stateless, never, Props>()("lp-job-list", {
  props: {
    jobs: prop.value(listOf(isJob), { default: [], equals: sameJson }),
    error: prop.string({ default: "" }),
    currency: prop.value(isCurrency, { default: "USD" }),
    costs: prop.value(listOf(isJobCost), { default: [], equals: sameJson }),
  },
  styles: widgetStyles,
  view: (_state, _intents, ctx) => {
    const jobs = [...ctx.props.jobs].sort((left, right) => right.created_at.localeCompare(left.created_at));
    const costs = new Map(ctx.props.costs.map((cost) => [cost.job_id, cost]));
    return html`
      ${ctx.props.error ? html`<p role="alert">${ctx.props.error}</p>` : ""}
      ${
        jobs.length === 0
          ? html`<p role="status">No jobs match.</p>`
          : html`<table class="jobs">
              <caption>Jobs, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">Status</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Cost</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                ${each(
                  jobs,
                  (job) => job.id,
                  (job, picked) => Row(job, picked.cost, picked.currency),
                  (job) => ({ cost: costs.get(job.id) ?? null, currency: ctx.props.currency }),
                )}
              </tbody>
            </table>`
      }
    `;
  },
});

declare global {
  interface HTMLElementTagNameMap {
    "lp-job-list": InstanceType<typeof JobList>;
  }
}
