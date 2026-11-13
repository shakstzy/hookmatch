import { useEffect, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getConfigForPage } from "../lib/config.server";
import { useCopy } from "../lib/adminUi";
import { ConfigErrorBoundary } from "../lib/ConfigErrorBoundary";
import { URL_PARAMS } from "../lib/config";
import { hasAnyHit, matchedSummary } from "../lib/report.server";
import { formatCount, formatMoney } from "../lib/report";

const EMBED = "hm-core";
const BLOCKS = ["hm-headline", "hm-subheadline", "hm-media", "hm-badge"];
const BLOCK_BUTTONS = [
  ["hm-headline", "Headline"],
  ["hm-subheadline", "Subheadline"],
  ["hm-media", "Image or video"],
  ["hm-badge", "Badge"],
];
const PAGES = [
  ["index", "home page"],
  ["product", "product page"],
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [config, seen, week] = await Promise.all([
    getConfigForPage(admin),
    hasAnyHit(session.shop),
    matchedSummary(session.shop, 7),
  ]);
  return {
    // eslint-disable-next-line no-undef
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
    angleCount: config.angles.length,
    seen,
    week,
  };
};

type Status = "checking" | "yes" | "no";

// Asks App Bridge which of our theme blocks are live on the published theme.
// No access scope needed. Outside the admin or in dev it can fail; then we show "not detected".
function useThemeStatus() {
  const shopify = useAppBridge();
  const [embed, setEmbed] = useState<Status>("checking");
  const [blocks, setBlocks] = useState<Status>("checking");
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const exts = await shopify.app.extensions();
        const acts = exts
          .filter((e) => e.type === "theme_app_extension")
          .flatMap(
            (e) => e.activations as { handle: string; status: string }[],
          );
        const on = (handles: string[]) =>
          acts.some((a) => handles.includes(a.handle) && a.status === "active");
        if (!live) return;
        setEmbed(on([EMBED]) ? "yes" : "no");
        setBlocks(on(BLOCKS) ? "yes" : "no");
      } catch {
        if (!live) return;
        setEmbed("no");
        setBlocks("no");
      }
    })();
    return () => {
      live = false;
    };
  }, [shopify]);
  return { embed, blocks };
}

function StatusBadge({ status, label }: { status: Status; label?: string }) {
  if (status === "checking") return <s-badge>Checking</s-badge>;
  return status === "yes" ? (
    <s-badge tone="success">{label ?? "Done"}</s-badge>
  ) : (
    <s-badge tone="caution">{label ?? "To do"}</s-badge>
  );
}

export default function Index() {
  const { apiKey, shop, angleCount, seen, week } =
    useLoaderData<typeof loader>();
  const { embed, blocks } = useThemeStatus();

  const editor = `https://${shop}/admin/themes/current/editor`;
  const embedLink = `${editor}?context=apps&activateAppId=${apiKey}/${EMBED}`;
  // Product pages have a main section that takes app blocks; home has none, so blocks get a new section at the bottom.
  const blockLink = (template: string, handle: string) =>
    `${editor}?template=${template}&addAppBlockId=${apiKey}/${handle}&target=${template === "product" ? "mainSection" : "newAppsSection"}`;

  const copy = useCopy(URL_PARAMS);

  return (
    <s-page heading="Hookmatch">
      <s-section heading="Set up">
        <s-stack direction="block" gap="large">
          <s-stack direction="block" gap="small">
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-heading>1. Turn on the app embed</s-heading>
              <StatusBadge
                status={embed}
                label={embed === "yes" ? "On" : "Off"}
              />
            </s-stack>
            <s-paragraph>
              Runs on every page and swaps content for matched ads.
            </s-paragraph>
            <s-stack direction="inline">
              <s-button
                href={embedLink}
                target="_blank"
                {...(embed === "yes" ? {} : { variant: "primary" })}
              >
                {embed === "yes" ? "Open theme editor" : "Turn on"}
              </s-button>
            </s-stack>
          </s-stack>

          <s-stack direction="block" gap="small">
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-heading>2. Add blocks to your pages</s-heading>
              <StatusBadge
                status={blocks}
                label={
                  blocks === "yes" ? "Added on at least one page" : "None yet"
                }
              />
            </s-stack>
            <s-paragraph>
              Add the blocks where you want content to change: headline,
              subheadline, image or video, and badge. An empty block shows
              nothing unless a matched ad visitor arrives.
            </s-paragraph>
            <s-paragraph>
              On the home page, blocks land at the bottom. Drag them up in the
              editor. Needs an Online Store 2.0 theme. Themes with an
              index.liquid home page can't take app blocks on the home page.
            </s-paragraph>
            {PAGES.map(([template, label]) => (
              <s-stack key={template} direction="inline" gap="base">
                {BLOCK_BUTTONS.map(([handle, name]) => (
                  <s-button
                    key={handle}
                    href={blockLink(template, handle)}
                    target="_blank"
                  >
                    {name}, {label}
                  </s-button>
                ))}
              </s-stack>
            ))}
          </s-stack>

          <s-stack direction="block" gap="small">
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-heading>3. Create an angle</s-heading>
              <StatusBadge
                status={angleCount > 0 ? "yes" : "no"}
                label={angleCount > 0 ? `${angleCount}` : "None yet"}
              />
            </s-stack>
            <s-paragraph>
              An angle is one idea your ad sells, with the page content to
              match.
            </s-paragraph>
            <s-stack direction="inline">
              <s-button
                href="/app/angles/new"
                {...(angleCount > 0 ? {} : { variant: "primary" })}
              >
                {angleCount > 0 ? "Manage angles" : "Create angle"}
              </s-button>
            </s-stack>
          </s-stack>

          <s-stack direction="block" gap="small">
            <s-heading>4. Paste URL parameters into your ads</s-heading>
            <s-paragraph>
              In Ads Manager, open each ad, go to Tracking, and paste this into
              URL parameters.
            </s-paragraph>
            <s-paragraph>
              Point the ad at your home page or a product page that has the
              Hookmatch blocks.
            </s-paragraph>
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <code style={{ wordBreak: "break-all" }}>{URL_PARAMS}</code>
            </s-box>
            <s-stack direction="inline">
              <s-button onClick={copy}>Copy</s-button>
            </s-stack>
          </s-stack>

          <s-stack direction="block" gap="small">
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-heading>5. See your first ad visit</s-heading>
              <StatusBadge
                status={seen ? "yes" : "no"}
                label={seen ? "Seen" : "Waiting"}
              />
            </s-stack>
            <s-paragraph>
              {seen
                ? "Visits are coming in. See which ads they came from."
                : "Click one of your ads, or add ?hm_ad=123 to your store link. It shows up here."}
            </s-paragraph>
            {seen && (
              <s-stack direction="inline">
                <s-button href="/app/ads">View ads</s-button>
              </s-stack>
            )}
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Last 7 days, matched visitors">
        <s-stack direction="inline" gap="large">
          <s-stack direction="block">
            <s-text color="subdued">Sessions</s-text>
            <s-heading>{formatCount(week.stats.sessions)}</s-heading>
          </s-stack>
          <s-stack direction="block">
            <s-text color="subdued">Orders</s-text>
            <s-heading>{formatCount(week.stats.orders)}</s-heading>
          </s-stack>
          <s-stack direction="block">
            <s-text color="subdued">Revenue</s-text>
            <s-heading>
              {formatMoney(week.stats.revenue, week.currency)}
            </s-heading>
          </s-stack>
        </s-stack>
        <s-paragraph>
          <s-link href="/app/report">Full report</s-link>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);

export const ErrorBoundary = ConfigErrorBoundary;
