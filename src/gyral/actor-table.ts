import { define, each, html, outputs, prop, type TemplateResult } from "@gyral/core";

import { classBar, totalsByCurrency, type ActorSnapshot } from "@/lib/attribution";
import { formatEth, formatMoney, formatUsd } from "@/lib/money";

import { isActorSnapshot, listOf, sameJson } from "./guards";
import { widgetStyles } from "./styles";

export type ActorTableOutput = { readonly _tag: "LookupJob"; readonly jobId: string };

type Props = { readonly actors: readonly ActorSnapshot[]; readonly error: string; readonly lookupError: string };
type State = { readonly jobId: string };
type Msg = { readonly _tag: "JobId"; readonly value: string } | { readonly _tag: "Lookup"; readonly jobId: string };

const emit = outputs<ActorTableOutput>();

const Row = (actor: ActorSnapshot): TemplateResult => {
  const reconciliation = actor.reconciliation.ok ? actor.reconciliation.value : null;
  const bar = reconciliation ? classBar(reconciliation.by_class) : null;
  const allowance = actor.allowance.ok ? actor.allowance.value : null;
  return html`
    <tr>
      <th scope="row"><bdi>${actor.actorId}</bdi></th>
      <td>${allowance ? formatMoney(allowance.spent) : actor.allowance.ok ? "" : actor.allowance.error}</td>
      <td>${allowance ? formatMoney(allowance.available) : "pending"}</td>
      <td>
        ${
          reconciliation
            ? html`<strong
                class="chip"
                data-tone=${reconciliation.balanced === true ? "ok" : reconciliation.balanced === false ? "bad" : "wait"}
              >
                ${reconciliation.balanced === true ? "balanced" : reconciliation.balanced === false ? "unbalanced" : "unavailable"}
              </strong>`
            : actor.reconciliation.ok
              ? ""
              : actor.reconciliation.error
        }
      </td>
      <td>
        ${
          bar
            ? html`<figure>
                <div class="bar">
                  ${bar.segments.map(
                    (segment) => html`<span class=${segment.costClass} style="--fill: ${segment.width}"></span>`,
                  )}
                </div>
                <figcaption>
                  Spend by class in ${bar.unit}: ${bar.missingUsd ? formatEth(bar.total) : formatUsd(bar.total)}
                </figcaption>
              </figure>`
            : ""
        }
      </td>
    </tr>
  `;
};

export const ActorTable = define<State, Msg, Props, ActorTableOutput>()("lp-actor-attribution-table", {
  props: {
    actors: prop.value(listOf(isActorSnapshot), { default: [], equals: sameJson }),
    error: prop.string({ default: "" }),
    lookupError: prop.string({ default: "" }),
  },
  styles: widgetStyles,
  init: () => ({ jobId: "" }),
  intent: {
    JobId: ({ value }) => ({ _tag: "JobId", value: value ?? "" }),
    Lookup: (_input, ctx) => {
      const jobId = ctx.state.jobId.trim();
      return jobId ? { _tag: "Lookup", jobId } : undefined;
    },
  },
  update: {
    JobId: (s, m) => ({ ...s, jobId: m.value }),
    Lookup: (s, m) => [s, [emit({ _tag: "LookupJob", jobId: m.jobId })]],
  },
  view: (s, i, ctx) => {
    const spent = totalsByCurrency(
      ctx.props.actors.map((actor) => (actor.reconciliation.ok ? actor.reconciliation.value.provider_spent : null)),
    );
    return html`
      <p>
        Across actors, Batteries reports
        ${spent.length === 0 ? "no spend yet" : spent.map((total) => `${total.amount} ${total.currency}`).join(", ")}.
        The engine cannot list another actor's jobs, so look one up by id.
      </p>
      ${ctx.props.error ? html`<p role="alert">${ctx.props.error}</p>` : ""}
      <table>
        <caption>Allowance and reconciliation by actor</caption>
        <thead>
          <tr>
            <th scope="col">Actor</th>
            <th scope="col">Spent</th>
            <th scope="col">Available</th>
            <th scope="col">Reconciliation</th>
            <th scope="col">Classes</th>
          </tr>
        </thead>
        <tbody>
          ${each(ctx.props.actors, (actor) => `${actor.applicationId}/${actor.actorId}`, Row)}
        </tbody>
      </table>
      <search>
        <form class="cluster" data-intent=${i.Lookup}>
          <label>Job id (required) <input value=${s.jobId} data-intent=${i.JobId} required spellcheck="false" /></label>
          <button type="submit">Open job</button>
        </form>
      </search>
      ${ctx.props.lookupError ? html`<p role="alert">${ctx.props.lookupError}</p>` : ""}
    `;
  },
});

declare global {
  interface HTMLElementTagNameMap {
    "lp-actor-attribution-table": InstanceType<typeof ActorTable>;
  }
}
