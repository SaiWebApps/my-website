/* Transit Map: maps and rides. Content is in the HTML; this only adds motion and the one-station-at-a-time view. */
(() => {
  const G = window.gsap;
  const motionOK = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (G) {
    const plugins = [window.ScrollTrigger, window.DrawSVGPlugin, window.MotionPathPlugin].filter(Boolean);
    G.registerPlugin(...plugins);
  }
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const visible = el => !!(el && el.offsetParent !== null);

  /* ---------- Light and dark: the choice is remembered on every page ---------- */
  const label = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    $$('[data-theme-toggle]').forEach(b => {
      b.setAttribute('aria-label', dark ? 'Switch to the light theme' : 'Switch to the dark theme');
      b.setAttribute('aria-pressed', String(dark));
    });
  };
  label();
  $$('[data-theme-toggle]').forEach(b => b.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch {}
    label();
  }));

  /* ---------- Cars: step through a unit's screens; dots show where you are ---------- */
  const carsOf = el => $('.cars__track', el);
  const carStep = (track, d) => {
    if (!track) return false;
    const w = track.clientWidth, max = track.scrollWidth - w - 2;
    if ((d > 0 && track.scrollLeft >= max) || (d < 0 && track.scrollLeft <= 2)) return false;
    track.scrollBy({ left: d * w, behavior: motionOK() ? 'smooth' : 'auto' });
    return true;
  };
  $$('[data-cars]').forEach(c => {
    const track = carsOf(c), line = $('.cars__line', c), btns = $$('[data-car]', c);
    const scope = c.closest('article, section');
    const heading = scope && $('h1, h2, h3, .sign, .eh__title, .eh__org', scope);
    track.tabIndex = 0;
    track.setAttribute('role', 'region');
    track.setAttribute('aria-label', `${heading?.textContent.trim() || 'Evidence'} — more evidence`);
    const sync = () => {
      const max = Math.max(1, track.scrollWidth - track.clientWidth);
      line?.style.setProperty('--p', Math.min(1, Math.max(0, track.scrollLeft / max)).toFixed(3));
      btns.forEach(b => b.setAttribute('aria-disabled', (b.dataset.car < 0 ? track.scrollLeft <= 2 : track.scrollLeft >= track.scrollWidth - track.clientWidth - 2) ? 'true' : 'false'));
    };
    btns.forEach(b => b.addEventListener('click', () => carStep(track, +b.dataset.car)));
    track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
    addEventListener('resize', sync);
    sync();
  });
  window.__carStep = el => d => carStep(carsOf(el), d);

  /* ---------- A double-click anywhere on a line opens that line's page ---------- */
  $$('.map--home [data-href]').forEach(p => p.addEventListener('dblclick', e => { e.preventDefault(); location.href = p.dataset.href; }));


  /* ---------- Path helpers ---------- */
  function nearest(path, x, y) {
    const len = path.getTotalLength();
    let best = 0, bd = Infinity;
    for (let i = 0; i <= 600; i++) {
      const p = path.getPointAtLength(len * i / 600);
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = i / 600; }
    }
    return { f: best, d: Math.sqrt(bd), len };
  }
  function makeTrain(svg, w, h) {
    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'train');
    g.innerHTML = `<rect width="${w}" height="${h}" rx="${h / 2}" fill="#1A1A1A"/><rect x="${w * 0.18}" y="${h * 0.28}" width="${w * 0.64}" height="${h * 0.22}" rx="${h * 0.11}" fill="#FAFAF7"/>`;
    svg.appendChild(g);
    return g;
  }

  /* ---------- System maps: focus a line, ride it to the chosen station ---------- */
  const initMap = map => {
    const svg = $('svg', map);
    const hub = $('.stn--hub', map);
    const [hx, hy] = hub ? [+hub.dataset.x, +hub.dataset.y] : (map.dataset.hub || '').split(',').map(Number);
    const isWide = map.classList.contains('map--wide');
    const train = G && window.MotionPathPlugin ? makeTrain(svg, isWide ? 40 : 28, isWide ? 16 : 12) : null;
    const pathFor = line => $(`.ln[data-line="${line}"]`, svg);
    let busy = false;

    // The train is parked at Apple, the station I work from today.
    const park = $('.stn[href$="#apple"]', map);
    if (train) {
      const red = pathFor('red');
      let at = park ? nearest(red, +park.dataset.x, +park.dataset.y).f : nearest(red, hx, hy).f;
      // Apple is the hub ring on desktop: park just past it so the train never sits on the ring.
      if (park && Math.hypot(+park.dataset.x - hx, +park.dataset.y - hy) < 5) at = Math.min(1, at + 46 / red.getTotalLength());
      G.set(train, { motionPath: { path: red, align: red, alignOrigin: [0.5, 0.5], start: at, end: at, autoRotate: true } });
    }

    // Short grace on leave, so moving from a line to its stations keeps the line lit.
    let idle;
    const focus = line => { clearTimeout(idle); if (!busy) map.dataset.focus = line; };
    const unfocus = () => { clearTimeout(idle); idle = setTimeout(() => { if (!busy) delete map.dataset.focus; }, 280); };
    $$('.ln[data-line]', svg).forEach(p => {
      p.addEventListener('pointerenter', () => focus(p.dataset.line));
      p.addEventListener('pointerleave', unfocus);
    });

    // Zoom into the red line alone: everything else fades, the line straightens into the exact place of the
    // Career ride's strip, then the page changes with that strip as a shared element, so it never moves.
    const boardCareer = (dest = 'career.html#cmu') => {
      if (busy) return;
      if (!G || !motionOK() || !window.MorphSVGPlugin) { location.href = dest; return; }
      busy = true;
      G.registerPlugin(MorphSVGPlugin);
      map.dataset.focus = 'red';
      // Where the ride's strip line sits on the Career page (same stylesheet, so read its tokens).
      const css = getComputedStyle(document.documentElement);
      // --gutter is a clamp(), so resolve it by measuring.
      const probe = document.createElement('i');
      probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--gutter);height:0';
      document.documentElement.appendChild(probe);
      const gutter = probe.getBoundingClientRect().width || 40;
      probe.remove();
      const hd = parseFloat(css.getPropertyValue('--hd-h')) || 72;
      const vw = document.documentElement.clientWidth;
      const left = Math.max(0, (vw - 1360) / 2) + gutter, width = Math.min(vw, 1360) - 2 * gutter;
      const top = hd + 8 + 22 + 40, h = 10;
      const ctm = svg.getScreenCTM(), inv = ctm.inverse(), k = ctm.a;
      const at = (x, y) => new DOMPoint(x, y).matrixTransform(inv);
      const p0 = at(left + h / 2, top + h / 2), p1 = at(left + width - h / 2, top + h / 2);
      const line = $('.ln[data-line="red"]', svg);
      const rest = [...svg.children].filter(el => el !== line && el.tagName !== 'defs');
      line.setAttribute('stroke-linecap', 'round');
      // A hidden tab pauses animation frames; never strand the visitor mid-zoom.
      const safety = setTimeout(() => { location.href = dest; }, 2500);
      const tl = G.timeline({ onComplete: () => {
        clearTimeout(safety);
        // Hand the line to the next page: a bar in the same place, named like the ride's strip line.
        const bar = document.createElement('div');
        bar.className = 'cr-handoff';
        Object.assign(bar.style, { left: left + 'px', top: top + 'px', width: width + 'px', height: h + 'px' });
        document.body.appendChild(bar);
        line.style.opacity = '0';
        // Let the bar paint before leaving, so the page transition can capture it.
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => { location.href = dest; }, 0)));
      } });
      tl.to([...rest, ...$$('.stn', map), train].filter(Boolean), { opacity: 0, duration: 0.35, ease: 'power1.out' }, 0)
        .to(line, { morphSVG: `M${p0.x} ${p0.y} L${p1.x} ${p1.y}`, attr: { 'stroke-width': h / k }, duration: 0.85, ease: 'power3.inOut' }, 0.1);
    };
    if (isWide) $$('.ln[data-line="red"]', svg).forEach(p => p.addEventListener('click', () => boardCareer()));

    $$('.stn[data-line]', map).forEach(stn => {
      if (stn.classList.contains('stn--hub')) return;
      const on = () => focus(stn.dataset.line);
      const off = unfocus;
      stn.addEventListener('pointerenter', on);
      stn.addEventListener('pointerleave', off);
      stn.addEventListener('focus', on);
      stn.addEventListener('blur', off);
      stn.addEventListener('click', e => {
        // Every stop on the red line boards the same ride, opening at that stop.
        if (isWide && stn.dataset.line === 'red' && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) {
          e.preventDefault();
          const hash = (stn.getAttribute('href') || '').split('#')[1];
          boardCareer('career.html#' + (hash || 'cmu'));
          return;
        }
        if (!train || !motionOK() || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || busy) return;
        // A branched line has several paths: ride the one this station sits on.
        const path = $$(`.ln[data-line="${stn.dataset.line}"]`, svg).sort((a, b) => nearest(a, +stn.dataset.x, +stn.dataset.y).d - nearest(b, +stn.dataset.x, +stn.dataset.y).d)[0];
        if (!path) return;
        e.preventDefault();
        busy = true;
        map.dataset.focus = stn.dataset.line;
        const parked = park && stn.dataset.line === 'red' ? park : null;
        const from = nearest(path, parked ? +parked.dataset.x : hx, parked ? +parked.dataset.y : hy);
        const to = nearest(path, +stn.dataset.x, +stn.dataset.y);
        const start = from.d < 30 ? from.f : 0;
        if (!parked) G.set(train, { motionPath: { path, align: path, alignOrigin: [0.5, 0.5], start, end: start, autoRotate: true } });
        const end = to.d < 30 ? to.f : 1;
        const dur = Math.min(0.9, Math.max(0.45, Math.abs(end - start) * to.len / 1100));
        G.to(train, {
          duration: dur, ease: 'power2.inOut',
          motionPath: { path, align: path, alignOrigin: [0.5, 0.5], start, end, autoRotate: true },
          onComplete: () => { location.href = stn.href; setTimeout(() => { busy = false; delete map.dataset.focus; }, 600); },
        });
      });
    });

    // Signature load: every line draws out from where it begins, then the train parks at my station.
    if (G && window.DrawSVGPlugin && motionOK() && visible(map)) {
      const order = ['red', 'orange', 'purple', 'blue', 'green', 'black'];
      const tl = G.timeline({ defaults: { ease: 'power2.inOut' } });
      order.forEach((line, i) => {
        const p = pathFor(line);
        if (p) tl.from(p, { drawSVG: '0%', duration: line === 'red' ? 1.15 : 0.9 }, i * 0.14);
      });
      map.classList.add('is-loading');
      tl.fromTo([...$$('.tk, .ix', svg), ...$$('.stn__face', map)], { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.012, clearProps: 'opacity' }, 0.45);
      tl.eventCallback('onComplete', () => map.classList.remove('is-loading'));
      if (train) tl.from(train, { opacity: 0, scale: 0.6, transformOrigin: '50% 50%', duration: 0.3, ease: 'power3.out' }, 1.05);
    }
  };
  $$('.map--home').forEach(initMap);

  /* ---------- Home: his face is the hub; tapping it zooms toward him and opens the card ---------- */
  const me = $('#me');
  if (me) {
    let opener = null, tl = null, fade = [], closing = false;
    const open = face => {
      if (me.open) return;
      opener = face;
      const map = face.closest('.map'), svg = $('svg', map), vb = svg.viewBox.baseVal;
      const zoom = !!G && motionOK();
      me.classList.toggle('is-zoom', zoom);
      face.setAttribute('aria-expanded', 'true');
      if (zoom) {
        // Everything but his ring and photo leaves first; they ride the zoom a moment longer, then the card takes over.
        const ring = $$('circle.ix', svg).find(c => Math.abs(c.getAttribute('cx') - face.dataset.x) < 1 && Math.abs(c.getAttribute('cy') - face.dataset.y) < 1);
        const photo = $('.stn__face', face);
        fade = [...svg.children, ...$$('.stn', map), $('.stn__name', face)].filter(el => el && el !== ring && el !== face && el.tagName !== 'defs');
        const origin = `${+face.dataset.x / vb.width * 100}% ${+face.dataset.y / vb.height * 100}%`;
        tl = G.timeline()
          .to(fade, { opacity: 0, duration: 0.25, ease: 'power1.out' }, 0)
          .to(map, { scale: 2.2, transformOrigin: origin, duration: 0.6, ease: 'power3.inOut' }, 0)
          .to([ring, photo].filter(Boolean), { opacity: 0, duration: 0.22, ease: 'power1.in' }, 0.3);
        // Only opacity is cleared on the fading parts: labels and the train keep their own transforms.
        tl.eventCallback('onReverseComplete', () => { G.set([...fade, ring, photo].filter(Boolean), { clearProps: 'opacity' }); G.set(map, { clearProps: 'transform,transformOrigin' }); });
      }
      me.showModal();
      if (zoom) G.fromTo(me, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.35, delay: 0.34, ease: 'power2.out', clearProps: 'opacity,transform' });
    };
    const close = () => {
      if (!me.open || closing) return;
      if (!tl) { me.close(); return; }
      closing = true;
      G.killTweensOf(me);
      G.to(me, { opacity: 0, duration: 0.18, ease: 'power1.in', onComplete: () => { me.close(); G.set(me, { clearProps: 'opacity,transform' }); tl.reverse(); tl = null; closing = false; } });
    };
    me.addEventListener('close', () => { opener?.setAttribute('aria-expanded', 'false'); opener?.focus({ preventScroll: true }); });
    me.addEventListener('cancel', e => { e.preventDefault(); close(); });
    $('[data-close-me]', me).addEventListener('click', close);
    // Outside the card is the map: a click there closes it.
    me.addEventListener('click', e => {
      const r = me.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
    });
    $$('.map--home .stn--me').forEach(face => {
      face.setAttribute('role', 'button');
      face.setAttribute('aria-haspopup', 'dialog');
      face.setAttribute('aria-controls', 'me');
      face.setAttribute('aria-expanded', 'false');
      face.addEventListener('click', e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); open(face); });
      face.addEventListener('keydown', e => { if (e.key === ' ') { e.preventDefault(); open(face); } });
    });
  }

  /* ---------- Career map: the camera rides to the chosen station ---------- */
  $$('.cmap__frame').forEach(frame => {
    const map = $('.map', frame);
    const root = frame.closest('[data-ride]');
    const vb = $('svg', map).viewBox.baseVal;
    let first = true;
    root.addEventListener('ride:change', e => {
      const id = e.detail.id;
      $$('.stn', map).forEach(b => b.classList.toggle('is-here', b.dataset.stop === id));
      const btn = $(`.stn[data-stop="${id}"]`, map);
      if (!btn || !visible(frame)) return;
      const W = map.offsetWidth, H = map.offsetHeight;
      const x = +btn.dataset.x / vb.width * W, y = +btn.dataset.y / vb.height * H;
      const s = 1.32;
      const tx = Math.min(0, Math.max(W - W * s, W / 2 - x * s));
      const ty = Math.min(0, Math.max(H - H * s, H / 2 - y * s));
      const animate = !first && motionOK() && !e.detail.kbd;
      first = false;
      if (G) G.to(map, { x: tx, y: ty, scale: s, duration: animate ? 0.55 : 0, ease: 'power2.inOut', overwrite: true });
      else map.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    });
  });
  /* ---------- Secondary reading lives in <details>; a link into it opens it ---------- */
  const openFor = id => { const el = id ? document.getElementById(id) : null; const d = el ? el.closest('details') : null; if (d && !d.open) d.open = true; };
  openFor(decodeURIComponent(location.hash.slice(1)));
  addEventListener('hashchange', () => openFor(decodeURIComponent(location.hash.slice(1))));
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', () => openFor(decodeURIComponent(a.getAttribute('href').slice(1)))));
  $$('details').forEach(d => d.addEventListener('toggle', () => dispatchEvent(new Event('resize'))));

  /* ---------- Station rides: one platform at a time, chosen on the line ---------- */
  $$('[data-ride]').forEach(initRide);

  function initRide(root) {
    const stops = $$('[data-stop]', root).filter(b => b.closest('[data-ride]') === root);
    const panels = $$('.platform', root).filter(p => p.closest('[data-ride]') === root);
    if (!stops.length || !panels.length) return;
    root.classList.add('is-riding');
    const ids = panels.map(p => p.id);
    let current = -1;

    const strips = $$('.strip', root);
    strips.forEach(strip => {
      const tr = document.createElement('span');
      tr.className = 'strip__train';
      tr.setAttribute('aria-hidden', 'true');
      $('.strip__line', strip)?.appendChild(tr);
    });

    function placeTrains(animate) {
      strips.forEach(strip => {
        const tr = $('.strip__train', strip);
        const btn = $$(`[data-stop="${ids[current]}"]`, strip)[0];
        const line = $('.strip__line', strip);
        if (!tr || !btn || !line) return;
        const lb = line.getBoundingClientRect();
        const bb = (btn.querySelector('.stop__tick') || btn).getBoundingClientRect();
        const vertical = getComputedStyle(strip).getPropertyValue('--axis').trim() === 'y';
        const x = vertical ? 0 : bb.left + bb.width / 2 - lb.left;
        const y = vertical ? bb.top + bb.height / 2 - lb.top : 0;
        if (G && animate && motionOK()) G.to(tr, { x, y, duration: 0.42, ease: 'power2.inOut', overwrite: true });
        else if (G) G.set(tr, { x, y });
        else tr.style.transform = `translate(${x}px, ${y}px)`;
      });
    }

    function show(i, opts = {}) {
      if (i < 0 || i >= panels.length || i === current) return;
      const prev = current;
      current = i;
      panels.forEach((p, k) => { p.hidden = k !== i; });
      stops.forEach(b => {
        const on = b.dataset.stop === ids[i];
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
      root.dispatchEvent(new CustomEvent('ride:change', { detail: { index: i, id: ids[i], prev, kbd: !!opts.kbd } }));
      placeTrains(prev !== -1);
      // keep the chosen stop in view on scrolling strips
      $$(`[data-stop="${ids[i]}"]`, root).forEach(b => {
        const sc = b.closest('.strip__scroll');
        if (sc && sc.scrollWidth > sc.clientWidth + 2) {
          const left = b.offsetLeft - sc.clientWidth / 2 + b.offsetWidth / 2;
          sc.scrollTo({ left, behavior: prev === -1 || !motionOK() ? 'auto' : 'smooth' });
        }
      });
      const panel = panels[i];
      if (prev !== -1 && G && motionOK() && !opts.kbd) {
        const dir = i > prev ? 1 : -1;
        G.fromTo(panel.querySelectorAll('.pf__in > *'), { opacity: 0, x: 18 * dir }, { opacity: 1, x: 0, duration: 0.26, ease: 'power3.out', stagger: 0.03, overwrite: true, clearProps: 'transform,opacity' });
      }
      if (opts.focusPanel) panel.focus({ preventScroll: true });
      if (opts.hash !== false && prev !== -1) history.replaceState(null, '', '#' + ids[i]);
      if (opts.scroll && prev !== -1) {
        const top = root.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(root).scrollMarginTop) || 0);
        if (scrollY > top + 40) window.scrollTo({ top, behavior: motionOK() ? 'smooth' : 'auto' });
      }
    }

    stops.forEach(b => {
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => show(ids.indexOf(b.dataset.stop)));
      b.addEventListener('keydown', e => {
        const k = e.key;
        const dirs = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
        let n = null;
        if (k in dirs) n = Math.min(panels.length - 1, Math.max(0, current + dirs[k]));
        if (k === 'Home') n = 0;
        if (k === 'End') n = panels.length - 1;
        if (n === null) return;
        e.preventDefault();
        show(n, { kbd: true });
        const group = b.closest('[role="tablist"]');
        $(`[data-stop="${ids[n]}"]`, group || root)?.focus();
      });
    });
    $$('[role="tablist"]', root).forEach(t => t.setAttribute('aria-orientation', 'horizontal'));
    panels.forEach(p => {
      p.setAttribute('role', 'tabpanel');
      p.tabIndex = -1;
      const btn = stops.find(b => b.dataset.stop === p.id);
      if (btn) { if (!btn.id) btn.id = 'tab-' + p.id; p.setAttribute('aria-labelledby', btn.id); btn.setAttribute('aria-controls', p.id); }
    });
    $$('[data-go]', root).forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      show(ids.indexOf(a.dataset.go), { focusPanel: true, scroll: true });
    }));

    const fromHash = () => {
      const h = decodeURIComponent(location.hash.slice(1));
      const k = ids.indexOf(h);
      return k;
    };
    const start = fromHash();
    show(start >= 0 ? start : Math.max(0, ids.indexOf(root.dataset.start)), { hash: false });
    if (start >= 0) requestAnimationFrame(() => root.scrollIntoView({ block: 'start' }));
    // A link to a station (#hp) shows its platform and brings the ride into view, as on load.
    addEventListener('hashchange', () => { const k = fromHash(); if (k >= 0) { show(k, { hash: false }); root.scrollIntoView({ block: 'start', behavior: motionOK() ? 'smooth' : 'auto' }); } });
    addEventListener('resize', () => placeTrains(false));
    document.fonts?.ready.then(() => placeTrains(false));
    root.ride = { show, get index() { return current; } };
  }

  /* ---------- Speaking: the line runs into a balloon loop at the stadium ---------- */
  const stage = $('.stadium__stage');
  if (stage) {
    const svg = $('.stadium__svg', stage), path = $('.stadium__path', stage), loop = $('.stadium__loop', stage);
    let train = null, played = false;
    const build = () => {
      const sb = stage.getBoundingClientRect(), lb = loop.getBoundingClientRect();
      const h = 11;
      const L = lb.left - sb.left + h, R = lb.right - sb.left - h, T = lb.top - sb.top + h, B = lb.bottom - sb.top - h;
      svg.setAttribute('viewBox', `0 0 ${sb.width} ${sb.height}`);
      let d;
      if (R - L >= B - T) {
        const r = (B - T) / 2, cy = (T + B) / 2;
        // In from the left, once around the balloon, closing where it entered.
        d = `M${-sb.left - 20} ${cy} H${L} A${r} ${r} 0 0 1 ${L + r} ${T} H${R - r} A${r} ${r} 0 0 1 ${R - r} ${B} H${L + r} A${r} ${r} 0 0 1 ${L} ${cy}`;
      } else {
        const r = (R - L) / 2, cx = (L + R) / 2, top = 16; // clear of the heading above
        d = `M${cx} ${top} V${T} A${r} ${r} 0 0 1 ${R} ${T + r} V${B - r} A${r} ${r} 0 0 1 ${L} ${B - r} V${T + r} A${r} ${r} 0 0 1 ${cx} ${T}`;
      }
      path.setAttribute('d', d);
      stage.classList.add('has-svg');
      if (train && (played || !motionOK())) G.set(train, { motionPath: { path, align: path, alignOrigin: [0.5, 0.5], start: 1, end: 1, autoRotate: true } });
    };
    build();
    if (G && window.MotionPathPlugin) {
      train = makeTrain(svg, 58, 22);
      if (motionOK() && window.DrawSVGPlugin) {
        const tl = G.timeline({ delay: 0.25, onComplete: () => { played = true; } });
        tl.fromTo(path, { drawSVG: '0%' }, { drawSVG: '100%', duration: 2.6, ease: 'power1.inOut' }, 0)
          .fromTo(train, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0)
          .to(train, { duration: 2.6, ease: 'power1.inOut', motionPath: { path, align: path, alignOrigin: [0.5, 0.5], start: 0, end: 1, autoRotate: true } }, 0);
      } else { played = true; build(); }
    }
    let rz;
    addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { played = true; G?.killTweensOf(train); G?.set(path, { drawSVG: '100%' }); build(); }, 120); });
    document.fonts?.ready.then(build);
  }

  /* ---------- Destination blind: one talk at a time ---------- */
  $$('[data-blind]').forEach(b => {
    const roll = $('.blind__roll', b), items = $$('.blind__stop', b), win = $('.blind__window', b);
    let i = 0;
    const go = n => { i = (n + items.length) % items.length; roll.style.transform = `translateY(${-i * win.clientHeight}px)`; };
    $('[data-blind-next]', b)?.addEventListener('click', () => go(i + 1));
    $('[data-blind-prev]', b)?.addEventListener('click', () => go(i - 1));
    addEventListener('resize', () => go(i));
  });


  /* ---------- Services: pick a door on the map, see only that door ---------- */
  const panel = $('.doors-panel');
  if (panel) {
    document.documentElement.classList.add('doors-js');
    const maps = $$('.map--svc');
    const doors = $$('.door', panel);
    const show = (id, scroll) => {
      const door = doors.find(d => d.id === id);
      if (!door) return;
      doors.forEach(d => d.toggleAttribute('data-off', d !== door));
      maps.forEach(m => { m.dataset.focus = door.dataset.line; });
      maps.forEach(m => $$('.stn--route', m).forEach(r => r.toggleAttribute('aria-current', r.getAttribute('href') === '#' + id)));
      if (G && motionOK() && scroll) G.fromTo(door, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.45, ease: 'expo.out' });
      if (scroll && door.getBoundingClientRect().top > innerHeight * 0.55) door.scrollIntoView({ behavior: motionOK() ? 'smooth' : 'auto', block: 'start' });
    };
    maps.forEach(m => m.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      e.preventDefault();
      show(a.getAttribute('href').slice(1), true);
      history.replaceState(null, '', a.getAttribute('href'));
    }));
    const start = location.hash && doors.some(d => d.id === location.hash.slice(1)) ? location.hash.slice(1) : doors[0].id;
    show(start, false);
  }

  /* ---------- Career rail: one station at a time, with every proof exposed ---------- */
  const cride = $('[data-career-ride]');
  if (cride) {
    const sts = $$('.cr-st', cride), ids = sts.map(s => s.id);
    const strip = $('.cr-strip', cride), train = $('.cr-train', cride);
    const stationLinks = $$('.cr-strip__s', strip);
    cride.classList.add('is-ride');
    let cur = -1;
    const show = (id, record = true) => {
      const i = ids.indexOf(id);
      if (i < 0 || i === cur) return;
      const from = cur;
      sts.forEach((s, k) => s.classList.toggle('is-on', k === i));
      stationLinks.forEach(a => {
        const active = a.dataset.go === id;
        a.classList.toggle('is-on', active);
        a.classList.toggle('is-past', ids.indexOf(a.dataset.go) < i);
        a.tabIndex = active ? 0 : -1;
        if (active) a.setAttribute('aria-current', 'step');
        else a.removeAttribute('aria-current');
      });
      cride.style.setProperty('--x', sts[i].dataset.x);
      if (train) train.style.opacity = '1';
      if (from >= 0 && G && motionOK()) G.fromTo(sts[i], { opacity: 0, x: i > from ? 48 : -48 }, { opacity: 1, x: 0, duration: 0.42, ease: 'expo.out', clearProps: 'transform,opacity' });
      cur = i;
      if (record) history.replaceState(null, '', '#' + id);
    };
    const step = d => {
      const next = Math.max(0, Math.min(ids.length - 1, cur + d));
      if (next !== cur) show(ids[next]);
    };
    cride.addEventListener('click', e => {
      const a = e.target.closest('[data-go]');
      if (!a) return;
      e.preventDefault();
      show(a.dataset.go);
      if (a.closest('.cr-foot')) {
        const heading = document.getElementById(a.dataset.go + '-h');
        heading?.focus({ preventScroll: true });
        scrollTo({ top: 0, behavior: motionOK() ? 'smooth' : 'auto' });
      }
    });
    strip.addEventListener('keydown', e => {
      if (!e.target.closest('.cr-strip__s')) return;
      let next = cur;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(ids.length - 1, cur + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, cur - 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = ids.length - 1;
      else return;
      e.preventDefault();
      show(ids[next]);
      stationLinks[next].focus({ preventScroll: true });
    });
    // A mostly horizontal touch gesture moves one station without creating a horizontal page scroller.
    let sx = 0, sy = 0, st = false;
    const stage = $('.cr-stage', cride);
    stage.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; sx = e.clientX; sy = e.clientY; st = true; }, { passive: true });
    stage.addEventListener('pointerup', e => {
      if (!st) return; st = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
    }, { passive: true });
    stage.addEventListener('pointercancel', () => { st = false; });
    // A station link (career.html#amazon) opens the ride at that station; the page stays at the top, strip in view.
    const top = () => { if (ids.includes(location.hash.slice(1))) { scrollTo(0, 0); requestAnimationFrame(() => scrollTo(0, 0)); } };
    addEventListener('hashchange', () => { show(location.hash.slice(1), false); top(); });
    show(ids.includes(location.hash.slice(1)) ? location.hash.slice(1) : ids[0], false);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    top(); addEventListener('load', top, { once: true });
  }

  window.__transit = { G, $, $$, motionOK, nearest, makeTrain, visible };
  window.__SITE_READY__ = true;
  document.documentElement.dataset.siteReady = 'true';
})();
