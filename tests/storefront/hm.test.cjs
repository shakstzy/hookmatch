// Real-browser tests (Playwright + cached headless Chromium) for the Hookmatch storefront runtime.
// The page is the real inline snippet from blocks/hm-core.liquid + the real assets/hm.js; Liquid
// output of the config is emulated the same way the block does it (json, then the block's own '<' escape).
// Run: npm run test:storefront
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');

const EXT = path.join(__dirname, '../../extensions/hookmatch-theme');
const HMJS = fs.readFileSync(path.join(EXT, 'assets/hm.js'), 'utf8');
const CORE = fs.readFileSync(path.join(EXT, 'blocks/hm-core.liquid'), 'utf8');
// The escape the block really applies to the config: `| replace: '<', '<'` in the Liquid source.
const LT_ESCAPE = CORE.match(/\|\s*replace:\s*'<',\s*'([^']*)'\s*\}\}/)[1];
const INLINE = CORE.match(/<script>(.*?)<\/script>/s)[1];
// The embed's Liquid for the head snippet: the three selector assigns, the <style> and the #hm-auto tag, rendered
// with a minimal Liquid evaluator (assign, if/unless ==, output, the few filters the block uses) so the tests
// run the real file text for any `block.settings`.
const LQ_SETUP = CORE.match(/(?:\{%- assign hm_[hsm] = [^\n]*\n){3}/)[0];
const LQ_STYLE = CORE.match(/<style>.*?<\/style>/s)[0];
const LQ_AUTO = CORE.match(/\{%- unless block\.settings\.mode == 'blocks' %\}\s*<script type="application\/json" id="hm-auto">.*?<\/script>\s*\{%- endunless %\}/s)[0];
function liquid(src, settings) {
  const toks = src.split(/(\{%-?[\s\S]*?-?%\}|\{\{-?[\s\S]*?-?\}\})/).filter((t) => t !== '');
  toks.forEach((t, i) => { // whitespace control
    if (/^\{[{%]-/.test(t) && i) toks[i - 1] = toks[i - 1].replace(/\s+$/, '');
    if (/-[}%]\}$/.test(t) && toks[i + 1] !== undefined) toks[i + 1] = toks[i + 1].replace(/^\s+/, '');
  });
  const vars = { block: { settings } };
  const get = (e) => (e.startsWith("'") ? e.slice(1, -1) : e.split('.').reduce((o, k) => (o == null ? o : o[k]), vars));
  const evalExpr = (e) => {
    const [head, ...fs] = e.split('|');
    return fs.reduce((v, f) => {
      const name = f.trim().match(/^\w+/)[0], a = [...f.matchAll(/'([^']*)'/g)].map((m) => m[1]);
      if (name === 'remove') return String(v ?? '').split(a[0]).join('');
      if (name === 'strip') return String(v ?? '').trim();
      if (name === 'default') return v == null || v === false || v === '' ? a[0] : v;
      if (name === 'json') return JSON.stringify(v ?? null);
      if (name === 'replace') return String(v).split(a[0]).join(a[1]);
      throw new Error('liquid filter ' + name);
    }, get(head.trim()));
  };
  let p = 0;
  function walk(stops) {
    let out = '';
    while (p < toks.length) {
      const t = toks[p], tag = t.match(/^\{%-?\s*(\w+)\s*([\s\S]*?)\s*-?%\}$/), o = t.match(/^\{\{-?\s*([\s\S]*?)\s*-?\}\}$/);
      if (tag && stops.includes(tag[1])) return out;
      p++;
      if (o) out += evalExpr(o[1]);
      else if (!tag) out += t;
      else if (tag[1] === 'assign') { const [l, r] = tag[2].split(/\s=\s(.*)/s); vars[l.trim()] = evalExpr(r); }
      else if (tag[1] === 'if' || tag[1] === 'unless') {
        const [l, r] = tag[2].split(/\s==\s/), body = walk(['endif', 'endunless']); p++;
        if ((get(l.trim()) === get(r.trim())) === (tag[1] === 'if')) out += body;
      } else throw new Error('liquid tag ' + tag[1]);
    }
    return out;
  }
  return walk([]);
}
const renderStyle = (settings = {}) => liquid(LQ_SETUP + LQ_STYLE, settings);
const renderAuto = (settings = {}) => liquid(LQ_SETUP + LQ_AUTO, settings);
const STYLE = renderStyle();
const ORIGIN = 'https://shop.test';

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(os.homedir(), '.cache/ms-playwright');
  for (const d of fs.readdirSync(base).filter((x) => x.startsWith('chromium_headless_shell')).sort().reverse()) {
    const dir = path.join(base, d);
    for (const sub of fs.readdirSync(dir)) {
      const f = path.join(dir, sub, 'chrome-headless-shell');
      if (fs.existsSync(f)) return f;
      const g = path.join(dir, sub, 'headless_shell');
      if (fs.existsSync(g)) return g;
    }
  }
  return undefined; // let Playwright find its own
}

function mkcfg({ holdout = 0, route = null } = {}) {
  return {
    v: 1, holdout,
    angles: [
      { id: 'a_1', slug: 'preppers', name: 'Preppers', active: true,
        match: { adIds: ['111'], adsetIds: ['222'], campaignIds: ['333'], nameContains: ['outage'] },
        content: { headline: 'Never lose power again', subheadline: 'Backup power for outages', media: '/img/prep.png', mediaType: 'image', badge: 'Prepper pick' },
        route: null, discountCode: 'PREP10' },
      { id: 'a_2', slug: 'gifts', name: 'Gifts', active: true,
        match: { adIds: ['999'], adsetIds: [], campaignIds: ['444'], nameContains: ['gift'] },
        content: { headline: 'The gift they will keep', subheadline: '', media: '/vid/gift.mp4', mediaType: 'video', badge: '' },
        route, discountCode: null },
      { id: 'a_3', slug: 'dead', name: 'Inactive', active: false, match: { adIds: ['555'] }, content: { headline: 'NOPE' }, route: null, discountCode: null },
    ],
  };
}

const BODY = `<h2 data-hm-slot="headline">Default headline</h2>
<p data-hm-slot="subheadline">Default sub</p>
<span data-hm-slot="badge" hidden></span>
<img data-hm-slot="media" src="/img/default.png" width="1600" height="900" alt="d" style="aspect-ratio:1600/900" class="hm-el">`;

function page(site) {
  let cfgTag = '';
  if (site.raw !== undefined) cfgTag = `<script type="application/json" id="hm-config">${site.raw}</script>`;
  else if (site.cfg) cfgTag = `<script type="application/json" id="hm-config">${JSON.stringify(site.cfg).replaceAll('<', LT_ESCAPE)}</script>`;
  const st = site.settings || {};
  return `<!doctype html><html><head><meta charset="utf-8"><title>t</title>${site.css ? '<link rel="stylesheet" href="/hm.css">' : ''}${site.head || ''}${renderStyle(st)}<script>${INLINE}</script>${cfgTag}${renderAuto(st)}<script src="/hm.js" defer></script></head><body>${site.body || BODY}</body></html>`;
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: findChrome() }); });
test.after(async () => { await browser.close(); });

