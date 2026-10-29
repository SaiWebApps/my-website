// Transit map renderer: 45/90 polylines with rounded bends, line-colour ticks,
// interchange rings, terminus bars, and HTML labels positioned in % of the viewBox.
export const C = {
  red: '#E2231A', blue: '#0070C0', green: '#00A651', orange: '#F7941D',
  purple: '#7B3F98', yellow: '#FFD200', black: '#1A1A1A',
};

const norm = (dx, dy) => { const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
const f = n => +n.toFixed(1);

export function pathD(pts, r = 22) {
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const [ax, ay] = norm(px - pts[i - 1][0], py - pts[i - 1][1]);
    const [bx, by] = norm(pts[i + 1][0] - px, pts[i + 1][1] - py);
    const lin = Math.hypot(px - pts[i - 1][0], py - pts[i - 1][1]);
    const lout = Math.hypot(pts[i + 1][0] - px, pts[i + 1][1] - py);
    const rr = Math.min(r, lin / 2, lout / 2);
    d += ` L${f(px - ax * rr)} ${f(py - ay * rr)} Q${f(px)} ${f(py)} ${f(px + bx * rr)} ${f(py + by * rr)}`;
  }
  const l = pts[pts.length - 1];
  return d + ` L${f(l[0])} ${f(l[1])}`;
}

// Station marks. dir = unit-ish vector pointing to the label side.
function tick(s, line) {
  const [dx, dy] = norm(...s.dir);
  const w = line.w;
  const len = w * 0.5 + w * 0.75;
  return `<line class="tk" data-line="${line.id}" x1="${f(s.at[0])}" y1="${f(s.at[1])}" x2="${f(s.at[0] + dx * len)}" y2="${f(s.at[1] + dy * len)}" stroke="${line.color}" stroke-width="${f(w * 0.62)}" stroke-linecap="butt"/>`;
}
function terminus(s, line) {
  const [dx, dy] = norm(...s.dir);
  const len = line.w * 1.25;
  return `<line class="tk" data-line="${line.id}" x1="${f(s.at[0] - dx * len)}" y1="${f(s.at[1] - dy * len)}" x2="${f(s.at[0] + dx * len)}" y2="${f(s.at[1] + dy * len)}" stroke="${line.color}" stroke-width="${f(line.w * 0.75)}"/>`;
}
function ring(s, r) {
  return `<circle class="ix" cx="${f(s.at[0])}" cy="${f(s.at[1])}" r="${r}" fill="#fff" stroke="#1A1A1A" stroke-width="${f(r * 0.36)}"/>`;
}
function capsule(a, b, r) {
  return `<line class="ix" x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="#1A1A1A" stroke-width="${f(r * 2 + r * 0.72)}" stroke-linecap="round"/><line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="#fff" stroke-width="${f(r * 2)}" stroke-linecap="round"/>`;
}

const anchors = {
  n: 'translate(-50%,-100%)', s: 'translate(-50%,0)', e: 'translate(0,-50%)', w: 'translate(-100%,-50%)',
  c: 'translate(-50%,-50%)', ne: 'translate(0,-100%)', nw: 'translate(-100%,-100%)', se: 'translate(0,0)', sw: 'translate(-100%,0)',
};
const align = { c: 'center', n: 'center', s: 'center', e: 'left', w: 'right', ne: 'left', nw: 'right', se: 'left', sw: 'right' };

export function renderMap(spec) {
  const { W, H, lines, extras = '', cls = '', labelTag = 'a', id = '', hub } = spec;
  let svg = `<svg class="map__svg" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">`;
  svg += extras.before || '';
  // casing pass, then lines, so crossings read as over/under
  for (const L of lines) {
    for (const seg of L.segs || [L.pts]) svg += `<path class="cs" d="${pathD(seg, L.r)}" fill="none" stroke="#FAFAF7" stroke-width="${L.w + 8}" stroke-linejoin="round"/>`;
  }
  for (const L of lines) {
    const segs = L.segs || [L.pts];
    segs.forEach((seg, i) => {
      const dash = L.dash && L.dash[i] ? ` stroke-dasharray="${L.dash[i]}"` : '';
      const href = L.href ? ` data-href="${L.href}"` : '';  // double-click the line to open its page
      const outline = L.casing ? `<path class="ln-case" data-line="${L.id}"${href} d="${pathD(seg, L.r)}" fill="none" stroke="#1A1A1A" stroke-width="${L.w + 3}" stroke-linejoin="round"${dash}/>` : '';
      svg += `${outline}<path class="ln" id="${L.id}${segs.length > 1 ? '-' + i : ''}-path${id}" data-line="${L.id}"${href} d="${pathD(seg, L.r)}" fill="none" stroke="${L.color}" stroke-width="${L.w}" stroke-linejoin="round"${dash}/>`;
    });
    if (L.extra) svg += L.extra;
  }
  let marks = '';
  let labels = '';
  for (const L of lines) {
    for (const s of L.stations || []) {
      if (s.kind === 'tick') marks += tick(s, L);
      if (s.kind === 'end') marks += terminus(s, L);
    }
  }
  svg += marks;
  for (const L of lines) for (const s of L.stations || []) {
    if (s.kind === 'ix') svg += ring(s, s.r || 13);
    if (s.kind === 'cap') svg += capsule(s.at, s.to, s.r || 12);
  }
  svg += extras.after || '';
  svg += `</svg>`;
  for (const L of lines) for (const s of L.stations || []) {
    if (!s.label) continue;
    const lb = s.label;
    const x = (s.at[0] + (lb.dx || 0)) / W * 100;
    const y = (s.at[1] + (lb.dy || 0)) / H * 100;
    const tag = lb.href ? 'a' : (lb.button ? 'button' : 'span');
    const attrs = lb.href ? ` href="${lb.href}"` : (lb.button ? ` type="button" data-stop="${lb.button}"` : '');
    const cl = `stn${lb.big ? ' stn--big' : ''}${lb.cls ? ' ' + lb.cls : ''}`;
    // A face fills the interchange ring: the label box is the ring's outer circle, the photo its white inside.
    let face = '', size = '';
    if (lb.face) {
      const r = s.r || 13, sw = r * 0.36, cq = n => +(n / W * 100).toFixed(3);
      face = `<img class="stn__face" src="${lb.face}" alt="" width="96" height="96">`;
      size = `;--d:${cq(2 * r + sw)}cqi;--p:${cq(sw)}cqi`;
    }
    labels += `<${tag} class="${cl}" data-line="${lb.line || L.id}" data-x="${f(s.at[0])}" data-y="${f(s.at[1])}"${attrs} style="left:${f(x)}%;top:${f(y)}%;transform:${anchors[lb.a || 's']};text-align:${align[lb.a || 's']}${size}">${face}<span class="stn__name">${lb.text}</span>${lb.sub ? `<span class="stn__sub">${lb.sub}</span>` : ''}</${tag}>`;
  }
  return `<div class="map ${cls}"${hub ? ` data-hub="${hub}"` : ''} style="aspect-ratio:${W}/${H}">${svg}${labels}</div>`;
}

// Replace content between <!--gen:name--> and <!--/gen:name--> in a file.
import { readFileSync, writeFileSync } from 'node:fs';
export function inject(file, name, html) {
  const src = readFileSync(file, 'utf8');
  const a = `<!--gen:${name}-->`, b = `<!--/gen:${name}-->`;
  const i = src.indexOf(a), j = src.indexOf(b);
  if (i < 0 || j < 0) throw new Error(`markers for ${name} missing in ${file}`);
  writeFileSync(file, src.slice(0, i + a.length) + html + src.slice(j));
}
