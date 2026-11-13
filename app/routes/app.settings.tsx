import { useEffect, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getConfigForPage, getPlan, updateConfig } from "../lib/config.server";
import { SaveErrors, useCopy } from "../lib/adminUi";
import { ConfigErrorBoundary } from "../lib/ConfigErrorBoundary";
import { MAX_HOLDOUT, URL_PARAMS, pricingUrl } from "../lib/config";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [config, plan] = await Promise.all([getConfigForPage(admin), getPlan(admin)]);
  return { holdout: config.holdout, plan, pricing: pricingUrl(session.shop), params: URL_PARAMS };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const raw = String(form.get("holdout") ?? "").trim();
  const holdout = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (Number.isNaN(holdout)) return { ok: false, errors: ["Holdout must be a whole number."] };
  const result = await updateConfig(admin, session.shop, (c) => ({ ...c, holdout }));
  return { ok: result.ok, errors: result.errors };
};

export default function Settings() {
  const { holdout, plan, pricing, params } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();
  const [value, setValue] = useState(String(holdout));
  const saving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.ok) shopify.toast.show("Saved");
  }, [fetcher.data, shopify]);

  const copy = useCopy(params);

  return (
    <s-page heading="Settings">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => fetcher.submit({ holdout: value }, { method: "POST" })}
        {...(saving ? { loading: true } : {})}
      >
        Save
      </s-button>

      {fetcher.data && !fetcher.data.ok && <SaveErrors errors={fetcher.data.errors} />}

      <s-section heading="Holdout">
        <s-stack gap="base">
          <s-paragraph>
            The share of matched visitors who see your normal store instead. They are still counted, so Report can show
            how much the matched pages add. 10% is a common start.
          </s-paragraph>
          <s-number-field
            label="Holdout %"
            value={value}
            min={0}
            max={MAX_HOLDOUT}
            step={1}
            disabled={plan === "free"}
            details={plan === "free" ? "Holdout is a Pro feature." : `0 to ${MAX_HOLDOUT}`}
            onInput={(e) => setValue(e.currentTarget.value)}
          />
        </s-stack>
      </s-section>

      <s-section heading="Plan">
        <s-stack gap="base">
          <s-paragraph>
            You are on <strong>{plan === "pro" ? "Pro" : "Free"}</strong>.{" "}
            {plan === "pro"
              ? "Unlimited angles and holdout."
              : "1 active angle, all reporting. Pro ($39/mo, 14-day trial) adds unlimited angles and holdout."}
          </s-paragraph>
          <s-link href={pricing} target="_top">
            {plan === "pro" ? "Manage plan" : "Change plan"}
          </s-link>
        </s-stack>
      </s-section>

      <s-section heading="URL parameters">
        <s-stack gap="base">
          <s-paragraph>
            In Meta Ads Manager, open each ad, go to Tracking, and paste this into URL parameters. Hookmatch then finds
            every ad on its own.
          </s-paragraph>
          <s-paragraph>Point the ad at your home page or a product page that has the Hookmatch blocks.</s-paragraph>
          <s-text-field label="URL parameters" value={params} readOnly />
          <s-stack direction="inline">
            <s-button onClick={copy}>Copy</s-button>
          </s-stack>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

export const ErrorBoundary = ConfigErrorBoundary;
