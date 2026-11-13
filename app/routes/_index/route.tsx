import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form } from "react-router";

import styles from "./styles.module.css";

const SITE = "https://hookmatch.vercel.app";
const TITLE = "Hookmatch: match your Shopify store to the Meta ad clicked";
const DESCRIPTION =
  "Show each Meta ad click a store page that fits the ad, then see revenue per ad with a holdout. Free plan, Pro from $39 a month.";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export const meta = () => [
  { title: TITLE },
  { name: "description", content: DESCRIPTION },
  { name: "color-scheme", content: "light dark" },
  { property: "og:type", content: "website" },
  { property: "og:site_name", content: "Hookmatch" },
  { property: "og:title", content: TITLE },
  { property: "og:description", content: DESCRIPTION },
  { property: "og:url", content: SITE },
  { property: "og:image", content: `${SITE}/og.png` },
  { property: "og:image:width", content: "1200" },
  { property: "og:image:height", content: "630" },
  {
    property: "og:image:alt",
    content: "The same store page showing a different headline for each Meta ad",
  },
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:title", content: TITLE },
  { name: "twitter:description", content: DESCRIPTION },
  { name: "twitter:image", content: `${SITE}/og.png` },
];

const PARAMS =
  "utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&hm_ad={{ad.id}}&hm_set={{adset.id}}&hm_cmp={{campaign.id}}";

const ANGLES = [
  {
    key: "commute",
    label: "Commuters",
    adName: "Commute pack, 15s demo",
    adLine: "Fits a 16-inch laptop and a lunch.",
    headline: "The pack that survives your commute",
    sub: "Padded laptop sleeve, hidden pocket, rain cover included.",
    badge: "Fits a 16-inch laptop",
    discount: null,
    tone: "toneA",
  },
  {
    key: "hike",
    label: "Hikers",
    adName: "20 mile test, Reel",
    adLine: "Carried for 20 miles. No sore shoulders.",
    headline: "Built for 20-mile days",
    sub: "Load-spreading straps and a waterproof base.",
    badge: "Waterproof base",
    discount: null,
    tone: "toneB",
  },
  {
    key: "gift",
    label: "Gift buyers",
    adName: "Gift guide, carousel",
    adLine: "The gift they will actually use.",
    headline: "The gift they will actually use",
    sub: "Ships in a gift box with a handwritten card.",
    badge: "Free gift wrap",
    discount: "GIFT10 applied at checkout",
    tone: "toneC",
  },
] as const;

