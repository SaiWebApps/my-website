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
  // One step is one car: its width plus the gap (a car is narrower than the track on Career).
  const carWidth = track => (track.firstElementChild ? track.firstElementChild.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0) : track.clientWidth);
  const carStep = (track, d) => {
    if (!track) return false;
    const w = carWidth(track), max = track.scrollWidth - track.clientWidth - 2;
    if ((d > 0 && track.scrollLeft >= max) || (d < 0 && track.scrollLeft <= 2)) return false;
    track.scrollBy({ left: d * w, behavior: motionOK() ? 'smooth' : 'auto' });
    return true;
  };
  $$('[data-cars]').forEach(c => {
    const track = carsOf(c), line = $('.cars__line', c), btns = $$('[data-car]', c), consist = $$('.cr-consist i', c);
    const scope = c.closest('article, section');
    const heading = scope && $('h1, h2, h3, .sign, .eh__title, .eh__org', scope);
    track.tabIndex = 0;
    track.setAttribute('role', 'region');
    track.setAttribute('aria-label', `${heading?.textContent.trim() || 'Evidence'} — more evidence`);
    const sync = () => {
      const max = Math.max(1, track.scrollWidth - track.clientWidth);
      line?.style.setProperty('--p', Math.min(1, Math.max(0, track.scrollLeft / max)).toFixed(3));
      const at = Math.round(track.scrollLeft / carWidth(track));
      consist.forEach((pip, k) => pip.classList.toggle('on', k === at));
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

  /* ---------- Career shelf: each job is a book; pull one down and it opens, one fact per page ---------- */
  const cride = $('[data-career-ride]');
  if (cride) {
    const sts = $$('.cr-st', cride), ids = sts.map(s => s.id);
    const shelf = $('.bk-shelf', cride), row = $('.bk-shelf__row', shelf), slot = $('.bk-slot', shelf);
    const spineOf = id => $(`.bk-spine[data-go="${id}"]`, row);
    const mk = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
    const phone = matchMedia('(max-width: 860px)');
    // The book: two pages between boards, page-block edges, and turn buttons.
    const stage = mk('section', 'bk-stage'); stage.setAttribute('aria-label', 'Open book');
    const book = mk('div', 'bk-book');
    const verso = mk('div', 'bk-leafpage bk-verso'), recto = mk('div', 'bk-leafpage bk-recto');
    verso.setAttribute('aria-hidden', 'true'); recto.setAttribute('aria-live', 'polite');
    book.append(mk('div', 'bk-edge bk-edge--l'), verso, recto, mk('div', 'bk-edge bk-edge--r'));
    const turns = mk('div', 'bk-turns');
    const prev = mk('button', 'bk-turn', '<span aria-hidden="true">←</span>'), next = mk('button', 'bk-turn', '<span aria-hidden="true">→</span>');
    prev.type = next.type = 'button'; prev.setAttribute('aria-label', 'Previous page'); next.setAttribute('aria-label', 'Next page');
    turns.append(prev, next); stage.append(book, turns); cride.append(stage);
    cride.classList.add('is-shelf');
    document.documentElement.style.setProperty('--shelf-w', shelf.getBoundingClientRect().width + 'px');

    let job = null, page = 0, busy = false;
    const stOf = id => sts[ids.indexOf(id)];
    const pagesOf = id => $$('.bk-page', stOf(id));
    const count = id => pagesOf(id).length + 1;   // page 0 is the title page
    // A page's content is a copy of the job's own page, with ids dropped so the original stays the only one.
    const copy = node => { const c = node.cloneNode(true); c.removeAttribute('id'); $$('[id]', c).forEach(n => n.removeAttribute('id')); return c; };
    const versoFor = (id, p) => {
      const f = document.createDocumentFragment(), plate = mk('div', 'bk-plate');
      if (p === 0) plate.append(mk('div', 'bk-plate__title', $('.cr-sign', stOf(id)).innerHTML));
      else if (pagesOf(id)[p - 1].dataset.kind === 'quote') plate.append(mk('div', 'bk-plate__mark', '“'));
      else plate.append(mk('div', 'bk-plate__num', String(p)));
      f.append(plate, mk('div', 'bk-shade'));
      return f;
    };
    const rectoFor = (id, p) => {
      const f = document.createDocumentFragment(), sheet = mk('div', 'bk-sheet');
      if (p === 0) { const t = mk('div', 'bk-title'); t.append(copy($('.cr-station__identity', stOf(id)))); sheet.append(t); }
      else sheet.append(...copy(pagesOf(id)[p - 1]).childNodes);
      f.append(sheet, mk('div', 'bk-shade'), mk('span', 'bk-folio', String(p * 2 + 1)));
      return f;
    };
    const paint = (el, frag) => el.replaceChildren(frag);
    const setEdges = () => {
      const n = count(job), total = Math.min(3 + n * 0.4, 12);
      const left = Math.max(1, Math.round(total * page / Math.max(1, n - 1)));
      book.style.setProperty('--left', Math.min(left, 10) + 'px');
      book.style.setProperty('--right', Math.min(10, Math.max(1, Math.round(total - left))) + 'px');
      prev.disabled = page === 0; next.disabled = page === n - 1;
      book.toggleAttribute('data-turnable', n > 1);
    };
    const placeSlot = () => {
      if (!job) return;
      const r = spineOf(job).getBoundingClientRect(), pr = shelf.getBoundingClientRect();
      slot.style.left = (r.left - pr.left + shelf.scrollLeft) + 'px'; slot.style.width = r.width + 'px'; slot.style.height = r.height + 'px';
    };
    const animated = () => G && motionOK() && !phone.matches;
    const open = (id, fromShelf) => {
      if (busy || !ids.includes(id) || (id === job && fromShelf)) return;
      job = id; page = 0;
      const line = stOf(id).dataset.line;
      book.dataset.line = line; stage.dataset.line = line;
      $$('.bk-spine', row).forEach(a => a.toggleAttribute('aria-current', a.dataset.go === id));
      placeSlot();
      paint(verso, versoFor(job, 0)); paint(recto, rectoFor(job, 0)); setEdges();
      if (!fromShelf || !G) return;
      if (!animated()) { G.fromTo(book, { opacity: 0 }, { opacity: 1, duration: motionOK() ? 0.26 : 0.18, ease: 'power1.out' }); return; }
      // Pull the book off the shelf, then swing the front board open.
      busy = true;
      const cover = mk('div', 'bk-cover'), front = mk('div', 'bk-cover__front'), back = mk('div', 'bk-cover__back');
      front.append(mk('b', '', $('.cr-sign', stOf(id)).innerHTML), mk('span', '', $('.bk-spine__dates', spineOf(id)).innerHTML));
      back.append(versoFor(job, 0)); cover.append(front, back); book.append(cover);
      const s = spineOf(id).getBoundingClientRect(), bb = book.getBoundingClientRect();
      G.set(verso, { opacity: 0 });
      G.timeline({ onComplete: () => { cover.remove(); busy = false; } })
        .fromTo(book, { x: s.left + s.width / 2 - (bb.left + bb.width * 0.75), y: 40, rotateY: -18, scale: 0.62, opacity: 0 },
          { x: 0, y: 0, rotateY: 0, scale: 1, opacity: 1, duration: 0.62, ease: 'power3.out' })
        .to(cover, { rotateY: -180, duration: 0.9, ease: 'power2.inOut' }, '-=0.08')
        .set(verso, { opacity: 1 }, '-=0.45');
    };
    const turn = dir => {
      const to = page + dir;
      if (busy || !job || to < 0 || to > count(job) - 1) return;
      if (!animated()) {
        page = to;
        const swap = () => { paint(verso, versoFor(job, page)); paint(recto, rectoFor(job, page)); setEdges(); };
        if (!G) return swap();
        busy = true;
        G.to([verso, recto], { opacity: 0, x: motionOK() ? -14 * dir : 0, duration: 0.14, ease: 'power2.in', onComplete: () => {
          swap();
          G.fromTo([verso, recto], { opacity: 0, x: motionOK() ? 14 * dir : 0 }, { opacity: 1, x: 0, duration: 0.22, ease: 'power2.out', onComplete: () => { busy = false; } });
        } });
        return;
      }
      // A real leaf: the recto lifts over the gutter and lands as the next verso (or back again).
      busy = true;
      const leaf = mk('div', 'bk-leaf ' + (dir > 0 ? 'bk-leaf--fwd' : 'bk-leaf--back'));
      const f = mk('div', 'bk-leaf__front'), b = mk('div', 'bk-leaf__back'), df = mk('div', 'bk-leaf__dark'), db = mk('div', 'bk-leaf__dark');
      if (dir > 0) { f.append(...recto.cloneNode(true).childNodes); b.append(versoFor(job, to)); paint(recto, rectoFor(job, to)); }
      else { f.append(...verso.cloneNode(true).childNodes); b.append(rectoFor(job, to)); paint(verso, versoFor(job, to)); }
      f.append(df); b.append(db); leaf.append(f, b); book.append(leaf);
      page = to; setEdges();
      const d = dir > 0 ? 0.78 : 0.6;   // forward turns take their time; going back is quicker
      G.timeline({ onComplete: () => { if (dir > 0) paint(verso, versoFor(job, page)); else paint(recto, rectoFor(job, page)); leaf.remove(); busy = false; } })
        .to(leaf, { rotateY: dir > 0 ? -180 : 180, duration: d, ease: 'power2.inOut' })
        .to(df, { opacity: 0.22, duration: d / 2, ease: 'power1.in' }, 0)
        .fromTo(db, { opacity: 0.22 }, { opacity: 0, duration: d / 2, ease: 'power1.out' }, d / 2);
    };
    row.addEventListener('click', e => {
      const a = e.target.closest('[data-go]');
      if (!a) return;
      e.preventDefault(); open(a.dataset.go, true); history.replaceState(null, '', '#' + a.dataset.go);
    });
    next.addEventListener('click', () => turn(1));
    prev.addEventListener('click', () => turn(-1));
    recto.addEventListener('click', e => { if (!phone.matches && !e.target.closest('a')) turn(1); });
    verso.addEventListener('click', () => { if (!phone.matches) turn(-1); });
    addEventListener('keydown', e => {
      if (e.altKey || e.metaKey || e.ctrlKey || e.target.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowRight') turn(1);
      if (e.key === 'ArrowLeft') turn(-1);
    });
    addEventListener('resize', placeSlot);
    addEventListener('hashchange', () => open(location.hash.slice(1), true));
    // A link to career.html#amazon opens that book settled; otherwise Apple comes off the shelf.
    const deep = ids.includes(location.hash.slice(1));
    open(deep ? location.hash.slice(1) : 'apple', !deep);
    const p = Number(new URLSearchParams(location.search).get('page'));
    if (p > 0) { page = Math.min(p, count(job) - 1); paint(verso, versoFor(job, page)); paint(recto, rectoFor(job, page)); setEdges(); }
  }

  /* ---------- Speaking poster wall: pull a poster forward to read its small print ---------- */
  const wall = $('.sp2');
  if (wall) {
    const posters = $$('.sp2-member', wall);
    let open = null, scrim = null, close = null, home = null;
    const label = el => (el.querySelector('h3')?.textContent || '').trim();
    posters.forEach(p => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'sp2-pull';
      b.setAttribute('aria-label', 'Read ' + label(p));
      b.addEventListener('click', () => pull(p));
      p.append(b);
    });
    const put = () => {
      if (!open) return;
      const p = open; open = null;
      const back = () => { p.classList.remove('is-open'); scrim?.remove(); close?.remove(); document.documentElement.classList.remove('sp2-locked'); home?.focus({ preventScroll: true }); };
      if (G && motionOK()) G.to(p, { scale: 0.94, opacity: 0, duration: 0.18, ease: 'power2.in', onComplete: () => { back(); G.fromTo(p, { scale: 1.04, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.24, ease: 'back.out(2)', clearProps: 'scale,opacity' }); } });
      else back();
    };
    const pull = p => {
      if (open) return;
      home = p.querySelector('.sp2-pull');
      const from = p.getBoundingClientRect();
      open = p;
      scrim = document.createElement('button'); scrim.type = 'button'; scrim.className = 'sp2-scrim'; scrim.setAttribute('aria-label', 'Put it back');
      close = document.createElement('button'); close.type = 'button'; close.className = 'sp2-close'; close.textContent = 'Close';
      scrim.addEventListener('click', put); close.addEventListener('click', put);
      document.body.append(scrim, close);
      document.documentElement.classList.add('sp2-locked');
      p.classList.add('is-open'); p.scrollTop = 0;
      close.focus({ preventScroll: true });
      if (G && motionOK()) {
        // Peel it off the wall: it starts where it hung and swings to the centre.
        const to = p.getBoundingClientRect();
        G.fromTo(p, { x: from.left - to.left, y: from.top - to.top, scale: from.width / to.width, rotate: -3, transformOrigin: '50% 0%' },
          { x: 0, y: 0, scale: 1, rotate: 0, duration: 0.55, ease: 'expo.out', clearProps: 'transform' });
        G.fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: 0.26, ease: 'power1.out' });
      }
    };
    addEventListener('keydown', e => { if (e.key === 'Escape') put(); });
  }

  window.__transit = { G, $, $$, motionOK, nearest, makeTrain, visible };
  window.__SITE_READY__ = true;
  document.documentElement.dataset.siteReady = 'true';
})();

