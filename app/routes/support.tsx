import { PublicPage } from "../lib/PublicPage";

export const meta = () => [
  { title: "Support | Hookmatch" },
  { name: "description", content: "Get help with Hookmatch." },
];

export default function Support() {
  return (
    <PublicPage>
      <h1>Support</h1>
      <p>
        Email <a href="mailto:support@outerscope.xyz">support@outerscope.xyz</a>. We
        reply within 1 business day. Include your shop domain (your-store.myshopify.com)
        and what you expected to happen.
      </p>

      <h2>Set up in 5 steps</h2>
      <ol>
        <li>Install Hookmatch and open it from your Shopify admin Apps list.</li>
        <li>
          Turn on the Hookmatch app embed in your theme (the setup checklist has a
          direct link).
        </li>
        <li>
          Add the Matched headline, subheadline, media or badge blocks where you want
          the content to change, and set your normal content in each block.
        </li>
        <li>
          Create an angle: give it a name, the ad or names that should match it, and
          the content shoppers from that ad should see.
        </li>
        <li>
          Copy the URL parameters string from the app into the URL parameters field of
          your ads in Meta Ads Manager (ad level). Visit your store with a test ad id
          to check it.
        </li>
      </ol>

      <h2>Questions</h2>

      <h3>Does it slow my store?</h3>
      <p>
        Hookmatch is built to stay light. It loads one small deferred script, reads its
        settings from your theme without a network call, and sends one tiny request per
        landing visit. Nothing else calls our server from your storefront.
      </p>

      <h3>Does it work with my theme?</h3>
      <p>
        It works with Online Store 2.0 themes, because it uses theme app embeds and app
        blocks. Older vintage themes without app blocks are not supported. You can add
        the blocks to any section that accepts app blocks, with no code edits.
      </p>

      <h3>What happens if I uninstall?</h3>
      <p>
        The Hookmatch embed and blocks leave your theme with the app, and your store
        goes back to your default content. About 48 hours later Shopify tells us to
        delete your shop&apos;s data, and we do. See the{" "}
        <a href="/privacy">privacy policy</a>.
      </p>

      <h3>How does the holdout work?</h3>
      <p>
        On the Pro plan you pick a holdout percentage. That share of matched visitors
        is kept on your normal store (the control group) and still counted. The rest
        see the matched content. Each visitor is assigned once per angle. The Report
        compares revenue per visit between the two groups so you can see the lift
        from matching.
      </p>
    </PublicPage>
  );
}