// One browser context = one visitor. `site` is mutable so a test can change the config between loads.
async function visitor(site, { initScript, hmJs = 'ok', slowDiscount = 0, hmDelay = 0 } = {}) {
  const ctx = await browser.newContext({ baseURL: ORIGIN });
  const log = { cart: [], hits: [], discounts: [], navs: 0, errors: [], t: {} };
  await ctx.addInitScript(() => {
    window.__sawPending = false;
    new MutationObserver(() => { if (document.documentElement.classList.contains('hm-pending')) window.__sawPending = true; })
      .observe(document, { attributes: true, subtree: true, childList: true });
  });
  if (initScript) await ctx.addInitScript(initScript);
  await ctx.route(`${ORIGIN}/**`, async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (u.pathname === '/hm.js') {
      if (hmDelay) await new Promise((r) => setTimeout(r, hmDelay));
      return hmJs === 'abort' ? route.abort() : route.fulfill({ contentType: 'text/javascript', body: HMJS });
    }
    if (u.pathname === '/hm.css') return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(EXT, 'assets/hm.css'), 'utf8') });
    if (u.pathname === '/cart/update.js') { log.t.cartStart = Date.now(); log.cart.push(JSON.parse(req.postData())); return route.fulfill({ contentType: 'application/json', body: '{}' }); }
    if (u.pathname === '/apps/hm/hit') { log.hits.push(JSON.parse(req.postData())); return route.fulfill({ status: 204, body: '' }); }
    if (u.pathname.startsWith('/discount/')) { log.discounts.push(u.pathname); if (slowDiscount) await new Promise((r) => setTimeout(r, slowDiscount)); log.t.discountDone = Date.now(); return route.fulfill({ status: 302, headers: { location: '/' }, body: '' }); }
    if (u.pathname.startsWith('/img/')) return route.fulfill({ contentType: 'image/png', body: PNG });
    if (u.pathname.startsWith('/vid/')) return route.fulfill({ contentType: 'video/mp4', body: '' });
    return route.fulfill({ contentType: 'text/html', body: page(site) });
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => log.errors.push(String(e)));
  pg.on('framenavigated', (f) => { if (f === pg.mainFrame()) log.navs++; });
  async function go(url, { settle = 150 } = {}) {
    await pg.goto(url, { waitUntil: 'load' });
    await pg.waitForLoadState('networkidle');
    await pg.waitForTimeout(settle);
    return snap();
  }
  const snap = () => pg.evaluate(() => {
    const q = (s) => document.querySelector(`[data-hm-slot="${s}"]`);
    const media = q('media') || document.body;
    return {
      url: location.pathname + location.search,
      pending: document.documentElement.classList.contains('hm-pending'),
      sawPending: window.__sawPending,
      headline: q('headline')?.textContent,
      sub: q('subheadline')?.textContent,
      badge: q('badge')?.textContent, badgeHidden: q('badge')?.hidden,
      mediaTag: media.tagName, mediaSrc: media.getAttribute('src'), mediaW: media.getAttribute('width'), mediaH: media.getAttribute('height'),
      mediaStyle: media.style.aspectRatio, mediaClass: media.className, mediaAlt: media.getAttribute('alt'),
      video: media.tagName === 'VIDEO' ? { autoplay: media.autoplay, muted: media.muted, loop: media.loop, playsInline: media.playsInline } : null,
      ls: Object.fromEntries(Object.entries(localStorage)),
    };
  });
  return { ctx, pg, log, go, snap, close: () => ctx.close() };
}

async function once(site, search, opts) {
  const v = await visitor(site, opts);
  try { const s = await v.go('/' + search); return { s, log: v.log }; } finally { await v.close(); }
}
const DEFAULT = { headline: 'Default headline', sub: 'Default sub', badgeHidden: true, mediaTag: 'IMG', mediaSrc: '/img/default.png' };
const isDefault = (s) => Object.entries(DEFAULT).every(([k, v]) => s[k] === v);
const A1 = { headline: 'Never lose power again', sub: 'Backup power for outages' };
const A2 = { headline: 'The gift they will keep', sub: 'Default sub' };

test('match: hm_angle slug (case-insensitive), swaps text, badge and image keeping size', async () => {
  const { s, log } = await once({ cfg: mkcfg() }, '?hm_angle=PREPPERS');
  assert.equal(s.headline, A1.headline); assert.equal(s.sub, A1.sub);
  assert.equal(s.badge, 'Prepper pick'); assert.equal(s.badgeHidden, false);
  assert.equal(s.mediaTag, 'IMG'); assert.equal(s.mediaSrc, '/img/prep.png');
  assert.equal(s.mediaW, '1600'); assert.equal(s.mediaH, '900'); assert.equal(s.mediaStyle, '1600 / 900');
  assert.equal(s.mediaClass, 'hm-el'); assert.equal(s.mediaAlt, 'd');
  assert.deepEqual(log.errors, []);
  assert.deepEqual(log.hits, [{ angle: 'a_1', arm: 'matched', ad: '', adName: '', set: '', setName: '', cmp: '', cmpName: '' }]);
});

test('match: video media is a muted autoplay looping inline video of the same size; empty field keeps default', async () => {
  const { s } = await once({ cfg: mkcfg() }, '?hm_angle=gifts');
  assert.equal(s.headline, A2.headline); assert.equal(s.sub, 'Default sub'); assert.equal(s.badgeHidden, true);
  assert.equal(s.mediaTag, 'VIDEO'); assert.equal(s.mediaSrc, '/vid/gift.mp4');
  assert.equal(s.mediaW, '1600'); assert.equal(s.mediaH, '900'); assert.equal(s.mediaStyle, '1600 / 900');
  assert.deepEqual(s.video, { autoplay: true, muted: true, loop: true, playsInline: true });
});

test('empty block slots: hidden for other visitors, filled and shown for a matched visitor (media swaps on an empty placeholder)', async () => {
  const body = `<h2 data-hm-slot="headline" hidden></h2>
<p data-hm-slot="subheadline" hidden></p>
<span data-hm-slot="badge" hidden></span>
<img data-hm-slot="media" hidden width="1600" height="900" alt="Promotional image" style="aspect-ratio:1600/900">`;
  const read = (pg) => pg.evaluate(() => {
    const q = (s) => document.querySelector(`[data-hm-slot="${s}"]`), m = q('media');
    return { h: [q('headline').hidden, q('headline').textContent], sub: [q('subheadline').hidden, q('subheadline').textContent],
      badge: [q('badge').hidden, q('badge').textContent], tag: m.tagName, src: m.getAttribute('src'), hidden: m.hidden,
      w: m.getAttribute('width'), h2: m.getAttribute('height'), ratio: m.style.aspectRatio, display: getComputedStyle(m).display };
  });
  let v = await visitor({ cfg: mkcfg(), body });
  try {
    await v.go('/');
    const s = await read(v.pg);
    assert.deepEqual([s.h[0], s.sub[0], s.badge[0], s.hidden, s.display], [true, true, true, true, 'none']);
  } finally { await v.close(); }
  v = await visitor({ cfg: mkcfg(), body });
  try {
    await v.go('/?hm_ad=111');
    const s = await read(v.pg);
    assert.deepEqual(s.h, [false, 'Never lose power again']); assert.deepEqual(s.sub, [false, 'Backup power for outages']);
    assert.deepEqual(s.badge, [false, 'Prepper pick']);
    assert.equal(s.tag, 'IMG'); assert.equal(s.src, '/img/prep.png'); assert.equal(s.hidden, false); assert.notEqual(s.display, 'none');
    assert.equal(s.w, '1600'); assert.equal(s.h2, '900'); assert.equal(s.ratio, '1600 / 900');
    assert.deepEqual(v.log.errors, []);
  } finally { await v.close(); }
});

const ORDER = [
  ['ad id', '?hm_ad=111', 'a_1'],
  ['ad id beats adset id', '?hm_ad=999&hm_set=222', 'a_2'],
  ['slug beats ad id', '?hm_angle=gifts&hm_ad=111', 'a_2'],
  ['unknown slug falls through to ad id', '?hm_angle=nope&hm_ad=111', 'a_1'],
  ['inactive slug falls through to ad id', '?hm_angle=dead&hm_ad=111', 'a_1'],
  ['adset id', '?hm_set=222', 'a_1'],
  ['adset id beats campaign id', '?hm_set=222&hm_cmp=444', 'a_1'],
  ['campaign id', '?hm_cmp=444', 'a_2'],
  ['campaign id beats name', '?hm_cmp=333&utm_content=gift', 'a_1'],
  ['name contains, case-insensitive (ad name)', '?utm_source=facebook&utm_content=Holiday%20GIFT%20Guide', 'a_2'],
  ['name contains (adset name)', '?utm_source=facebook&utm_term=Big+Outage+Set', 'a_1'],
  ['name contains (campaign name)', '?utm_source=facebook&utm_campaign=OUTAGE-prep', 'a_1'],
  ['ad name is checked before adset and campaign name', '?utm_source=fb&utm_content=gift&utm_term=outage&utm_campaign=outage', 'a_2'],
  ['utm_source ig alone with name', '?utm_source=ig&utm_content=gift', 'a_2'],
];
for (const [name, search, want] of ORDER) {
  test(`match order: ${name}`, async () => {
    const { s, log } = await once({ cfg: mkcfg() }, search);
    assert.equal(s.headline, want === 'a_1' ? A1.headline : A2.headline);
    assert.equal(log.hits.length, 1);
    assert.equal(log.hits[0].angle, want);
    assert.equal(log.hits[0].arm, 'matched');
    assert.deepEqual(log.errors, []);
  });
}

