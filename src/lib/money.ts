import Decimal from "decimal.js-light";

import type { Fees, Money } from "./engine/types";

export function parseDecimal(value: string | null | undefined): Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    return new Decimal(value);
  } catch {
    return null;
  }
}

/** A missing amount stays pending. A present amount keeps its decimal text. */
export function formatMoney(money: Money | null | undefined): string {
  if (money === null || money === undefined) return "pending";
  return `${money.amount} ${money.currency}`;
}

export function formatUsd(amount: string | null | undefined): string {
  if (amount === null) return "no USD price";
  if (amount === undefined || amount === "") return "pending";
  return `${amount} USD`;
}

export function formatEth(amount: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "pending";
  return `${amount} ETH`;
}

export function sameAmount(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  if (a === null || b === null) return left === right;
  return a.eq(b);
}

export function sumDecimals(values: readonly (string | null | undefined)[]): string | null {
  let total = new Decimal(0);
  for (const value of values) {
    if (value === null) return null;
    const parsed = parseDecimal(value);
    if (parsed === null) return null;
    total = total.plus(parsed);
  }
  return total.toString();
}

/** CSS width from two decimal strings. Zero or missing totals produce an empty bar. */
export function percentWidth(part: string | null | undefined, whole: string | null | undefined): string {
  const numerator = parseDecimal(part);
  const denominator = parseDecimal(whole);
  if (numerator === null || denominator === null || denominator.isZero() || numerator.lte(0)) {
    return "0%";
  }
  const percent = numerator.div(denominator).mul(100);
  if (percent.gte(100)) return "100%";
  return `${percent.toFixed(2)}%`;
}

export function feePositive(fees: Fees | null | undefined): boolean {
  if (!fees) return false;
  const eth = parseDecimal(fees.fee_eth);
  const usd = fees.fee_usd === null ? null : parseDecimal(fees.fee_usd);
  return (eth !== null && eth.gt(0)) || (usd !== null && usd.gt(0));
}

export function defaultCostWindow(now: Date = new Date()): { start: string; end: string } {
  const end = now;
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}
