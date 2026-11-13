import { describe, expect, it } from "vitest";
import { normalizeTopic, orderIdsToRedact, parseNoteAttributes, toDecimalString } from "../app/lib/attribution";

describe("parseNoteAttributes", () => {
  it("reads all three attributes", () => {
    expect(
      parseNoteAttributes([
        { name: "_hm_angle", value: "a_x1" },
        { name: "_hm_arm", value: "matched" },
        { name: "_hm_ad", value: "123" },
        { name: "gift", value: "yes" },
      ]),
    ).toEqual({ angleId: "a_x1", arm: "matched", adId: "123" });
  });
  it("accepts a partial set", () => {
    expect(parseNoteAttributes([{ name: "_hm_ad", value: "9" }])).toEqual({ angleId: "", arm: "", adId: "9" });
  });
  it("drops an unknown arm but keeps the rest", () => {
    expect(parseNoteAttributes([{ name: "_hm_angle", value: "a" }, { name: "_hm_arm", value: "zzz" }])).toEqual({
      angleId: "a",
      arm: "",
      adId: "",
    });
  });
  it("returns null when absent or malformed", () => {
    expect(parseNoteAttributes([{ name: "gift", value: "x" }])).toBeNull();
    expect(parseNoteAttributes([])).toBeNull();
    expect(parseNoteAttributes(undefined)).toBeNull();
    expect(parseNoteAttributes("x")).toBeNull();
    expect(parseNoteAttributes([null, 5, { name: 3 }])).toBeNull();
    expect(parseNoteAttributes([{ name: "_hm_angle", value: "" }])).toBeNull();
  });
});

describe("helpers", () => {
  it("normalizes topics", () => {
    expect(normalizeTopic("customers/redact")).toBe("CUSTOMERS_REDACT");
    expect(normalizeTopic("SHOP_REDACT")).toBe("SHOP_REDACT");
  });
  it("validates decimals", () => {
    expect(toDecimalString("19.99")).toBe("19.99");
    expect(toDecimalString("abc")).toBeNull();
    expect(toDecimalString(undefined)).toBeNull();
    expect(toDecimalString("")).toBeNull();
  });
  it("lists orders to redact as strings", () => {
    expect(orderIdsToRedact({ orders_to_redact: [1, "2", null, {}] })).toEqual(["1", "2"]);
    expect(orderIdsToRedact({})).toEqual([]);
    expect(orderIdsToRedact(null)).toEqual([]);
  });
});

describe("unassigned-ad attributes", () => {
  it("stores arm none with an empty angle and an ad id", () => {
    expect(
      parseNoteAttributes([
        { name: "_hm_arm", value: "none" },
        { name: "_hm_angle", value: "" },
        { name: "_hm_ad", value: "123" },
      ]),
    ).toEqual({ angleId: "", arm: "none", adId: "123" });
  });
});
