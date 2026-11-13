import { describe, expect, it } from "vitest";
import {
  assignAdToAngle,
  matchAngle,
  defaultConfig,
  emptyAngle,
  newAngleId,
  publicConfig,
  trimToFree,
  slugify,
  validateConfig,
  type Angle,
  type Config,
} from "../app/lib/config";
import { enforcePlan, resolvePlan } from "../app/lib/config.server";

const angle = (over: Partial<Angle> = {}): Angle => ({
  ...emptyAngle("a_1"),
  slug: "one",
  name: "One",
  ...over,
});
const cfg = (angles: Angle[], holdout = 0, rev = 0): Config => ({
  v: 1,
  rev,
  holdout,
  angles,
});

describe("validateConfig", () => {
  it("accepts the default config", () => {
    const r = validateConfig(defaultConfig());
    expect(r.ok).toBe(true);
    expect(r.config).toEqual({ v: 1, rev: 0, holdout: 0, angles: [] });
  });

  it("accepts the SPEC example shape", () => {
    const r = validateConfig({
      v: 1,
      holdout: 10,
      angles: [
        {
          id: "a_x1",
          slug: "preppers",
          name: "Outage preppers",
          icp: "free text",
          active: true,
          match: {
            adIds: [],
            adsetIds: [],
            campaignIds: [],
            nameContains: ["outage", "prep"],
          },
          content: {
            headline: "",
            subheadline: "",
            media: "",
            mediaType: "image",
            badge: "",
          },
          route: null,
          discountCode: null,
        },
      ],
    });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("rejects non-objects", () => {
    expect(validateConfig(null).ok).toBe(false);
    expect(validateConfig("x").ok).toBe(false);
    expect(validateConfig([]).ok).toBe(false);
  });

  it("checks holdout range and integer", () => {
    expect(validateConfig(cfg([], 50)).ok).toBe(true);
    expect(validateConfig(cfg([], 51)).ok).toBe(false);
    expect(validateConfig(cfg([], -1)).ok).toBe(false);
    expect(validateConfig(cfg([], 2.5)).ok).toBe(false);
    expect(validateConfig({ v: 1, holdout: "10", angles: [] }).ok).toBe(false);
  });

  it("checks slug format and uniqueness", () => {
    expect(validateConfig(cfg([angle({ slug: "Bad Slug" })])).ok).toBe(false);
    expect(validateConfig(cfg([angle({ slug: "" })])).ok).toBe(false);
    const dup = validateConfig(cfg([angle(), angle({ id: "a_2" })]));
    expect(dup.ok).toBe(false);
    expect(dup.errors.join(" ")).toMatch(/slug/i);
  });

  it("checks id uniqueness", () => {
    const r = validateConfig(cfg([angle(), angle({ slug: "two" })]));
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/Duplicate id/);
  });

  it("trims and caps strings", () => {
    const r = validateConfig(cfg([angle({ name: "  Hello  " })]));
    expect(r.config.angles[0].name).toBe("Hello");
    expect(validateConfig(cfg([angle({ name: "x".repeat(81) })])).ok).toBe(
      false,
    );
    const tooLong = angle();
    tooLong.content.headline = "h".repeat(151);
    expect(validateConfig(cfg([tooLong])).ok).toBe(false);
  });

  it("requires a name", () => {
    expect(validateConfig(cfg([angle({ name: "   " })])).ok).toBe(false);
  });

  it("route must be a relative path or null", () => {
    expect(validateConfig(cfg([angle({ route: "/pages/a" })])).ok).toBe(true);
    expect(validateConfig(cfg([angle({ route: null })])).ok).toBe(true);
    expect(validateConfig(cfg([angle({ route: "pages/a" })])).ok).toBe(false);
    expect(validateConfig(cfg([angle({ route: "//evil.com" })])).ok).toBe(
      false,
    );
    expect(validateConfig(cfg([angle({ route: "https://evil.com" })])).ok).toBe(
      false,
    );
    expect(validateConfig(cfg([angle({ route: "/a b" })])).ok).toBe(false);
    expect(validateConfig(cfg([angle({ route: "/\\evil.com" })])).ok).toBe(
      false,
    );
    expect(
      validateConfig(cfg([angle({ route: "" })])).config.angles[0].route,
    ).toBeNull();
  });

  it("discount code format", () => {
    expect(validateConfig(cfg([angle({ discountCode: "SAVE-10_x" })])).ok).toBe(
      true,
    );
    expect(validateConfig(cfg([angle({ discountCode: "bad code" })])).ok).toBe(
      false,
    );
    expect(
      validateConfig(cfg([angle({ discountCode: "a".repeat(65) })])).ok,
    ).toBe(false);
    expect(
      validateConfig(cfg([angle({ discountCode: "" })])).config.angles[0]
        .discountCode,
    ).toBeNull();
  });

  it("media type and url", () => {
    const a = angle();
    a.content.mediaType = "gif" as never;
    expect(validateConfig(cfg([a])).ok).toBe(false);
    const b = angle();
    b.content.media = "javascript:alert(1)";
    expect(validateConfig(cfg([b])).ok).toBe(false);
    const c = angle();
    c.content.media = "https://cdn.shopify.com/s/files/x.jpg";
    c.content.mediaType = "video";
    expect(validateConfig(cfg([c])).ok).toBe(true);
  });

  it("ids are digits only, deduped", () => {
    const a = angle();
    a.match.adIds = ["123", "123", " 456 "];
    const r = validateConfig(cfg([a]));
    expect(r.ok).toBe(true);
    expect(r.config.angles[0].match.adIds).toEqual(["123", "456"]);
    const b = angle();
    b.match.campaignIds = ["12a"];
    expect(validateConfig(cfg([b])).ok).toBe(false);
  });

  it("nameContains is lowercased, trimmed, non-empty", () => {
    const a = angle();
    a.match.nameContains = ["  Outage ", "", "PREP", "outage"];
    const r = validateConfig(cfg([a]));
    expect(r.ok).toBe(true);
    expect(r.config.angles[0].match.nameContains).toEqual(["outage", "prep"]);
  });

  it("active must be boolean", () => {
    expect(
      validateConfig(cfg([{ ...angle(), active: "yes" as never }])).ok,
    ).toBe(false);
  });

  it("rejects configs over 60 KB", () => {
    const angles: Angle[] = [];
    for (let i = 0; i < 40; i++) {
      const a = angle({ id: `a_${i}`, slug: `s${i}`, name: `N${i}` });
      a.icp = "i".repeat(500);
      a.content.headline = "h".repeat(150);
      a.content.subheadline = "s".repeat(300);
      a.match.nameContains = Array.from(
        { length: 60 },
        (_, k) => `term${i}-${k}-${"x".repeat(20)}`,
      );
      angles.push(a);
    }
    const r = validateConfig(cfg(angles));
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/too large/);
  });

  it("drops unknown keys", () => {
    const r = validateConfig({ ...cfg([angle()]), secret: "x" });
    expect(Object.keys(r.config).sort()).toEqual([
      "angles",
      "holdout",
      "rev",
      "v",
    ]);
  });
});

