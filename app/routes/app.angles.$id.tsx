import { useEffect, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getConfigForPage, updateConfig, type Admin } from "../lib/config.server";
import { SaveErrors } from "../lib/adminUi";
import { ConfigErrorBoundary } from "../lib/ConfigErrorBoundary";
import {
  emptyAngle,
  parseList,
  slugify,
  validateConfig,
  type Angle,
  type MediaType,
} from "../lib/config";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  if (params.id === "new") return { angle: emptyAngle(), isNew: true, rev: null as number | null };
  const config = await getConfigForPage(admin);
  const angle = config.angles.find((a) => a.id === params.id);
  if (!angle) throw new Response("Angle not found", { status: 404 });
  return { angle, isNew: false, rev: config.rev as number | null };
};

type ActionResult =
  | { intent: "save" | "delete"; ok: boolean; errors: string[]; id?: string }
  | { intent: "file"; ok: boolean; errors: string[]; url?: string; mediaType?: MediaType };

async function resolveFile(admin: Admin, id: string): Promise<ActionResult> {
  const fail = (m: string): ActionResult => ({ intent: "file", ok: false, errors: [m] });
  if (!/^gid:\/\/shopify\/(MediaImage|Video|GenericFile)\/\d+$/.test(id)) return fail("Unsupported file.");
  const res = await admin.graphql(
    `#graphql
    query HmFile($id: ID!) {
      node(id: $id) {
        __typename
        ... on MediaImage { image { url } }
        ... on Video { sources { url mimeType } }
        ... on GenericFile { url mimeType }
      }
    }`,
    { variables: { id } },
  );
  const body = (await res.json()) as {
    data?: {
      node?: {
        __typename?: string;
        image?: { url: string } | null;
        sources?: { url: string; mimeType: string }[];
        url?: string | null;
        mimeType?: string | null;
      } | null;
    };
  };
  const node = body.data?.node;
  if (node?.__typename === "GenericFile") {
    // Files can hold any document; only an image or video file is usable as hero media.
    const type = node.mimeType?.startsWith("image/") ? "image" : node.mimeType?.startsWith("video/") ? "video" : null;
    if (!type) return fail("That file is a document, not an image or video. Pick an image or video file.");
    if (!node.url) return fail("That file is not ready yet. Try again in a moment.");
    return { intent: "file", ok: true, errors: [], url: node.url, mediaType: type };
  }
  if (node?.image?.url) return { intent: "file", ok: true, errors: [], url: node.image.url, mediaType: "image" };
  const mp4 = node?.sources?.find((s) => s.mimeType === "video/mp4") ?? node?.sources?.[0];
  if (mp4) return { intent: "file", ok: true, errors: [], url: mp4.url, mediaType: "video" };
  return fail("That file is not ready yet or is not an image or video. Try again in a moment.");
}

export const action = async ({ request, params }: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "file") return resolveFile(admin, String(form.get("fileId") ?? ""));

  if (intent === "delete") {
    const result = await updateConfig(admin, session.shop, (c) => ({
      ...c,
      angles: c.angles.filter((a) => a.id !== params.id),
    }));
    return { intent: "delete", ok: result.ok, errors: result.errors };
  }

  let angle: Angle;
  try {
    angle = JSON.parse(String(form.get("angle")));
  } catch {
    return { intent: "save", ok: false, errors: ["Could not read the form."] };
  }
  // Check this angle alone first so messages name the real problem.
  const alone = validateConfig({ v: 1, holdout: 0, angles: [angle] });
  if (!alone.ok) return { intent: "save", ok: false, errors: alone.errors };
  const clean = alone.config.angles[0];
  const rawRev = String(form.get("rev") ?? "");
  const rev = /^\d+$/.test(rawRev) ? Number(rawRev) : undefined;
  const result = await updateConfig(
    admin,
    session.shop,
    (c) => {
      const exists = c.angles.some((a) => a.id === clean.id);
      return {
        ...c,
        angles: exists ? c.angles.map((a) => (a.id === clean.id ? clean : a)) : [...c.angles, clean],
      };
    },
    rev,
  );
  return { intent: "save", ok: result.ok, errors: result.errors, id: clean.id };
};

