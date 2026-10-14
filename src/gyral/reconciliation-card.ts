import { define, html, prop, type Stateless } from "@gyral/core";

import { COST_CLASSES, type Reconciliation } from "@/lib/engine/types";
import { formatEth, formatMoney, formatUsd } from "@/lib/money";

import { isReconciliation, orNull, sameJson } from "./guards";
import { widgetStyles } from "./styles";

type Props = { readonly reconciliation: Reconciliation | null; readonly error: string };

const LABELS: Record<(typeof COST_CLASSES)[number], string> = {
  delivered: "Delivered",
  failed_after_payment: "Failed after payment",
  uncertain: "Uncertain",
  pending: "Pending",
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
    const badge = row.balanced === true ? "balanced" : row.balanced === false ? "unbalanced" : "unavailable";
    const tone = row.balanced === true ? "ok" : row.balanced === false ? "bad" : "wait";
    return html`
      <p>
        <strong class="chip" data-tone=${tone}>${badge}</strong> <code>${row.allocation_id}</code>
      </p>
      <dl>
        <dt>Batteries spent</dt>
        <dd>${formatMoney(row.provider_spent)}</dd>
        ${COST_CLASSES.map(
          (name) => html`
            <dt>${LABELS[name]}</dt>
            <dd>${formatUsd(row.by_class[name]?.fee_usd)} · ${formatEth(row.by_class[name]?.fee_eth)}</dd>
          `,
        )}
        <dt>Unattributed</dt>
        <dd>${formatUsd(row.unattributed.fee_usd)} · ${formatEth(row.unattributed.fee_eth)}</dd>
      </dl>
      <p>Balanced means Batteries spent equals delivered + failed after payment + uncertain + unattributed.</p>
    `;
  },
});

declare global {
  interface HTMLElementTagNameMap {
    "lp-reconciliation-card": InstanceType<typeof ReconciliationCard>;
  }
}
