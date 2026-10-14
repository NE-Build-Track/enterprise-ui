import { expect, it } from "vitest";

import { formatMoney, formatTime, formatUsd, percentWidth, sameAmount, sumDecimals } from "./money";

it("keeps a missing amount pending and a null USD price unlabeled", () => {
  expect(formatMoney(null)).toBe("pending");
  expect(formatMoney({ amount: "1.50", currency: "USD" })).toBe("1.50 USD");
  expect(formatUsd(null)).toBe("no USD price");
  expect(formatUsd("0")).toBe("0 USD");
});

it("adds decimal strings and refuses to treat a missing price as zero", () => {
  expect(sumDecimals(["0.10", "0.20"])).toBe("0.3");
  expect(sumDecimals(["1", null])).toBeNull();
  expect(sameAmount("1.0", "1.00")).toBe(true);
  expect(sameAmount("1", null)).toBe(false);
});

it("formats an instant as a short local time", () => {
  const iso = "2026-10-13T15:04:00.000Z";
  expect(formatTime(iso)).toBe(
    new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso)),
  );
  expect(formatTime("")).toBe("");
  expect(formatTime(null)).toBe("");
  expect(formatTime("not-a-date")).toBe("not-a-date");
});

it("builds bar widths from decimals", () => {
  expect(percentWidth("1", "4")).toBe("25.00%");
  expect(percentWidth("0", "4")).toBe("0%");
  expect(percentWidth(null, "4")).toBe("0%");
});
