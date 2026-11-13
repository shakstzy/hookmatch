export const ARMS = ["matched", "control", "none"] as const;
export type Arm = (typeof ARMS)[number];

export type HitInput = {
  angleId: string;
  arm: Arm;
  adId: string;
  adName: string;
  adsetId: string;
  adsetName: string;
  campaignId: string;
  campaignName: string;
};

export const MAX_FIELD = 255;
const MAX_BODY = 4096;

// Postgres rejects NUL in text columns, so strip control characters before storing.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

export function clean(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value === "number" && Number.isFinite(value)) value = String(value);
  if (typeof value !== "string") return null;
  return value.replace(CONTROL, "").trim().slice(0, MAX_FIELD);
}

// Parses the beacon body (JSON, sent as text/plain by sendBeacon) into a Hit.
// Returns null on any invalid input; the caller answers 400.
export function parseHit(raw: string): HitInput | null {
  if (raw.length > MAX_BODY) return null;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;

  const arm = clean(b.arm);
  if (arm === null || !(ARMS as readonly string[]).includes(arm)) return null;

  const fields = {
    angleId: clean(b.angle),
    adId: clean(b.ad),
    adName: clean(b.adName),
    adsetId: clean(b.set),
    adsetName: clean(b.setName),
    campaignId: clean(b.cmp),
    campaignName: clean(b.cmpName),
  };
  if (Object.values(fields).some((v) => v === null)) return null;

  return { arm: arm as Arm, ...(fields as Record<keyof typeof fields, string>) };
}

// Calendar day in UTC as a Date at 00:00Z, for the @db.Date column.
export function utcDay(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Growth caps per shop, so forged beacons cannot fill the tables. Existing rows still increment.
export const MAX_ADS_PER_SHOP = 2000;
export const MAX_HITS_PER_SHOP_DAY = 5000;

export type HitNames = Pick<HitInput, "adName" | "adsetId" | "adsetName" | "campaignId" | "campaignName">;

// Only non-empty names overwrite stored ones, so a beacon without a name never blanks it.
export function nameUpdate(names: HitNames): Partial<HitNames> {
  const out: Partial<HitNames> = {};
  for (const k of Object.keys(names) as (keyof HitNames)[]) {
    if (names[k]) out[k] = names[k];
  }
  return out;
}