// ---- speaking topics: "I need my [audience] to [need]." lifts the best-matching talk forward ----
(() => {
  const ts = document.querySelector('[data-ts]');
  if (!ts) return;
  const groups = [...ts.querySelectorAll('.ts__group')];
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const select = (label, options) => {
    const field = el('span', 'ts__field');
    const s = el('select', 'ts__pick');
    s.setAttribute('aria-label', label);
    options.forEach(([value, text]) => s.append(new Option(text, value)));
    field.append(s);
    return [field, s];
  };
  const [audField, aud] = select('Who is in the room', [['exec', 'executives'], ['eng', 'engineering leaders'], ['teams', 'teams']]);
  const [needField, need] = select('What they need', groups.map((g) => [g.dataset.need, g.querySelector('.ts__need').textContent]));
  const sentence = el('p', 'ts__sentence');
  const tail = el('span', 'ts__tail');
  tail.append(needField, '.');
  sentence.append('I need my ', audField, ' to ', tail);
  const lead = el('div', 'ts__lead');
  const alts = el('div', 'ts__alts');
  const stage = el('div', 'ts__stage');
  const side = el('div', 'ts__side');
  side.append(alts);
  stage.append(lead, side);
  side.append(ts.querySelector('.ts__custom'));
  ts.prepend(sentence, stage);
  const show = (talk) => {
    const card = talk.cloneNode(true);
    card.removeAttribute('data-content-unit');
    const book = el('a', 'ts__book', 'Book a talk');
    book.href = 'mailto:sairambkrishnan@gmail.com?subject=' + encodeURIComponent('Talk: ' + talk.querySelector('.ts__title').textContent);
    const proof = card.querySelector('.ts__proof');
    const first = (talk.dataset.clients || '').split(' ').filter(Boolean)[0];
    const poster = first && document.getElementById(first);
    if (proof && poster) {
      // The proof opens the client's own card on the wall.
      const link = el('a', '', proof.textContent);
      link.href = '#' + first;
      link.addEventListener('click', (e) => { e.preventDefault(); poster.querySelector('.sp2-pull')?.click(); });
      proof.replaceChildren(link);
    }
    lead.replaceChildren(...card.children, book);
    lead.classList.remove('is-new'); void lead.offsetWidth; lead.classList.add('is-new');
  };
  const update = (first) => {
    const group = groups.find((g) => g.dataset.need === need.value);
    const talks = [...group.querySelectorAll('.ts__talk')].sort((a, b) => a.dataset.rank - b.dataset.rank);
    const fit = talks.filter((t) => t.dataset.aud.split(' ').includes(aud.value));
    const pool = fit.length ? fit : talks;
    const top = first && pool.includes(first) ? first : pool[0];
    show(top);
    alts.replaceChildren(...pool.filter((t) => t !== top).slice(0, 3).map((t) => {
      const b = el('button', 'ts__alt');
      b.type = 'button';
      b.append(el('b', '', t.querySelector('.ts__title').textContent), el('span', '', t.querySelector('.ts__promise').textContent));
      b.addEventListener('click', () => update(t));
      return b;
    }));
  };
  aud.addEventListener('change', () => update());
  need.addEventListener('change', () => update());
  groups.forEach((g) => g.querySelectorAll('.ts__talk').forEach((t) => {
    t.tabIndex = 0;
    const pick = () => {
      need.value = g.dataset.need;
      if (!t.dataset.aud.split(' ').includes(aud.value)) aud.value = t.dataset.aud.split(' ')[0];
      update(t);
      sentence.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    };
    t.addEventListener('click', pick);
    t.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
  }));
  ts.classList.add('is-js');
  update();
})();

// ---- page switcher: close it on an outside click or Escape ----
(() => {
  const pages = document.querySelector('[data-pages]');
  if (!pages) return;
  document.addEventListener('click', (e) => { if (pages.open && !pages.contains(e.target)) pages.open = false; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pages.open) { pages.open = false; pages.querySelector('summary').focus(); }
  });
})();

