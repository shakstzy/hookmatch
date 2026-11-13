import prisma from "../db.server";
import { utcDay } from "./hit";
import {
  armStats,
  buildAdRows,
  buildAngleRows,
  splitCurrencies,
  type AdRow,
  type AngleRow,
  type ArmStats,
} from "./report";

const DAY_MS = 86_400_000;

// Window includes today: days=7 covers today and the 6 days before it.
function rangeStart(days: number, now: Date = new Date()): Date {
  return new Date(utcDay(now).getTime() - (days - 1) * DAY_MS);
}

// Revenue can only be summed in one currency. Use the shop's most-used one in the window.
async function currencies(shop: string, since: Date) {
  const rows = await prisma.attribution.groupBy({
    by: ["currency"],
    where: { shop, createdAt: { gte: since } },
    _count: { _all: true },
  });
  return splitCurrencies(rows.map((r) => ({ currency: r.currency, orders: r._count._all })));
}

export async function perAngle(shop: string, days: number) {
  const since = rangeStart(days);
  const { currency, excluded } = await currencies(shop, since);
  const [hits, orders] = await Promise.all([
    prisma.hit.groupBy({
      by: ["angleId", "arm"],
      where: { shop, day: { gte: since } },
      _sum: { count: true },
    }),
    prisma.attribution.groupBy({
      by: ["angleId", "arm"],
      where: { shop, createdAt: { gte: since }, ...(currency ? { currency } : {}) },
      _count: { _all: true },
      _sum: { total: true },
    }),
  ]);
  const rows: AngleRow[] = buildAngleRows(
    hits.map((h) => ({ angleId: h.angleId, arm: h.arm, sessions: h._sum.count ?? 0 })),
    orders.map((o) => ({
      angleId: o.angleId,
      arm: o.arm,
      orders: o._count._all,
      revenue: Number(o._sum.total ?? 0),
    })),
  );
  const unmatchedSessions = hits
    .filter((h) => h.arm === "none" || !h.angleId)
    .reduce((n, h) => n + (h._sum.count ?? 0), 0);
  return { rows, currency, excluded, unmatchedSessions };
}

export async function perAd(shop: string, days: number) {
  const since = rangeStart(days);
  const { currency, excluded } = await currencies(shop, since);
  const [hits, orders, ads] = await Promise.all([
    prisma.hit.groupBy({
      by: ["adId", "angleId"],
      where: { shop, day: { gte: since }, adId: { not: "" } },
      _sum: { count: true },
    }),
    prisma.attribution.groupBy({
      by: ["adId"],
      where: { shop, createdAt: { gte: since }, adId: { not: "" }, ...(currency ? { currency } : {}) },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.ad.findMany({ where: { shop }, select: { adId: true, adName: true } }),
  ]);
  const names: Record<string, string> = {};
  for (const a of ads) names[a.adId] = a.adName;
  const rows: AdRow[] = buildAdRows(
    hits.map((h) => ({ adId: h.adId, angleId: h.angleId, sessions: h._sum.count ?? 0 })),
    orders.map((o) => ({ adId: o.adId, orders: o._count._all, revenue: Number(o._sum.total ?? 0) })),
    names,
  );
  return { rows, currency, excluded };
}

// Home numbers: visitors who got the matched page.
export async function matchedSummary(shop: string, days: number): Promise<{ stats: ArmStats; currency: string }> {
  const { rows, currency } = await perAngle(shop, days);
  const total = rows.reduce(
    (t, r) => ({
      sessions: t.sessions + r.matched.sessions,
      orders: t.orders + r.matched.orders,
      revenue: t.revenue + r.matched.revenue,
    }),
    { sessions: 0, orders: 0, revenue: 0 },
  );
  return { stats: armStats(total), currency };
}

// Ads page: total sessions per ad over all time.
export async function sessionsByAd(shop: string): Promise<Record<string, number>> {
  const rows = await prisma.hit.groupBy({
    by: ["adId"],
    where: { shop, adId: { not: "" } },
    _sum: { count: true },
  });
  return Object.fromEntries(rows.map((r) => [r.adId, r._sum.count ?? 0]));
}

export async function hasAnyHit(shop: string): Promise<boolean> {
  return (await prisma.hit.findFirst({ where: { shop }, select: { id: true } })) !== null;
}
