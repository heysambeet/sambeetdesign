/* ============================================================
   Sketch demo — Strategy builder case study
   A small, self-contained payoff chart you can shape by hand.
   Toy model from the PRD: NIFTY 23,650 · lot 75 · iron condor.
   Prices come from Black–Scholes at a flat IV. Illustrative only.
   ============================================================ */
(function () {
  var root = document.querySelector('[data-sketch]');
  if (!root) return;

  var SPOT = 23650, LOT = 75, IV = 0.13, DAYS = 6, T = DAYS / 365, STEP = 50;
  var XMIN = 22450, XMAX = 24850, MAX_LEGS = 6;
  var BASE = [
    { type: 'PE', side: 1,  K: 23050 },
    { type: 'PE', side: -1, K: 23250 },
    { type: 'CE', side: -1, K: 24050 },
    { type: 'CE', side: 1,  K: 24250 }
  ];

  var svg = root.querySelector('.sk-svg');
  var chart = root.querySelector('.sk-chart');
  var legsEl = root.querySelector('.sk-legs');
  var menu = root.querySelector('.sk-menu');
  var undoBtn = root.querySelector('[data-sk-undo]');
  var resetBtn = root.querySelector('[data-sk-reset]');
  var out = {
    credit: root.querySelector('[data-sk="credit"]'),
    maxp: root.querySelector('[data-sk="maxp"]'),
    maxl: root.querySelector('[data-sk="maxl"]'),
    pop: root.querySelector('[data-sk="pop"]'),
    be: root.querySelector('[data-sk="be"]')
  };
  var NS = 'http://www.w3.org/2000/svg';

  /* ---------- Maths ---------- */
  function erf(x) {
    var s = x < 0 ? -1 : 1; x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  function N(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }
  function bs(type, S, K, t) {
    if (t <= 0) return type === 'CE' ? Math.max(S - K, 0) : Math.max(K - S, 0);
    var v = IV * Math.sqrt(t);
    var d1 = (Math.log(S / K) + 0.5 * IV * IV * t) / v, d2 = d1 - v;
    return type === 'CE' ? S * N(d1) - K * N(d2) : K * N(-d2) - S * N(-d1);
  }
  function priced(l) { return { type: l.type, side: l.side, K: l.K, prem: Math.round(bs(l.type, SPOT, l.K, T) * 100) / 100 }; }
  function qty(l) { return l.side * LOT; }
  function expiryAt(S) {
    var p = 0;
    for (var i = 0; i < legs.length; i++) {
      var l = legs[i], intr = l.type === 'CE' ? Math.max(S - l.K, 0) : Math.max(l.K - S, 0);
      p += qty(l) * (intr - l.prem);
    }
    return p;
  }
  function todayAt(S) {
    var p = 0;
    for (var i = 0; i < legs.length; i++) { var l = legs[i]; p += qty(l) * (bs(l.type, S, l.K, T) - l.prem); }
    return p;
  }

  /* ---------- State ---------- */
  var legs = BASE.map(priced), history = [];
  function snapshot() { return legs.map(function (l) { return { type: l.type, side: l.side, K: l.K, prem: l.prem }; }); }
  function push() { history.push(snapshot()); if (history.length > 40) history.shift(); }
  function sorted() { return legs.map(function (l, i) { return { l: l, i: i }; }).sort(function (a, b) { return a.l.K - b.l.K || a.i - b.i; }); }

  /* ---------- Formatting ---------- */
  function inr(n) { return Math.round(Math.abs(n)).toLocaleString('en-IN'); }
  function signed(n) { return (n >= 0 ? '+' : '−') + '₹' + inr(n); }
  function short(n) {
    var a = Math.abs(n), s = n < 0 ? '−' : n > 0 ? '+' : '';
    return a >= 1000 ? s + (a / 1000).toFixed(a % 1000 ? 1 : 0).replace('.0', '') + 'k' : s + a;
  }

  /* ---------- Geometry ---------- */
  var W, H, PL = 52, PR = 14, PT = 18, PB = 30, ymin, ymax;
  function sx(S) { return PL + (S - XMIN) / (XMAX - XMIN) * (W - PL - PR); }
  function sy(v) { return PT + (ymax - v) / (ymax - ymin) * (H - PT - PB); }
  function toS(clientX) {
    var r = svg.getBoundingClientRect();
    return XMIN + (clientX - r.left - PL) / (W - PL - PR) * (XMAX - XMIN);
  }
  function snap(S) { return Math.round(S / STEP) * STEP; }
  function niceStep(span) {
    var raw = span / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /* ---------- Metrics ---------- */
  function metrics() {
    if (!legs.length) return null;
    var credit = 0, right = 0, left = 0;
    legs.forEach(function (l) {
      credit -= qty(l) * l.prem;
      if (l.type === 'CE') right += qty(l); else left -= qty(l);
    });
    var ks = legs.map(function (l) { return l.K; }).sort(function (a, b) { return a - b; });
    var vals = ks.map(expiryAt);
    var maxp = Math.max.apply(null, vals), maxl = Math.min.apply(null, vals);
    var unlP = right > 0 || left < 0, unlL = right < 0 || left > 0;
    // POP and breakevens from a fine scan of the expiry payoff
    var sd = IV * Math.sqrt(T), pop = 0, be = [], prev = expiryAt(15000), prevS = 15000;
    function z(S) { return (Math.log(S / SPOT) + 0.5 * sd * sd) / sd; }
    for (var S = 15000; S <= 33000; S += 5) {
      var v = expiryAt(S + 2.5);
      if (v > 0) pop += N(z(S + 5)) - N(z(S));
      var cur = expiryAt(S + 5);
      if ((prev <= 0 && cur > 0) || (prev > 0 && cur <= 0)) {
        var x = prevS + (S + 5 - prevS) * (0 - prev) / (cur - prev);
        be.push(Math.round(x));
      }
      prev = cur; prevS = S + 5;
    }
    return { credit: credit, maxp: maxp, maxl: maxl, unlP: unlP, unlL: unlL, pop: Math.round(pop * 100), be: be };
  }

  /* ---------- Render ---------- */
  var hover = null, drag = null;
  function render() {
    W = Math.max(280, Math.round(chart.clientWidth));
    H = W < 520 ? 260 : 320;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // y range
    var lo = 0, hi = 0, pts = [], tpts = [];
    for (var S = XMIN; S <= XMAX; S += 10) {
      var v = legs.length ? expiryAt(S) : 0, t = legs.length ? todayAt(S) : 0;
      pts.push([S, v]); tpts.push([S, t]);
      lo = Math.min(lo, v, t); hi = Math.max(hi, v, t);
    }
    if (!legs.length) { lo = -10000; hi = 10000; }
    var span = (hi - lo) || 10000, stepY = niceStep(span * 1.15);
    ymin = Math.floor((lo - span * 0.08) / stepY) * stepY;
    ymax = Math.ceil((hi + span * 0.08) / stepY) * stepY;

    var defs = el('defs', {}, svg);
    var cpUp = el('clipPath', { id: 'sk-up' }, defs); el('rect', { x: 0, y: 0, width: W, height: sy(0) }, cpUp);
    var cpDn = el('clipPath', { id: 'sk-dn' }, defs); el('rect', { x: 0, y: sy(0), width: W, height: H }, cpDn);

    var bg = el('rect', { x: PL, y: PT, width: W - PL - PR, height: H - PT - PB, class: 'sk-bg' }, svg);

    // grid + y labels
    for (var y = ymin; y <= ymax + 1; y += stepY) {
      el('line', { x1: PL, x2: W - PR, y1: sy(y), y2: sy(y), class: y === 0 ? 'sk-zero' : 'sk-grid' }, svg);
      var ty = el('text', { x: PL - 8, y: sy(y) + 4, class: 'sk-ylab', 'text-anchor': 'end' }, svg); ty.textContent = short(y);
    }
    // x labels
    var xstep = W < 420 ? 600 : W < 520 ? 400 : 200;
    for (var x = Math.ceil(XMIN / xstep) * xstep; x <= XMAX; x += xstep) {
      var tx = el('text', { x: sx(x), y: H - 10, class: 'sk-xlab', 'text-anchor': 'middle' }, svg); tx.textContent = x.toLocaleString('en-IN');
    }
    // spot
    el('line', { x1: sx(SPOT), x2: sx(SPOT), y1: PT, y2: H - PB, class: 'sk-spot' }, svg);
    var st = el('text', { x: sx(SPOT) + 6, y: PT + 10, class: 'sk-spotlab' }, svg); st.textContent = 'NIFTY ' + SPOT.toLocaleString('en-IN');

    if (legs.length) {
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ' ' + sy(p[1]).toFixed(1); }).join(' ');
      var area = d + ' L' + sx(XMAX) + ' ' + sy(0) + ' L' + sx(XMIN) + ' ' + sy(0) + ' Z';
      el('path', { d: area, class: 'sk-profit', 'clip-path': 'url(#sk-up)' }, svg);
      el('path', { d: area, class: 'sk-loss', 'clip-path': 'url(#sk-dn)' }, svg);
      var td = tpts.map(function (p, i) { return (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ' ' + sy(p[1]).toFixed(1); }).join(' ');
      el('path', { d: td, class: 'sk-today' }, svg);
      // on expiry: green above zero, red below, as in the terminal
      el('path', { d: d, class: 'sk-expiry sk-expiry--up', 'clip-path': 'url(#sk-up)' }, svg);
      el('path', { d: d, class: 'sk-expiry sk-expiry--dn', 'clip-path': 'url(#sk-dn)' }, svg);

      // sides: adjacent legs of the same type move together
      var so = sorted();
      for (var k = 0; k < so.length - 1; k++) {
        var a = so[k], b = so[k + 1];
        if (a.l.type !== b.l.type || a.l.K === b.l.K) continue;
        var seg = el('line', { x1: sx(a.l.K), y1: sy(expiryAt(a.l.K)), x2: sx(b.l.K), y2: sy(expiryAt(b.l.K)), class: 'sk-side' }, svg);
        seg.dataset.pair = a.i + ',' + b.i;
        var tt = el('title', {}, seg); tt.textContent = 'Drag to move both legs';
      }
      // dots
      var seen = {};
      so.forEach(function (o) {
        var off = (seen[o.l.K] = (seen[o.l.K] || 0) + 1) - 1;
        var cx = sx(o.l.K), cy = sy(expiryAt(o.l.K)) - off * 20;
        var g = el('g', { class: 'sk-dot ' + (o.l.side > 0 ? 'is-buy' : 'is-sell'), tabindex: 0, role: 'slider',
          'aria-label': (o.l.side > 0 ? 'Buy ' : 'Sell ') + o.l.K + ' ' + o.l.type + '. Arrow keys roll the strike.',
          'aria-valuenow': o.l.K, 'aria-valuemin': XMIN, 'aria-valuemax': XMAX }, svg);
        g.dataset.i = o.i;
        el('circle', { cx: cx, cy: cy, r: 16, class: 'sk-dot__hit' }, g);
        el('rect', { x: cx - 8, y: cy - 8, width: 16, height: 16, rx: 4, class: 'sk-dot__chip' }, g);
        var lt = el('text', { x: cx, y: cy + 3.5, 'text-anchor': 'middle' }, g); lt.textContent = o.l.side > 0 ? 'B' : 'S';
      });
    } else {
      var em = el('text', { x: (PL + W - PR) / 2, y: sy(0) - 14, class: 'sk-empty', 'text-anchor': 'middle' }, svg);
      em.textContent = 'Tap anywhere on the chart to add a leg';
    }

    // hover plus
    if (hover && !drag && legs.length < MAX_LEGS) {
      var hx = sx(hover);
      el('line', { x1: hx, x2: hx, y1: PT, y2: H - PB, class: 'sk-guide' }, svg);
      var hg = el('g', { class: 'sk-plus' }, svg);
      el('circle', { cx: hx, cy: sy(0), r: 8 }, hg);
      el('path', { d: 'M' + (hx - 3.5) + ' ' + sy(0) + 'h7M' + hx + ' ' + (sy(0) - 3.5) + 'v7' }, hg);
      var lab = hover.toLocaleString('en-IN'), lw = lab.length * 6.2 + 14;
      var lx = Math.min(Math.max(hx - lw / 2, PL), W - PR - lw);
      el('rect', { x: lx, y: PT + 2, width: lw, height: 20, rx: 6, class: 'sk-guidepill' }, svg);
      var hl = el('text', { x: lx + lw / 2, y: PT + 16, 'text-anchor': 'middle', class: 'sk-guidelab' }, svg); hl.textContent = lab;
    }
    renderSide();
  }

  function renderSide() {
    // legs list
    legsEl.innerHTML = '';
    if (!legs.length) {
      var p = document.createElement('li'); p.className = 'sk-legs__empty'; p.textContent = 'No legs yet. Start from the empty chart.'; legsEl.appendChild(p);
    }
    sorted().forEach(function (o) {
      var li = document.createElement('li');
      li.className = 'sk-leg ' + (o.l.side > 0 ? 'is-buy' : 'is-sell');
      li.innerHTML = '<b>' + (o.l.side > 0 ? 'B' : 'S') + '</b><span>' + o.l.K + ' ' + o.l.type + '</span><em>₹' + o.l.prem.toFixed(1) + '</em>';
      var x = document.createElement('button'); x.type = 'button'; x.className = 'sk-leg__del';
      x.setAttribute('aria-label', 'Delete ' + o.l.K + ' ' + o.l.type); x.textContent = '×';
      x.addEventListener('click', function () { push(); legs.splice(o.i, 1); render(); });
      li.appendChild(x); legsEl.appendChild(li);
    });
    // metrics
    var m = metrics();
    if (!m) { out.maxp.className = out.maxl.className = ''; out.credit.textContent = out.maxp.textContent = out.maxl.textContent = out.pop.textContent = out.be.textContent = '--'; }
    else {
      out.credit.textContent = (m.credit >= 0 ? 'Get ' : 'Pay ') + '₹' + inr(m.credit);
      out.maxp.textContent = m.unlP ? 'Unlimited' : signed(m.maxp);
      out.maxl.textContent = m.unlL ? 'Unlimited' : signed(m.maxl);
      out.maxp.className = m.unlP || m.maxp > 0 ? 'is-pos' : m.maxp < 0 ? 'is-neg' : '';
      out.maxl.className = m.unlL || m.maxl < 0 ? 'is-neg' : m.maxl > 0 ? 'is-pos' : '';
      out.pop.textContent = m.pop + '%';
      out.be.textContent = m.be.length ? m.be.slice(0, 3).map(function (b) { return b.toLocaleString('en-IN'); }).join(' · ') : 'None';
    }
    undoBtn.disabled = !history.length;
  }

  /* ---------- Interaction ---------- */
  function closeMenu() { menu.hidden = true; }
  function openMenu(K) {
    if (legs.length >= MAX_LEGS) return;
    menu.querySelector('.sk-menu__strike').textContent = K.toLocaleString('en-IN');
    menu.dataset.k = K;
    menu.hidden = false;
    var left = sx(K), w = menu.offsetWidth;
    menu.style.left = Math.min(Math.max(left - w / 2, 4), W - w - 4) + 'px';
    menu.style.top = Math.min(sy(0) + 14, H - menu.offsetHeight - 4) + 'px';
    menu.querySelector('button').focus({ preventScroll: true });
  }
  menu.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-add]'); if (!b) return;
    var parts = b.dataset.add.split(' ');
    push();
    legs.push(priced({ type: parts[1], side: parts[0] === 'buy' ? 1 : -1, K: Number(menu.dataset.k) }));
    closeMenu(); hover = null; render();
  });

  function bounds(idxs) {
    // the moving legs can't cross a fixed neighbour (min gap 50)
    var moving = {}, lo = XMIN, hi = XMAX;
    idxs.forEach(function (i) { moving[i] = true; });
    var mn = Math.min.apply(null, idxs.map(function (i) { return legs[i].K; }));
    var mx = Math.max.apply(null, idxs.map(function (i) { return legs[i].K; }));
    legs.forEach(function (l, i) {
      if (moving[i]) return;
      if (l.K < mn || (l.K === mn && i < idxs[0])) lo = Math.max(lo, l.K + STEP);
      else if (l.K > mx || (l.K === mx)) hi = Math.min(hi, l.K - STEP);
    });
    return { minDelta: lo - mn, maxDelta: hi - mx };
  }

  svg.addEventListener('pointerdown', function (e) {
    var dot = e.target.closest('.sk-dot'), side = e.target.closest('.sk-side');
    closeMenu();
    if (dot || side) {
      var idxs = dot ? [Number(dot.dataset.i)] : side.dataset.pair.split(',').map(Number);
      drag = { idxs: idxs, startS: snap(toS(e.clientX)), orig: idxs.map(function (i) { return legs[i].K; }), before: snapshot(), lim: bounds(idxs), moved: false };
      try { svg.setPointerCapture(e.pointerId); } catch (err) {}
      root.classList.add('is-dragging');
      e.preventDefault();
    } else if (e.target.classList.contains('sk-bg') || e.target.closest('.sk-plus')) {
      drag = { add: true, x: e.clientX };
    }
  });
  svg.addEventListener('pointermove', function (e) {
    if (drag && drag.idxs) {
      var delta = snap(toS(e.clientX)) - drag.startS;
      delta = Math.max(drag.lim.minDelta, Math.min(drag.lim.maxDelta, delta));
      var changed = false;
      drag.idxs.forEach(function (i, n) {
        var K = drag.orig[n] + delta;
        if (legs[i].K !== K) { legs[i] = priced({ type: legs[i].type, side: legs[i].side, K: K }); changed = true; }
      });
      if (changed) { drag.moved = true; render(); }
      return;
    }
    if (e.pointerType === 'mouse') {
      var onBg = e.target.classList.contains('sk-bg') || e.target.closest('.sk-plus') || e.target.classList.contains('sk-guide');
      var K = onBg ? snap(toS(e.clientX)) : null;
      if (K !== null && (K < XMIN || K > XMAX)) K = null;
      if (K !== hover) { hover = K; render(); }
    }
  });
  function endDrag(e) {
    if (!drag) return;
    if (drag.idxs) {
      if (drag.moved) { history.push(drag.before); if (history.length > 40) history.shift(); }
      root.classList.remove('is-dragging');
      drag = null; render();
    } else if (drag.add) {
      var moved = Math.abs(e.clientX - drag.x) > 6;
      drag = null;
      if (!moved) { var K = snap(toS(e.clientX)); if (K >= XMIN && K <= XMAX) { hover = null; render(); openMenu(K); } }
    }
  }
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', function () { if (drag && drag.idxs) { legs = drag.before; } drag = null; root.classList.remove('is-dragging'); render(); });
  svg.addEventListener('pointerleave', function () { if (hover !== null && !drag) { hover = null; render(); } });

  svg.addEventListener('keydown', function (e) {
    var dot = e.target.closest && e.target.closest('.sk-dot'); if (!dot) return;
    var dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    var i = Number(dot.dataset.i), lim = bounds([i]), delta = dir * STEP;
    if (delta < lim.minDelta || delta > lim.maxDelta) return;
    push();
    legs[i] = priced({ type: legs[i].type, side: legs[i].side, K: legs[i].K + delta });
    render();
    var again = svg.querySelector('.sk-dot[data-i="' + i + '"]'); if (again) again.focus();
  });

  document.addEventListener('pointerdown', function (e) { if (!menu.hidden && !menu.contains(e.target) && !svg.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  undoBtn.addEventListener('click', function () { if (history.length) { legs = history.pop(); closeMenu(); render(); } });
  resetBtn.addEventListener('click', function () { push(); legs = BASE.map(priced); closeMenu(); render(); });

  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(render, 80); });
  render();
})();