const join = (xs: string[]) => xs.join(", ");

export default function AngleForm() {
  const { angle, isNew, rev } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const saver = useFetcher<typeof action>();
  const filer = useFetcher<typeof action>();

  const [name, setName] = useState(angle.name);
  const [slug, setSlug] = useState(angle.slug);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [icp, setIcp] = useState(angle.icp);
  const [active, setActive] = useState(angle.active);
  const [adIds, setAdIds] = useState(join(angle.match.adIds));
  const [adsetIds, setAdsetIds] = useState(join(angle.match.adsetIds));
  const [campaignIds, setCampaignIds] = useState(join(angle.match.campaignIds));
  const [nameContains, setNameContains] = useState(join(angle.match.nameContains));
  const [headline, setHeadline] = useState(angle.content.headline);
  const [subheadline, setSubheadline] = useState(angle.content.subheadline);
  const [badge, setBadge] = useState(angle.content.badge);
  const [media, setMedia] = useState(angle.content.media);
  const [mediaType, setMediaType] = useState<MediaType>(angle.content.mediaType);
  const [route, setRoute] = useState(angle.route ?? "");
  const [discountCode, setDiscountCode] = useState(angle.discountCode ?? "");

  const saving = saver.state !== "idle";
  const result = saver.data && saver.data.intent !== "file" ? saver.data : null;
  const fileResult = filer.data && filer.data.intent === "file" ? filer.data : null;

  useEffect(() => {
    if (!result?.ok) return;
    if (result.intent === "delete") {
      shopify.toast.show("Angle deleted");
      navigate("/app/angles", { replace: true });
    } else {
      shopify.toast.show("Saved");
      if (isNew) navigate(`/app/angles/${result.id}`, { replace: true });
    }
  }, [result, isNew, navigate, shopify]);

  useEffect(() => {
    if (fileResult?.ok && fileResult.url) {
      setMedia(fileResult.url);
      if (fileResult.mediaType) setMediaType(fileResult.mediaType);
    }
  }, [fileResult]);

  const onName = (v: string) => {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const pickFile = async () => {
    const activity = await shopify.intents.invoke?.("pick:shopify/File", {
      data: { mediaTypes: ["MediaImage", "Video"], multiSelect: false },
    });
    const response = await activity?.complete;
    const ids = response && response.code === "ok" ? (response.data as { ids?: string[] })?.ids : undefined;
    if (ids?.[0]) filer.submit({ intent: "file", fileId: ids[0] }, { method: "POST" });
  };

  const save = () => {
    const body: Angle = {
      id: angle.id,
      slug,
      name,
      icp,
      active,
      match: {
        adIds: parseList(adIds),
        adsetIds: parseList(adsetIds),
        campaignIds: parseList(campaignIds),
        nameContains: nameContains.split(",").map((s) => s.trim()).filter(Boolean),
      },
      content: { headline, subheadline, media, mediaType, badge },
      route: route.trim() || null,
      discountCode: discountCode.trim() || null,
    };
    saver.submit(
      { intent: "save", angle: JSON.stringify(body), ...(rev === null ? {} : { rev: String(rev) }) },
      { method: "POST" },
    );
  };

  const remove = () => {
    if (window.confirm(`Delete "${name || "this angle"}"? This cannot be undone.`)) {
      saver.submit({ intent: "delete" }, { method: "POST" });
    }
  };

  return (
    <s-page heading={isNew ? "New angle" : name || "Angle"}>
      <s-link slot="breadcrumb-actions" href="/app/angles">
        Angles
      </s-link>
      <s-button slot="primary-action" variant="primary" onClick={save} {...(saving ? { loading: true } : {})}>
        Save
      </s-button>
      {!isNew && (
        <s-button slot="secondary-actions" tone="critical" onClick={remove}>
          Delete
        </s-button>
      )}

      {result && !result.ok && <SaveErrors errors={result.errors} />}

      <s-section heading="Basics">
        <s-stack gap="base">
          <s-text-field label="Name" value={name} onInput={(e) => onName(e.currentTarget.value)} />
          <s-text-field
            label="Slug"
            value={slug}
            details={`For links from other channels: ?hm_angle=${slug || "your-slug"}`}
            onInput={(e) => {
              setSlugTouched(true);
              setSlug(e.currentTarget.value);
            }}
          />
          <s-text-area
            label="Who is this for (ICP note)"
            value={icp}
            rows={2}
            details="Only for you. Not shown to shoppers."
            onInput={(e) => setIcp(e.currentTarget.value)}
          />
          <s-switch
            label="Active"
            checked={active}
            onChange={(e) => setActive(e.currentTarget.checked)}
          />
        </s-stack>
      </s-section>

      <s-section heading="Which ads match">
        <s-stack gap="base">
          <s-paragraph>
            Separate entries with commas. Checked in order: ad, ad set, campaign, then name. Ids are digits only.
          </s-paragraph>
          <s-text-field label="Ad ids" value={adIds} onInput={(e) => setAdIds(e.currentTarget.value)} />
          <s-text-field label="Ad set ids" value={adsetIds} onInput={(e) => setAdsetIds(e.currentTarget.value)} />
          <s-text-field
            label="Campaign ids"
            value={campaignIds}
            onInput={(e) => setCampaignIds(e.currentTarget.value)}
          />
          <s-text-field
            label="Name contains"
            value={nameContains}
            details="Matches ad, ad set or campaign names. Not case sensitive."
            onInput={(e) => setNameContains(e.currentTarget.value)}
          />
        </s-stack>
      </s-section>

      <s-section heading="What they see">
        <s-stack gap="base">
          <s-text-field label="Headline" value={headline} onInput={(e) => setHeadline(e.currentTarget.value)} />
          <s-text-field
            label="Subheadline"
            value={subheadline}
            details="Shows only where you add the Subheadline block."
            onInput={(e) => setSubheadline(e.currentTarget.value)}
          />
          <s-text-field
            label="Badge"
            value={badge}
            details="Shows only where you add the Badge block."
            onInput={(e) => setBadge(e.currentTarget.value)}
          />
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-text-field
              label="Hero media URL"
              value={media}
              details="Pick from your Files or paste a https:// link."
              onInput={(e) => setMedia(e.currentTarget.value)}
            />
            <s-select
              label="Type"
              value={mediaType}
              onChange={(e) => setMediaType(e.currentTarget.value as MediaType)}
            >
              <s-option value="image">Image</s-option>
              <s-option value="video">Video</s-option>
            </s-select>
            <s-button onClick={pickFile} {...(filer.state !== "idle" ? { loading: true } : {})}>
              Choose from Files
            </s-button>
          </s-stack>
          {fileResult && !fileResult.ok && (
            <s-banner tone="warning">{fileResult.errors[0]}</s-banner>
          )}
          {media && mediaType === "image" && <s-image src={media} alt="" aspectRatio="16/9" objectFit="contain" />}
        </s-stack>
      </s-section>

      <s-section heading="Page and offer">
        <s-stack gap="base">
          <s-text-field
            label="Send visitors to (optional)"
            value={route}
            placeholder="/pages/outage-kit"
            details="A path on your store. Visitors from matching ads land here instead."
            onInput={(e) => setRoute(e.currentTarget.value)}
          />
          <s-text-field
            label="Discount code (optional)"
            value={discountCode}
            details="Create the code in Shopify first. It applies at checkout."
            onInput={(e) => setDiscountCode(e.currentTarget.value)}
          />
          <s-text color="subdued">Shoppers can see this code in the page source.</s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

export const ErrorBoundary = ConfigErrorBoundary;