test('match: none leaves the store unchanged, still reports an unmatched ad id', async () => {
  const { s, log } = await once({ cfg: mkcfg() }, '?utm_source=facebook&hm_ad=777&hm_set=888&hm_cmp=999000&utm_content=Boring&utm_term=T&utm_campaign=C');
  assert.ok(isDefault(s));
  assert.deepEqual(log.hits, [{ angle: null, arm: 'none', ad: '777', adName: 'Boring', set: '888', setName: 'T', cmp: '999000', cmpName: 'C' }]);
  assert.deepEqual(log.cart, [{ attributes: { _hm_angle: '', _hm_arm: 'none', _hm_ad: '777' } }]); assert.deepEqual(log.discounts, []);
  assert.equal(s.pending, false); assert.equal(s.sawPending, true);
});

test('match: inactive angle id does not match (reported as unmatched)', async () => {
  const { s, log } = await once({ cfg: mkcfg() }, '?hm_ad=555');
  assert.ok(isDefault(s));
  assert.equal(log.hits[0].arm, 'none'); assert.equal(log.hits[0].angle, null);
});

test('match: no hm params and a non-meta utm_source does nothing, no pending, no beacon', async () => {
  for (const q of ['', '?utm_source=google&utm_content=gift', '?utm_source=facebookish']) {
    const { s, log } = await once({ cfg: mkcfg() }, q);
    assert.ok(isDefault(s), q); assert.equal(s.sawPending, false, q); assert.deepEqual(log.hits, []); assert.deepEqual(log.cart, []);
  }
});

test('match: meta utm_source alone with no ad reports no hit', async () => {
  const { s, log } = await once({ cfg: mkcfg() }, '?utm_source=instagram');
  assert.ok(isDefault(s)); assert.equal(s.sawPending, true); assert.equal(s.pending, false); assert.deepEqual(log.hits, []);
});

test('holdout 100: control arm sees the unchanged store but is still counted and tagged', async () => {
  const { s, log } = await once({ cfg: mkcfg({ holdout: 100 }) }, '?hm_ad=111');
  assert.ok(isDefault(s));
  assert.equal(log.hits[0].arm, 'control'); assert.equal(log.hits[0].angle, 'a_1');
  assert.deepEqual(log.discounts, []);
  assert.deepEqual(log.cart, [{ attributes: { _hm_angle: 'a_1', _hm_arm: 'control', _hm_ad: '111' } }]);
  assert.equal(JSON.parse(s.ls.hm).arm, 'control');
});

test('holdout 0: everyone matched', async () => {
  const { s, log } = await once({ cfg: mkcfg({ holdout: 0 }) }, '?hm_ad=111');
  assert.equal(s.headline, A1.headline); assert.equal(log.hits[0].arm, 'matched');
});

test('holdout 100 never routes', async () => {
  const v = await visitor({ cfg: mkcfg({ holdout: 100, route: '/pages/gifts' }) });
  const s = await v.go('/?hm_ad=999');
  assert.equal(s.url, '/?hm_ad=999'); assert.equal(v.log.navs, 1); await v.close();
});

test('arm is assigned once per visitor per angle: later config change does not flip it', async () => {
  const site = { cfg: mkcfg({ holdout: 100 }) };
  const v = await visitor(site);
  await v.go('/?hm_ad=111');
  site.cfg = mkcfg({ holdout: 0 });
  const s = await v.go('/?hm_set=222');
  assert.ok(isDefault(s)); assert.equal(v.log.hits[1].arm, 'control');
  // a different angle gets its own draw
  const s2 = await v.go('/?hm_ad=999');
  assert.equal(s2.headline, A2.headline);
  await v.close();
});

test('holdout is a probability: about half of visitors are control at 50', async () => {
  const site = { cfg: mkcfg({ holdout: 50 }) };
  let control = 0; const N = 24;
  const v = await visitor(site);
  await v.go('/blank', { settle: 0 });
  for (let i = 0; i < N; i++) {
    await v.pg.evaluate(() => localStorage.clear());
    const s = await v.go('/?hm_ad=111', { settle: 0 });
    if (JSON.parse(s.ls.hm_a).a_1 === 'control') control++;
  }
  assert.ok(control > 2 && control < N - 2, `control=${control}/${N}`);
  await v.close();
});

test('persistence: second page with no params stays matched (24h), no new beacon, discount and cart sent once', async () => {
  const v = await visitor({ cfg: mkcfg() });
  const s1 = await v.go('/?hm_ad=111&utm_content=x');
  assert.equal(s1.headline, A1.headline); assert.equal(s1.sawPending, true); assert.equal(s1.pending, false);
  const st = JSON.parse(s1.ls.hm);
  assert.deepEqual(Object.keys(st).filter((k) => k !== 'd').sort(), ['ad', 'angle', 'arm', 'ts']);
  assert.equal(st.angle, 'a_1'); assert.equal(st.arm, 'matched'); assert.equal(st.ad, '111');
  const s2 = await v.go('/products/shirt');
  assert.equal(s2.url, '/products/shirt');
  assert.equal(s2.headline, A1.headline); assert.equal(s2.mediaSrc, '/img/prep.png');
  assert.equal(s2.sawPending, true, 'pending is set from fresh stored state'); assert.equal(s2.pending, false);
  assert.equal(v.log.hits.length, 1, 'beacon only on the landing hit');
  assert.equal(v.log.discounts.length, 1, 'discount once per state');
  assert.equal(v.log.cart.length, 1, 'cart attributes only when changed');
  assert.deepEqual(v.log.errors, []);
  await v.close();
});

test('persistence: stored state older than 24h is ignored', async () => {
  const v = await visitor({ cfg: mkcfg() });
  await v.go('/?hm_ad=111');
  await v.pg.evaluate(() => { const s = JSON.parse(localStorage.hm); s.ts = Date.now() - 25 * 3600e3; localStorage.hm = JSON.stringify(s); });
  const s = await v.go('/products/shirt');
  assert.ok(isDefault(s)); assert.equal(s.sawPending, false);
  await v.close();
});

test('persistence: new params override stored state, including a new ad that matches nothing', async () => {
  const v = await visitor({ cfg: mkcfg() });
  await v.go('/?hm_ad=111');
  let s = await v.go('/?hm_ad=999');
  assert.equal(s.headline, A2.headline); assert.equal(JSON.parse(s.ls.hm).angle, 'a_2');
  s = await v.go('/?hm_ad=424242');
  assert.ok(isDefault(s)); assert.deepEqual(JSON.parse(s.ls.hm), { angle: '', arm: 'none', ad: '424242', ts: JSON.parse(s.ls.hm).ts });
  s = await v.go('/next');
  assert.ok(isDefault(s));
  s = await v.go('/?utm_source=facebook'); // landing with no ad id clears the stored state
  assert.equal(s.ls.hm, undefined);
  await v.close();
});

test('persistence: angle removed from config -> stored state is ignored', async () => {
  const site = { cfg: mkcfg() };
  const v = await visitor(site);
  await v.go('/?hm_ad=111');
  site.cfg.angles[0].active = false;
  const s = await v.go('/x');
  assert.ok(isDefault(s));
  await v.close();
});

test('route: landing hit goes to the route with the full original query once, then no loop', async () => {
  const q = '?utm_source=facebook&utm_content=Gift%20Box+A&hm_ad=999&hm_set=5&hm_cmp=6&x=%E2%9C%93#frag';
  const v = await visitor({ cfg: mkcfg({ route: '/pages/gifts/' }) });
  await v.pg.goto('/' + q, { waitUntil: 'load' });
  await v.pg.waitForURL((u) => u.pathname === '/pages/gifts/');
  await v.pg.waitForLoadState('networkidle'); await v.pg.waitForTimeout(250);
  const s = await v.snap();
  assert.equal(s.url, '/pages/gifts/?utm_source=facebook&utm_content=Gift%20Box+A&hm_ad=999&hm_set=5&hm_cmp=6&x=%E2%9C%93');
  assert.equal(v.log.navs, 2, 'exactly one route hop');
  assert.equal(s.headline, A2.headline); assert.equal(s.pending, false);
  assert.equal(v.log.hits.length, 1, 'one beacon total (sent from the routed page)');
  assert.equal(v.log.hits[0].ad, '999'); assert.equal(v.log.hits[0].adName, 'Gift Box A');
  assert.equal(v.log.cart.length, 1);
  // landing again on the route path itself does not navigate
  await v.pg.waitForTimeout(100);
  await v.go('/pages/gifts/?hm_ad=999');
  assert.equal(v.log.navs, 3, 'goto only, no extra hop');
  assert.deepEqual(v.log.errors, []);
  await v.close();
});

