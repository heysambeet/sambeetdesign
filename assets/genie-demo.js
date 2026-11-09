/* ============================================================
   Genie demo — Strategy builder case study
   A self-playing prototype: a cursor states a wish (shape, POP,
   max profit), hits Generate, and a small solver fits real strikes
   on the toy model, then shows which wishes were met (green) and
   which could only be approached (amber). Uses SketchKit from
   sketch-demo.js for pricing, metrics and the payoff chart.
   Margin is taken as ₹1,00,000 for the toy model.
   ============================================================ */
(function () {
  var root = document.querySelector('[data-genie]');
  if (!root || !window.SketchKit) return;
  var Kit = window.SketchKit, MARGIN = 100000, STEP = Kit.STEP;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var api = Kit.Sketch(root, { auto: true, start: [], yFloor: 12000 });
  var cap = root.querySelector('.sk-auto__cap');
  var verdict = root.querySelector('.gn-verdict');
  var gen = root.querySelector('.gn-generate');
  var wishes = {
    strategy: root.querySelector('[data-wish="strategy"]'),
    pop: root.querySelector('[data-wish="pop"]'),
    profit: root.querySelector('[data-wish="profit"]')
  };
  var select = wishes.strategy.querySelector('.gn-select');
  var drop = wishes.strategy.querySelector('.gn-drop');
  var cursor = document.createElement('div');
  cursor.className = 'sk-cursor';
  cursor.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 2.5v13.2l3.4-3.1 2.3 5.1 2.4-1.1-2.3-5h4.6z"/></svg><i></i>';
  root.appendChild(cursor);

  /* ---------- Solver: closest iron condor across active wishes ---------- */
  var cands = null;
  function buildCands() {
    cands = [];
    for (var p = 22900; p <= 23600; p += STEP)
      for (var c = 23700; c <= 24400; c += STEP)
        [100, 200, 300].forEach(function (w) {
          var legs = [
            { type: 'PE', side: 1, K: p - w }, { type: 'PE', side: -1, K: p },
            { type: 'CE', side: -1, K: c }, { type: 'CE', side: 1, K: c + w }
          ];
          var m = Kit.metricsOf(legs.map(Kit.priced));
          cands.push({ legs: legs, pop: m.popRaw, prof: m.maxp / MARGIN * 100 });
        });
  }
  function solve(w) {
    if (!cands) buildCands();
    var best = null, bestErr = Infinity;
    cands.forEach(function (o) {
      var e = 0;
      if (w.pop) e += Math.pow((o.pop - w.pop) / 3, 2);
      if (w.profit) e += Math.pow((o.prof - w.profit) / (0.15 * w.profit), 2);
      if (e < bestErr) { bestErr = e; best = o; }
    });
    return best;
  }

  /* ---------- UI state ---------- */
  function setOn(key, on) { wishes[key].classList.toggle('is-on', on); }
  function pick(key, val) {
    wishes[key].querySelectorAll('.gn-chip').forEach(function (b) { b.classList.toggle('is-sel', b.dataset.v === String(val)); });
    var f = wishes[key].querySelector('.gn-field b'); if (f) f.textContent = val ? val + (key === 'profit' ? '%' : ' %') : '';
  }
  function reset() {
    ['strategy', 'pop', 'profit'].forEach(function (k) { setOn(k, false); });
    pick('pop', null); pick('profit', null);
    select.querySelector('span').textContent = 'Select your strategy'; select.classList.remove('is-filled');
    drop.hidden = true; gen.classList.remove('is-busy'); gen.querySelector('span').textContent = 'Generate';
    verdict.innerHTML = ''; verdict.hidden = true;
    api.setLegs([]);
  }
  function showVerdict(w, r) {
    var html = '', anyAmber = false;
    function chip(label, want, got, ok) {
      if (!ok) anyAmber = true;
      return '<span class="gn-pill ' + (ok ? 'is-met' : 'is-close') + '">' + (ok ? '✓ ' : '≈ ') + label + ' ' + want +
        ' <em>' + (ok ? 'met, ' : 'closest ') + got + '</em></span>';
    }
    html += '<span class="gn-pill is-met">✓ Iron condor</span>';
    if (w.pop) html += chip('POP', w.pop + '%', Math.round(r.pop) + '%', Math.abs(r.pop - w.pop) <= 3);
    if (w.profit) html += chip('Max profit', w.profit + '%', r.prof.toFixed(1) + '%', Math.abs(r.prof - w.profit) <= 0.15 * w.profit);
    if (anyAmber) html += '<p class="gn-note">These wishes pull against each other. This is the closest fit, and Genie says so.</p>';
    verdict.innerHTML = html; verdict.hidden = false;
  }

  /* ---------- Player ---------- */
  var run = 0, visible = false, playing = false;
  function stopIf(r) { if (r !== run) throw 'stop'; }
  function wait(ms, r) { return new Promise(function (res) { setTimeout(res, ms); }).then(function () { stopIf(r); }); }
  function say(t) { cap.textContent = t; }
  function at(elm) {
    var a = elm.getBoundingClientRect(), b = root.getBoundingClientRect();
    return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 };
  }
  /* Cursor travel time scales with distance, so short hops feel quick
     and long ones don't snap. Opacity keeps its own short fade. */
  var pos = null;
  function place(x, y, ms) {
    cursor.style.transition = 'transform ' + ms + 'ms cubic-bezier(.4,.1,.2,1), opacity 220ms ease';
    cursor.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    pos = { x: x, y: y };
  }
  async function go(elm, r, ms) {
    var p = at(elm);
    if (ms == null) {
      var d = pos ? Math.hypot(p.x - pos.x, p.y - pos.y) : 0;
      ms = Math.round(Math.max(260, Math.min(620, 200 + d * 0.9)));
    }
    place(p.x, p.y, ms);
    await wait(ms + 40, r);
  }
  async function click(elm, r) {
    await go(elm, r);
    cursor.classList.add('is-press'); await wait(150, r); cursor.classList.remove('is-press');
  }
  async function generate(w, r) {
    await click(gen, r);
    gen.classList.add('is-busy'); gen.querySelector('span').textContent = 'Generating';
    verdict.hidden = true;
    var res = solve(w);
    await wait(950, r);
    gen.classList.remove('is-busy'); gen.querySelector('span').textContent = 'Generate';
    api.setLegs(res.legs);
    showVerdict(w, res);
    return res;
  }

  async function play(r) {
    reset();
    say('Start with the outcome you want, not the strikes');
    // Fade the cursor in on empty space just below the first switch,
    // instead of parking it on the title text.
    var sw = at(wishes.strategy.querySelector('.gn-switch'));
    if (cursor.classList.contains('is-on')) { cursor.classList.remove('is-on'); await wait(240, r); }
    place(sw.x - 70, sw.y + 70, 0);
    await wait(30, r);
    cursor.classList.add('is-on');
    await wait(450, r);

    say('Optional: pick a shape');
    await click(wishes.strategy.querySelector('.gn-switch'), r); setOn('strategy', true); await wait(150, r);
    await click(select, r); drop.hidden = false; await wait(260, r);
    var ic = drop.querySelector('[data-v="Iron condor"]');
    await click(ic, r); drop.hidden = true;
    select.querySelector('span').textContent = 'Iron condor'; select.classList.add('is-filled'); await wait(320, r);

    say('Ask for the chance of profit you want');
    await click(wishes.pop.querySelector('.gn-switch'), r); setOn('pop', true); await wait(150, r);
    await click(wishes.pop.querySelector('[data-v="80"]'), r); pick('pop', 80); await wait(320, r);

    say('And the profit, as a share of margin');
    await click(wishes.profit.querySelector('.gn-switch'), r); setOn('profit', true); await wait(150, r);
    await click(wishes.profit.querySelector('[data-v="2"]'), r); pick('profit', 2); await wait(320, r);

    say('One click: Genie fits real strikes');
    await generate({ pop: 80, profit: 2 }, r);
    say('Real, editable legs that meet both wishes');
    await wait(3200, r);

    say('Now ask for more than the market allows');
    await click(wishes.pop.querySelector('[data-v="90"]'), r); pick('pop', 90); await wait(300, r);
    await click(wishes.profit.querySelector('[data-v="4"]'), r); pick('profit', 4); await wait(400, r);
    await generate({ pop: 90, profit: 4 }, r);
    say('Genie returns the closest fit, and is honest about it');
    await wait(4200, r);
  }

  async function loop() {
    if (playing) return;
    playing = true;
    var r = ++run;
    try { while (true) { await play(r); } } catch (e) { /* stopped */ }
    playing = false;
    if (visible) loop();
  }
  function stop() { run++; cursor.classList.remove('is-on', 'is-press'); }

  if (reduced) {
    setOn('strategy', true); setOn('pop', true); setOn('profit', true);
    select.querySelector('span').textContent = 'Iron condor'; select.classList.add('is-filled');
    pick('pop', 80); pick('profit', 2);
    var res = solve({ pop: 80, profit: 2 });
    api.setLegs(res.legs); showVerdict({ pop: 80, profit: 2 }, res);
    say('A wish, and the strategy Genie fitted to it');
    return;
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible) loop(); else stop();
    }, { threshold: 0.3 }).observe(root);
  } else { visible = true; loop(); }
})();
