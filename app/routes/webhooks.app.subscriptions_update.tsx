import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getPlan, trimConfigToFree } from "../lib/config.server";

// A plan ended or changed. If the shop is no longer Pro, shrink its saved config to what Free allows
// (first active angle stays, the rest go off, holdout 0) so the storefront and admin match the plan.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // No offline session (for example after uninstall): nothing to rewrite.
  if (!admin || !session) return new Response();

  if ((await getPlan(admin)) === "pro") return new Response();
  const trimmed = await trimConfigToFree(admin, shop);
  if (trimmed) console.log(`Trimmed ${shop} to the Free plan`);
  return new Response();
};
