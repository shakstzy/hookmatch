import { data } from "react-router";
import prisma from "../db.server";
import {
  MAX_HOLDOUT,
  activeAngles,
  defaultConfig,
  publicConfig,
  trimToFree,
  validateConfig,
  type Config,
} from "./config";

// Minimal shape of the Admin GraphQL client from authenticate.admin().
export type Admin = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

export type Plan = "free" | "pro";

const FREE_MAX_ACTIVE = 1;
const NAMESPACE = "$app:hm";
const ADMIN_KEY = "admin"; // full config, private
const PUBLIC_KEY = "config"; // public projection read by hm.js; also the legacy full config
export const STALE_MESSAGE = "This angle changed in another tab. Reload.";

// The saved config exists but cannot be read. Never fall back to an empty config: a save would wipe it.
export class ConfigError extends Error {}

async function gql<T>(admin: Admin, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await admin.graphql(query, variables ? { variables } : undefined);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data as T;
}

function parseStored(raw: string, key: string): Config {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ConfigError(`Your saved Hookmatch settings (${key}) are not valid JSON. Nothing was changed.`);
  }
  const checked = validateConfig(json);
  if (!checked.ok) {
    throw new ConfigError(
      `Your saved Hookmatch settings (${key}) failed validation: ${checked.errors.slice(0, 3).join(" ")} Nothing was changed.`,
    );
  }
  return checked.config;
}

type Stored = { shopId: string; config: Config };

// Reads the admin config. Absent -> default. Legacy shops only have `config` (full); read that as the admin config.
// Present but unreadable -> throws ConfigError.
async function loadStored(admin: Admin): Promise<Stored> {
  const d = await gql<{
    shop: { id: string; adminCfg: { value: string } | null; legacy: { value: string } | null };
  }>(
    admin,
    `#graphql
    query HmConfig {
      shop {
        id
        adminCfg: metafield(namespace: "${NAMESPACE}", key: "${ADMIN_KEY}") { value }
        legacy: metafield(namespace: "${NAMESPACE}", key: "${PUBLIC_KEY}") { value }
      }
    }`,
  );
  const { id: shopId, adminCfg, legacy } = d.shop;
  if (adminCfg?.value) return { shopId, config: parseStored(adminCfg.value, ADMIN_KEY) };
  if (legacy?.value) return { shopId, config: parseStored(legacy.value, PUBLIC_KEY) };
  return { shopId, config: defaultConfig() };
}

export async function getConfig(admin: Admin): Promise<Config> {
  return (await loadStored(admin)).config;
}

// For page loaders: an unreadable config becomes a thrown response the route ErrorBoundary shows as a banner.
export async function getConfigForPage(admin: Admin): Promise<Config> {
  try {
    return await getConfig(admin);
  } catch (e) {
    if (e instanceof ConfigError) throw data({ configError: e.message }, { status: 500 });
    throw e;
  }
}

export type SaveResult = { ok: boolean; errors: string[]; config: Config };

