import { PublicPage } from "../lib/PublicPage";

import styles from "../lib/page.module.css";

export const meta = () => [
  { title: "Privacy policy | Hookmatch" },
  { name: "description", content: "What Hookmatch stores, why, and how long." },
];

export default function Privacy() {
  return (
    <PublicPage>
      <h1>Privacy policy</h1>
      <p className={styles.updated}>Last updated: November 6, 2026</p>
      <p>
        Hookmatch is a Shopify app that matches your store pages to the Meta ad a
        shopper clicked and reports revenue per ad. It is operated by Outerscope.
        This page says what it stores, why, and for how long. Questions:{" "}
        <a href="mailto:support@outerscope.xyz">support@outerscope.xyz</a>.
      </p>

      <h2>What we collect from Shopify</h2>
      <ul>
        <li>
          <strong>Shop and session data.</strong> Your shop domain and the Shopify
          access and session tokens needed to sign you in to the app and write the
          app configuration to your shop.
        </li>
        <li>
          <strong>Order data, per order.</strong> From the orders/create webhook we
          store the order id, order total, currency and three Hookmatch cart
          attributes (angle, test group, ad id). We use it to show revenue per angle
          and per ad.
        </li>
        <li>
          <strong>Your angle settings.</strong> The angles, match rules and content you
          enter in the app. These are stored in a metafield on your shop that only
          Hookmatch owns.
        </li>
      </ul>
      <p>
        We do not store customer names, email addresses, phone numbers or street
        addresses. The only customer-related Shopify data we read is the order data
        above (protected customer data level 1).
      </p>

      <h2>What we collect from your storefront visitors</h2>
      <ul>
        <li>
          <strong>Daily visit counts.</strong> When a visitor lands from an ad, the
          storefront sends one anonymous count with the angle, test group, and the ad,
          ad set and campaign ids and names that came in the page URL parameters. We
          keep a daily total per combination. No IP address, user agent or visitor id
          is stored.
        </li>
        <li>
          <strong>Cart attributes.</strong> Hookmatch adds three hidden attributes to
          the cart (angle, test group, ad id) so the order can be matched to the ad.
        </li>
      </ul>

      <h2>Cookies and browser storage</h2>
      <p>
        Hookmatch sets no cookies. It uses the visitor&apos;s browser localStorage and
        sessionStorage on your store to keep a visitor on the same angle and test
        group. The matched angle is kept for 24 hours. A small record of which test
        group the visitor was put in for each angle stays until the visitor clears
        their browser data, so the visitor is not switched between groups. None of
        this is sent to us except as the anonymous counts above.
      </p>

      <h2>How we use it</h2>
      <p>
        Only to run the app: to show the right content, to report results to you, and
        to bill through Shopify. We do not sell data, share it for advertising, build
        visitor profiles, or use it for anything else. We make no automated decisions
        about people.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        We keep data while Hookmatch is installed. Shopify sends a shop/redact request
        about 48 hours after you uninstall, and we delete everything we hold for your
        shop then: sessions, daily counts, ads and order records. When Shopify sends a
        customers/redact request we delete the matching order records. A
        customers/data_request needs no export from us, because we hold no personal
        customer details. Uninstalling also removes the Hookmatch blocks and embed from
        your theme.
      </p>

      <h2>Where data is stored and who processes it</h2>
      <p>
        The app runs on Vercel in the United States. The database is Supabase
        Postgres in us-east-1 (United States). Those two providers process the data on
        our behalf. If you are in the EEA, UK or Switzerland, your data is transferred
        to the United States. Shopify&apos;s own handling of your data is covered by{" "}
        <a href="https://www.shopify.com/legal/privacy/app-users">
          Shopify&apos;s privacy policy
        </a>
        .
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask us to access, correct or delete the data we hold about your shop,
        and a shopper can ask the merchant, who can pass the request on to us, to
        delete order records tied to that shopper. Email{" "}
        <a href="mailto:support@outerscope.xyz">support@outerscope.xyz</a> and we reply
        within 1 business day.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes in a way that affects what we collect, we will update
        the date above and tell installed merchants in the app.
      </p>

      <h2>Contact</h2>
      <p>
        Outerscope, <a href="mailto:support@outerscope.xyz">support@outerscope.xyz</a>
      </p>
    </PublicPage>
  );
}
