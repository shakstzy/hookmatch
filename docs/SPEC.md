# Hookmatch SPEC

Public Shopify app. A shopper who clicks a Meta (Facebook/Instagram) ad lands on a store whose headline, hero media, badge and offer match that ad's angle (ICP), or gets routed to the page built for that angle. The merchant sees revenue per angle and per ad, with a holdout that proves the lift.

## Why (research, Nov 2026)
- Sellers' top Meta complaint: "clicks but no sales" because the page opens generic while the ad sold one idea. Fix they describe is message match, one page per persona.
- Existing apps key off UTM campaign only, none use Meta ad IDs, none show revenue per ad, capable ones cost $199+/mo with few reviews, cheap ones swap a banner only. Reviewers hate code left in the theme and "no-code" that needs code.
- Closest rival: AdSwitch (launched Sep 2026, $19-149/mo, product-page headline/hero swap from campaign links you build by hand). We win on ad-ID auto-discovery, routing, holdout lift and per-ad revenue.
- So: ad-ID matching with zero Meta login, theme-native blocks that vanish on uninstall, per-ad revenue, built-in holdout, $0 / $39.

## Visitor flow
1. Merchant pastes one URL-parameters string into Ads Manager (ad level "URL parameters"), copied from the app:
   `utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&hm_ad={{ad.id}}&hm_set={{adset.id}}&hm_cmp={{campaign.id}}`
   Any other channel can use `?hm_angle=<angle-slug>`.
