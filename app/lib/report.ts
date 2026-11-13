// Report math. Pure: no database, no Shopify. Fed by report.server.ts.

export const MIN_SESSIONS = 300;

export type Counts = { sessions: number; orders: number; revenue: number };
export type ArmStats = Counts & { conversion: number; revenuePerVisit: number };

export type HitByAngleArm = { angleId: string; arm: string; sessions: number };
export type OrderByAngleArm = { angleId: string; arm: string; orders: number; revenue: number };
export type HitByAd = { adId: string; angleId: string; sessions: number };
export type OrderByAd = { adId: string; orders: number; revenue: number };

export type AngleRow = {
  angleId: string;
  matched: ArmStats;
  control: ArmStats;
  lift: number | null;
  note: string | null;
};

export type AdRow = Counts & { adId: string; adName: string; angleId: string };

const zero = (): Counts => ({ sessions: 0, orders: 0, revenue: 0 });

function ratio(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

export function armStats(c: Counts): ArmStats {
  return { ...c, conversion: ratio(c.orders, c.sessions), revenuePerVisit: ratio(c.revenue, c.sessions) };
}

// Lift of matched over control on revenue per visit, as a fraction (0.25 = +25%).
// Null when control earned nothing, since the ratio is undefined.
export function lift(matched: ArmStats, control: ArmStats): number | null {
  if (control.revenuePerVisit <= 0) return null;
  return matched.revenuePerVisit / control.revenuePerVisit - 1;
}

export type CurrencyCount = { currency: string; orders: number };

// Revenue sums in one currency only: the most-used one. The rest are returned so the report can name them.
export function splitCurrencies(rows: CurrencyCount[]): { currency: string; excluded: CurrencyCount[] } {
  const sorted = [...rows].sort((a, b) => b.orders - a.orders);
  return { currency: sorted[0]?.currency ?? "", excluded: sorted.slice(1) };
}

export function excludedNote(currency: string, excluded: CurrencyCount[]): string | null {
  if (excluded.length === 0) return null;
  const list = excluded.map((e) => `${e.currency || "unknown"} (${e.orders} ${e.orders === 1 ? "order" : "orders"})`).join(", ");
  return `Revenue is shown in ${currency || "unknown"} only. Orders in other currencies are left out: ${list}.`;
}

export function sampleNote(matched: ArmStats, control: ArmStats): string | null {
  if (matched.sessions >= MIN_SESSIONS && control.sessions >= MIN_SESSIONS) return null;
  if (control.sessions === 0) return "No control visits yet. Set a holdout to measure lift.";
  return `Too few visits to trust the lift. Wait for ${MIN_SESSIONS}+ in each group.`;
}

export function buildAngleRows(hits: HitByAngleArm[], orders: OrderByAngleArm[]): AngleRow[] {
  const byAngle = new Map<string, { matched: Counts; control: Counts }>();
  const slot = (angleId: string) => {
    let s = byAngle.get(angleId);
    if (!s) byAngle.set(angleId, (s = { matched: zero(), control: zero() }));
    return s;
  };
  for (const h of hits) {
    if (!h.angleId || (h.arm !== "matched" && h.arm !== "control")) continue;
    slot(h.angleId)[h.arm].sessions += h.sessions;
  }
  for (const o of orders) {
    if (!o.angleId || (o.arm !== "matched" && o.arm !== "control")) continue;
    const c = slot(o.angleId)[o.arm];
    c.orders += o.orders;
    c.revenue += o.revenue;
  }
  return [...byAngle.entries()]
    .map(([angleId, { matched, control }]) => {
      const m = armStats(matched);
      const c = armStats(control);
      return { angleId, matched: m, control: c, lift: lift(m, c), note: sampleNote(m, c) };
    })
    .sort((a, b) => b.matched.revenue + b.control.revenue - (a.matched.revenue + a.control.revenue));
}

export function buildAdRows(hits: HitByAd[], orders: OrderByAd[], names: Record<string, string>): AdRow[] {
  const sessions = new Map<string, number>();
  const angleSessions = new Map<string, Map<string, number>>();
  for (const h of hits) {
    if (!h.adId) continue;
    sessions.set(h.adId, (sessions.get(h.adId) ?? 0) + h.sessions);
    if (h.angleId) {
      const m = angleSessions.get(h.adId) ?? new Map<string, number>();
      m.set(h.angleId, (m.get(h.angleId) ?? 0) + h.sessions);
      angleSessions.set(h.adId, m);
    }
  }
  const money = new Map<string, { orders: number; revenue: number }>();
  for (const o of orders) {
    if (!o.adId) continue;
    const m = money.get(o.adId) ?? { orders: 0, revenue: 0 };
    m.orders += o.orders;
    m.revenue += o.revenue;
    money.set(o.adId, m);
  }
  const ids = new Set([...sessions.keys(), ...money.keys()]);
  return [...ids]
    .map((adId) => {
      let angleId = "";
      let best = 0;
      for (const [id, n] of angleSessions.get(adId) ?? []) {
        if (n > best) {
          best = n;
          angleId = id;
        }
      }
      const m = money.get(adId) ?? { orders: 0, revenue: 0 };
      return { adId, adName: names[adId] ?? "", angleId, sessions: sessions.get(adId) ?? 0, ...m };
    })
    .sort((a, b) => b.revenue - a.revenue || b.sessions - a.sessions);
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatPercent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatLift(l: number | null): string {
  if (l === null) return "n/a";
  const p = Math.round(l * 1000) / 10;
  return `${p > 0 ? "+" : ""}${p}%`;
}

export const RANGES = [7, 30, 90] as const;
export function parseRange(value: string | null): (typeof RANGES)[number] {
  const n = Number(value);
  return (RANGES as readonly number[]).includes(n) ? (n as (typeof RANGES)[number]) : 7;
}
