import { describe, expect, it } from "vitest";
import { parseHit, utcDay, nameUpdate, MAX_FIELD } from "../app/lib/hit";

const ok = {
  angle: "a_x1",
  arm: "matched",
  ad: "123",
  adName: "Outage ad",
  set: "45",
  setName: "Set",
  cmp: "6",
  cmpName: "Camp",
};

describe("parseHit", () => {
  it("accepts a full body", () => {
    expect(parseHit(JSON.stringify(ok))).toEqual({
      angleId: "a_x1",
      arm: "matched",
      adId: "123",
      adName: "Outage ad",
      adsetId: "45",
      adsetName: "Set",
      campaignId: "6",
      campaignName: "Camp",
    });
  });
  it("uses empty strings for missing angle and ad", () => {
    const h = parseHit('{"arm":"none"}');
    expect(h).toMatchObject({ arm: "none", angleId: "", adId: "" });
  });
  it("accepts numeric ids", () => {
    expect(parseHit(JSON.stringify({ ...ok, ad: 123 }))?.adId).toBe("123");
  });
  it("trims and truncates to 255", () => {
    const h = parseHit(JSON.stringify({ ...ok, adName: "  " + "x".repeat(400) + "  " }));
    expect(h?.adName).toHaveLength(MAX_FIELD);
    expect(parseHit(JSON.stringify({ ...ok, angle: "  a  " }))?.angleId).toBe("a");
  });
  it("strips NUL and control characters", () => {
    expect(parseHit(JSON.stringify({ ...ok, adName: "a\u0000b\nc" }))?.adName).toBe("abc");
  });
  it.each([
    ["not json", "nope"],
    ["empty", ""],
    ["array", "[]"],
    ["null", "null"],
    ["number", "5"],
    ["missing arm", JSON.stringify({ angle: "a" })],
    ["bad arm", JSON.stringify({ ...ok, arm: "other" })],
    ["object field", JSON.stringify({ ...ok, ad: { x: 1 } })],
    ["array field", JSON.stringify({ ...ok, angle: ["a"] })],
    ["too large", JSON.stringify({ ...ok, adName: "x".repeat(5000) })],
  ])("rejects %s", (_n, raw) => {
    expect(parseHit(raw)).toBeNull();
  });
});

describe("utcDay", () => {
  it("returns UTC midnight", () => {
    expect(utcDay(new Date("2026-11-06T23:59:59-06:00")).toISOString()).toBe("2026-11-07T00:00:00.000Z");
  });
});

describe("nameUpdate", () => {
  it("drops empty names so stored ones are kept", () => {
    expect(
      nameUpdate({ adName: "", adsetId: "5", adsetName: "", campaignId: "", campaignName: "C" }),
    ).toEqual({ adsetId: "5", campaignName: "C" });
  });
  it("returns nothing when all names are empty", () => {
    expect(nameUpdate({ adName: "", adsetId: "", adsetName: "", campaignId: "", campaignName: "" })).toEqual({});
  });
});