test('route: not applied when no params (non-landing page), nor to unmatched visitors', async () => {
  const v = await visitor({ cfg: mkcfg({ route: '/pages/gifts' }) });
  await v.go('/?hm_ad=999&hm_angle=nope');
  const navs = v.log.navs;
  assert.equal(navs, 2);
  // second page, no params: stays where it is
  const s = await v.go('/collections/all');
  assert.equal(s.url, '/collections/all');
  const u = await v.go('/?hm_ad=123');
  assert.equal(u.url, '/?hm_ad=123');
  await v.close();
});

test('route: cross-origin route is ignored', async () => {
  const v = await visitor({ cfg: mkcfg({ route: 'https://evil.test/x' }) });
  const s = await v.go('/?hm_ad=999');
  assert.equal(s.url, '/?hm_ad=999'); assert.equal(s.headline, A2.headline);
  await v.close();
});

test('discount: fetched once per state with the code URL-encoded', async () => {
  const cfg = mkcfg(); cfg.angles[0].discountCode = 'SAVE 10%';
  const v = await visitor({ cfg });
  await v.go('/?hm_ad=111'); await v.go('/a'); await v.go('/b');
  assert.deepEqual(v.log.discounts, ['/discount/SAVE%2010%25']);
  await v.close();
});

test('discount and cart attributes run in turn: the cart update starts only after a slow discount request completes', async () => {
  const v = await visitor({ cfg: mkcfg() }, { slowDiscount: 600 });
  await v.pg.goto('/?hm_ad=111', { waitUntil: 'load' });
  await v.pg.waitForTimeout(1200);
  assert.equal(v.log.discounts.length, 1); assert.equal(v.log.cart.length, 1);
  assert.ok(v.log.t.cartStart >= v.log.t.discountDone, `cart ${v.log.t.cartStart} before discount ${v.log.t.discountDone}`);
  assert.deepEqual(v.log.errors, []);
  await v.close();
});

test('cart attributes: posted once with the right keys; again only when angle, arm or ad changes', async () => {
  const v = await visitor({ cfg: mkcfg() });
  await v.go('/?hm_ad=111&hm_set=1');
  await v.go('/a');
  assert.deepEqual(v.log.cart, [{ attributes: { _hm_angle: 'a_1', _hm_arm: 'matched', _hm_ad: '111' } }]);
  await v.go('/?hm_ad=111');           // same signature -> no resend
  assert.equal(v.log.cart.length, 1);
  await v.go('/?hm_set=222');          // same angle, ad now empty -> changed
  assert.equal(v.log.cart.length, 2);
  assert.deepEqual(v.log.cart[1], { attributes: { _hm_angle: 'a_1', _hm_arm: 'matched', _hm_ad: '' } });
  await v.go('/?hm_ad=999');           // different angle
  assert.equal(v.log.cart.length, 3); assert.equal(v.log.cart[2].attributes._hm_angle, 'a_2');
  await v.close();
});

test('unassigned ad: cart attributes carry the ad id with arm none, once, persisted 24h without swapping', async () => {
  const v = await visitor({ cfg: mkcfg() });
  const s1 = await v.go('/?hm_ad=424242');
  assert.ok(isDefault(s1));
  assert.deepEqual(v.log.cart, [{ attributes: { _hm_angle: '', _hm_arm: 'none', _hm_ad: '424242' } }]);
  assert.deepEqual(v.log.discounts, []);
  const s2 = await v.go('/products/shirt');
  assert.ok(isDefault(s2)); assert.equal(v.log.cart.length, 1, 'same state, no resend');
  assert.equal(v.log.hits.length, 1, 'beacon only on the landing hit');
  await v.pg.evaluate(() => { const s = JSON.parse(localStorage.hm); s.ts = Date.now() - 25 * 3600e3; localStorage.hm = JSON.stringify(s); localStorage.removeItem('hm_c'); });
  await v.go('/products/shirt');
  assert.equal(v.log.cart.length, 1, 'expired state sends nothing');
  assert.deepEqual(v.log.errors, []);
  await v.close();
});

test('cart token: a new cart re-sends the attributes, the same cart does not', async () => {
  const v = await visitor({ cfg: mkcfg() });
  const cookie = (value) => v.ctx.addCookies([{ name: 'cart', value, url: ORIGIN }]);
  await cookie('tok1%3Fkey%3Da');
  await v.go('/?hm_ad=111');
  assert.equal(v.log.cart.length, 1);
  await cookie('tok1%3Fkey%3Db'); // same cart, new key
  await v.go('/a');
  assert.equal(v.log.cart.length, 1, 'same token is not re-sent');
  await cookie('tok2%3Fkey%3Dc'); // checkout done, new cart
  await v.go('/b');
  assert.equal(v.log.cart.length, 2);
  assert.deepEqual(v.log.cart[1], v.log.cart[0]);
  await v.go('/c');
  assert.equal(v.log.cart.length, 2);
  await v.close();
});

test('cart token: a cart created by the discount fetch does not cause a second send', async () => {
  const v = await visitor({ cfg: mkcfg() });
  await v.ctx.route(`${ORIGIN}/discount/**`, (r) => r.fulfill({ status: 302, headers: { location: '/', 'set-cookie': 'cart=newtok; Path=/' }, body: '' }));
  await v.go('/?hm_ad=111'); await v.go('/a');
  assert.equal(v.log.cart.length, 1);
  await v.close();
});

test('consent: analytics refused skips the beacon but keeps the swap and cart attributes; granted or missing sends it', async () => {
  const deny = () => { window.Shopify = { customerPrivacy: { analyticsProcessingAllowed: () => false } }; };
  const allow = () => { window.Shopify = { customerPrivacy: { analyticsProcessingAllowed: () => true } }; };
  const odd = () => { window.Shopify = { customerPrivacy: {} }; };
  const d = await visitor({ cfg: mkcfg() }, { initScript: deny });
  const s = await d.go('/?hm_ad=111');
  assert.equal(s.headline, A1.headline); assert.deepEqual(d.log.hits, []); assert.equal(d.log.cart.length, 1); assert.equal(d.log.discounts.length, 1);
  assert.deepEqual(d.log.errors, []); await d.close();
  for (const initScript of [allow, odd]) {
    const v = await visitor({ cfg: mkcfg() }, { initScript });
    await v.go('/?hm_ad=111');
    assert.equal(v.log.hits.length, 1); await v.close();
  }
});

test('beacon payload: all ids and names, JSON body, once per landing (reload does not double count)', async () => {
  const v = await visitor({ cfg: mkcfg() });
  const url = '/?utm_source=facebook&utm_medium=paid&utm_campaign=Camp%20X&utm_term=Set%20Y&utm_content=Ad%20Z&hm_ad=111&hm_set=222&hm_cmp=333';
  await v.go(url);
  assert.deepEqual(v.log.hits, [{ angle: 'a_1', arm: 'matched', ad: '111', adName: 'Ad Z', set: '222', setName: 'Set Y', cmp: '333', cmpName: 'Camp X' }]);
  await v.pg.reload({ waitUntil: 'load' }); await v.pg.waitForLoadState('networkidle'); await v.pg.waitForTimeout(100);
  assert.equal(v.log.hits.length, 1, 'same landing in the same tab is not counted twice');
  await v.close();
});

test('anti-flicker: pending is set only for landing/fresh state, slots hidden while pending, removed after', async () => {
  const v = await visitor({ cfg: mkcfg() });
  const s = await v.go('/?hm_angle=preppers');
  assert.equal(s.sawPending, true); assert.equal(s.pending, false);
  const vis = await v.pg.evaluate(() => getComputedStyle(document.querySelector('[data-hm-slot=headline]')).visibility);
  assert.equal(vis, 'visible');
  assert.equal(await v.pg.evaluate(() => { document.documentElement.classList.add('hm-pending'); return getComputedStyle(document.querySelector('[data-hm-slot=headline]')).visibility; }), 'hidden');
  await v.close();
});

test('anti-flicker: if hm.js never loads the inline safety timeout still removes the class in 1.2 s', async () => {
  const v = await visitor({ cfg: mkcfg() }, { hmJs: 'abort' });
  await v.pg.goto('/?hm_ad=111', { waitUntil: 'load' });
  assert.equal(await v.pg.evaluate(() => document.documentElement.classList.contains('hm-pending')), true);
  await v.pg.waitForTimeout(1400);
  assert.equal(await v.pg.evaluate(() => document.documentElement.classList.contains('hm-pending')), false);
  assert.deepEqual(v.log.errors, []);
  await v.close();
});

