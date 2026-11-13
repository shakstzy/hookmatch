import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { getConfigForPage, updateConfig } from "../lib/config.server";
import { useErrorToast } from "../lib/adminUi";
import { ConfigErrorBoundary } from "../lib/ConfigErrorBoundary";
import { assignAdToAngle, matchAngle } from "../lib/config";
import { formatCount } from "../lib/report";
import { sessionsByAd } from "../lib/report.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [config, ads, sessions] = await Promise.all([
    getConfigForPage(admin),
    prisma.ad.findMany({
      where: { shop: session.shop },
      orderBy: { lastSeen: "desc" },
      take: 500,
    }),
    sessionsByAd(session.shop),
  ]);
  const angleOf: Record<string, string> = {};
  for (const a of config.angles)
    for (const id of a.match.adIds) angleOf[id] = a.id;
  return {
    angles: config.angles.map((a) => ({ id: a.id, name: a.name })),
    ads: ads.map((a) => {
      const m = matchAngle(config, {
        ad: a.adId,
        set: a.adsetId,
        cmp: a.campaignId,
        adName: a.adName,
        setName: a.adsetName,
        cmpName: a.campaignName,
      });
      return {
        adId: a.adId,
        adName: a.adName,
        adsetName: a.adsetName,
        campaignName: a.campaignName,
        lastSeen: a.lastSeen.toISOString(),
        sessions: sessions[a.adId] ?? 0,
        angleId: angleOf[a.adId] ?? "",
        matchedName: m ? m.angle.name : "",
        matchedBy: m ? m.by : "",
      };
    }),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const adId = String(form.get("adId") ?? "");
  const angleId = String(form.get("angleId") ?? "");
  if (!/^[0-9]{1,30}$/.test(adId)) return { ok: false, errors: ["Bad ad id."] };
  const result = await updateConfig(admin, session.shop, (c) =>
    assignAdToAngle(c, angleId, adId),
  );
  return { ok: result.ok, errors: result.errors };
};

function Assign({
  adId,
  angleId,
  angles,
}: {
  adId: string;
  angleId: string;
  angles: { id: string; name: string }[];
}) {
  const fetcher = useFetcher<typeof action>();
  const value = fetcher.formData
    ? String(fetcher.formData.get("angleId"))
    : angleId;
  useErrorToast(fetcher.data);
  return (
    <s-select
      label="Angle"
      labelAccessibilityVisibility="exclusive"
      value={value}
      onChange={(e) =>
        fetcher.submit(
          { adId, angleId: e.currentTarget.value },
          { method: "POST" },
        )
      }
    >
      <s-option value="">Unassigned</s-option>
      {angles.map((a) => (
        <s-option key={a.id} value={a.id}>
          {a.name}
        </s-option>
      ))}
    </s-select>
  );
}

export default function Ads() {
  const { angles, ads } = useLoaderData<typeof loader>();
  const offName = (id: string) => {
    const angle = angles.find((x) => x.id === id);
    return angle ? `${angle.name} (off)` : "Deleted angle";
  };
  return (
    <s-page heading="Ads">
      <s-section padding="none">
        {ads.length === 0 ? (
          <s-box padding="base">
            <s-paragraph>
              No ads yet. Paste the URL parameters from Home into your ads. Each
              ad shows up here after its first visit.
            </s-paragraph>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Ad</s-table-header>
              <s-table-header format="numeric">Sessions</s-table-header>
              <s-table-header>Angle</s-table-header>
              <s-table-header>Assign</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {ads.map((a) => (
                <s-table-row key={a.adId}>
                  <s-table-cell>
                    <s-stack direction="block">
                      <s-text>{a.adName || "Unnamed ad"}</s-text>
                      <s-text color="subdued">
                        {a.adId}
                        {a.campaignName ? ` · ${a.campaignName}` : ""}
                      </s-text>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{formatCount(a.sessions)}</s-table-cell>
                  <s-table-cell>
                    {a.matchedBy ? (
                      `${a.matchedName} (by ${a.matchedBy})`
                    ) : a.angleId ? (
                      offName(a.angleId)
                    ) : (
                      <s-badge tone="caution">Unassigned</s-badge>
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    <Assign adId={a.adId} angleId={a.angleId} angles={angles} />
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);

export const ErrorBoundary = ConfigErrorBoundary;
