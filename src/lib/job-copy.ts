import type { CostSummary, Job, JobCost, Money, Offering } from "./engine/types";
import { formatDisplayMoney, formatTime, sumDecimals, type DisplayAmount } from "./money";

export type FailureKind = NonNullable<Job["failure"]>["kind"];
export type BillingCurrency = Money["currency"];

const OFFERINGS: Readonly<Record<string, { readonly name: string; readonly description: string }>> = {
  "ffmpeg-compose": {
    name: "Compose media",
    description: "Combine tracks into one video.",
  },
  "ffmpeg-images-to-video": {
    name: "Images to video",
    description: "Turn a sequence of images into a video.",
  },
  "ffmpeg-extract-frame": {
    name: "Extract frame",
    description: "Save one frame from a video.",
  },
  "bg-remove": {
    name: "Remove background",
    description: "Remove the background from an image or video.",
  },
};

const FAILURES: Readonly<Record<FailureKind, { readonly title: string; readonly recovery: string }>> = {
  no_offering: {
    title: "No offering is available for this task.",
    recovery: "Choose another task, or wait until a runner is ready.",
  },
  no_capacity: {
    title: "No runner had capacity.",
    recovery: "Run again when a runner is free. That starts a new job and can incur a new charge.",
  },
  not_provisioned: {
    title: "This key is not provisioned for the task.",
    recovery: "Ask an operator to provision the actor, then run again. A new job can incur a new charge.",
  },
  refused: {
    title: "The runner refused the request.",
    recovery: "Check the input, then run again. A new job can incur a new charge.",
  },
  unreachable: {
    title: "The runner could not be reached.",
    recovery: "Run again later. A new job can incur a new charge.",
  },
  payment: {
    title: "Payment was refused.",
    recovery: "Check available credit before running again. A new job can incur a new charge.",
  },
  timeout: {
    title: "The job timed out.",
    recovery: "Run again with a longer timeout under advanced options. A new job can incur a new charge.",
  },
  runner_rejected: {
    title: "The runner rejected the input.",
    recovery: "Edit the input and run again. A new job can incur a new charge.",
  },
  runner_error: {
    title: "The runner failed while working.",
    recovery: "Run again. A new job can incur a new charge.",
  },
  interrupted: {
    title: "The job was interrupted.",
    recovery: "Run again. A new job can incur a new charge.",
  },
};

const PERIOD_SPEND = ["delivered", "failed_after_payment", "uncertain"] as const;

const windowTime = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

export function jobStateLabel(state: Job["state"]): string {
  if (state === "queued") return "Queued";
  if (state === "running") return "Running";
  if (state === "succeeded") return "Succeeded";
  if (state === "failed") return "Failed";
  return "Uncertain";
}

export function jobStateTone(state: Job["state"]): "ok" | "bad" | "wait" {
  if (state === "succeeded") return "ok";
  if (state === "failed") return "bad";
  return "wait";
}

export function failureCopy(kind: FailureKind | null | undefined): { readonly title: string; readonly recovery: string } {
  if (!kind) {
    return {
      title: "This job failed.",
      recovery: "Run again starts a new job and can incur a new charge.",
    };
  }
  return FAILURES[kind];
}

export function offeringCopy(app: string): { readonly name: string; readonly description: string } {
  const slug = (app.split("/").pop() ?? app).replace(/^fal-/, "");
  const known = OFFERINGS[slug] ?? OFFERINGS[app];
  if (known) return known;
  return { name: fallbackName(slug), description: "" };
}

export function readyCopy(ready: number, runners: number): string {
  if (runners === 0) return "No runners are registered. A runner has to be ready before this task can run.";
  if (ready === 0) {
    return `None of the ${runners} runners are ready. Ready means discovery is current and the runner can accept work.`;
  }
  const noun = ready === 1 ? "runner is" : "runners are";
  return `${ready} of ${runners} ${noun} ready. Ready means discovery is current and the runner can accept work.`;
}

export function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 8) : id;
}

export function jobTitle(job: Pick<Job, "app" | "id" | "operation_ref">): { readonly name: string; readonly detail: string } {
  return {
    name: offeringCopy(job.app).name,
    detail: shortId(job.operation_ref || job.id),
  };
}