test('graceful: malformed config -> nothing changes, no page error, pending removed', async () => {
  for (const raw of ['{not json', '', 'null', '{"v":1}', '{"angles":"x"}']) {
    const { s, log } = await once({ raw }, '?hm_ad=111&hm_angle=preppers');
    assert.ok(isDefault(s), raw); assert.equal(s.pending, false, raw); assert.deepEqual(log.errors, [], raw);
    assert.deepEqual(log.hits, [], raw); assert.deepEqual(log.cart, [], raw);
  }
});

test('graceful: config element absent -> nothing happens', async () => {
  const { s, log } = await once({}, '?hm_ad=111');
  assert.ok(isDefault(s)); assert.equal(s.pending, false); assert.deepEqual(log.errors, []); assert.deepEqual(log.hits, []);
});

test('graceful: storage throws everywhere -> still matches and swaps on the landing page, no page error', async () => {
  const blocked = () => {
    const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
    for (const k of ['getItem', 'setItem', 'removeItem', 'clear']) Storage.prototype[k] = boom;
  };
  const v = await visitor({ cfg: mkcfg() }, { initScript: blocked });
  const s = await v.pg.goto('/?hm_ad=111').then(async () => { await v.pg.waitForLoadState('networkidle'); await v.pg.waitForTimeout(150); return v.pg.evaluate(() => ({
    headline: document.querySelector('[data-hm-slot=headline]').textContent,
    pending: document.documentElement.classList.contains('hm-pending'), saw: window.__sawPending })); });
  assert.equal(s.headline, A1.headline); assert.equal(s.pending, false); assert.equal(s.saw, true);
  assert.equal(v.log.hits.length, 1); assert.equal(v.log.cart.length, 1); assert.equal(v.log.discounts.length, 1);
  assert.deepEqual(v.log.errors, []);
  // next page: nothing remembered, store is simply unchanged
  await v.pg.goto('/next'); await v.pg.waitForLoadState('networkidle');
  assert.equal(await v.pg.evaluate(() => document.querySelector('[data-hm-slot=headline]').textContent), 'Default headline');
  assert.deepEqual(v.log.errors, []);
  await v.close();
});

test('graceful: failing cart, beacon and discount requests never reach the page', async () => {
  const v = await visitor({ cfg: mkcfg() });
  await v.ctx.route(`${ORIGIN}/cart/update.js`, (r) => r.abort());
  await v.ctx.route(`${ORIGIN}/discount/**`, (r) => r.abort());
  await v.ctx.route(`${ORIGIN}/apps/hm/hit`, (r) => r.abort());
  const s = await v.go('/?hm_ad=111');
  assert.equal(s.headline, A1.headline); assert.equal(s.pending, false);
  assert.deepEqual(v.log.errors, []);
  await v.close();
});

test('theme editor: no swap, no routing, no pending when Shopify.designMode is set', async () => {
  const v = await visitor({ cfg: mkcfg({ route: '/pages/gifts' }) }, { initScript: () => { window.Shopify = { designMode: true }; } });
  const s = await v.go('/?hm_ad=999');
  assert.ok(isDefault(s)); assert.equal(s.url, '/?hm_ad=999'); assert.equal(s.pending, false); assert.deepEqual(v.log.hits, []);
  await v.close();
});

test('safety: config text with </script> and HTML is inert and set as plain text', async () => {
  const cfg = mkcfg(); cfg.angles[0].content.headline = '</script><img src=x onerror=window.__pwn=1> & <b>bold</b>';
  const { s } = await once({ cfg }, '?hm_ad=111');
  assert.equal(s.headline, cfg.angles[0].content.headline);
});

test('safety: the block escapes < as the JSON escape \\u003c, so </script> in config cannot break out of the tag', async () => {
  assert.equal(LT_ESCAPE, '\\u003c');
  const evil = '</script><img src=x onerror=window.__pwn=1>';
  const cfg = mkcfg(); cfg.angles[0].content.headline = evil;
  const raw = JSON.stringify(cfg).replaceAll('<', LT_ESCAPE);
  assert.ok(!raw.includes('</script>'));
  const v = await visitor({ cfg });
  try {
    const s = await v.go('/?hm_ad=111');
    assert.equal(s.headline, evil);
    const dom = await v.pg.evaluate(() => ({
      stray: document.querySelectorAll('img[src="x"]').length,
      scripts: document.querySelectorAll('script#hm-config').length,
      pwn: window.__pwn === undefined,
    }));
    assert.deepEqual(dom, { stray: 0, scripts: 1, pwn: true });
    assert.deepEqual(v.log.errors, []);
  } finally { await v.close(); }
});

// ---------------------------------------------------------------------------------------------
// Auto mode: the theme's own hero. Fixtures follow Dawn (image banner, srcset img) and Horizon
// (picture with sources, video hero) markup, with no Hookmatch blocks on the page.
// ---------------------------------------------------------------------------------------------
const THEME_HEAD = `<style>
body{margin:0;font:16px/1.4 sans-serif}.banner{position:relative}.banner__img{display:block;width:100%;height:auto;aspect-ratio:15/7;object-fit:cover}
.banner__content{position:absolute;left:0;right:0;bottom:0;padding:20px}
.hero{position:relative;height:420px;overflow:hidden}.hero__media,.hero__image,.hero__video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hero__content{position:relative;padding:20px}.logo{display:block}.card{display:block;width:300px;height:300px}</style>`;
const HEADER = `<header class="header-wrapper"><h1 class="header__heading"><a href="/"><img class="logo" src="/img/logo.png" width="90" height="30" alt="Shop"></a></h1><nav><a href="/c">Catalog</a><p>Nav note</p></nav></header>`;
const FOOTER = `<footer><p>Footer note</p><img src="/img/pay.png" width="38" height="24" alt=""><h2>Footer heading</h2></footer>`;
const GRID = `<div id="shopify-section-grid" class="shopify-section"><h2>Featured</h2><img class="card" src="/img/card.png" width="300" height="300" alt=""><p>Grid note</p></div>`;
const CONTENT = (h = 'h1') => `<div class="hero__content"><${h} class="h1">Theme headline</${h}><p class="rte">Theme sub</p><a class="button" href="/c"><span>Shop now</span></a></div>`;
const DAWN = `<div id="shopify-section-hero" class="shopify-section"><div class="banner"><div class="banner__media"><img id="hero-media" class="banner__img" src="/img/theme-hero.png" srcset="/img/theme-hero.png 750w, /img/theme-hero-2x.png 1500w" sizes="100vw" width="1500" height="700" alt="Theme hero"></div>
<div class="banner__content"><div class="banner__box"><h1 class="banner__heading">Theme headline</h1><div class="banner__text"><p>Theme sub</p></div><div class="banner__buttons"><a class="button" href="/c">Shop now</a></div></div></div></div></div>`;
const HORIZON_IMG = `<div id="shopify-section-hero" class="shopify-section section"><section class="hero"><picture class="hero__media"><source media="(min-width: 750px)" srcset="/img/h-d.png 1600w"><source srcset="/img/h-m.png 800w"><img id="hero-media" class="hero__image" src="/img/h-d.png" srcset="/img/h-m.png 800w, /img/h-d.png 1600w" sizes="100vw" width="1600" height="900" alt=""></picture>${CONTENT()}</section></div>`;
const HORIZON_VIDEO = `<div id="shopify-section-hero" class="shopify-section section"><section class="hero"><video id="hero-media" class="hero__video" autoplay muted loop playsinline poster="/img/poster.png"><source src="/vid/theme.mp4" type="video/mp4"></video>${CONTENT()}</section></div>`;
const themePage = (hero, extra = '') => `${HEADER}<main id="MainContent">${hero}${GRID}${extra}</main>${FOOTER}`;
const T = { headline: 'Theme headline', sub: 'Theme sub' };