function Pack({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 140"
      role="img"
      aria-label="Backpack"
      focusable="false"
    >
      <path
        d="M40 28c0-12 8-20 20-20s20 8 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <rect x="18" y="26" width="84" height="108" rx="26" fill="currentColor" />
      <rect x="36" y="86" width="48" height="34" rx="10" fill="var(--pack-pocket)" />
      <path
        d="M36 100h48"
        stroke="var(--pack-line)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StoreMock({
  headline,
  sub,
  badge,
  discount,
  tone,
  label,
  matched,
}: {
  headline: string;
  sub: string;
  badge: string | null;
  discount: string | null;
  tone: string;
  label: string;
  matched: boolean;
}) {
  return (
    <div className={`${styles.store} ${styles[tone]}`} data-matched={matched}>
      <div className={styles.storeBar}>
        <span className={styles.dots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className={styles.storeUrl}>northline.com</span>
        <span className={styles.storeTag}>{label}</span>
      </div>
      <div className={styles.storeBody}>
        <div className={styles.storeCopy}>
          {badge ? <span className={styles.badge}>{badge}</span> : null}
          <p className={styles.storeHeadline}>{headline}</p>
          <p className={styles.storeSub}>{sub}</p>
          <span className={styles.storeCta}>Shop the pack</span>
          {discount ? <span className={styles.storeDiscount}>{discount}</span> : null}
        </div>
        <div className={styles.storeMedia}>
          <Pack className={styles.pack} />
        </div>
      </div>
    </div>
  );
}

function Compare() {
  const [active, setActive] = useState(0);
  const a = ANGLES[active];
  return (
    <div className={styles.compare}>
      <div className={styles.picker} role="group" aria-label="Pick an ad">
        {ANGLES.map((x, i) => (
          <button
            key={x.key}
            type="button"
            className={styles.pick}
            aria-pressed={i === active}
            onClick={() => setActive(i)}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className={styles.ad}>
        <div className={styles.adHead}>
          <span className={styles.adAvatar} aria-hidden="true" />
          <span>
            <strong>Northline</strong>
            <span className={styles.adSponsored}>Sponsored</span>
          </span>
        </div>
        <p className={styles.adText}>{a.adLine}</p>
        <div className={`${styles.adMedia} ${styles[a.tone]}`}>
          <Pack className={styles.packSm} />
        </div>
        <div className={styles.adFoot}>
          <span className={styles.adName}>{a.adName}</span>
          <span className={styles.adLink}>Shop now</span>
        </div>
      </div>

      <div className={styles.flow} aria-hidden="true">
        <span className={styles.flowLine} />
        <code className={styles.flowCode}>hm_ad=1204</code>
      </div>

      <div className={styles.pair}>
        <StoreMock
          headline="Gear for every day"
          sub="Packs, bags and travel essentials."
          badge={null}
          discount={null}
          tone="toneN"
          label="Without Hookmatch"
          matched={false}
        />
        <StoreMock
          headline={a.headline}
          sub={a.sub}
          badge={a.badge}
          discount={a.discount}
          tone={a.tone}
          label="With Hookmatch"
          matched
        />
      </div>
      <p className={styles.caption} aria-live="polite">
        Same store, same product. The headline, badge and offer follow the ad:{" "}
        {a.label.toLowerCase()}.
      </p>
    </div>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Paste one string into Ads Manager",
    body: "Copy the URL parameters from the app and paste them once, at the ad level. Every ad you run now carries its own ad ID.",
  },
  {
    n: "02",
    title: "Make an angle for each ad idea",
    body: "Write the headline, image, badge, and an optional page and discount code. Assign ads to it with one click as they show up.",
  },
  {
    n: "03",
    title: "See revenue for each ad",
    body: "The report shows orders and revenue per angle and per ad, matched visitors next to a holdout group on your normal store.",
  },
];

const FEATURES = [
  {
    title: "Matches by ad ID, no Meta login",
    body: "The ad ID comes in the link, so Hookmatch never connects to your Meta account.",
  },
  {
    title: "New ads show up to assign",
    body: "A new ad appears in the app after its first click. Assign it to an angle in one step.",
  },
  {
    title: "Send an angle to its own page",
    body: "Route an angle to a page you already built, with its own discount code applied at checkout.",
  },
  {
    title: "A holdout proves the lift",
    body: "Keep a share of matched visitors on your normal store and compare their orders with the rest.",
  },
  {
    title: "Leaves nothing behind",
    body: "It works through theme app blocks. Uninstall the app and the blocks go with it, no code to clean up.",
  },
  {
    title: "A script of about 2.5 KB",
    body: "Gzipped. Your settings are printed in the page, so matching needs no extra network call.",
  },
];

const FAQ = [
  {
    q: "Will it slow my store?",
    a: "The script is about 2.5 KB gzipped and your angles are printed in the page, so matching needs no server call. A matched visitor sees the new content right away. A visitor with no ad sees your store as it is.",
  },
  {
    q: "Which themes work?",
    a: "Online Store 2.0 themes. Hookmatch adds app blocks (headline, subheadline, media, badge) that you place in the theme editor, with no theme code to edit.",
  },
  {
    q: "What happens when I uninstall?",
    a: "The blocks and the app embed are removed with the app, and your theme is left as it was. Shopify tells us, and your shop data is deleted about 48 hours later.",
  },
  {
    q: "What do you store about my shoppers?",
    a: "No names, emails or addresses. We keep daily click counts per ad, and for each order its ID, total and which angle it came from. The privacy policy has the details.",
  },
  {
    q: "Do I need a Meta login?",
    a: "No. Hookmatch reads the ad ID from the link. It never contacts Meta.",
  },
];

export default function App() {
  return (
    <div className={styles.root}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <header className={styles.header}>
        <div className={styles.wrap}>
          <a className={styles.brand} href="/">
            <span className={styles.mark} aria-hidden="true" />
            Hookmatch
          </a>
          <nav className={styles.nav} aria-label="Primary">
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <a className={styles.navLogin} href="#install">
              Log in
            </a>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className={styles.hero}>
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>For Shopify stores that run Meta ads</p>
              <h1 className={styles.h1}>Your store page, matched to the ad they clicked</h1>
              <p className={styles.lead}>
                Shoppers click an ad about one idea, then land on a generic page. Hookmatch
                changes the headline, image, badge or offer to fit that ad, and shows you
                revenue for every ad.
              </p>
              <div className={styles.actions}>
                <a className={styles.primary} href="#install">
                  Install on Shopify
                </a>
                <a className={styles.secondary} href="#how">
                  See how it works
                </a>
              </div>
              <p className={styles.fine}>Free plan. Pro has a 14-day trial.</p>
            </div>
            <div className={styles.heroVisual}>
              <Compare />
            </div>
          </div>
        </section>

        <section className={styles.section} id="how">
          <div className={styles.wrap}>
            <h2 className={styles.h2}>How it works</h2>
            <ol className={styles.steps}>
              {STEPS.map((s) => (
                <li key={s.n} className={styles.step}>
                  <span className={styles.stepN}>{s.n}</span>
                  <h3 className={styles.h3}>{s.title}</h3>
                  <p className={styles.body}>{s.body}</p>
                </li>
              ))}
            </ol>
            <div className={styles.codeWrap}>
              <p className={styles.codeLabel}>
                The string from step 1. It goes in the ad&apos;s URL parameters field.
              </p>
              <pre className={styles.code} tabIndex={0}>
                <code>{PARAMS}</code>
              </pre>
            </div>
          </div>
        </section>

        <section className={styles.section} id="features">
          <div className={styles.wrap}>
            <h2 className={styles.h2}>What you get</h2>
            <ul className={styles.features}>
              {FEATURES.map((f) => (
                <li key={f.title} className={styles.feature}>
                  <h3 className={styles.h3}>{f.title}</h3>
                  <p className={styles.body}>{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={styles.section} id="pricing">
          <div className={styles.wrap}>
            <h2 className={styles.h2}>Pricing</h2>
            <p className={styles.sectionLead}>Billed through Shopify. Cancel any time.</p>
            <div className={styles.plans}>
              <div className={styles.plan}>
                <h3 className={styles.planName}>Free</h3>
                <p className={styles.price}>
                  $0<span> forever</span>
                </p>
                <ul className={styles.planList}>
                  <li>1 active angle</li>
                  <li>Full reporting by angle and ad</li>
                  <li>Ad ID matching and ad discovery</li>
                </ul>
                <a className={styles.secondary} href="#install">
                  Start free
                </a>
              </div>
              <div className={`${styles.plan} ${styles.planPro}`}>
                <h3 className={styles.planName}>Pro</h3>
                <p className={styles.price}>
                  $39<span> a month, 14-day trial</span>
                </p>
                <ul className={styles.planList}>
                  <li>Unlimited angles</li>
                  <li>Holdout testing to prove the lift</li>
                  <li>Everything in Free</li>
                </ul>
                <a className={styles.primary} href="#install">
                  Try Pro free for 14 days
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section} id="faq">
          <div className={styles.wrap}>
            <h2 className={styles.h2}>Questions</h2>
            <div className={styles.faq}>
              {FAQ.map((f) => (
                <details key={f.q} className={styles.qa}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.install}`} id="install">
          <div className={`${styles.wrap} ${styles.installGrid}`}>
            <div>
              <h2 className={styles.h2}>Install or log in</h2>
              <p className={styles.sectionLead}>
                Enter your store&apos;s myshopify.com domain. Shopify asks you to approve,
                and that is the only sign-in there is. Until the App Store listing is
                live, installs work on Shopify development stores.
              </p>
            </div>
            <Form className={styles.form} method="post" action="/auth/login">
              <label className={styles.label} htmlFor="shop">
                Shop domain
              </label>
              <input
                id="shop"
                className={styles.input}
                type="text"
                name="shop"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="my-shop-domain.myshopify.com"
                aria-describedby="shop-hint"
                required
              />
              <p className={styles.hint} id="shop-hint">
                Example: my-shop-domain.myshopify.com
              </p>
              <button className={styles.primary} type="submit">
                Log in or install
              </button>
            </Form>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footRow}`}>
          <span>Hookmatch, by Outerscope</span>
          <nav className={styles.footNav} aria-label="Footer">
            <a href="/support">Support</a>
            <a href="/privacy">Privacy policy</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