// Writes the full admin config and its public projection together in one mutation.
async function writeStored(admin: Admin, shopId: string, config: Config): Promise<string[]> {
  const out = await gql<{
    metafieldsSet: { userErrors: { field: string[] | null; message: string }[] };
  }>(
    admin,
    `#graphql
    mutation HmSaveConfig($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        { ownerId: shopId, namespace: NAMESPACE, key: ADMIN_KEY, type: "json", value: JSON.stringify(config) },
        {
          ownerId: shopId,
          namespace: NAMESPACE,
          key: PUBLIC_KEY,
          type: "json",
          value: JSON.stringify(publicConfig(config)),
        },
      ],
    },
  );
  return out.metafieldsSet.userErrors.map((e) => e.message);
}

// Managed pricing creates an AppSubscription named after the plan. A plan whose name
// contains "Pro" (set in the Partner Dashboard) with status ACTIVE (trial counts) is pro.
// Shops listed in HOOKMATCH_PRO_SHOPS (comma-separated myshopify domains) get Pro free: owner stores and
// the dev stores used for demos and App Store review. Other dev stores see the paywall.
export function resolvePlan(
  subs: { name: string; status: string }[],
  shop = "",
  proShops = process.env.HOOKMATCH_PRO_SHOPS ?? "",
): Plan {
  const owner = proShops.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (shop && owner.includes(shop.toLowerCase())) return "pro";
  return subs.some((s) => s.status === "ACTIVE" && /pro/i.test(s.name)) ? "pro" : "free";
}

export async function getPlan(admin: Admin): Promise<Plan> {
  const d = await gql<{
    currentAppInstallation: { activeSubscriptions: { name: string; status: string }[] };
    shop: { myshopifyDomain: string };
  }>(
    admin,
    `#graphql
    query HmPlan {
      currentAppInstallation { activeSubscriptions { name status } }
      shop { myshopifyDomain }
    }`,
  );
  return resolvePlan(d.currentAppInstallation.activeSubscriptions, d.shop.myshopifyDomain);
}

// Returns plain-English errors; never changes the config. Only a change that makes things worse on Free is
// rejected (more active angles than allowed AND than before, or holdout raised above 0), so a downgraded shop
// can always deactivate, delete and lower. `current` is the config before the change.
export function enforcePlan(config: Config, plan: Plan, current?: Config): string[] {
  if (plan === "pro") return [];
  const errors: string[] = [];
  const before = current ? activeAngles(current) : 0;
  const after = activeAngles(config);
  if (after > FREE_MAX_ACTIVE && after > before) {
    errors.push(
      `The Free plan allows ${FREE_MAX_ACTIVE} active angle. Turn the others off or upgrade to Pro for unlimited angles.`,
    );
  }
  if (config.holdout > 0 && config.holdout > (current?.holdout ?? 0)) {
    errors.push(`Holdout is a Pro feature. Set it to 0 or upgrade to Pro (up to ${MAX_HOLDOUT}%).`);
  }
  return errors;
}

// Runs the read-modify-write under a per-shop Postgres advisory lock so concurrent saves can't lose updates.
// Transaction-level lock: safe with pgbouncer in transaction mode (a session lock is not).
function withShopLock<T>(shop: string, fn: () => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${shop}))`;
      return fn();
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

// Load, change, check plan, bump rev, save. Shared by every admin save path.
// expectedRev: reject when the stored config moved on since the caller loaded it.
export async function updateConfig(
  admin: Admin,
  shop: string,
  change: (config: Config) => Config,
  expectedRev?: number,
): Promise<SaveResult> {
  try {
    return await withShopLock(shop, async () => {
      const [{ shopId, config: current }, plan] = await Promise.all([loadStored(admin), getPlan(admin)]);
      if (expectedRev !== undefined && expectedRev !== current.rev) {
        return { ok: false, errors: [STALE_MESSAGE], config: current };
      }
      const validation = validateConfig({ ...change(current), rev: current.rev + 1 });
      if (!validation.ok) return { ok: false, errors: validation.errors, config: current };
      const planErrors = enforcePlan(validation.config, plan, current);
      if (planErrors.length) return { ok: false, errors: planErrors, config: current };
      const errors = await writeStored(admin, shopId, validation.config);
      return errors.length ? { ok: false, errors, config: current } : { ok: true, errors: [], config: validation.config };
    });
  } catch (e) {
    if (e instanceof ConfigError) return { ok: false, errors: [e.message], config: defaultConfig() };
    throw e;
  }
}

// Downgrade: shrink the saved config to what Free allows and rewrite both metafields. No-op when already within it.
export async function trimConfigToFree(admin: Admin, shop: string): Promise<boolean> {
  return withShopLock(shop, async () => {
    const { shopId, config } = await loadStored(admin);
    const trimmed = trimToFree(config, FREE_MAX_ACTIVE);
    const changed = trimmed.holdout !== config.holdout || activeAngles(trimmed) !== activeAngles(config);
    if (!changed) return false;
    const errors = await writeStored(admin, shopId, { ...trimmed, rev: config.rev + 1 });
    if (errors.length) throw new Error(errors.join("; "));
    return true;
  });
}
