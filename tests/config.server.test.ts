import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake Postgres advisory lock: one holder per key at a time, released when the transaction callback ends.
const locks = vi.hoisted(() => ({ held: new Map<string, Promise<void>>(), calls: [] as string[] }));
vi.mock("../app/db.server", () => ({
  default: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      let release!: () => void;
      let key = "";
      const tx = {
        $executeRaw: async (_strings: TemplateStringsArray, shop: string) => {
          key = shop;
          locks.calls.push(shop);
          while (locks.held.has(key)) await locks.held.get(key);
          locks.held.set(key, new Promise<void>((r) => (release = r)));
        },
      };
      try {
        return await fn(tx);
      } finally {
        if (key) {
          locks.held.delete(key);
          release();
        }
      }
    },
  },
}));

import { emptyAngle, type Angle, type Config } from "../app/lib/config";
import {
  ConfigError,
  STALE_MESSAGE,
  getConfig,
  trimConfigToFree,
  updateConfig,
  type Admin,
} from "../app/lib/config.server";

const angle = (over: Partial<Angle> = {}): Angle => ({ ...emptyAngle("a_1"), slug: "one", name: "One", ...over });
const cfg = (angles: Angle[], holdout = 0, rev = 0): Config => ({ v: 1, rev, holdout, angles });

// In-memory shop: metafields by key, subscriptions, and a log of metafieldsSet writes.
function fakeShop(stored: Record<string, string> = {}, subs: { name: string; status: string }[] = []) {
  const fields = { ...stored };
  const writes: { key: string; value: string }[][] = [];
  const admin: Admin = {
    graphql: async (query, options) => {
      const body = (data: unknown) => new Response(JSON.stringify({ data }));
      if (query.includes("HmConfig")) {
        const f = (k: string) => (fields[k] !== undefined ? { value: fields[k] } : null);
        return body({ shop: { id: "gid://shopify/Shop/1", adminCfg: f("admin"), legacy: f("config") } });
      }
      if (query.includes("HmPlan")) {
        return body({
          currentAppInstallation: { activeSubscriptions: subs },
          shop: { myshopifyDomain: "t.myshopify.com" },
        });
      }
      if (query.includes("HmSaveConfig")) {
        const mf = (options?.variables?.metafields ?? []) as { key: string; value: string }[];
        writes.push(mf.map((m) => ({ key: m.key, value: m.value })));
        for (const m of mf) fields[m.key] = m.value;
        return body({ metafieldsSet: { userErrors: [] } });
      }
      throw new Error("unexpected query");
    },
  };
  return { admin, fields, writes };
}

const PRO = [{ name: "Hookmatch Pro", status: "ACTIVE" }];

beforeEach(() => {
  locks.held.clear();
  locks.calls.length = 0;
});

describe("getConfig", () => {
  it("returns the default when nothing is stored", async () => {
    const { admin } = fakeShop();
    expect((await getConfig(admin)).angles).toEqual([]);
  });

  it("fails closed on invalid JSON in either key", async () => {
    await expect(getConfig(fakeShop({ admin: "{not json" }).admin)).rejects.toBeInstanceOf(ConfigError);
    await expect(getConfig(fakeShop({ config: "{not json" }).admin)).rejects.toBeInstanceOf(ConfigError);
  });

  it("fails closed when validation fails", async () => {
    const bad = JSON.stringify({ v: 1, holdout: 99, angles: [] });
    await expect(getConfig(fakeShop({ admin: bad }).admin)).rejects.toThrow(/validation/);
  });

  it("reads the legacy public key as the admin config when admin is absent", async () => {
    const legacy = JSON.stringify(cfg([angle({ icp: "note" })]));
    const c = await getConfig(fakeShop({ config: legacy }).admin);
    expect(c.angles[0].icp).toBe("note");
  });

  it("prefers admin over the legacy key", async () => {
    const shop = fakeShop({ admin: JSON.stringify(cfg([angle({ name: "New" })], 0, 3)), config: JSON.stringify(cfg([]) ) });
    const c = await getConfig(shop.admin);
    expect(c.angles[0].name).toBe("New");
    expect(c.rev).toBe(3);
  });
});