describe("rev", () => {
  it("defaults to 0 and keeps a valid value", () => {
    expect(validateConfig({ v: 1, holdout: 0, angles: [] }).config.rev).toBe(0);
    expect(validateConfig(cfg([], 0, 7)).config.rev).toBe(7);
  });
  it("rejects a bad rev", () => {
    expect(validateConfig({ v: 1, rev: -1, angles: [] }).ok).toBe(false);
    expect(validateConfig({ v: 1, rev: 1.5, angles: [] }).ok).toBe(false);
    expect(validateConfig({ v: 1, rev: "2", angles: [] }).ok).toBe(false);
  });
});

describe("publicConfig", () => {
  it("keeps active angles and only the storefront fields", () => {
    const on = angle({
      icp: "secret ICP note",
      name: "Secret name",
      discountCode: "SAVE10",
      route: "/pages/x",
    });
    const off = angle({
      id: "a_2",
      slug: "two",
      name: "Hidden angle",
      active: false,
    });
    const pub = publicConfig(cfg([on, off], 10, 5));
    expect(pub).toEqual({
      v: 1,
      holdout: 10,
      angles: [
        {
          id: "a_1",
          slug: "one",
          active: true,
          match: on.match,
          content: on.content,
          route: "/pages/x",
          discountCode: "SAVE10",
        },
      ],
    });
    const text = JSON.stringify(pub);
    for (const leak of [
      "secret ICP",
      "Secret name",
      "Hidden angle",
      '"icp"',
      '"rev"',
      '"name"',
    ]) {
      expect(text).not.toContain(leak);
    }
  });
});

