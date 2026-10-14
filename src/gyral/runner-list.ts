import { define, each, html, prop, type Stateless, type TemplateResult } from "@gyral/core";

import type { Runner } from "@/lib/engine/types";

import { isRunner, listOf, sameJson } from "./guards";
import { widgetStyles } from "./styles";

type Props = { readonly runners: readonly Runner[]; readonly error: string };

const Row = (runner: Runner): TemplateResult => html`
  <tr>
    <th scope="row">${runner.orchestrator_url ?? "unknown orchestrator"}</th>
    <td><code>${runner.url}</code></td>
    <td>${runner.capacity_available ?? "—"} / ${runner.capacity ?? "—"}</td>
    <td>${runner.rate ? `${runner.rate.amount} ${runner.rate.currency}/${runner.rate.unit}` : "no rate"}</td>
  </tr>
`;

export const RunnerList = define<Stateless, never, Props>()("lp-runner-list", {
  props: {
    runners: prop.value(listOf(isRunner), { default: [], equals: sameJson }),
    error: prop.string({ default: "" }),
  },
  styles: widgetStyles,
  view: (_state, _intents, ctx) => html`
    ${ctx.props.error ? html`<p role="alert">${ctx.props.error}</p>` : ""}
    ${
      ctx.props.runners.length === 0
        ? html`<p role="status">Choose an offering to list its orchestrators.</p>`
        : html`<table>
            <caption>Orchestrators for the selected offering</caption>
            <thead>
              <tr>
                <th scope="col">Orchestrator</th>
                <th scope="col">Runner</th>
                <th scope="col">Capacity</th>
                <th scope="col">Rate</th>
              </tr>
            </thead>
            <tbody>
              ${each(ctx.props.runners, (runner) => `${runner.url} ${runner.orchestrator_url ?? ""}`, Row)}
            </tbody>
          </table>`
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    "lp-runner-list": InstanceType<typeof RunnerList>;
  }
}
