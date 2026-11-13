import { ARMS, clean } from "./hit";

export type OrderAttribution = { angleId: string; arm: string; adId: string };

type NoteAttribute = { name?: unknown; value?: unknown };

// Reads the hidden cart attributes (_hm_angle, _hm_arm, _hm_ad) from an orders/create
// payload's note_attributes. Returns null when none is present.
export function parseNoteAttributes(noteAttributes: unknown): OrderAttribution | null {
  if (!Array.isArray(noteAttributes)) return null;
  const found: Record<string, string> = {};
  for (const item of noteAttributes as NoteAttribute[]) {
    if (!item || typeof item !== "object") continue;
    if (typeof item.name !== "string") continue;
    if (["_hm_angle", "_hm_arm", "_hm_ad"].includes(item.name)) found[item.name] = clean(item.value) ?? "";
  }
  const angleId = found._hm_angle ?? "";
  const adId = found._hm_ad ?? "";
  let arm = found._hm_arm ?? "";
  if (arm && !(ARMS as readonly string[]).includes(arm)) arm = "";
  if (!angleId && !adId && !arm) return null;
  return { angleId, arm, adId };
}

// Shopify topics arrive as "CUSTOMERS_REDACT" from authenticate.webhook; accept "customers/redact" too.
export function normalizeTopic(topic: string): string {
  return topic.toUpperCase().replace(/[/.]/g, "_");
}

// Order total as a decimal string, or null when it is not one (the caller skips and logs the row).
export function toDecimalString(v: unknown): string | null {
  return typeof v === "string" && /^\d+(\.\d+)?$/.test(v) ? v : null;
}

export function orderIdsToRedact(payload: unknown): string[] {
  const list = (payload as { orders_to_redact?: unknown })?.orders_to_redact;
  if (!Array.isArray(list)) return [];
  return list
    .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
    .map(String);
}
