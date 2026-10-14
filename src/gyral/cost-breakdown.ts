import { define, html, outputs, prop } from "@gyral/core";

import { COST_CLASSES, type CostSummary } from "@/lib/engine/types";
import { formatEth, formatUsd } from "@/lib/money";

import { isCostSummary, orNull, sameJson } from "./guards";
import { widgetStyles } from "./styles";

const LABELS: Record<(typeof COST_CLASSES)[number], string> = {
  delivered: "Delivered",
  failed_after_payment: "Failed after payment",
  uncertain: "Uncertain",
  pending: "Pending",
};

export type CostOutput = { readonly _tag: "RangeChanged"; readonly start: string; readonly end: string };

type Props = {
  readonly summary: CostSummary | null;
  readonly error: string;
  readonly start: string;
  readonly end: string;
};

type State = { readonly start: string; readonly end: string };
type Msg = { readonly _tag: "Start"; readonly value: string } | { readonly _tag: "End"; readonly value: string } | { readonly _tag: "Apply" };

const emit = outputs<CostOutput>();

const props = {
  summary: prop.value(orNull(isCostSummary), { default: null, equals: sameJson }),
  error: prop.string({ default: "" }),
  start: prop.string({ default: "" }),
  end: prop.string({ default: "" }),
};

export const CostBreakdown = define<State, Msg, Props, CostOutput>()("lp-cost-breakdown", {
  props,
  styles: widgetStyles,
  init: (p) => ({ start: p.start, end: p.end }),
  intent: {
    Start: ({ value }) => ({ _tag: "Start", value: value ?? "" }),
    End: ({ value }) => ({ _tag: "End", value: value ?? "" }),
    Apply: true,
  },
  update: {
    Start: (s, m) => ({ ...s, start: m.value }),
    End: (s, m) => ({ ...s, end: m.value }),
    Apply: (s) => [s, [emit({ _tag: "RangeChanged", start: s.start, end: s.end })]],
    PropsChanged: (s, m) => ({ ...s, start: m.props.start, end: m.props.end }),
  },
  view: (s, i, ctx) => html`
    <search>
      <form class="cluster" data-intent=${i.Apply}>
        <label>Start <input type="text" value=${s.start} data-intent=${i.Start} spellcheck="false" /></label>
        <label>End <input type="text" value=${s.end} data-intent=${i.End} spellcheck="false" /></label>
        <button type="submit">Apply range</button>
      </form>
    </search>
    ${ctx.props.error ? html`<p role="alert">${ctx.props.error}</p>` : ""}
    ${summaryView(ctx.props.summary)}
  `,
});

function summaryView(summary: CostSummary | null) {
  if (!summary) return html`<p role="status">No cost summary yet.</p>`;
  return html`
    <p>
      ${summary.jobs_with_cost} jobs with cost, ${summary.jobs_pending} pending. Pending jobs stay beside the totals.
    </p>
    <dl>
      ${COST_CLASSES.map(
        (name) => html`
          <dt>${LABELS[name]}</dt>
          <dd>${formatUsd(summary.by_class[name]?.fee_usd)} · ${formatEth(summary.by_class[name]?.fee_eth)}</dd>
        `,
      )}
    </dl>
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "lp-cost-breakdown": InstanceType<typeof CostBreakdown>;
  }
}
