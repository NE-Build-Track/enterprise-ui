import { define, each, html, outputs, prop, type TemplateResult } from "@gyral/core";

import type { Job } from "@/lib/engine/types";

import { isJob, listOf, sameJson } from "./guards";
import { widgetStyles } from "./styles";

export type JobListOutput = { readonly _tag: "OpenJob"; readonly id: string };

type Props = { readonly jobs: readonly Job[]; readonly error: string; readonly selectedId: string };
type Msg = { readonly _tag: "Open"; readonly id: string };

const emit = outputs<JobListOutput>();

const Row = (job: Job, selectedId: string): TemplateResult => html`
  <tr>
    <td>
      <button
        type="button"
        class="quiet"
        value=${job.id}
        data-intent="Open"
        aria-current=${job.id === selectedId ? "true" : "false"}
      >
        ${job.app}
      </button>
    </td>
    <td>${job.state}</td>
    <td>${job.operation_ref ? html`<code>${job.operation_ref}</code>` : ""}</td>
    <td>${job.created_at ? html`<time datetime=${job.created_at}>${job.created_at}</time>` : ""}</td>
  </tr>
`;

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
  view: (_state, _intents, ctx) => html`
    ${ctx.props.error ? html`<p role="alert">${ctx.props.error}</p>` : ""}
    ${
      ctx.props.jobs.length === 0
        ? html`<p role="status">No jobs for this key yet.</p>`
        : html`<table>
            <caption>Jobs for this key</caption>
            <thead>
              <tr>
                <th scope="col">App</th>
                <th scope="col">State</th>
                <th scope="col">Operation ref</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              ${each(ctx.props.jobs, (job) => job.id, (job) => Row(job, ctx.props.selectedId))}
            </tbody>
          </table>`
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    "lp-job-list": InstanceType<typeof JobList>;
  }
}