2. App embed (head) on every page: reads config JSON rendered inline from the app-owned shop metafield (no network call), matches, stores `{angle, arm, ad, ts}` in localStorage for 24h so later pages stay matched.
3. Match order, first hit wins: `hm_angle` slug > ad id > adset id > campaign id > case-insensitive "name contains" over ad, adset and campaign names > no match (store unchanged).
4. Arm: `holdout`% of matched visitors get `control` (store unchanged, still counted); the rest `matched`. Assigned once per visitor per angle.
5. Matched arm:
   - Route: if the angle has `route` and this is the landing hit, `location.replace(route + original query)` once.
   - Swap, Auto mode (the app embed's default): hm.js changes the theme's own hero. Headline = the first visible `h1` in `main` (else the first `h2` of the first section); subheadline = the first `p` after it in the same section, not inside a button or form; media = the largest `img`/`video` in that section (else the first in the first section). Text is set as plain text. An `img` keeps its element, classes and box (new `src`, `srcset`/`sizes` and `<picture>` sources dropped); a video swapped for an image (or the reverse) is replaced by an element with the same class and rendered size. Header, footer, nav and cart drawers are never touched. Auto runs on the landing hit and on the home page only, so a matched visitor's collection, cart and article titles keep their own text.
   - Swap, blocks: app blocks render the merchant's default content inside `data-hm-slot="headline|subheadline|media|badge"`. A slot that has a block always wins over Auto for that slot, so blocks add the badge and extra places. Empty blocks (no default, no match) take no space.
   - Overrides: the app embed's `mode` is Auto or "Only Hookmatch blocks" (theme untouched), and optional `headline_selector`, `subheadline_selector`, `media_selector` (CSS, for themes the heuristics miss) replace the heuristic for that slot and swap every match outside header/footer/nav.
   - Anti-flicker: an inline head snippet hides the slots, and in Auto mode the hero targets (the selectors, or `main h1`, the headline section's `p`, the first section's images/videos), only while a match is pending, max 1200 ms. The page stays hidden until the new image has decoded or the timeout hits.
   - Offer: if the angle has `discountCode`, `fetch('/discount/<code>')` once so it applies at checkout.
6. Both arms: set hidden cart attributes `_hm_angle`, `_hm_arm`, `_hm_ad` via `/cart/update.js` (once, only when changed); `sendBeacon` to the app proxy `/apps/hm/hit` on the landing hit with angle, arm, ad/adset/campaign ids and names.

## Config (app-owned shop metafields, namespace `$app:hm`, type json)
Two keys, both written together in one `metafieldsSet` on every save:
- `admin`: the full config, read only by the app UI. Never printed on the storefront.
- `config`: the public projection hm.js reads (printed in page source): `v`, `holdout`, and only active angles with `id, slug, active, match, content, route, discountCode`. No names, ICP notes, inactive angles or `rev`.
```json
{"v":1,"rev":7,"holdout":10,"angles":[{"id":"a_x1","slug":"preppers","name":"Outage preppers","icp":"free text",
  "active":true,
  "match":{"adIds":[],"adsetIds":[],"campaignIds":[],"nameContains":["outage","prep"]},
  "content":{"headline":"","subheadline":"","media":"","mediaType":"image|video","badge":""},
  "route":null,"discountCode":null}]}
```
- Absent `admin` reads the legacy `config` (a full config from before the split) as the admin config; the next save writes both keys.
- Present but unreadable (bad JSON or fails validation) never falls back to the default: pages show an error banner and saves are refused, so a save can't wipe angles.
- Saves run as read-modify-write under a per-shop Postgres advisory transaction lock. `rev` increments on each save; the angle editor sends the rev it loaded and a mismatch is rejected ("This angle changed in another tab. Reload."). Ads-page assignments skip the rev check.
- Plan limits only reject changes that make things worse on Free (more active angles than the limit and than before, or holdout raised above 0). Deactivating, deleting and lowering are always allowed. The `app_subscriptions/update` webhook trims a shop that is no longer Pro to its first active angle and holdout 0.
- Kept under 64 KB. A discount code is visible in page source.

## Theme app extension
- App embed `hm-core` (target head): inline anti-flicker snippet + config JSON + deferred `hm.js` (under 3.2 KB gzipped); settings: `mode` (Auto default, or Only Hookmatch blocks) and the three selector overrides. Lighthouse drop must stay well under 10 points.
- App blocks: Matched headline, Matched subheadline, Matched media, Matched badge. Each has merchant default content in block settings and renders it server-side, so the store is normal with the app off. Removing the app removes the blocks; nothing is left in theme code.

## Admin (embedded, App Bridge + Polaris web components, Shopify React Router template)
- Home: setup checklist (enable embed via deep link, add blocks via deep link, copy URL parameters, first visit seen), key numbers.
- Angles: list, create, edit (name, ICP note, match rules, content with media from Shopify Files, route, discount code, active). Save writes the metafield.
- Ads: ads discovered from hits (id, names, sessions, assigned angle, unmatched flagged), one-click assign to an angle (adds the id to its rules).
- Report (date range): per angle and per ad, sessions, orders, revenue, conversion, revenue per visit, matched vs control with lift.
- Settings: holdout %, plan.

## Server
- Shopify React Router app template, Prisma on Supabase Postgres, hosted on any Node host (Vercel works).
- Tables: Session (template), Hit (shop, day, angleId, arm, adId, adName, adsetId, adsetName, campaignId, campaignName, count), Ad (shop, adId, names, firstSeen, lastSeen), Attribution (shop, orderId, angleId, arm, adId, total, currency, createdAt).
- App proxy `/apps/hm/hit`: verify proxy signature, upsert daily counts, upsert Ad. No customer data.
- Webhooks: `orders/create` reads note_attributes into Attribution; `app/uninstalled`; compliance `customers/data_request` (200, nothing held), `customers/redact` (delete by orders_to_redact), `shop/redact` (delete all shop rows). HMAC verified.
- Scopes: `read_orders`, `write_discounts` not needed (merchant creates codes), `read_files` for media picker, plus metafield writes on app-owned data (no scope). Protected customer data: level 1 for orders webhook, declare minimal use.

## Billing (Shopify managed pricing)
- Free: 1 active angle, all reporting.
- Pro $39/mo, 14-day trial: unlimited angles, holdout.
- Enforced in admin save; storefront reads only what was saved.

## Out of scope v1
Meta login or Ads API, AI-written angles, advertorial page builder (route to Replo/GemPages/any page instead), price tests, non-Meta auto params.

## AGNI side (dogfood)
- meta-ads skill: every creative created gets the URL parameters string above via `--url-tags`.
- dropshipping workspace: each approved creative angle becomes an angle in the app on that run's store.

## Done means
Installed on an AGNI dev store from the deployed app: visiting with a test ad id swaps headline and media with no visible flicker, route and discount work, control arm untouched, hit and order show in Report, compliance webhooks pass `shopify app` checks, Lighthouse delta measured. Listing draft and screencast ready; stop before paying the $19 registration.
