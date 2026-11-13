// Config contract (docs/product/SPEC.md "Config"). Pure: shared by routes and tests.
// Full admin config: app-owned shop metafield `$app:hm` key `admin` (private to the app UI).
// Public projection (publicConfig): key `config`, printed on the storefront and read by hm.js.

export type MediaType = "image" | "video";

export type Angle = {
  id: string;
  slug: string;
  name: string;
  icp: string;
  active: boolean;
  match: {
    adIds: string[];
    adsetIds: string[];
    campaignIds: string[];
    nameContains: string[];
  };
  content: {
    headline: string;
    subheadline: string;
    media: string;
    mediaType: MediaType;
    badge: string;
  };
  route: string | null;
  discountCode: string | null;
};

// rev counts saves; the angle editor sends the rev it loaded so a stale tab can't overwrite newer work.
export type Config = { v: 1; rev: number; holdout: number; angles: Angle[] };

// What the storefront may see: active angles only, only the fields hm.js reads.
export type PublicAngle = Pick<
  Angle,
  "id" | "slug" | "active" | "match" | "content" | "route" | "discountCode"
>;
export type PublicConfig = { v: 1; holdout: number; angles: PublicAngle[] };

export type ValidationResult = {
  ok: boolean;
  config: Config;
  errors: string[];
};

const MAX_BYTES = 60 * 1024;
const MAX_ANGLES = 100;
export const MAX_HOLDOUT = 50;
const MAX_LIST = 200;

export const URL_PARAMS =
  "utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&hm_ad={{ad.id}}&hm_set={{adset.id}}&hm_cmp={{campaign.id}}";

const SLUG_RE = /^[a-z0-9-]{1,40}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const DIGITS_RE = /^[0-9]{1,30}$/;
const CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function defaultConfig(): Config {
  return { v: 1, rev: 0, holdout: 0, angles: [] };
}

export function emptyAngle(id: string = newAngleId()): Angle {
  return {
    id,
    slug: "",
    name: "",
    icp: "",
    active: true,
    match: { adIds: [], adsetIds: [], campaignIds: [], nameContains: [] },
    content: {
      headline: "",
      subheadline: "",
      media: "",
      mediaType: "image",
      badge: "",
    },
    route: null,
    discountCode: null,
  };
}

