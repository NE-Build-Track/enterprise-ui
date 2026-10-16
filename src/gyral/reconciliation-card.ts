import { define, html, prop, type Stateless } from "@gyral/core";

import { COST_CLASSES, type Reconciliation } from "@/lib/engine/types";
import { reconciliationCopy } from "@/lib/job-copy";
import { formatDisplayMoney, formatEth, formatUsdDisplay } from "@/lib/money";

import { isReconciliation, orNull, sameJson } from "./guards";
import { widgetStyles } from "./styles";

type Props = { readonly reconciliation: Reconciliation | null; readonly error: string };

const LABELS: Record<(typeof COST_CLASSES)[number], string> = {
  delivered: "Delivered",
  failed_after_payment: "Failed after payment",
  uncertain: "Uncertain",
  pending: "Awaiting finalization",
};

export const ReconciliationCard = define<Stateless, never, Props>()("lp-reconciliation-card", {
  props: {
    reconciliation: prop.value(orNull(isReconciliation), { default: null, equals: sameJson }),
    error: prop.string({ default: "" }),
  },
  styles: widgetStyles,
  view: (_state, _intents, ctx) => {
    const row = ctx.props.reconciliation;
    if (!row) return html`<p role="status">${ctx.props.error || "No reconciliation yet."}</p>`;
    const copy = reconciliationCopy(row.balanced);
    const provider = formatDisplayMoney(row.provider_spent);
    const unattributed = formatUsdDisplay(row.unattributed.fee_usd);
    return html`
      <p>
        <strong class="chip" data-tone=${copy.tone}>${copy.label}</strong> <code>${row.allocation_id}</code>
      </p>
      <p>${copy.detail} Reconciliation covers this allocation, not only the selected spending period.</p>
      <table>
        <caption>What reconciliation compared</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Provider spent</th>
            <td title=${provider.exact}>${provider.text}</td>
          </tr>
          ${COST_CLASSES.map((name) => {
            const display = formatUsdDisplay(row.by_class[name]?.fee_usd);
            return html`<tr>
              <th scope="row">${LABELS[name]}</th>
              <td title=${display.exact}>${display.text}</td>
            </tr>`;
          })}
          <tr>
            <th scope="row">Unattributed</th>
            <td title=${unattributed.exact}>${unattributed.text}</td>
          </tr>
        </tbody>
      </table>
      <p>Unattributed is spend that was not tied to a job. It is part of the balanced total, not a second bill.</p>
      <details>
        <summary>ETH amounts</summary>
        <dl>
          ${COST_CLASSES.map(
            (name) => html`
              <dt>${LABELS[name]}</dt>
              <dd>${formatEth(row.by_class[name]?.fee_eth)}</dd>
            `,
          )}
          <dt>Unattributed</dt>
          <dd>${formatEth(row.unattributed.fee_eth)}</dd>
        </dl>
      </details>
    `;
  },
});

declare global {
  interface HTMLElementTagNameMap {
    "lp-reconciliation-card": InstanceType<typeof ReconciliationCard>;
  }
}
