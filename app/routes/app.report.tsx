import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getConfigForPage } from "../lib/config.server";
import { ConfigErrorBoundary } from "../lib/ConfigErrorBoundary";
import { perAd, perAngle } from "../lib/report.server";
import {
  RANGES,
  formatCount,
  formatLift,
  formatMoney,
  formatPercent,
  parseRange,
  excludedNote,
  MIN_SESSIONS,
  type ArmStats,
} from "../lib/report";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const days = parseRange(new URL(request.url).searchParams.get("days"));
  const [config, angles, ads] = await Promise.all([
    getConfigForPage(admin),
    perAngle(session.shop, days),
    perAd(session.shop, days),
  ]);
  const names: Record<string, string> = {};
  for (const a of config.angles) names[a.id] = a.name;
  return { days, names, angles, ads };
};

function ArmCells({ s, currency }: { s: ArmStats; currency: string }) {
  return (
    <>
      <s-table-cell>{formatCount(s.sessions)}</s-table-cell>
      <s-table-cell>{formatCount(s.orders)}</s-table-cell>
      <s-table-cell>{formatMoney(s.revenue, currency)}</s-table-cell>
      <s-table-cell>{formatPercent(s.conversion)}</s-table-cell>
      <s-table-cell>{formatMoney(s.revenuePerVisit, currency)}</s-table-cell>
    </>
  );
}

export default function Report() {
  const { days, names, angles, ads } = useLoaderData<typeof loader>();
  const angleName = (id: string) =>
    id ? (names[id] ?? "Deleted angle") : "No angle";
  const cur = angles.currency;
  const anyNote = angles.rows.some((r) => r.note);
  const currencyNote = excludedNote(cur, angles.excluded);

  return (
    <s-page heading="Report">
      <s-stack direction="inline" gap="small">
        {RANGES.map((d) => (
          <s-button
            key={d}
            href={`?days=${d}`}
            variant={d === days ? "primary" : "secondary"}
          >
            {d} days
          </s-button>
        ))}
      </s-stack>

      <s-paragraph>
        Revenue is the gross order total: tax and shipping are included and
        refunds are not subtracted.
      </s-paragraph>
      {currencyNote && (
        <s-banner tone="warning">
          <s-paragraph>{currencyNote}</s-paragraph>
        </s-banner>
      )}

      <s-section heading="By angle" padding="none">
        {angles.rows.length === 0 ? (
          <s-box padding="base">
            <s-paragraph>No visits in this period yet.</s-paragraph>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Angle</s-table-header>
              <s-table-header>Group</s-table-header>
              <s-table-header format="numeric">Sessions</s-table-header>
              <s-table-header format="numeric">Orders</s-table-header>
              <s-table-header format="numeric">Revenue</s-table-header>
              <s-table-header format="numeric">Conversion</s-table-header>
              <s-table-header format="numeric">
                Revenue per visit
              </s-table-header>
              <s-table-header format="numeric">Lift</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {angles.rows.flatMap((r) => [
                <s-table-row key={`${r.angleId}-m`}>
                  <s-table-cell>{angleName(r.angleId)}</s-table-cell>
                  <s-table-cell>Matched</s-table-cell>
                  <ArmCells s={r.matched} currency={cur} />
                  <s-table-cell>
                    {formatLift(r.lift)}
                    {r.note ? " *" : ""}
                  </s-table-cell>
                </s-table-row>,
                <s-table-row key={`${r.angleId}-c`}>
                  <s-table-cell />
                  <s-table-cell>Control</s-table-cell>
                  <ArmCells s={r.control} currency={cur} />
                  <s-table-cell />
                </s-table-row>,
              ])}
            </s-table-body>
          </s-table>
        )}
      </s-section>
      {anyNote && (
        <s-banner tone="info">
          <s-paragraph>
            * Too few visits to trust the lift. Wait for {MIN_SESSIONS}+ visits
            in both matched and control, and set a holdout under Settings if
            control is empty.
          </s-paragraph>
        </s-banner>
      )}
      {angles.unmatchedSessions > 0 && (
        <s-paragraph>
          {formatCount(angles.unmatchedSessions)}{" "}
          {angles.unmatchedSessions === 1 ? "session" : "sessions"} matched no
          angle. Assign those ads under <s-link href="/app/ads">Ads</s-link>.
        </s-paragraph>
      )}

      <s-section heading="By ad" padding="none">
        {ads.rows.length === 0 ? (
          <s-box padding="base">
            <s-paragraph>No ad visits in this period yet.</s-paragraph>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Ad</s-table-header>
              <s-table-header>Angle</s-table-header>
              <s-table-header format="numeric">Sessions</s-table-header>
              <s-table-header format="numeric">Orders</s-table-header>
              <s-table-header format="numeric">Revenue</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {ads.rows.map((r) => (
                <s-table-row key={r.adId}>
                  <s-table-cell>
                    <s-stack direction="block">
                      <s-text>{r.adName || "Unnamed ad"}</s-text>
                      <s-text color="subdued">{r.adId}</s-text>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{angleName(r.angleId)}</s-table-cell>
                  <s-table-cell>{formatCount(r.sessions)}</s-table-cell>
                  <s-table-cell>{formatCount(r.orders)}</s-table-cell>
                  <s-table-cell>
                    {formatMoney(r.revenue, ads.currency)}
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
