/* Hookmatch storefront runtime. Never throws to the page. */
(function () {
  var W = window, D = document, H = D.documentElement, K = 'hm', DAY = 864e5, routing, disc, pend = [];

  function get(k, ss) { try { return (ss ? W.sessionStorage : W.localStorage).getItem(k); } catch (e) {} }
  function put(k, v, ss) { try { (ss ? W.sessionStorage : W.localStorage).setItem(k, v); } catch (e) {} }
  function del(k) { try { W.localStorage.removeItem(k); } catch (e) {} }
  function parse(t) { try { return JSON.parse(t); } catch (e) {} }
  function lc(v) { return String(v || '').toLowerCase(); }
  function post(url, body) {
    return W.fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  function run() {
    var cfg = parse((D.getElementById('hm-config') || {}).textContent);
    if (!cfg || !cfg.angles || (W.Shopify && W.Shopify.designMode)) return;

    var q = new URLSearchParams(W.location.search);
    function p(k) { return q.get(k) || ''; }
    var ad = p('hm_ad'), set = p('hm_set'), cmp = p('hm_cmp'), slug = lc(p('hm_angle'));
    var names = [p('utm_content'), p('utm_term'), p('utm_campaign')].map(lc);
    var land = !!(slug || ad || set || cmp || /^(facebook|fb|ig|instagram|meta)$/i.test(p('utm_source')));
    var angles = cfg.angles.filter(function (a) { return a && a.active; });

    function first(test) { for (var i = 0; i < angles.length; i++) if (test(angles[i])) return angles[i]; }
    function ids(key, v) {
      return v && first(function (a) {
        return ((a.match || {})[key] || []).some(function (x) { return String(x) === v; });
      });
    }
    function byName() {
      for (var i = 0, a; i < names.length; i++) {
        if (!names[i]) continue;
        a = first(function (a) {
          return ((a.match || {}).nameContains || []).some(function (n) { return n && names[i].indexOf(lc(n)) > -1; });
        });
        if (a) return a;
      }
    }

    function armFor(a) {
      var map = parse(get('hm_a')) || {}, hold = Math.min(100, Math.max(0, +cfg.holdout || 0)), r;
      if (map[a.id]) return map[a.id];
      try { r = W.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296; } catch (e) { r = Math.random(); }
      map[a.id] = r * 100 < hold ? 'control' : 'matched';
      put('hm_a', JSON.stringify(map));
      return map[a.id];
    }

    var st = parse(get(K)), a, arm = 'none', un;
    if (land) {
      a = first(function (x) { return slug && lc(x.slug) === slug; }) ||
        ids('adIds', ad) || ids('adsetIds', set) || ids('campaignIds', cmp) || byName();
      if (a) {
        arm = armFor(a);
        st = { angle: a.id, arm: arm, ad: ad, ts: Date.now() };
        put(K, JSON.stringify(st));
      } else if (ad) {
        // Unassigned ad: no swap, cart keeps the ad id
        un = 1;
        st = { angle: '', arm: arm, ad: ad, ts: Date.now() };
        put(K, JSON.stringify(st));
      } else { del(K); st = null; }
    } else if (st && Date.now() - st.ts < DAY) {
      if (st.angle) { a = first(function (x) { return x.id === st.angle; }); arm = st.arm; }
      else if (st.ad) un = 1;
    }

    var matched = a && arm === 'matched';

    // Route once, on the landing hit (the routed page reports it)
    if (matched && land && a.route) {
      try {
        var u = new URL(a.route, W.location.href), cut = function (s) { return s.replace(/\/$/, ''); };
        if (u.origin === W.location.origin && cut(u.pathname) !== cut(W.location.pathname)) {
          u.search = W.location.search;
          routing = 1;
          W.location.replace(u.href);
          return;
        }
      } catch (e) {}
    }

    if (land && (a || ad)) {
      var hit = { angle: a ? a.id : null, arm: arm, ad: ad, adName: p('utm_content'), set: set, setName: p('utm_term'), cmp: cmp, cmpName: p('utm_campaign') };
      var key = JSON.stringify(hit);
      if (get('hm_h', 1) !== key) {
        // Consent: never awaited; missing API = allowed
        var ok = 1;
        try { ok = W.Shopify.customerPrivacy.analyticsProcessingAllowed() !== false; } catch (e) {}
        if (ok) {
          put('hm_h', key, 1);
          try { W.navigator.sendBeacon('/apps/hm/hit', new Blob([key], { type: 'application/json' })); } catch (e) {}
        }
      }
    }
    if (!a && !un) return;

    if (matched) {
      var c = a.content || {}, A = parse((D.getElementById('hm-auto') || {}).textContent), M = D.querySelector('main'), F = M && M.firstElementChild;
      // Auto: theme hero where no block
      var all = (s, r) => r ? [].filter.call(r.querySelectorAll(s), e => !e.closest('header,footer,nav,dialog,[id*=drawer],[class*=drawer]')) : [];
      function find(slot) {
        var s = A[slot], l = all('h1', M), area = e => e.offsetWidth * e.offsetHeight, h, t, m;
        if (s) return all(s, D);
        l = l[0] ? l : all('h2', F);
        h = l.filter(e => e.offsetHeight)[0] || l[0];
        for (t = h; t && t.parentNode != M; t = t.parentNode);
        if (slot == 'headline') return [h];
        if (slot == 'subheadline') return [all('p', t || F).filter(e => h && h.compareDocumentPosition(e) & 4 && !e.closest('button,form'))[0]];
        m = all('img,video', t || F).sort((x, y) => area(y) - area(x) || (y.tagName == 'VIDEO') - (x.tagName == 'VIDEO'))[0];
        return [m && area(m) ? m : all('img,video', F)[0]];
      }
      function swap(el, v, vid) {
        var isV = el.tagName == 'VIDEO', m = el, w = +el.getAttribute('width') || el.offsetWidth, h = +el.getAttribute('height') || el.offsetHeight, box = isV ? el : el.closest('picture');
        if (isV != vid) {
          m = D.createElement(vid ? 'video' : 'img');
          m.className = el.className;
          m.style.cssText = el.style.cssText;
          m.style.objectFit = 'cover';
          if (getComputedStyle(el).position == 'absolute') m.style.cssText += ';position:absolute;inset:0;width:100%;height:100%';
          m.dataset.hmSlot = 'media';
          if (w && h) { m.setAttribute('width', w); m.setAttribute('height', h); m.style.aspectRatio = w + '/' + h; }
          if (vid) { m.muted = m.autoplay = m.loop = m.playsInline = true; m.setAttribute('muted', ''); } else m.alt = el.alt || '';
          m.src = v;
          (box || el).replaceWith(m);
        } else {
          ['srcset', 'sizes', 'poster'].forEach(k => el.removeAttribute(k));
          if (box) box.querySelectorAll('source').forEach(x => x.remove());
          el.hidden = false;
          el.src = v;
          if (isV) el.load();
        }
        m.decode && pend.push(m.decode());
      }
      ['headline', 'subheadline', 'media', 'badge'].forEach(slot => {
        var v = c[slot], els = [...D.querySelectorAll('[data-hm-slot=' + slot + ']')];
        try {
          if (!v) return;
          if (!els.length && A && slot != 'badge' && (land || W.location.pathname == '/')) els = find(slot);
          els.forEach(el => { if (slot != 'media') { el.textContent = v; el.hidden = false; } else swap(el, v, c.mediaType == 'video'); });
        } catch (e) {}
      });
      if (a.discountCode && st && !st.d) {
        st.d = 1;
        put(K, JSON.stringify(st));
        disc = W.fetch('/discount/' + encodeURIComponent(a.discountCode), { credentials: 'same-origin', redirect: 'manual' }).catch(function () {});
      }
    }

    // Cart token in the signature: a new cart gets the attributes again
    var cad = land ? ad : (st && st.ad) || '', aid = a ? a.id : '';
    function sig() { return [aid, arm, cad, (D.cookie.match(/(?:^|; )cart=([^;%?]*)/) || [])[1]].join('|'); }
    if (get('hm_c') !== sig()) {
      // Both create a cart if none: run in turn so attributes land on the discounted cart
      (disc || Promise.resolve()).then(function () {
        return post('/cart/update.js', { attributes: { _hm_angle: aid, _hm_arm: arm, _hm_ad: cad } });
      }).then(function (r) { if (r.ok) put('hm_c', sig()); }, function () {});
    }
  }

  try { run(); } catch (e) {}
  function show() { H.classList.remove('hm-pending'); }
  if (!routing) Promise.all(pend).then(show, show);
})();
