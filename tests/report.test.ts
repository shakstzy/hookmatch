import { describe, expect, it } from "vitest";
import {
  armStats,
  excludedNote,
  splitCurrencies,
  buildAdRows,
  buildAngleRows,
  formatLift,
  lift,
  parseRange,
  sampleNote,
} from "../app/lib/report";

describe("armStats", () => {
  it("computes conversion and revenue per visit", () => {
    const s = armStats({ sessions: 200, orders: 10, revenue: 500 });
    expect(s.conversion).toBeCloseTo(0.05);
    expect(s.revenuePerVisit).toBeCloseTo(2.5);
  });
  it("handles zero sessions", () => {
    const s = armStats({ sessions: 0, orders: 0, revenue: 0 });
    expect(s.conversion).toBe(0);
    expect(s.revenuePerVisit).toBe(0);
  });
});

describe("lift", () => {
  it("is matched over control minus one", () => {
    const m = armStats({ sessions: 100, orders: 5, revenue: 300 });
    const c = armStats({ sessions: 100, orders: 4, revenue: 200 });
    expect(lift(m, c)).toBeCloseTo(0.5);
  });
  it("is null when control earned nothing", () => {
    const m = armStats({ sessions: 100, orders: 5, revenue: 300 });
    const c = armStats({ sessions: 100, orders: 0, revenue: 0 });
    expect(lift(m, c)).toBeNull();
  });
  it("formats", () => {
    expect(formatLift(0.256)).toBe("+25.6%");
    expect(formatLift(-0.1)).toBe("-10%");
    expect(formatLift(null)).toBe("n/a");
  });
});

describe("sampleNote", () => {
  const big = armStats({ sessions: 300, orders: 1, revenue: 10 });
  const small = armStats({ sessions: 299, orders: 1, revenue: 10 });
  it("names the 300 threshold", () => expect(sampleNote(small, big)).toMatch(/300\+/));
  it("is null at 300+ per arm", () => expect(sampleNote(big, big)).toBeNull());
  it("warns when either arm is under 300", () => {
    expect(sampleNote(small, big)).toMatch(/Too few/);
    expect(sampleNote(big, small)).toMatch(/Too few/);
  });
  it("says so when there is no control", () => {
    expect(sampleNote(big, armStats({ sessions: 0, orders: 0, revenue: 0 }))).toMatch(/No control/);
  });
});

describe("buildAngleRows", () => {
  it("splits arms per angle and ignores unmatched rows", () => {
    const rows = buildAngleRows(
      [
        { angleId: "a1", arm: "matched", sessions: 270 },
        { angleId: "a1", arm: "matched", sessions: 90 },
        { angleId: "a1", arm: "control", sessions: 300 },
        { angleId: "", arm: "none", sessions: 500 },
      ],
      [
        { angleId: "a1", arm: "matched", orders: 6, revenue: 1080 },
        { angleId: "a1", arm: "control", orders: 4, revenue: 600 },
        { angleId: "", arm: "", orders: 9, revenue: 900 },
      ],
    );
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.matched.sessions).toBe(360);
    expect(r.control.revenue).toBe(600);
    expect(r.matched.revenuePerVisit).toBeCloseTo(3);
    expect(r.control.revenuePerVisit).toBeCloseTo(2);
    expect(r.lift).toBeCloseTo(0.5);
    expect(r.note).toBeNull();
  });
  it("includes angles seen only in orders and sorts by revenue", () => {
    const rows = buildAngleRows(
      [{ angleId: "a1", arm: "matched", sessions: 10 }],
      [{ angleId: "a2", arm: "matched", orders: 1, revenue: 50 }],
    );
    expect(rows.map((r) => r.angleId)).toEqual(["a2", "a1"]);
    expect(rows[0]!.note).not.toBeNull();
  });
});

describe("buildAdRows", () => {
  it("joins sessions, orders, names and the busiest angle", () => {
    const rows = buildAdRows(
      [
        { adId: "1", angleId: "a1", sessions: 5 },
        { adId: "1", angleId: "a2", sessions: 20 },
        { adId: "2", angleId: "", sessions: 40 },
        { adId: "", angleId: "a1", sessions: 99 },
      ],
      [
        { adId: "1", orders: 2, revenue: 80 },
        { adId: "3", orders: 1, revenue: 10 },
      ],
      { "1": "Outage ad" },
    );
    expect(rows.map((r) => r.adId)).toEqual(["1", "3", "2"]);
    expect(rows[0]).toMatchObject({ adName: "Outage ad", angleId: "a2", sessions: 25, orders: 2, revenue: 80 });
    expect(rows[2]).toMatchObject({ adName: "", angleId: "", sessions: 40 });
  });
});

describe("parseRange", () => {
  it("accepts 7, 30, 90 and defaults to 7", () => {
    expect(parseRange("30")).toBe(30);
    expect(parseRange("90")).toBe(90);
    expect(parseRange("5")).toBe(7);
    expect(parseRange(null)).toBe(7);
  });
});

describe("currencies", () => {
  it("keeps the most-used currency and names the rest", () => {
    const { currency, excluded } = splitCurrencies([
      { currency: "EUR", orders: 1 },
      { currency: "USD", orders: 5 },
      { currency: "GBP", orders: 2 },
    ]);
    expect(currency).toBe("USD");
    expect(excluded).toEqual([
      { currency: "GBP", orders: 2 },
      { currency: "EUR", orders: 1 },
    ]);
    expect(excludedNote(currency, excluded)).toBe(
      "Revenue is shown in USD only. Orders in other currencies are left out: GBP (2 orders), EUR (1 order).",
    );
  });
  it("has no note for one currency or none", () => {
    expect(excludedNote("USD", splitCurrencies([{ currency: "USD", orders: 3 }]).excluded)).toBeNull();
    expect(splitCurrencies([])).toEqual({ currency: "", excluded: [] });
  });
});

describe("unassigned-ad orders in the per-ad table", () => {
  it("shows an order with arm none and no angle", () => {
    const rows = buildAdRows([{ adId: "9", angleId: "", sessions: 4 }], [{ adId: "9", orders: 1, revenue: 20 }], { "9": "Ad" });
    expect(rows).toEqual([{ adId: "9", adName: "Ad", angleId: "", sessions: 4, orders: 1, revenue: 20 }]);
  });
});
