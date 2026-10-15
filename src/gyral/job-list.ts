import { define, each, html, outputs, prop, type TemplateResult } from "@gyral/core";

import type { Job } from "@/lib/engine/types";
import { formatTime } from "@/lib/money";

import { isJob, listOf, sameJson } from "./guards";
import { widgetStyles } from "./styles";

export type JobListOutput = { readonly _tag: "OpenJob"; readonly id: string };

type Props = { readonly jobs: readonly Job[]; readonly error: string; readonly selectedId: string };
type Msg = { readonly _tag: "Open"; readonly id: string };

const emit = outputs<JobListOutput>();

function stateTone(state: Job["state"]): "ok" | "bad" | "wait" {
  if (state === "succeeded") return "ok";
  if (state === "failed") return "bad";
  return "wait";
}

const Row = (job: Job, selectedId: string): TemplateResult => {
  const selected = job.id === selectedId ? "true" : "false";
  return html`
    <tr data-selected=${selected}>
      <th scope="row">
        <button
          type="button"
          class="quiet"
          value=${job.id}
          data-intent="Open"
          aria-current=${job.id === selectedId ? "true" : "false"}
        >
          ${job.app}
        </button>
      </th>
      <td class="state"><strong class="chip" data-tone=${stateTone(job.state)}>${job.state}</strong></td>
      <td class="when">
        ${job.created_at ? html`<time datetime=${job.created_at}>${formatTime(job.created_at)}</time>` : ""}
      </td>
    </tr>
    <tr class="nested" data-selected=${selected}>
      <td colspan="3">
        <span class="field">Operation ref</span>
        ${job.operation_ref ? html`<code>${job.operation_ref}</code>` : html`<span class="muted">None</span>`}
      </td>
    </tr>
  `;
};

export const JobList = define<{ readonly selectedId: string }, Msg, Props, JobListOutput>()("lp-job-list", {
  props: {
    jobs: prop.value(listOf(isJob), { default: [], equals: sameJson }),
    error: prop.string({ default: "" }),
    selectedId: prop.string({ default: "" }),
  },
  styles: widgetStyles,
  init: () => ({ selectedId: "" }),
  intent: {
    Open: ({ value }) => (value ? { _tag: "Open", id: value } : undefined),
  },
  update: {
    Open: (s, m) => [{ selectedId: m.id }, [emit({ _tag: "OpenJob", id: m.id })]],
  },
  view: (_state, _intents, ctx) => {
    const jobs = [...ctx.props.jobs].sort((left, right) => right.created_at.localeCompare(left.created_at));
    return html`
      ${ctx.props.error ? html`<p role="alert">${ctx.props.error}</p>` : ""}
      ${
        jobs.length === 0
          ? html`<p role="status">No jobs for this key yet.</p>`
          : html`<table class="jobs">
              <caption>Jobs for this key, newest first</caption>
              <colgroup>
                <col />
                <col class="state" />
                <col class="when" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">App</th>
                  <th scope="col">State</th>
                  <th scope="col">Created</th>
                </tr>
              </thead>
              <tbody>
                ${each(jobs, (job) => job.id, (job) => Row(job, ctx.props.selectedId))}
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