describe("updateConfig", () => {
  const add = (a: Angle) => (c: Config): Config => ({ ...c, angles: [...c.angles, a] });

  it("does not wipe a corrupt config and writes nothing", async () => {
    const shop = fakeShop({ admin: "garbage" }, PRO);
    const r = await updateConfig(shop.admin, "t.myshopify.com", add(angle()));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/not valid JSON/);
    expect(shop.writes).toEqual([]);
  });

  it("writes the full admin config and a public projection together, bumping rev", async () => {
    const shop = fakeShop({}, PRO);
    const secret = angle({ icp: "private ICP", name: "Private name" });
    const off = angle({ id: "a_2", slug: "two", name: "Draft angle", active: false });
    await updateConfig(shop.admin, "t.myshopify.com", add(secret));
    const r = await updateConfig(shop.admin, "t.myshopify.com", add(off));
    expect(r.ok).toBe(true);
    expect(shop.writes).toHaveLength(2);
    expect(shop.writes[1].map((w) => w.key).sort()).toEqual(["admin", "config"]);
    const admin = JSON.parse(shop.fields.admin);
    expect(admin.rev).toBe(2);
    expect(admin.angles).toHaveLength(2);
    expect(admin.angles[0].icp).toBe("private ICP");
    const pub = shop.fields.config;
    expect(pub).not.toMatch(/private ICP|Private name|Draft angle|"icp"|"rev"/);
    expect(JSON.parse(pub).angles).toHaveLength(1);
    expect(locks.calls).toEqual(["t.myshopify.com", "t.myshopify.com"]);
  });

  it("migrates a legacy config on first save", async () => {
    const shop = fakeShop({ config: JSON.stringify(cfg([angle({ icp: "legacy note" })])) }, PRO);
    const r = await updateConfig(shop.admin, "t.myshopify.com", add(angle({ id: "a_2", slug: "two", name: "Two" })));
    expect(r.ok).toBe(true);
    expect(JSON.parse(shop.fields.admin).angles[0].icp).toBe("legacy note");
    expect(shop.fields.config).not.toContain("legacy note");
  });

  it("rejects a stale rev and writes nothing", async () => {
    const shop = fakeShop({ admin: JSON.stringify(cfg([angle()], 0, 4)) }, PRO);
    const r = await updateConfig(shop.admin, "t.myshopify.com", (c) => c, 3);
    expect(r).toMatchObject({ ok: false, errors: [STALE_MESSAGE] });
    expect(shop.writes).toEqual([]);
    expect((await updateConfig(shop.admin, "t.myshopify.com", (c) => c, 4)).ok).toBe(true);
  });

  it("serializes concurrent saves under the lock (no lost update)", async () => {
    const shop = fakeShop({}, PRO);
    const results = await Promise.all([
      updateConfig(shop.admin, "t.myshopify.com", add(angle())),
      updateConfig(shop.admin, "t.myshopify.com", add(angle({ id: "a_2", slug: "two", name: "Two" }))),
      updateConfig(shop.admin, "t.myshopify.com", add(angle({ id: "a_3", slug: "three", name: "Three" }))),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    const admin = JSON.parse(shop.fields.admin);
    expect(admin.angles).toHaveLength(3);
    expect(admin.rev).toBe(3);
  });

  it("lets a downgraded Free shop deactivate and delete but not add active angles", async () => {
    const two = cfg([angle(), angle({ id: "a_2", slug: "two", name: "Two" })], 20);
    const shop = fakeShop({ admin: JSON.stringify(two) }, []);
    const off = await updateConfig(shop.admin, "t", (c) => ({
      ...c,
      angles: c.angles.map((a) => (a.id === "a_2" ? { ...a, active: false } : a)),
    }));
    expect(off.ok).toBe(true);
    const lower = await updateConfig(shop.admin, "t", (c) => ({ ...c, holdout: 0 }));
    expect(lower.ok).toBe(true);
    const reactivate = await updateConfig(shop.admin, "t", (c) => ({
      ...c,
      angles: c.angles.map((a) => ({ ...a, active: true })),
    }));
    expect(reactivate.ok).toBe(false);
    const del = await updateConfig(shop.admin, "t", (c) => ({ ...c, angles: c.angles.filter((a) => a.id !== "a_2") }));
    expect(del.ok).toBe(true);
  });
});

describe("trimConfigToFree", () => {
  it("keeps the first active angle, deactivates the rest, zeroes holdout, rewrites both keys", async () => {
    const c = cfg([angle(), angle({ id: "a_2", slug: "two", name: "Two" }), angle({ id: "a_3", slug: "three", name: "Three" })], 20, 5);
    const shop = fakeShop({ admin: JSON.stringify(c) });
    expect(await trimConfigToFree(shop.admin, "t")).toBe(true);
    const admin = JSON.parse(shop.fields.admin);
    expect(admin.angles.map((a: Angle) => a.active)).toEqual([true, false, false]);
    expect(admin.holdout).toBe(0);
    expect(admin.rev).toBe(6);
    const pub = JSON.parse(shop.fields.config);
    expect(pub.angles).toHaveLength(1);
    expect(pub.holdout).toBe(0);
  });

  it("does nothing when already within Free limits", async () => {
    const shop = fakeShop({ admin: JSON.stringify(cfg([angle()])) });
    expect(await trimConfigToFree(shop.admin, "t")).toBe(false);
    expect(shop.writes).toEqual([]);
  });
});