describe("trimToFree", () => {
  it("keeps the first active angle, turns off the rest, clears holdout", () => {
    const c = cfg(
      [
        angle({ active: false }),
        angle({ id: "a_2", slug: "two" }),
        angle({ id: "a_3", slug: "three" }),
      ],
      20,
    );
    const t = trimToFree(c);
    expect(t.angles.map((a) => a.active)).toEqual([false, true, false]);
    expect(t.holdout).toBe(0);
    expect(c.angles[2].active).toBe(true);
  });
});

describe("assignAdToAngle", () => {
  it("adds the id and removes it from other angles", () => {
    const a = angle();
    a.match.adIds = ["111"];
    const b = angle({ id: "a_2", slug: "two" });
    const out = assignAdToAngle(cfg([a, b]), "a_2", "111");
    expect(out.angles[0].match.adIds).toEqual([]);
    expect(out.angles[1].match.adIds).toEqual(["111"]);
  });

  it("does not duplicate and does not mutate", () => {
    const a = angle();
    a.match.adIds = ["111"];
    const input = cfg([a]);
    const out = assignAdToAngle(input, "a_1", "111");
    expect(out.angles[0].match.adIds).toEqual(["111"]);
    expect(input.angles[0].match.adIds).toEqual(["111"]);
    expect(out).not.toBe(input);
  });
});

describe("helpers", () => {
  it("newAngleId is unique and valid", () => {
    const ids = new Set(Array.from({ length: 50 }, newAngleId));
    expect(ids.size).toBe(50);
    expect(validateConfig(cfg([angle({ id: [...ids][0] })])).ok).toBe(true);
  });

  it("slugify", () => {
    expect(slugify("Outage Preppers!")).toBe("outage-preppers");
    expect(slugify("  --  ")).toBe("");
  });
});

describe("enforcePlan", () => {
  it("pro has no limits", () => {
    const c = cfg([angle(), angle({ id: "a_2", slug: "two" })], 20);
    expect(enforcePlan(c, "pro")).toEqual([]);
  });

  it("free allows one active angle and no holdout", () => {
    expect(enforcePlan(cfg([angle()]), "free")).toEqual([]);
  });

  it("free allows many inactive angles", () => {
    const c = cfg([angle(), angle({ id: "a_2", slug: "two", active: false })]);
    expect(enforcePlan(c, "free")).toEqual([]);
  });

  it("free rejects a second active angle with an upgrade message", () => {
    const errors = enforcePlan(
      cfg([angle(), angle({ id: "a_2", slug: "two" })]),
      "free",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Pro/);
  });

  it("free rejects holdout and does not change the config", () => {
    const c = cfg([angle()], 10);
    const errors = enforcePlan(c, "free");
    expect(errors.join(" ")).toMatch(/Holdout/);
    expect(c.holdout).toBe(10);
  });
});

describe("enforcePlan on a downgraded shop", () => {
  const two = () => cfg([angle(), angle({ id: "a_2", slug: "two" })], 20);
  it("allows deactivating, deleting and lowering holdout while still over the limit", () => {
    const before = two();
    const deactivated = cfg(
      [angle(), angle({ id: "a_2", slug: "two", active: false })],
      20,
    );
    expect(enforcePlan(deactivated, "free", before)).toEqual([]);
    const deleted = cfg([angle()], 20);
    expect(enforcePlan(deleted, "free", before)).toEqual([]);
    expect(enforcePlan(cfg(before.angles, 5), "free", before)).toEqual([]);
    expect(enforcePlan(cfg(before.angles, 0), "free", before)).toEqual([]);
  });
  it("allows editing an angle while over the limit (active count unchanged)", () => {
    const before = two();
    const edited = cfg([angle({ name: "Renamed" }), before.angles[1]], 20);
    expect(enforcePlan(edited, "free", before)).toEqual([]);
  });
  it("rejects adding to an already-over active count and raising holdout", () => {
    const before = cfg([
      angle(),
      angle({ id: "a_2", slug: "two", active: false }),
    ]);
    expect(
      enforcePlan(
        cfg([angle(), angle({ id: "a_2", slug: "two" })]),
        "free",
        before,
      ),
    ).toHaveLength(1);
    expect(enforcePlan(cfg(before.angles, 10), "free", before)).toHaveLength(1);
    expect(
      enforcePlan(cfg(before.angles, 15), "free", cfg(before.angles, 10)),
    ).toHaveLength(1);
  });
});