const probe = (pg) => pg.evaluate(() => {
  const $ = (q) => document.querySelector(q), box = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(Math.round); };
  const m = $('#shopify-section-hero :is(img,video)');
  return {
    h1: $('main h1')?.textContent, h2: $('main h2')?.textContent, sub: $('#shopify-section-hero p')?.textContent, pending: document.documentElement.classList.contains('hm-pending'),
    media: m && { tag: m.tagName, id: m.id, cls: m.className, src: m.getAttribute('src'), srcset: m.getAttribute('srcset'), sizes: m.getAttribute('sizes'), poster: m.getAttribute('poster'),
      sources: m.parentElement.tagName === 'PICTURE' || m.tagName === 'VIDEO' ? (m.tagName === 'VIDEO' ? m : m.parentElement).querySelectorAll('source').length : 0,
      picture: !!m.closest('picture'), fit: getComputedStyle(m).objectFit, w: m.getAttribute('width'), h: m.getAttribute('height'),
      video: m.tagName === 'VIDEO' ? { autoplay: m.autoplay, muted: m.muted, loop: m.loop, playsInline: m.playsInline } : null, vis: getComputedStyle(m).visibility },
    boxes: { hero: box($('#shopify-section-hero')), grid: box($('#shopify-section-grid')), header: box($('header')), footer: box($('footer')), media: box(m), card: box($('.card')) },
    header: $('header')?.outerHTML, footer: $('footer')?.outerHTML, grid: $('#shopify-section-grid')?.outerHTML,
    imgs: [...document.images].map((i) => i.getAttribute('src')),
  };
});
async function theme(hero, search, { cfg = mkcfg(), settings, extra, body, ...opts } = {}) {
  const v = await visitor({ cfg, settings, body: body || themePage(hero, extra), head: THEME_HEAD }, opts);
  try {
    await v.go(search);
    return { p: await probe(v.pg), log: v.log };
  } finally { await v.close(); }
}
const baseline = (hero, o) => theme(hero, '/', o);
const A1T = { h1: A1.headline, sub: A1.sub };

for (const [name, hero] of [['Dawn image banner (img srcset)', DAWN], ['Horizon picture hero (sources + srcset)', HORIZON_IMG]]) {
  test(`auto: ${name} -> image: headline, subheadline and media swap in place, rest untouched`, async () => {
    const base = await baseline(hero), { p, log } = await theme(hero, '/?hm_angle=preppers');
    assert.equal(base.p.h1, T.headline); assert.equal(p.h1, A1T.h1); assert.equal(p.sub, A1T.sub);
    assert.equal(p.media.id, 'hero-media', 'same element, not a new one');
    assert.equal(p.media.src, '/img/prep.png'); assert.equal(p.media.srcset, null); assert.equal(p.media.sizes, null);
    assert.equal(p.media.sources, 0, 'picture <source> siblings removed'); assert.equal(p.media.cls, base.p.media.cls);
    assert.equal(p.media.picture, base.p.media.picture);
    assert.equal(p.header, base.p.header); assert.equal(p.footer, base.p.footer); assert.equal(p.grid, base.p.grid);
    assert.deepEqual(p.boxes, base.p.boxes, 'no layout shift anywhere: hero, grid, header, footer, media boxes all equal');
    assert.equal(p.pending, false); assert.deepEqual(log.errors, []);
    assert.equal(log.hits[0].angle, 'a_1');
  });
}

test('auto: video hero -> image: the video is replaced by an img with the same class and box, object-fit cover', async () => {
  const base = await baseline(HORIZON_VIDEO), { p, log } = await theme(HORIZON_VIDEO, '/?hm_angle=preppers');
  assert.equal(base.p.media.tag, 'VIDEO');
  assert.equal(p.media.tag, 'IMG'); assert.equal(p.media.src, '/img/prep.png'); assert.equal(p.media.cls, 'hero__video');
  assert.equal(p.media.fit, 'cover'); assert.deepEqual(p.boxes, base.p.boxes);
  assert.equal(p.h1, A1T.h1); assert.equal(p.header, base.p.header); assert.equal(p.footer, base.p.footer);
  assert.deepEqual(log.errors, []);
});

// Horizon's real hero: a poster <img> inside a button and a playing <video> stacked over it in a deferred-media element.
const HORIZON_DEFERRED = `<div id="shopify-section-hero" class="shopify-section section"><section class="hero"><deferred-media style="display:block;position:relative;height:420px"><button class="poster" style="display:block;width:100%;height:100%;padding:0;border:0"><img id="poster" class="hero__poster" src="/img/poster.png" width="1600" height="900" alt="" style="width:100%;height:100%;object-fit:cover"></button><video id="hero-media" autoplay muted loop playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"><source src="/vid/theme.mp4" type="video/mp4"></video></deferred-media>${CONTENT()}</section></div>`;
test('auto: poster img under a playing video (Horizon deferred-media) -> image: the video itself is replaced, so the new image is what shows', async () => {
  const base = await baseline(HORIZON_DEFERRED), v = await visitor({ cfg: mkcfg(), body: themePage(HORIZON_DEFERRED), head: THEME_HEAD }, {});
  try {
    await v.go('/?hm_angle=preppers');
    const r = await v.pg.evaluate(() => { const h = document.querySelector('#shopify-section-hero deferred-media').getBoundingClientRect(), e = document.elementFromPoint(h.x + h.width / 2, h.y + h.height / 2); return { top: e.tagName, src: e.getAttribute('src'), videos: document.querySelectorAll('#shopify-section-hero video').length, box: [h.width, h.height].map(Math.round) }; });
    assert.deepEqual(r, { top: 'IMG', src: '/img/prep.png', videos: 0, box: [base.p.boxes.hero[2], 420] });
    assert.equal(base.p.boxes.hero[3], (await theme(HORIZON_DEFERRED, '/?hm_angle=preppers')).p.boxes.hero[3], 'hero height unchanged');
  } finally { await v.close(); }
});

test('auto: video hero -> video: swapped in place, old sources and poster dropped', async () => {
  const { p } = await theme(HORIZON_VIDEO, '/?hm_angle=gifts');
  assert.equal(p.media.tag, 'VIDEO'); assert.equal(p.media.id, 'hero-media'); assert.equal(p.media.src, '/vid/gift.mp4');
  assert.equal(p.media.sources, 0); assert.equal(p.media.poster, null); assert.equal(p.h1, A2.headline);
  assert.equal(p.sub, T.sub, 'angle with no subheadline keeps the theme text');
});

for (const [name, hero] of [['Dawn img', DAWN], ['Horizon picture', HORIZON_IMG]]) {
  test(`auto: ${name} hero -> video: replaced by a muted autoplay looping inline video with the same class and box`, async () => {
    const base = await baseline(hero), { p, log } = await theme(hero, '/?hm_angle=gifts');
    assert.equal(p.media.tag, 'VIDEO'); assert.equal(p.media.src, '/vid/gift.mp4'); assert.equal(p.media.cls, base.p.media.cls);
    assert.deepEqual(p.media.video, { autoplay: true, muted: true, loop: true, playsInline: true });
    assert.equal(p.media.picture, false, 'the whole <picture> is replaced'); assert.equal(p.media.fit, 'cover');
    assert.deepEqual(p.boxes, base.p.boxes); assert.deepEqual(log.errors, []);
  });
}

test('auto: control arm, unmatched ad and plain visits leave the theme alone', async () => {
  const base = await baseline(DAWN);
  for (const [search, cfg] of [['/?hm_angle=preppers', mkcfg({ holdout: 100 })], ['/?hm_ad=424242', mkcfg()], ['/', mkcfg()]]) {
    const { p } = await theme(DAWN, search, { cfg });
    assert.deepEqual({ ...p, pending: 0 }, { ...base.p, pending: 0 }, search);
  }
});

test('auto: Only Hookmatch blocks mode leaves the theme alone, no #hm-auto tag, no hero hiding CSS, blocks still work', async () => {
  const settings = { mode: 'blocks' };
  assert.equal(renderAuto(settings), ''); assert.ok(!/main h1/.test(renderStyle(settings)));
  const base = await baseline(DAWN);
  const { p } = await theme(DAWN, '/?hm_angle=preppers', { settings });
  assert.deepEqual(p, base.p);
  // a block on the page is still swapped, the theme hero next to it is not
  const blk = `<div class="hm-block"><h2 data-hm-slot="headline" hidden></h2></div>`;
  const v = await visitor({ cfg: mkcfg(), settings, head: THEME_HEAD, body: themePage(DAWN, blk) });
  try {
    await v.go('/?hm_angle=preppers');
    const r = await v.pg.evaluate(() => [document.querySelector('[data-hm-slot=headline]').textContent, document.querySelector('main h1').textContent]);
    assert.deepEqual(r, [A1.headline, T.headline]);
  } finally { await v.close(); }
});

