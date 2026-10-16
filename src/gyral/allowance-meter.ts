import { define, html, prop, type Stateless } from "@gyral/core";

import { formatDisplayMoney } from "@/lib/money";
import type { Allowance } from "@/lib/engine/types";

import { isAllowance, orNull, sameJson } from "./guards";
import { widgetStyles } from "./styles";

type Props = {
  readonly allowance: Allowance | null;
  readonly error: string;
};

function finiteNumber(value: string | null): number | null {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const props = {
  allowance: prop.value(orNull(isAllowance), { default: null, equals: sameJson }),
  error: prop.string({ default: "" }),
};

export const AllowanceMeter = define<Stateless, never, Props>()("lp-allowance-meter", {
  props,
  styles: widgetStyles,
  view: (_state, _intents, ctx) => {
    const allowance = ctx.props.allowance;
    if (!allowance) {
      return html`<p role="status">${ctx.props.error || "No allowance loaded."}</p>`;
    }
    const granted = allowance.granted?.amount ?? null;
    const spent = allowance.spent?.amount ?? null;
    const grantedNumber = finiteNumber(granted);
    const spentNumber = finiteNumber(spent);
    const tone = allowance.status === "active" ? "ok" : "wait";
    const grantedText = formatDisplayMoney(allowance.granted);
    const spentText = formatDisplayMoney(allowance.spent);
    const availableText = formatDisplayMoney(allowance.available);
    return html`
      <p>
        <strong class="chip" data-tone=${tone}>${allowance.status}</strong>
        <code>${allowance.allocation_id}</code>
      </p>
      ${
        grantedNumber !== null && spentNumber !== null && grantedNumber > 0
          ? html`<meter min="0" max=${String(grantedNumber)} value=${String(Math.min(spentNumber, grantedNumber))}>
              ${spentText.text} used of ${grantedText.text}
            </meter>`
          : ""
      }
      <dl>
        <dt>Granted</dt>
        <dd title=${grantedText.exact}>${grantedText.text}</dd>
        <dt>Total allowance used</dt>
        <dd title=${spentText.exact}>${spentText.text}</dd>
        <dt>Available</dt>
        <dd title=${availableText.exact}>${availableText.text}</dd>
      </dl>
      <details>
        <summary>Exact amounts</summary>
        <dl>
          <dt>Granted</dt>
          <dd>${grantedText.exact || "Pending"}</dd>
          <dt>Total allowance used</dt>
          <dd>${spentText.exact || "Pending"}</dd>
          <dt>Available</dt>
          <dd>${availableText.exact || "Pending"}</dd>
        </dl>
      </details>
    `;
  },
});

declare global {
  interface HTMLElementTagNameMap {
    "lp-allowance-meter": InstanceType<typeof AllowanceMeter>;
  }
}