describe("resolvePlan", () => {
  it("does not give development stores Pro automatically", () => {
    expect(resolvePlan([], "agni-demo-09.myshopify.com", "")).toBe("free");
  });
  it("is free without an active Pro subscription", () => {
    expect(resolvePlan([])).toBe("free");
    expect(resolvePlan([{ name: "Hookmatch Pro", status: "CANCELLED" }])).toBe(
      "free",
    );
  });
  it("is pro with an active Pro subscription", () => {
    expect(resolvePlan([{ name: "Hookmatch Pro", status: "ACTIVE" }])).toBe(
      "pro",
    );
  });
  it("gives owner shops in HOOKMATCH_PRO_SHOPS Pro (trimmed, case-insensitive) and nobody else", () => {
    const list = " a.myshopify.com, B.myshopify.com ,";
    expect(resolvePlan([], "a.myshopify.com", list)).toBe("pro");
    expect(resolvePlan([], "b.myshopify.com", list)).toBe("pro");
    expect(resolvePlan([], "c.myshopify.com", list)).toBe("free");
    expect(resolvePlan([], "", list)).toBe("free");
    expect(resolvePlan([], "a.myshopify.com", "")).toBe("free");
  });
});

// Same fixture and cases as the "match order" tests in tests/storefront/hm.test.cjs: the Ads page must agree with hm.js.
describe("matchAngle (parity with hm.js)", () => {
  const preppers = angle({
    id: "a_1",
    slug: "preppers",
    match: {
      adIds: ["111"],
      adsetIds: ["222"],
      campaignIds: ["333"],
      nameContains: ["outage"],
    },
  });
  const gifts = angle({
    id: "a_2",
    slug: "gifts",
    match: {
      adIds: ["999"],
      adsetIds: [],
      campaignIds: ["444"],
      nameContains: ["gift"],
    },
  });
  const dead = angle({
    id: "a_3",
    slug: "dead",
    active: false,
    match: {
      adIds: ["555"],
      adsetIds: [],
      campaignIds: [],
      nameContains: ["dead"],
    },
  });
  const c = cfg([preppers, gifts, dead]);
  const m = (k: Parameters<typeof matchAngle>[1]) => {
    const r = matchAngle(c, k);
    return r ? `${r.angle.id}:${r.by}` : null;
  };

  it("ad id", () => expect(m({ ad: "111" })).toBe("a_1:id"));
  it("ad id beats adset id", () =>
    expect(m({ ad: "999", set: "222" })).toBe("a_2:id"));
  it("adset id", () => expect(m({ set: "222" })).toBe("a_1:id"));
  it("adset id beats campaign id", () =>
    expect(m({ set: "222", cmp: "444" })).toBe("a_1:id"));
  it("campaign id", () => expect(m({ cmp: "444" })).toBe("a_2:id"));
  it("campaign id beats name", () =>
    expect(m({ cmp: "333", adName: "gift" })).toBe("a_1:id"));
  it("name contains is case-insensitive (ad name)", () =>
    expect(m({ adName: "Holiday GIFT Guide" })).toBe("a_2:rule"));
  it("name contains (ad set name)", () =>
    expect(m({ setName: "Big Outage Set" })).toBe("a_1:rule"));
  it("name contains (campaign name)", () =>
    expect(m({ cmpName: "OUTAGE-prep" })).toBe("a_1:rule"));
  it("ad name is checked before ad set and campaign name", () =>
    expect(m({ adName: "gift", setName: "outage", cmpName: "outage" })).toBe(
      "a_2:rule",
    ));
  it("inactive angles never match", () => {
    expect(m({ ad: "555" })).toBeNull();
    expect(m({ adName: "dead" })).toBeNull();
  });
  it("nothing matches", () =>
    expect(m({ ad: "1", set: "2", cmp: "3", adName: "x" })).toBeNull());
  it("empty values never match", () =>
    expect(m({ ad: "", adName: "" })).toBeNull());
  it("first angle wins when two match the same id", () => {
    const both = cfg([
      preppers,
      angle({ id: "a_9", slug: "nine", match: { ...preppers.match } }),
    ]);
    expect(matchAngle(both, { ad: "111" })?.angle.id).toBe("a_1");
  });
});
