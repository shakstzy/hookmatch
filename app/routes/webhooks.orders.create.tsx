import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { parseNoteAttributes, toDecimalString } from "../lib/attribution";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const attribution = parseNoteAttributes(payload?.note_attributes);
  if (!attribution || payload?.id === undefined || payload?.id === null) {
    return new Response(null, { status: 200 });
  }

  const orderId = String(payload.id);
  const total = toDecimalString(payload.total_price);
  if (total === null) {
    console.error("orders/create skipped: bad total_price", shop, orderId, payload.total_price);
    return new Response(null, { status: 200 });
  }
  const currency = typeof payload.currency === "string" ? payload.currency.slice(0, 8) : "";
  const created = new Date(payload.created_at);
  const createdAt = Number.isNaN(created.getTime()) ? new Date() : created;

  // Shopify retries webhooks, so the upsert keeps one row per order.
  await db.attribution.upsert({
    where: { shop_orderId: { shop, orderId } },
    create: { shop, orderId, ...attribution, total, currency, createdAt },
    update: { ...attribution, total, currency },
  });

  return new Response(null, { status: 200 });
};
