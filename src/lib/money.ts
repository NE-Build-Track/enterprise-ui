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

export type DisplayAmount = { readonly text: string; readonly exact: string };

/** Familiar currency text. `exact` keeps the decimal string for titles and calculations. */
export function formatDisplayMoney(money: Money | null | undefined): DisplayAmount {
  if (!money) return { text: "Pending", exact: "" };
  if (money.currency === "USD") return formatUsdDisplay(money.amount);
  const exact = `${money.amount} ETH`;
  return { text: exact, exact };
}

export function formatUsdDisplay(amount: string | null | undefined): DisplayAmount {
  if (amount === null) return { text: "No USD price", exact: "" };
  if (amount === undefined || amount === "") return { text: "Pending", exact: "" };
  const exact = `${amount} USD`;
  const value = parseDecimal(amount);
  if (!value) return { text: exact, exact };
  if (value.gt(0) && value.lt("0.01")) return { text: "<$0.01", exact };
  const places = value.abs().gte(1) ? 2 : Math.min(6, Math.max(2, fractionDigits(value)));
  const fixed = value.toFixed(places);
  const negative = fixed.startsWith("-");
  const [whole, frac = ""] = fixed.replace("-", "").split(".");
  const grouped = groupThousands(whole ?? "");
  return { text: `${negative ? "-" : ""}$${grouped}.${frac}`, exact };
}

function groupThousands(whole: string): string {
  const digits = [...whole];
  const parts: string[] = [];
  for (let index = 0; index < digits.length; index += 1) {
    const remaining = digits.length - index;
    if (index > 0 && remaining % 3 === 0) parts.push(",");
    parts.push(digits[index] ?? "");
  }
  return parts.join("");
}

function fractionDigits(value: Decimal): number {
  const text = trimTrailingZeros(value.abs().toFixed(8));
  const dot = text.indexOf(".");
  if (dot === -1) return 0;
  return text.length - dot - 1;
}

function trimTrailingZeros(text: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === "0") end -= 1;
  return text.slice(0, end);
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

const shortTime = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** A short local time for people. Callers keep the ISO string in `datetime`. */
export function formatTime(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === "") return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return shortTime.format(date);
}

export function defaultCostWindow(now: Date = new Date()): { start: string; end: string } {
  const end = now;
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}
