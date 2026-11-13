import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { normalizeTopic, orderIdsToRedact } from "../lib/attribution";

// Mandatory privacy webhooks. authenticate.webhook verifies the HMAC and throws 401 when it is bad.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  switch (normalizeTopic(topic)) {
    case "CUSTOMERS_DATA_REQUEST":
      // We hold no customer data, only order ids, totals and ad ids.
      break;
    case "CUSTOMERS_REDACT": {
      const orderIds = orderIdsToRedact(payload);
      if (orderIds.length) {
        await db.attribution.deleteMany({ where: { shop, orderId: { in: orderIds } } });
      }
      break;
    }
    case "SHOP_REDACT":
      await db.$transaction([
        db.hit.deleteMany({ where: { shop } }),
        db.ad.deleteMany({ where: { shop } }),
        db.attribution.deleteMany({ where: { shop } }),
        db.session.deleteMany({ where: { shop } }),
      ]);
      break;
    default:
      console.warn(`Unhandled compliance topic ${topic}`);
  }

  return new Response(null, { status: 200 });
};
