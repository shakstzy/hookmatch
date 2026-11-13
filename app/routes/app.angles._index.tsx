import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getConfigForPage, getPlan, updateConfig } from "../lib/config.server";
import { useErrorToast } from "../lib/adminUi";
import { ConfigErrorBoundary } from "../lib/ConfigErrorBoundary";
import { matchSummary, pricingUrl } from "../lib/config";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [config, plan] = await Promise.all([getConfigForPage(admin), getPlan(admin)]);
  return { angles: config.angles, plan, pricing: pricingUrl(session.shop) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const active = form.get("active") === "true";
  const result = await updateConfig(admin, session.shop, (c) => ({
    ...c,
    angles: c.angles.map((a) => (a.id === id ? { ...a, active } : a)),
  }));
  return { ok: result.ok, errors: result.errors };
};

function ActiveToggle({ id, name, active }: { id: string; name: string; active: boolean }) {
  const fetcher = useFetcher<typeof action>();
  const checked = fetcher.formData ? fetcher.formData.get("active") === "true" : active;
  useErrorToast(fetcher.data);
  return (
    <s-switch
      label={`${name} active`}
      labelAccessibilityVisibility="exclusive"
      checked={checked}
      onChange={(e) =>
        fetcher.submit({ id, active: String(e.currentTarget.checked) }, { method: "POST" })
      }
    />
  );
}

export default function Angles() {
  const { angles, plan, pricing } = useLoaderData<typeof loader>();
  return (
    <s-page heading="Angles">
      <s-button slot="primary-action" variant="primary" href="/app/angles/new">
        Create angle
      </s-button>
      {plan === "free" && (
        <s-banner tone="info" heading="Free plan: 1 active angle">
          <s-paragraph>
            Upgrade to Pro for unlimited angles and holdout.{" "}
            <s-link href={pricing} target="_top">
              See plans
            </s-link>
          </s-paragraph>
        </s-banner>
      )}
      <s-section padding="none">
        {angles.length === 0 ? (
          <s-box padding="base">
            <s-paragraph>
              No angles yet. An angle is one idea your ad sells. Create one, then point ads at it.
            </s-paragraph>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Angle</s-table-header>
              <s-table-header>Slug</s-table-header>
              <s-table-header>Matches</s-table-header>
              <s-table-header>Active</s-table-header>
              <s-table-header>Edit</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {angles.map((a) => (
                <s-table-row key={a.id}>
                  <s-table-cell>{a.name}</s-table-cell>
                  <s-table-cell>
                    <code>{a.slug}</code>
                  </s-table-cell>
                  <s-table-cell>{matchSummary(a)}</s-table-cell>
                  <s-table-cell>
                    <ActiveToggle id={a.id} name={a.name} active={a.active} />
                  </s-table-cell>
                  <s-table-cell>
                    <s-link href={`/app/angles/${a.id}`}>Edit</s-link>
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

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

export const ErrorBoundary = ConfigErrorBoundary;