export function formatSubmitted(iso: string | null | undefined): string {
  const time = formatTime(iso);
  if (!iso || !time || time === iso) return time;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return time;
  const zone = windowTime.formatToParts(date).find((part) => part.type === "timeZoneName")?.value;
  return zone ? `${time} ${zone}` : time;
}

export function formatWindow(start: string, end: string): string {
  const from = stamp(start);
  const to = stamp(end);
  if (!from || !to) return "the selected period";
  return `${from} to ${to}`;
}

export function formatDuration(startIso: string, endIso: string | null, now = Date.now()): string {
  const start = Date.parse(startIso);
  if (Number.isNaN(start)) return "";
  const end = endIso ? Date.parse(endIso) : now;
  if (Number.isNaN(end)) return "";
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

export function lastUpdate(job: Job): string {
  const times = job.attempts.flatMap((attempt) => [attempt.ended_at, attempt.started_at].filter((value): value is string => Boolean(value)));
  return times.sort().at(-1) ?? job.created_at;
}

export function billingCurrency(available: Money | null | undefined, spent: Money | null | undefined, granted: Money | null | undefined): BillingCurrency {
  return available?.currency ?? spent?.currency ?? granted?.currency ?? "USD";
}

export function formatJobCost(cost: JobCost | null | undefined, currency: BillingCurrency): DisplayAmount {
  if (!cost || cost.status === "none" || cost.status === "pending") return { text: "Awaiting cost", exact: "" };
  if (currency === "ETH") {
    const exact = `${cost.fees.fee_eth} ETH`;
    return { text: exact, exact };
  }
  if (cost.fees.fee_usd === null || cost.fees.fee_usd === "") {
    return { text: "Awaiting cost", exact: cost.fees.fee_eth ? `${cost.fees.fee_eth} ETH` : "" };
  }
  return formatDisplayMoney({ amount: cost.fees.fee_usd, currency: "USD" });
}

export function periodSpendUsd(summary: CostSummary | null): string | null {
  if (!summary) return null;
  const amounts = PERIOD_SPEND.map((name) => summary.by_class[name]?.fee_usd ?? null);
  if (amounts.every((amount) => amount === null)) return null;
  return sumDecimals(amounts.map((amount) => amount ?? "0"));
}

export function reconciliationCopy(balanced: boolean | null): { readonly label: string; readonly tone: "ok" | "bad" | "wait"; readonly detail: string } {
  if (balanced === true) {
    return {
      label: "Balanced",
      tone: "ok",
      detail:
        "Balanced means provider spend matches delivered, failed after payment, uncertain, and unattributed costs. Unattributed can still be above zero.",
    };
  }
  if (balanced === false) {
    return {
      label: "Unbalanced",
      tone: "bad",
      detail: "Provider spend does not match delivered, failed after payment, uncertain, and unattributed costs.",
    };
  }
  return { label: "Unavailable", tone: "wait", detail: "Reconciliation has not been loaded." };
}

export function inputSummary(payload: Record<string, unknown> | null, invalid: boolean): string {
  if (invalid) return "Input is not valid JSON yet.";
  if (!payload || Object.keys(payload).length === 0) return "No input yet.";
  const keys = Object.keys(payload);
  const shown = keys.slice(0, 6).join(", ");
  return keys.length > 6 ? `${shown}, …` : shown;
}

export function offeringByApp(offerings: readonly Offering[], app: string): Offering | undefined {
  return offerings.find((item) => item.app === app);
}

export function tasksMatching<T extends { readonly app: string }>(offerings: readonly T[], query: string): readonly T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return offerings;
  return offerings.filter((offering) => {
    const copy = offeringCopy(offering.app);
    return `${copy.name} ${copy.description} ${offering.app}`.toLowerCase().includes(needle);
  });
}

function fallbackName(slug: string): string {
  const words = slug.split(/[-_]/).filter((word) => word !== "fal" && word !== "ffmpeg");
  const source = words.length > 0 ? words : slug.split(/[-_]/).filter(Boolean);
  if (source.length === 0) return slug;
  const joined: string[] = [];
  for (const word of source) {
    const previous = joined.at(-1);
    if (previous && /^\d+$/.test(word) && /\d$/.test(previous)) {
      joined[joined.length - 1] = `${previous}.${word}`;
      continue;
    }
    joined.push(word);
  }
  return joined.map((word) => (/^\d/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1))).join(" ");
}

function stamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return windowTime.format(date);
}