test('auto: mode defaults to Auto when the setting is missing', () => {
  assert.ok(renderAuto({}).includes('id="hm-auto"')); assert.ok(renderAuto({ mode: 'auto' }).includes('id="hm-auto"'));
  assert.ok(/main h1/.test(renderStyle({})));
});

test('auto: selector overrides replace the heuristic per slot; matches inside header/footer are ignored', async () => {
  const extra = `<div class="promo"><span class="promo__title">Promo title</span><span class="promo__text">Promo text</span><img class="promo__img" src="/img/promo.png" width="200" height="100" alt=""></div>`;
  const settings = { headline_selector: '.promo__title', subheadline_selector: '.promo__text', media_selector: '.promo__img, .logo, footer img' };
  const base = await baseline(DAWN, { extra });
  const v = await visitor({ cfg: mkcfg(), settings, head: THEME_HEAD, body: themePage(DAWN, extra) });
  try {
    await v.go('/?hm_angle=preppers');
    const r = await v.pg.evaluate(() => ({
      title: document.querySelector('.promo__title').textContent, text: document.querySelector('.promo__text').textContent,
      promo: document.querySelector('.promo__img').getAttribute('src'), h1: document.querySelector('main h1').textContent,
      hero: document.querySelector('#hero-media').getAttribute('src'), heroSrcset: document.querySelector('#hero-media').hasAttribute('srcset'),
      header: document.querySelector('header').outerHTML, footer: document.querySelector('footer').outerHTML, sub: document.querySelector('.banner__text p').textContent,
    }));
    assert.deepEqual([r.title, r.text, r.promo], [A1.headline, A1.sub, '/img/prep.png']);
    assert.equal(r.h1, T.headline, 'heuristic not used for a slot with an override'); assert.equal(r.sub, T.sub);
    assert.equal(r.hero, '/img/theme-hero.png'); assert.equal(r.heroSrcset, true);
    assert.equal(r.header, base.p.header); assert.equal(r.footer, base.p.footer);
    assert.deepEqual(v.log.errors, []);
  } finally { await v.close(); }
});

test('auto: a selector override applies to every match, and a broken selector does not stop the cart, discount or beacon', async () => {
  const { p } = await theme(HORIZON_IMG, '/?hm_angle=preppers', { settings: { media_selector: 'main img' } });
  assert.deepEqual(p.imgs.filter((x) => x === '/img/prep.png').length, 2, 'hero and the grid card are both swapped');
  const bad = await theme(HORIZON_IMG, '/?hm_angle=preppers', { settings: { headline_selector: '[[bad', media_selector: ':::' } });
  assert.deepEqual(bad.log.errors, []); assert.equal(bad.log.hits.length, 1); assert.equal(bad.log.cart.length, 1); assert.equal(bad.log.discounts.length, 1);
  assert.equal(bad.p.pending, false);
});

test('auto: selector text cannot break out of the style or script tags', () => {
  const evil = '</style><script>alert(1)</script>{}.x';
  const st = renderStyle({ headline_selector: evil }), au = renderAuto({ headline_selector: evil });
  assert.equal((st.match(/<\/style>/g) || []).length, 1); assert.ok(!/<script/.test(st));
  assert.equal((au.match(/<\/script>/g) || []).length, 1);
  assert.equal(JSON.parse(au.replace(/<\/?script[^>]*>/g, '')).headline, '/style>script>alert(1)/script>.x');
});

test('auto: headline falls back to the first h2 of the first section when main has no h1 (Dawn image banner)', async () => {
  const hero = DAWN.replace('<h1 class="banner__heading">Theme headline</h1>', '<h2 class="banner__heading">Theme headline</h2>');
  const { p } = await theme(hero, '/?hm_angle=preppers');
  assert.equal(p.h2, A1.headline); assert.equal(p.sub, A1.sub);
  assert.equal(p.grid.includes('<h2>Featured</h2>'), true, 'later sections untouched');
});

test('auto: subheadline skips a <p> inside a button or form and one before the headline', async () => {
  const hero = `<div id="shopify-section-hero" class="shopify-section"><p>Before</p><img id="hero-media" src="/img/theme-hero.png" width="800" height="400" alt=""><h1>Theme headline</h1><form><p>Email me</p></form><button><p>Click</p></button><div><p id="real">Real sub</p></div><p>Second</p></div>`;
  const v = await visitor({ cfg: mkcfg(), head: THEME_HEAD, body: themePage(hero) });
  try {
    await v.go('/?hm_angle=preppers');
    const r = await v.pg.evaluate(() => [...document.querySelectorAll('#shopify-section-hero p')].map((e) => e.textContent));
    assert.deepEqual(r, ['Before', 'Email me', 'Click', A1.sub, 'Second']);
  } finally { await v.close(); }
});

test('auto: media is the largest image in the headline section; falls back to the first image of the first section', async () => {
  const sec = (imgs) => `<div class="shopify-section" id="shopify-section-hero"><h1>Theme headline</h1>${imgs}</div>`;
  const small = '<img id="badge" src="/img/b.png" width="40" height="40" alt="">', big = '<img id="big" src="/img/big.png" width="800" height="400" alt="">';
  let r = await theme(sec(small + big), '/?hm_angle=preppers');
  assert.deepEqual(r.p.imgs.slice(1, 4), ['/img/b.png', '/img/prep.png', '/img/card.png'], 'the largest swaps, the small icon stays');
  // headline in a later section whose own images are all zero-size: use the first image of main's first section
  const first = `<div class="shopify-section" id="first"><img src="/img/first.png" width="600" height="300" alt=""></div>`;
  const later = `<div class="shopify-section" id="shopify-section-hero"><h1>Theme headline</h1><img src="/img/z.png" width="0" height="0" alt=""></div>`;
  r = await theme(null, '/?hm_angle=preppers', { body: `<main>${first}${later}</main>` });
  assert.deepEqual(r.p.imgs, ['/img/prep.png', '/img/z.png']);
});

test('auto: app block slots win per slot; Auto fills only the slots the blocks do not have', async () => {
  const blk = `<div class="hm-block"><h2 data-hm-slot="headline" hidden></h2></div>`;
  const v = await visitor({ cfg: mkcfg(), head: THEME_HEAD, body: themePage(DAWN, blk) });
  try {
    await v.go('/?hm_angle=preppers');
    const r = await v.pg.evaluate(() => [document.querySelector('[data-hm-slot=headline]').textContent, document.querySelector('main h1').textContent, document.querySelector('.banner__text p').textContent, document.querySelector('#hero-media').getAttribute('src')]);
    assert.deepEqual(r, [A1.headline, T.headline, A1.sub, '/img/prep.png']);
  } finally { await v.close(); }
});

test('auto: only on the landing hit and the home page; a collection or cart page of a matched visitor keeps its own title', async () => {
  const v = await visitor({ cfg: mkcfg(), head: THEME_HEAD, body: themePage(DAWN) });
  try {
    await v.go('/?hm_angle=preppers');
    const own = async () => (await probe(v.pg)).h1;
    assert.equal(await own(), A1.headline);
    await v.go('/collections/all'); assert.equal(await own(), T.headline, 'persisted match, not landing, not home');
    await v.go('/'); assert.equal(await own(), A1.headline, 'home keeps matching');
    await v.go('/products/shirt?hm_angle=preppers'); assert.equal(await own(), A1.headline, 'landing hit anywhere');
    assert.deepEqual(v.log.errors, []);
  } finally { await v.close(); }
});

test('auto: no <main>, or design mode: nothing is touched and nothing throws', async () => {
  const { p, log } = await theme(null, '/?hm_angle=preppers', { body: '<div><h1>Plain</h1><img src="/img/a.png" width="10" height="10"></div>' });
  assert.deepEqual(p.imgs, ['/img/a.png']); assert.deepEqual(log.errors, []); assert.equal(p.pending, false);
  const v = await visitor({ cfg: mkcfg(), head: THEME_HEAD, body: themePage(DAWN) }, { initScript: () => { window.Shopify = { designMode: true }; } });
  try { await v.go('/?hm_angle=preppers'); assert.equal((await probe(v.pg)).h1, T.headline); } finally { await v.close(); }
});

