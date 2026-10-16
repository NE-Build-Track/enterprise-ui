import { expect, it } from "vitest";

import { formatDisplayMoney, formatMoney, formatTime, formatUsd, formatUsdDisplay, percentWidth, sameAmount, sumDecimals } from "./money";

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

it("formats familiar USD amounts and keeps the exact decimal", () => {
  expect(formatUsdDisplay("2.96")).toEqual({ text: "$2.96", exact: "2.96 USD" });
  expect(formatUsdDisplay("0.5")).toEqual({ text: "$0.50", exact: "0.5 USD" });
  expect(formatUsdDisplay("0.1234")).toEqual({ text: "$0.1234", exact: "0.1234 USD" });
  expect(formatUsdDisplay("0.004")).toEqual({ text: "<$0.01", exact: "0.004 USD" });
  expect(formatUsdDisplay("0")).toEqual({ text: "$0.00", exact: "0 USD" });
  expect(formatUsdDisplay("12345.6")).toEqual({ text: "$12,345.60", exact: "12345.6 USD" });
  expect(formatUsdDisplay("-1234")).toEqual({ text: "-$1,234.00", exact: "-1234 USD" });
  expect(formatDisplayMoney({ amount: "2.96", currency: "USD" }).text).toBe("$2.96");
  expect(formatDisplayMoney(null)).toEqual({ text: "Pending", exact: "" });
});

it("builds bar widths from decimals", () => {
  expect(percentWidth("1", "4")).toBe("25.00%");
  expect(percentWidth("0", "4")).toBe("0%");
  expect(percentWidth(null, "4")).toBe("0%");
});
