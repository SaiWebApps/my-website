type Kind = 'work' | 'school' | 'aspect';

type SimNode = {
  id: string;
  parent?: string;
  kind: Kind;
  time: number;
  lane: number;
  el: SVGGElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number;
  fy?: number;
  hw: number;
  top: number;
  bottom: number;
  entered: boolean;
};

type SimEdge = { id: string; from: SimNode; to: SimNode; el: SVGGElement; line: SVGLineElement; hit: SVGLineElement; label: SVGTextElement };

type Options = { initial: string; onSelect: (id: string) => void };

const DESKTOP = { w: 1200, h: 620, pad: 80 };
const MOBILE = { w: 420, h: 1000, pad: 60 };

export function mountCareerGraph(root: HTMLElement, options: Options) {
  const svg = root.querySelector('svg')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = matchMedia('(max-width: 720px)');

  const nodes: SimNode[] = [...root.querySelectorAll<SVGGElement>('.cg-node')].map(el => ({
    id: el.dataset.entry!,
    parent: el.dataset.parent || undefined,
    kind: el.dataset.kind as Kind,
    time: Number(el.dataset.time),
    lane: Number(el.dataset.lane),
    el,
    x: 0, y: 0, vx: 0, vy: 0,
    hw: 20, top: 20, bottom: 20,
    entered: false,
  }));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const edges: SimEdge[] = [...root.querySelectorAll<SVGGElement>('.cg-edge')].map(el => ({
    id: el.dataset.entry!,
    from: byId.get(el.dataset.from!)!,
    to: byId.get(el.dataset.entry!)!,
    el,
    line: el.querySelector('.cg-edge-line')!,
    hit: el.querySelector('.cg-edge-hit')!,
    label: root.querySelector<SVGTextElement>(`.cg-edge-label[data-entry="${el.dataset.entry}"]`)!,
  }));
  const order = [...nodes].sort((a, b) => a.time - b.time);

  let box = narrow.matches ? MOBILE : DESKTOP;
  let vertical = narrow.matches;
  let alpha = 0;
  let frame = 0;
  let started = false;
  let selected = '';

  function applyBox() {
    box = narrow.matches ? MOBILE : DESKTOP;
    vertical = narrow.matches;
    svg.setAttribute('viewBox', `0 0 ${box.w} ${box.h}`);
  }

  function measure() {
    for (const node of nodes) {
      const text = node.el.querySelector<SVGTextElement>('.cg-label')!;
      let width = 0;
      try { width = text.getBBox().width; } catch { /* not rendered yet */ }
      if (!width) width = (text.textContent ?? '').length * 8;
      const dot = node.kind === 'aspect' ? 13 : 17;
      node.hw = Math.max(dot, width / 2) + 10;
      node.top = dot + 6;
      node.bottom = dot + 26;
    }
  }

  function targets(node: SimNode, times: { min: number; max: number; count: number }) {
    const long = vertical ? box.h : box.w;
    const cross = vertical ? box.w : box.h;
    const usable = long - box.pad * 2;
    const span = times.count < 2 ? 0 : usable * (0.3 + 0.7 * (times.count - 1) / (nodes.length - 1));
    const t = times.max > times.min ? (node.time - times.min) / (times.max - times.min) : 0.5;
    const along = long / 2 + (t - 0.5) * span;
    const across = cross / 2 + node.lane * cross * (vertical ? 0.3 : 0.28);
    return vertical ? { x: across, y: along } : { x: along, y: across };
  }

  function tick() {
    const live = nodes.filter(node => node.entered);
    const times = live.reduce((acc, node) => ({ min: Math.min(acc.min, node.time), max: Math.max(acc.max, node.time), count: acc.count + 1 }), { min: Infinity, max: -Infinity, count: 0 });

    for (const node of live) {
      const target = targets(node, times);
      node.vx += (target.x - node.x) * (vertical ? 0.03 : 0.07) * alpha;
      node.vy += (target.y - node.y) * (vertical ? 0.07 : 0.03) * alpha;
    }

    for (const edge of edges) {
      if (!edge.from.entered || !edge.to.entered) continue;
      const rest = edge.to.kind === 'aspect' ? 130 : 150;
      const dx = edge.to.x - edge.from.x;
      const dy = edge.to.y - edge.from.y;
      const d = Math.hypot(dx, dy) || 1;
      const k = ((d - rest) / d) * 0.12 * alpha;
      edge.to.vx -= dx * k; edge.to.vy -= dy * k;
      edge.from.vx += dx * k * 0.5; edge.from.vy += dy * k * 0.5;
    }

    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        const dx = b.x - a.x || 0.01;
        const dy = b.y - a.y || 0.01;
        const d2 = Math.max(dx * dx + dy * dy, 400);
        const f = (7000 * alpha) / d2;
        const d = Math.sqrt(d2);
        a.vx -= (dx / d) * f; a.vy -= (dy / d) * f;
        b.vx += (dx / d) * f; b.vy += (dy / d) * f;
      }
    }

    for (const node of live) {
      if (node.fx !== undefined) { node.x = node.fx; node.y = node.fy!; node.vx = node.vy = 0; continue; }
      node.vx *= 0.6; node.vy *= 0.6;
      node.x += node.vx; node.y += node.vy;
    }

    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i], b = live[j];
          const ox = a.hw + b.hw - Math.abs(b.x - a.x);
          const oy = (b.y > a.y ? a.bottom + b.top : b.bottom + a.top) - Math.abs(b.y - a.y);
          if (ox <= 0 || oy <= 0) continue;
          const wa = a.fx !== undefined ? 0 : b.fx !== undefined ? 1 : 0.5;
          const wb = 1 - wa;
          if (ox < oy) {
            const s = Math.sign(b.x - a.x) || 1;
            a.x -= s * ox * wb; b.x += s * ox * wa;
          } else {
            const s = Math.sign(b.y - a.y) || 1;
            a.y -= s * oy * wb; b.y += s * oy * wa;
          }
        }
      }
    }

    for (const node of live) {
      node.x = Math.min(box.w - node.hw, Math.max(node.hw, node.x));
      node.y = Math.min(box.h - node.bottom, Math.max(node.top, node.y));
    }

    alpha += (0 - alpha) * 0.012;
  }

  function render() {
    for (const node of nodes) {
      if (node.entered) node.el.setAttribute('transform', `translate(${node.x.toFixed(1)} ${node.y.toFixed(1)})`);
    }
    for (const edge of edges) {
      if (!edge.to.entered) continue;
      for (const line of [edge.line, edge.hit]) {
        line.setAttribute('x1', edge.from.x.toFixed(1));
        line.setAttribute('y1', edge.from.y.toFixed(1));
        line.setAttribute('x2', edge.to.x.toFixed(1));
        line.setAttribute('y2', edge.to.y.toFixed(1));
      }
      const flat = Math.abs(edge.to.x - edge.from.x) > Math.abs(edge.to.y - edge.from.y);
      const mx = ((edge.from.x + edge.to.x) / 2 + (flat ? 0 : 12)).toFixed(1);
      edge.label.setAttribute('text-anchor', flat ? 'middle' : 'start');
      edge.label.setAttribute('y', ((edge.from.y + edge.to.y) / 2 - (flat ? 24 : 6)).toFixed(1));
      edge.label.querySelectorAll('tspan').forEach(span => span.setAttribute('x', mx));
    }
  }

  let last = 0;
  function loop(now: number) {
    const steps = last ? Math.min(12, Math.max(1, Math.round((now - last) / 16.7))) : 1;
    last = now;
    for (let i = 0; i < steps && alpha > 0.004; i++) tick();
    render();
    frame = alpha > 0.004 ? requestAnimationFrame(loop) : 0;
    if (!frame) last = 0;
  }

  function heat(value: number) {
    alpha = Math.max(alpha, value);
    if (!frame && !reduced) frame = requestAnimationFrame(loop);
  }

  function enter(node: SimNode) {
    const parent = node.parent ? byId.get(node.parent) : undefined;
    const jitter = () => (Math.random() - 0.5) * 30;
    node.x = parent ? parent.x + jitter() : box.w / 2;
    node.y = parent ? parent.y + jitter() : box.h / 2;
    node.entered = true;
    node.el.classList.add('is-in');
    edges.forEach(edge => edge.label.classList.toggle('is-fresh', edge.to === node));
    edges.find(edge => edge.to === node)?.el.classList.add('is-in');
    render();
  }

  function highlight(id: string) {
    const lineage = new Set<string>();
    for (let node = byId.get(id); node; node = node.parent ? byId.get(node.parent) : undefined) lineage.add(node.id);
    root.classList.toggle('has-selection', Boolean(id));
    for (const node of nodes) {
      node.el.classList.toggle('is-on', lineage.has(node.id));
      node.el.classList.toggle('is-selected', node.id === id);
      node.el.setAttribute('aria-pressed', String(node.id === id));
    }
    for (const edge of edges) {
      edge.el.classList.toggle('is-on', lineage.has(edge.id));
      edge.label.classList.toggle('is-current', edge.id === id);
    }
  }

  function select(id: string) {
    if (!byId.has(id)) return;
    selected = id;
    if (started) highlight(id);
  }

  function choose(id: string) {
    select(id);
    options.onSelect(id);
  }

  function start() {
    if (started) return;
    started = true;
    root.classList.add('is-running');
    measure();
    const finish = () => {
      root.classList.add('is-settled');
      edges.forEach(edge => edge.label.classList.remove('is-fresh'));
      highlight(selected || options.initial);
    };
    if (reduced) {
      order.forEach(enter);
      alpha = 1;
      for (let i = 0; i < 600; i++) tick();
      render();
      finish();
      return;
    }
    const origin = order[0];
    enter(origin);
    origin.el.classList.add('is-seed');
    setTimeout(() => {
      origin.el.classList.remove('is-seed');
      heat(0.5);
      order.slice(1).forEach((node, i) => setTimeout(() => {
        enter(node);
        heat(0.8);
        if (i === order.length - 2) setTimeout(finish, 400);
      }, 700 + i * 620));
    }, 1500);
  }

  let drag: { node: SimNode; x: number; y: number; moved: boolean } | null = null;
  let suppressClick = false;
  const toSvg = (event: PointerEvent) => {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: point.x, y: point.y };
  };

  for (const node of nodes) {
    node.el.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' || event.button !== 0) return;
      drag = { node, x: event.clientX, y: event.clientY, moved: false };
      node.el.setPointerCapture(event.pointerId);
    });
    node.el.addEventListener('pointermove', event => {
      if (!drag || drag.node !== node) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
      drag.moved = true;
      const p = toSvg(event);
      node.fx = p.x; node.fy = p.y;
      root.classList.add('is-dragging');
      heat(0.3);
      if (reduced) { tick(); render(); }
    });
    const release = () => {
      if (!drag || drag.node !== node) return;
      suppressClick = drag.moved;
      node.fx = node.fy = undefined;
      drag = null;
      root.classList.remove('is-dragging');
      heat(0.15);
    };
    node.el.addEventListener('pointerup', release);
    node.el.addEventListener('pointercancel', release);
  }

  for (const edge of edges) {
    const show = (on: boolean) => () => edge.label.classList.toggle('is-hover', on);
    edge.el.addEventListener('pointerenter', show(true));
    edge.el.addEventListener('pointerleave', show(false));
    edge.el.addEventListener('focus', show(true));
    edge.el.addEventListener('blur', show(false));
  }

  for (const el of [...nodes.map(node => node.el), ...edges.map(edge => edge.el)]) {
    el.addEventListener('click', () => {
      if (suppressClick) { suppressClick = false; return; }
      choose(el.dataset.entry!);
    });
    el.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      choose(el.dataset.entry!);
    });
  }

  narrow.addEventListener('change', () => {
    const from = box;
    applyBox();
    for (const node of nodes) {
      const fx = node.x / from.w, fy = node.y / from.h;
      node.x = (vertical ? fy : fx) * box.w;
      node.y = (vertical ? fx : fy) * box.h;
    }
    measure();
    if (reduced) { alpha = 1; for (let i = 0; i < 600; i++) tick(); render(); }
    else heat(0.9);
  });

  applyBox();
  document.fonts?.ready.then(() => { if (started) measure(); });

  const visible = () => root.getClientRects().length > 0;
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && visible()) { io.disconnect(); start(); }
    }, { threshold: 0.3 });
    io.observe(root);
  } else if (visible()) start();

  return {
    select,
    resume() {
      if (!started) return;
      measure();
      heat(0.2);
    },
  };
}