test('auto: sequencing, consent and unassigned-ad rules still hold with theme swapping', async () => {
  const v = await visitor({ cfg: mkcfg(), head: THEME_HEAD, body: themePage(DAWN) }, { slowDiscount: 400, initScript: () => { window.Shopify = { customerPrivacy: { analyticsProcessingAllowed: () => false } }; } });
  try {
    await v.go('/?hm_ad=111');
    assert.equal((await probe(v.pg)).h1, A1.headline); assert.deepEqual(v.log.hits, []);
    assert.ok(v.log.t.cartStart >= v.log.t.discountDone, 'cart update after the discount request');
  } finally { await v.close(); }
  const u = await theme(DAWN, '/?hm_ad=424242');
  assert.equal(u.p.h1, T.headline); assert.deepEqual(u.log.cart, [{ attributes: { _hm_angle: '', _hm_arm: 'none', _hm_ad: '424242' } }]);
});

test('auto anti-flicker: hero headline, subheadline and media are hidden while pending, header/footer/other sections never, all revealed after', async () => {
  const vis = (pg) => pg.evaluate(() => {
    const g = (q) => getComputedStyle(document.querySelector(q)).visibility;
    return { cls: [...document.documentElement.classList].sort().join(' '), h1: g('main h1'), sub: g('.banner__text p'), hero: g('#hero-media'), card: g('.card'), grid: g('#shopify-section-grid p'), logo: g('.logo'), footer: g('footer img'), fh: g('footer h2') };
  });
  const v = await visitor({ cfg: mkcfg(), head: THEME_HEAD, body: themePage(DAWN) }, { hmDelay: 700 });
  try {
    v.pg.goto('/?hm_angle=preppers', { waitUntil: 'commit' }).catch(() => {});
    await v.pg.waitForSelector('footer', { state: 'attached' }); await v.pg.waitForTimeout(150);
    assert.deepEqual(await vis(v.pg), { cls: 'hm-a hm-pending', h1: 'hidden', sub: 'hidden', hero: 'hidden', card: 'visible', grid: 'visible', logo: 'visible', footer: 'visible', fh: 'visible' });
    await v.pg.waitForLoadState('load'); await v.pg.waitForTimeout(200);
    const after = await vis(v.pg);
    assert.equal(after.cls, 'hm-a'); assert.deepEqual([after.h1, after.sub, after.hero], ['visible', 'visible', 'visible']);
    assert.equal(await v.pg.evaluate(() => document.querySelector('main h1').textContent), A1.headline);
  } finally { await v.close(); }
});

test('auto anti-flicker: an override hides only its own selector; heuristics stay for the other slots; blocks mode hides blocks only', async () => {
  const extra = `<div class="promo"><span class="promo__title">Promo</span></div>`;
  const vis = (pg) => pg.evaluate(() => { const g = (q) => getComputedStyle(document.querySelector(q)).visibility; return [g('.promo__title'), g('main h1'), g('#hero-media')]; });
  for (const [settings, want] of [[{ headline_selector: '.promo__title' }, ['hidden', 'visible', 'hidden']], [{ mode: 'blocks' }, ['visible', 'visible', 'visible']]]) {
    const v = await visitor({ cfg: mkcfg(), settings, head: THEME_HEAD, body: themePage(DAWN, extra) }, { hmDelay: 600 });
    try {
      v.pg.goto('/?hm_angle=preppers', { waitUntil: 'commit' }).catch(() => {});
      await v.pg.waitForSelector('footer', { state: 'attached' }); await v.pg.waitForTimeout(150);
      assert.deepEqual(await vis(v.pg), want, JSON.stringify(settings));
    } finally { await v.close(); }
  }
});

test('auto anti-flicker: a persisted match on a non-landing, non-home page hides nothing of the theme', async () => {
  const v = await visitor({ cfg: mkcfg(), head: THEME_HEAD, body: themePage(DAWN) });
  try {
    await v.go('/?hm_angle=preppers');
    await v.ctx.unroute(`${ORIGIN}/**`);
    await v.ctx.route(`${ORIGIN}/**`, async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === '/hm.js') { await new Promise((r) => setTimeout(r, 600)); return route.fulfill({ contentType: 'text/javascript', body: HMJS }); }
      if (u.pathname.startsWith('/img/')) return route.fulfill({ contentType: 'image/png', body: PNG });
      return route.fulfill({ contentType: 'text/html', body: page({ cfg: mkcfg(), head: THEME_HEAD, body: themePage(DAWN) }) });
    });
    v.pg.goto('/collections/all', { waitUntil: 'commit' }).catch(() => {});
    await v.pg.waitForSelector('footer', { state: 'attached' }); await v.pg.waitForTimeout(150);
    const r = await v.pg.evaluate(() => [document.documentElement.className, getComputedStyle(document.querySelector('main h1')).visibility, getComputedStyle(document.querySelector('#hero-media')).visibility]);
    assert.deepEqual(r, ['hm-pending', 'visible', 'visible']);
  } finally { await v.close(); }
});

test('auto anti-flicker: if hm.js never loads, the 1.2 s safety timeout reveals the theme hero', async () => {
  const v = await visitor({ cfg: mkcfg(), head: THEME_HEAD, body: themePage(DAWN) }, { hmJs: 'abort' });
  try {
    await v.pg.goto('/?hm_angle=preppers', { waitUntil: 'load' });
    assert.equal(await v.pg.evaluate(() => getComputedStyle(document.querySelector('main h1')).visibility), 'hidden');
    await v.pg.waitForTimeout(1400);
    assert.equal(await v.pg.evaluate(() => getComputedStyle(document.querySelector('main h1')).visibility), 'visible');
  } finally { await v.close(); }
});

test('auto anti-flicker: the hero stays hidden until the new image has decoded (old image never shows)', async () => {
  const v = await visitor({ cfg: mkcfg(), head: THEME_HEAD, body: themePage(DAWN) });
  try {
    await v.ctx.route(`${ORIGIN}/img/prep.png`, async (route) => { await new Promise((r) => setTimeout(r, 500)); return route.fulfill({ contentType: 'image/png', body: PNG }); });
    v.pg.goto('/?hm_angle=preppers', { waitUntil: 'commit' }).catch(() => {});
    await v.pg.waitForSelector('footer', { state: 'attached' }); await v.pg.waitForTimeout(300);
    assert.equal(await v.pg.evaluate(() => [document.documentElement.classList.contains('hm-pending'), getComputedStyle(document.querySelector('#hero-media')).visibility].join()), 'true,hidden');
    await v.pg.waitForTimeout(800);
    assert.equal(await v.pg.evaluate(() => [document.documentElement.classList.contains('hm-pending'), getComputedStyle(document.querySelector('#hero-media')).visibility].join()), 'false,visible');
  } finally { await v.close(); }
});

test('css: empty Hookmatch block wrappers take no space, a filled block shows', async () => {
  const body = `<main><div class="shopify-app-block" id="w1"><div class="hm-block hm-headline"><h2 data-hm-slot="headline" hidden></h2></div></div><div class="shopify-app-block" id="w2"><div class="hm-block hm-media"><img data-hm-slot="media" hidden width="1600" height="900" alt="" style="aspect-ratio:1600/900"></div></div><p id="after">after</p></main>`;
  const v = await visitor({ cfg: mkcfg(), css: 1, body });
  try {
    await v.go('/');
    const disp = () => v.pg.evaluate(() => ['#w1', '#w2', '#w1 .hm-block', '#w2 .hm-block'].map((q) => getComputedStyle(document.querySelector(q)).display));
    assert.deepEqual(await disp(), ['none', 'none', 'none', 'none']);
    assert.equal(await v.pg.evaluate(() => Math.round(document.querySelector('#after').getBoundingClientRect().top - document.querySelector('main').getBoundingClientRect().top)), 0);
    await v.go('/?hm_angle=preppers');
    const d = await disp();
    assert.notEqual(d[0], 'none'); assert.notEqual(d[2], 'none'); assert.notEqual(d[1], 'none');
  } finally { await v.close(); }
});

test('size budget: hm.js <= 3.2 KB gzipped; inline anti-flicker snippet stays small', () => {
  const gz = require('node:zlib').gzipSync(HMJS, { level: 9 }).length;
  const inline = Buffer.byteLength(STYLE + '<script>' + INLINE + '</script>');
  const auto = Buffer.byteLength(renderAuto());
  console.log(`hm.js ${Buffer.byteLength(HMJS)} B raw, ${gz} B gzipped; inline snippet ${inline} B (+ #hm-auto tag ${auto} B)`);
  assert.ok(gz <= 3277, `gz=${gz}`); assert.ok(inline < 1000, `inline=${inline}`);
});
