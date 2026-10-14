import { feePositive, parseDecimal, sumDecimals } from "./money";
import {
  COST_CLASSES,
  type AccessKey,
  type Allowance,
  type CostClass,
  type CostSummary,
  type Fees,
  type Money,
  type Reconciliation,
} from "./engine/types";

export type FieldResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly status: number; readonly error: string };

export type ActorSnapshot = {
  readonly actorId: string;
  readonly applicationId: string;
  readonly activeKeys: number;
  readonly allowance: FieldResult<Allowance>;
  readonly summary: FieldResult<CostSummary>;
  readonly reconciliation: FieldResult<Reconciliation>;
};

export type ActorRef = {
  readonly actorId: string;
  readonly applicationId: string;
  readonly activeKeys: number;
};

export function actorsFromKeys(keys: readonly AccessKey[]): ActorRef[] {
  const rows = new Map<string, { actorId: string; applicationId: string; activeKeys: number }>();
  for (const key of keys) {
    if (key.kind !== "actor") continue;
    const id = `${key.application_id}\u0000${key.actor_id}`;
    const current = rows.get(id) ?? {
      actorId: key.actor_id,
      applicationId: key.application_id,
      activeKeys: 0,
    };
    if (key.revoked_at === null) current.activeKeys += 1;
    rows.set(id, current);
  }
  return [...rows.values()].filter((row) => row.activeKeys > 0);
}

export type SpendTotal = {
  readonly currency: Money["currency"];
  readonly amount: string;
};

export function totalsByCurrency(amounts: readonly (Money | null | undefined)[]): SpendTotal[] {
  const buckets = new Map<Money["currency"], ReturnType<typeof parseDecimal>>();
  for (const money of amounts) {
    if (!money) continue;
    const parsed = parseDecimal(money.amount);
    if (parsed === null) continue;
    const current = buckets.get(money.currency);
    buckets.set(money.currency, current ? current.plus(parsed) : parsed);
  }
  return [...buckets.entries()].flatMap(([currency, amount]) =>
    amount ? [{ currency, amount: amount.toString() }] : [],
  );
}

export type ClassBar = {
  readonly unit: "USD" | "ETH";
  readonly missingUsd: boolean;
  readonly total: string;
  readonly segments: readonly { readonly costClass: CostClass; readonly amount: string; readonly width: string }[];
};

export function classBar(byClass: Readonly<Record<string, Fees | undefined>>): ClassBar {
  const usdValues = COST_CLASSES.map((name) => byClass[name]?.fee_usd);
  const missingUsd = usdValues.some((value) => value === null || value === undefined);
  const unit = missingUsd ? "ETH" : "USD";
  const amounts = COST_CLASSES.map((name) => {
    const fees = byClass[name];
    const raw = unit === "USD" ? fees?.fee_usd : fees?.fee_eth;
    return { costClass: name, amount: raw ?? "0" };
  });
  const total = sumDecimals(amounts.map((segment) => segment.amount)) ?? "0";
  return {
    unit,
    missingUsd,
    total,
    segments: amounts.map((segment) => ({
      ...segment,
      width: widthOf(segment.amount, total),
    })),
  };
}

function widthOf(part: string, whole: string): string {
  const numerator = parseDecimal(part);
  const denominator = parseDecimal(whole);
  if (numerator === null || denominator === null || denominator.isZero() || numerator.lte(0)) return "0%";
  const percent = numerator.div(denominator).mul(100);
  if (percent.gte(100)) return "100%";
  return `${percent.toFixed(2)}%`;
}

export type T9Status = "pass" | "fail" | "waiting";

export function t9Status(rows: readonly Reconciliation[]): T9Status {
  if (rows.length === 0) return "waiting";
  if (rows.some((row) => row.balanced === false)) return "fail";
  if (rows.some((row) => row.balanced === null || row.provider_spent === null)) return "waiting";
  const spent = rows.some((row) => {
    const amount = parseDecimal(row.provider_spent?.amount ?? null);
    return amount !== null && amount.gt(0);
  });
  if (rows.every((row) => row.balanced === true) && spent) return "pass";
  return "waiting";
}

export function hasUnattributed(rows: readonly Reconciliation[]): boolean {
  return rows.some((row) => feePositive(row.unattributed));
}

export function failedAfterPayment(rows: readonly Reconciliation[]): Fees {
  const eth = sumDecimals(rows.map((row) => row.by_class.failed_after_payment?.fee_eth ?? "0"));
  const usdValues = rows.map((row) => row.by_class.failed_after_payment?.fee_usd);
  const usd = usdValues.some((value) => value === null || value === undefined)
    ? null
    : sumDecimals(usdValues.map((value) => value ?? "0"));
  const rowCount = rows.reduce((sum, row) => sum + (row.by_class.failed_after_payment?.row_count ?? 0), 0);
  return { fee_eth: eth ?? "0", fee_usd: usd, row_count: rowCount };
}