export function newAngleId(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return "a_" + Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export function assignAdToAngle(
  config: Config,
  angleId: string,
  adId: string,
): Config {
  const ad = String(adId).trim();
  return {
    ...config,
    angles: config.angles.map((a) => {
      const rest = a.match.adIds.filter((x) => x !== ad);
      const adIds = a.id === angleId ? [...rest, ad] : rest;
      return { ...a, match: { ...a.match, adIds } };
    }),
  };
}

export type AdKeys = {
  ad?: string;
  set?: string;
  cmp?: string;
  adName?: string;
  setName?: string;
  cmpName?: string;
};

// Which angle a shopper from this ad gets. Mirrors assets/hm.js exactly (slug aside): ad id, ad set id,
// campaign id, then name rules over ad name, ad set name, campaign name. Active angles only, first angle wins.
// "id" = matched by an id list, "rule" = matched by a name-contains rule.
export function matchAngle(
  config: Config,
  k: AdKeys,
): { angle: Angle; by: "id" | "rule" } | null {
  const angles = config.angles.filter((a) => a.active);
  const lc = (v: unknown) => String(v || "").toLowerCase();
  const byId = (key: "adIds" | "adsetIds" | "campaignIds", v?: string) =>
    v
      ? angles.find((a) => a.match[key].some((x) => String(x) === v))
      : undefined;
  const hit =
    byId("adIds", k.ad) ??
    byId("adsetIds", k.set) ??
    byId("campaignIds", k.cmp);
  if (hit) return { angle: hit, by: "id" };
  for (const name of [k.adName, k.setName, k.cmpName].map(lc)) {
    if (!name) continue;
    const a = angles.find((x) =>
      x.match.nameContains.some((n) => n && name.indexOf(lc(n)) > -1),
    );
    if (a) return { angle: a, by: "rule" };
  }
  return null;
}

export function publicConfig(config: Config): PublicConfig {
  return {
    v: 1,
    holdout: config.holdout,
    angles: config.angles
      .filter((a) => a.active)
      .map((a) => ({
        id: a.id,
        slug: a.slug,
        active: true,
        match: a.match,
        content: a.content,
        route: a.route,
        discountCode: a.discountCode,
      })),
  };
}

// Free-plan shape: first active angle stays on, the rest go off, no holdout.
export function trimToFree(config: Config, maxActive = 1): Config {
  let kept = 0;
  return {
    ...config,
    holdout: 0,
    angles: config.angles.map((a) =>
      a.active && kept++ >= maxActive ? { ...a, active: false } : a,
    ),
  };
}

export function activeAngles(config: Config): number {
  return config.angles.filter((a) => a.active).length;
}

export function matchSummary(a: Angle): string {
  const parts: string[] = [];
  const count = (n: number, noun: string) => `${n} ${noun}${n > 1 ? "s" : ""}`;
  if (a.match.adIds.length) parts.push(count(a.match.adIds.length, "ad"));
  if (a.match.adsetIds.length) parts.push(count(a.match.adsetIds.length, "ad set"));
  if (a.match.campaignIds.length) parts.push(count(a.match.campaignIds.length, "campaign"));
  if (a.match.nameContains.length)
    parts.push(`name has "${a.match.nameContains.join('", "')}"`);
  return parts.length
    ? parts.join(", ")
    : "No rules (only ?hm_angle=" + (a.slug || "slug") + ")";
}

export function pricingUrl(
  shopDomain: string,
  appHandle = "hookmatch",
): string {
  const store = shopDomain.replace(/\.myshopify\.com$/, "");
  return `https://admin.shopify.com/store/${store}/charges/${appHandle}/pricing_plans`;
}

export function parseList(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj =>
  typeof x === "object" && x !== null && !Array.isArray(x);

export function validateConfig(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(input)) {
    return {
      ok: false,
      config: defaultConfig(),
      errors: ["Config must be an object."],
    };
  }

  if (input.v !== undefined && input.v !== 1)
    errors.push("Unsupported config version.");

  let holdout = 0;
  if (input.holdout !== undefined) {
    if (
      typeof input.holdout === "number" &&
      Number.isInteger(input.holdout) &&
      input.holdout >= 0 &&
      input.holdout <= MAX_HOLDOUT
    ) {
      holdout = input.holdout;
    } else {
      errors.push(`Holdout must be a whole number from 0 to ${MAX_HOLDOUT}.`);
    }
  }

  let rev = 0;
  if (input.rev !== undefined) {
    if (
      typeof input.rev === "number" &&
      Number.isSafeInteger(input.rev) &&
      input.rev >= 0
    )
      rev = input.rev;
    else errors.push("Config revision is invalid.");
  }

  const rawAngles = input.angles === undefined ? [] : input.angles;
  const angles: Angle[] = [];
  if (!Array.isArray(rawAngles)) {
    errors.push("Angles must be a list.");
  } else {
    if (rawAngles.length > MAX_ANGLES)
      errors.push(`At most ${MAX_ANGLES} angles.`);
    const ids = new Set<string>();
    const slugs = new Set<string>();
    rawAngles.slice(0, MAX_ANGLES).forEach((raw, i) => {
      const label =
        isObj(raw) && typeof raw.name === "string" && raw.name.trim()
          ? `"${raw.name.trim()}"`
          : `Angle ${i + 1}`;
      const err = (m: string) => errors.push(`${label}: ${m}`);
      if (!isObj(raw)) return err("not an object.");

      const str = (
        v: unknown,
        field: string,
        max: number,
        required = false,
      ): string => {
        if (v === undefined || v === null) {
          if (required) err(`${field} is required.`);
          return "";
        }
        if (typeof v !== "string") {
          err(`${field} must be text.`);
          return "";
        }
        const t = v.trim();
        if (required && !t) err(`${field} is required.`);
        if (t.length > max) {
          err(`${field} is too long (max ${max}).`);
          return t.slice(0, max);
        }
        return t;
      };

      const id = str(raw.id, "Id", 40, true);
      if (id && !ID_RE.test(id))
        err("Id may only use letters, numbers, - and _.");
      if (id && ids.has(id)) err(`Duplicate id "${id}".`);
      ids.add(id);

      const slug = str(raw.slug, "Slug", 40, true);
      if (slug && !SLUG_RE.test(slug))
        err("Slug may only use lowercase letters, numbers and dashes.");
      if (slug && slugs.has(slug))
        err(`Another angle already uses the slug "${slug}".`);
      slugs.add(slug);

      const name = str(raw.name, "Name", 80, true);
      const icp = str(raw.icp, "ICP note", 500);

      let active = false;
      if (raw.active !== undefined) {
        if (typeof raw.active === "boolean") active = raw.active;
        else err("Active must be true or false.");
      }

      const m = isObj(raw.match) ? raw.match : {};
      if (raw.match !== undefined && !isObj(raw.match))
        err("Match rules must be an object.");
      const idList = (v: unknown, field: string): string[] => {
        if (v === undefined) return [];
        if (!Array.isArray(v)) {
          err(`${field} must be a list.`);
          return [];
        }
        if (v.length > MAX_LIST) err(`${field}: at most ${MAX_LIST} entries.`);
        const out: string[] = [];
        for (const e of v.slice(0, MAX_LIST)) {
          const t =
            typeof e === "string" || typeof e === "number"
              ? String(e).trim()
              : "";
          if (!t) continue;
          if (!DIGITS_RE.test(t))
            err(
              `${field}: "${String(e).slice(0, 30)}" is not a number id (digits only).`,
            );
          else if (!out.includes(t)) out.push(t);
        }
        return out;
      };
      const adIds = idList(m.adIds, "Ad ids");
      const adsetIds = idList(m.adsetIds, "Ad set ids");
      const campaignIds = idList(m.campaignIds, "Campaign ids");
      const nameContains: string[] = [];
      if (m.nameContains !== undefined) {
        if (!Array.isArray(m.nameContains))
          err("Name contains must be a list.");
        else {
          if (m.nameContains.length > MAX_LIST)
            err(`Name contains: at most ${MAX_LIST} entries.`);
          for (const e of m.nameContains.slice(0, MAX_LIST)) {
            if (typeof e !== "string") {
              err("Name contains entries must be text.");
              continue;
            }
            const t = e.trim().toLowerCase();
            if (!t) continue;
            if (t.length > 60)
              err("Name contains entries are at most 60 characters.");
            else if (!nameContains.includes(t)) nameContains.push(t);
          }
        }
      }

      const c = isObj(raw.content) ? raw.content : {};
      if (raw.content !== undefined && !isObj(raw.content))
        err("Content must be an object.");
      const headline = str(c.headline, "Headline", 150);
      const subheadline = str(c.subheadline, "Subheadline", 300);
      const badge = str(c.badge, "Badge", 40);
      const media = str(c.media, "Media URL", 500);
      if (media && !/^https:\/\/[^\s]+$/i.test(media))
        err("Media URL must start with https://.");
      let mediaType: MediaType = "image";
      if (c.mediaType !== undefined) {
        if (c.mediaType === "image" || c.mediaType === "video")
          mediaType = c.mediaType;
        else err("Media type must be image or video.");
      }

      let route: string | null = null;
      if (raw.route !== undefined && raw.route !== null && raw.route !== "") {
        if (typeof raw.route !== "string") err("Route must be text.");
        else {
          const r = raw.route.trim();
          if (r.length > 200) err("Route is too long (max 200).");
          else if (!/^\/(?![/\\])[^\s\\]*$/.test(r))
            err(
              "Route must be a path on your store starting with /, like /pages/outage.",
            );
          else route = r;
        }
      }

      let discountCode: string | null = null;
      if (
        raw.discountCode !== undefined &&
        raw.discountCode !== null &&
        raw.discountCode !== ""
      ) {
        if (typeof raw.discountCode !== "string")
          err("Discount code must be text.");
        else {
          const d = raw.discountCode.trim();
          if (!CODE_RE.test(d))
            err(
              "Discount code may only use letters, numbers, - and _ (max 64).",
            );
          else discountCode = d;
        }
      }

      angles.push({
        id,
        slug,
        name,
        icp,
        active,
        match: { adIds, adsetIds, campaignIds, nameContains },
        content: { headline, subheadline, media, mediaType, badge },
        route,
        discountCode,
      });
    });
  }

  const config: Config = { v: 1, rev, holdout, angles };
  if (new TextEncoder().encode(JSON.stringify(config)).length > MAX_BYTES) {
    errors.push(
      "Config is too large (over 60 KB). Remove angles or shorten match lists.",
    );
  }
  return { ok: errors.length === 0, config, errors };
}
