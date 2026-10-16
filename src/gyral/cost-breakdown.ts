import { define, html, outputs, prop } from "@gyral/core";

import { COST_CLASSES, type CostSummary } from "@/lib/engine/types";
import { formatWindow } from "@/lib/job-copy";
import { formatEth, formatUsdDisplay, percentWidth, sumDecimals } from "@/lib/money";

import { isCostSummary, orNull, sameJson } from "./guards";
import { widgetStyles } from "./styles";

const LABELS: Record<(typeof COST_CLASSES)[number], string> = {
  delivered: "Delivered",
  failed_after_payment: "Failed after payment",
  uncertain: "Uncertain",
  pending: "Awaiting finalization",
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

function dateInputValue(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function isoDay(value: string, edge: "start" | "end"): string {
  if (value === "") return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return "";
  const date =
    edge === "start" ? new Date(year, month - 1, day, 0, 0, 0, 0) : new Date(year, month - 1, day, 23, 59, 59, 999);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function usdTotal(summary: CostSummary): string | null {
  const amounts = COST_CLASSES.map((name) => summary.by_class[name]?.fee_usd);
  if (amounts.some((amount) => amount === null || amount === undefined || amount === "")) return null;
  const total = sumDecimals(amounts);
  if (total === null || total === "0") return null;
  return total;
}

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
    Start: (s, m) => ({ ...s, start: isoDay(m.value, "start") }),
    End: (s, m) => ({ ...s, end: isoDay(m.value, "end") }),
    Apply: (s) => [s, [emit({ _tag: "RangeChanged", start: s.start, end: s.end })]],
    PropsChanged: (s, m) => ({ ...s, start: m.props.start, end: m.props.end }),
  },
  view: (s, i, ctx) => html`
    <search>
      <form class="cluster" data-intent=${i.Apply}>
        <label>Start <input type="date" value=${dateInputValue(s.start)} data-intent=${i.Start} /></label>
        <label>End <input type="date" value=${dateInputValue(s.end)} data-intent=${i.End} /></label>
        <button type="submit">Apply range</button>
      </form>
    </search>
    ${ctx.props.error ? html`<p role="alert">${ctx.props.error}</p>` : ""}
    ${summaryView(ctx.props.summary)}
  `,
});

function summaryView(summary: CostSummary | null) {
  if (!summary) return html`<p role="status">No cost summary yet.</p>`;
  const total = usdTotal(summary);
  const period = formatWindow(summary.start, summary.end);
  return html`
    <p>Spend during selected period, ${period}.</p>
    <p>${summary.jobs_with_cost} jobs with cost. ${summary.jobs_pending} jobs awaiting cost.</p>
    ${
      total
        ? html`<div class="bar wide" aria-hidden="true">
            ${COST_CLASSES.map((name) => {
              const width = percentWidth(summary.by_class[name]?.fee_usd, total);
              return html`<span class=${name} style=${`--fill:${width}`}></span>`;
            })}
          </div>`
        : ""
    }
    <table>
      <caption>Cost classes for ${period}</caption>
      <thead>
        <tr>
          <th scope="col">Category</th>
          <th scope="col">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${COST_CLASSES.map((name) => {
          const display = formatUsdDisplay(summary.by_class[name]?.fee_usd);
          return html`<tr>
            <th scope="row">${LABELS[name]}</th>
            <td title=${display.exact}>${display.text}</td>
          </tr>`;
        })}
      </tbody>
    </table>
    <details>
      <summary>ETH amounts</summary>
      <dl>
        ${COST_CLASSES.map(
          (name) => html`
            <dt>${LABELS[name]}</dt>
            <dd>${formatEth(summary.by_class[name]?.fee_eth)}</dd>
          `,
        )}
      </dl>
    </details>
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "lp-cost-breakdown": InstanceType<typeof CostBreakdown>;
  }
}
