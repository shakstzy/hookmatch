import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { MAX_ADS_PER_SHOP, MAX_HITS_PER_SHOP_DAY, nameUpdate, parseHit, utcDay } from "../lib/hit";

// Storefront beacon: https://<shop>/apps/hm/hit -> POST /proxy/hit (signed by Shopify).
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });

  // Throws a 400 Response when the proxy signature is invalid.
  await authenticate.public.appProxy(request);

  const shop = new URL(request.url).searchParams.get("shop");
  if (!shop) return new Response(null, { status: 400 });

  const hit = parseHit(await request.text().catch(() => ""));
  if (!hit) return new Response(null, { status: 400 });

  const day = utcDay();
  const names = {
    adName: hit.adName,
    adsetId: hit.adsetId,
    adsetName: hit.adsetName,
    campaignId: hit.campaignId,
    campaignName: hit.campaignName,
  };

  const update = nameUpdate(names);

  try {
    // Existing rows always increment; a new row is created only while the shop is under its cap.
    const hitKey = { shop, day, angleId: hit.angleId, arm: hit.arm, adId: hit.adId };
    const hitWhere = { shop_day_angleId_arm_adId: hitKey };
    const hitExists = await db.hit.findUnique({ where: hitWhere, select: { id: true } });
    if (hitExists || (await db.hit.count({ where: { shop, day } })) < MAX_HITS_PER_SHOP_DAY) {
      await db.hit.upsert({
        where: hitWhere,
        create: { ...hitKey, ...names, count: 1 },
        update: { count: { increment: 1 }, ...update },
      });
    }

    if (hit.adId) {
      const now = new Date();
      const adWhere = { shop_adId: { shop, adId: hit.adId } };
      const adExists = await db.ad.findUnique({ where: adWhere, select: { id: true } });
      if (adExists || (await db.ad.count({ where: { shop } })) < MAX_ADS_PER_SHOP) {
        await db.ad.upsert({
          where: adWhere,
          create: { shop, adId: hit.adId, ...names, firstSeen: now, lastSeen: now },
          update: { ...update, lastSeen: now },
        });
      }
    }
  } catch (error) {
    console.error("hit upsert failed", shop, error);
    return new Response(null, { status: 500 });
  }

  return new Response(null, { status: 204 });
};

// Not a page: GET returns 405 instead of a route-not-found render.
export const loader = () => new Response(null, { status: 405 });
