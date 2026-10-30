import { C, renderMap, inject } from './lib.mjs';

const DIR = new URL('..', import.meta.url).pathname;
const S = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], ul: [-1, -1], ur: [1, -1], dl: [-1, 1], dr: [1, 1] };

// Stadium balloon loop appended to a path that ends at (x, yBottom) heading up.
const loop = (x, yb, w, h) => {
  const r = h / 2, hw = w / 2 - r;
  return ` H${x + hw} A${r} ${r} 0 0 0 ${x + hw} ${yb - h} H${x - hw} A${r} ${r} 0 0 0 ${x - hw} ${yb} H${x}`;
};

/* ---------------- Home, desktop ---------------- */
export const homeD = {
  W: 1440, H: 960, cls: 'map--home map--wide', id: '-d', hub: [800, 420],
  lines: [
    { id: 'purple', color: C.purple, w: 14, pts: [[90, 660], [90, 800], [170, 880], [720, 880]],
      stations: [
        { kind: 'cap', at: [280, 880], to: [400, 880], r: 12, label: { text: 'Drone-Megaddon 2014', sub: 'Command a drone swarm like StarCraft', href: 'research.html#drone-megaddon', dy: 26 } },
        { kind: 'none', at: [400, 880], label: { text: 'Drone-Megaddon 2026', sub: 'Speak to the swarm, approve each command', href: 'research.html#drone-megaddon-2026', a: 'n', dy: -24 } },
        { kind: 'tick', at: [540, 880], dir: S.down, label: { text: 'Who Trains the Next Senior?', sub: 'Code is cheap; verifying it is not', href: 'research.html#who-trains-the-next-senior', dy: 26 } },
        { kind: 'tick', at: [660, 880], dir: S.up, label: { text: 'AI ROI Framework', sub: 'Which AI projects to fund, and when', href: 'research.html#ai-roi', a: 'n', dy: -24 } },
        { kind: 'end', at: [720, 880], dir: S.down, label: { text: 'Research', href: 'research.html', a: 'e', dx: 24, big: true } },
      ] },
    { id: 'orange', color: C.orange, w: 14, pts: [[200, 720], [500, 720], [800, 420], [800, 168]], loop: [800, 168, 132, 96],
      stations: [
        { kind: 'end', at: [200, 720], dir: S.down, label: { text: 'Jacobson Strategic', href: 'speaking.html#jacobson-strategic', dy: 26 } },
        { kind: 'tick', at: [295, 720], dir: S.up, label: { text: 'HP', href: 'speaking.html#hp', a: 'n', dy: -20 } },
        { kind: 'tick', at: [375, 720], dir: S.down, label: { text: 'Morgan Lewis', href: 'speaking.html#morgan-lewis', dy: 20 } },
        { kind: 'tick', at: [460, 720], dir: S.down, label: { text: 'PBS', href: 'speaking.html#pbs', dy: 20 } },
        { kind: 'tick', at: [630, 590], dir: S.dr, label: { text: 'Philadelphia Eagles', href: 'speaking.html#eagles', a: 'e', dx: 22 } },
        { kind: 'tick', at: [700, 520], dir: S.dr, label: { text: 'Sonova', href: 'speaking.html#sonova', a: 'e', dx: 22 } },
        { kind: 'ix', at: [748, 472], r: 15, label: { text: 'Praxtera AI Institute', href: 'speaking.html#praxtera', a: 'w', dx: -24 } },
        { kind: 'tick', at: [800, 300], dir: S.left, label: { text: 'Atos', href: 'speaking.html#atos', a: 'w', dx: -22 } },
        { at: [800, 120], label: { text: 'Speaking', href: 'speaking.html', a: 'e', dx: 92, big: true } },
      ] },
    { id: 'green', color: C.green, w: 14, pts: [[800, 420], [800, 700], [880, 780], [1300, 780]],
      stations: [
        { kind: 'tick', at: [840, 740], dir: S.dl, label: { text: 'Persuaider', sub: 'AI negotiation practice', href: 'projects.html#persuaider', a: 'w', dx: -22 } },
        { kind: 'tick', at: [950, 780], dir: S.down, label: { text: 'Ondoway', sub: 'AI walking tours, in private beta', href: 'projects.html#ondoway', dy: 22 } },
        { kind: 'tick', at: [1040, 780], dir: S.up, label: { text: 'Gestiq', sub: 'Hand-gesture control for the Mac', href: 'projects.html#gestiq', a: 'n', dy: -22 } },
        { kind: 'tick', at: [1140, 780], dir: S.down, label: { text: 'Lore', sub: 'Dependency checks for AI coding agents', href: 'projects.html#lore', dy: 22 } },
        { kind: 'tick', at: [1230, 780], dir: S.up, label: { text: 'Crucible', sub: 'Workflows that make AI agents show their work', href: 'projects.html#crucible', a: 'n', dy: -22 } },
        { kind: 'end', at: [1300, 780], dir: S.down, label: { text: 'Projects', href: 'projects.html', a: 'e', dx: 24, big: true } },
      ] },
    { id: 'blue', color: C.blue, w: 14, segs: [
        [[800, 420], [960, 580], [970, 580], [1010, 540], [1200, 540], [1240, 580], [1390, 580]],
        [[960, 580], [970, 580], [1010, 620], [1200, 620], [1240, 580], [1250, 580]],
      ],
      stations: [
        { kind: 'tick', at: [1030, 540], dir: S.up, label: { text: 'Fit Call', href: 'services.html#fit', a: 'n', dy: -20 } },
        { kind: 'tick', at: [1110, 540], dir: S.up, label: { text: 'Architecture<br>Call', href: 'services.html#call', a: 'n', dy: -20 } },
        { kind: 'tick', at: [1185, 540], dir: S.up, label: { text: 'Design<br>Review', href: 'services.html#review', a: 'n', dy: -20 } },
        { kind: 'tick', at: [1030, 620], dir: S.down, label: { text: 'Keynote', href: 'services.html#keynote', dy: 20 } },
        { kind: 'tick', at: [1110, 620], dir: S.down, label: { text: 'Masterclass', href: 'services.html#masterclass', dy: 20 } },
        { kind: 'tick', at: [1185, 620], dir: S.down, label: { text: 'AI ROI<br>Review', href: 'services.html#roi', dy: 20 } },
        { kind: 'ix', at: [1260, 580], r: 13, label: { text: 'Advisory<br>Retainer', href: 'services.html#retainer', dy: 22 } },
        { kind: 'tick', at: [1350, 580], dir: S.down, label: { text: 'Fractional<br>CTO', href: 'services.html#cto', dy: 20 } },
        { kind: 'end', at: [1390, 580], dir: S.down, label: { text: 'Services', href: 'services.html', a: 'nw', dx: 10, dy: -28, big: true } },
      ] },
    { id: 'black', color: C.black, w: 14, pts: [[800, 420], [960, 260]],
      stations: [
        { kind: 'end', at: [960, 260], dir: S.dr, label: { text: 'Contact', href: 'contact.html', a: 'e', dx: 26, big: true } },
      ] },
    { id: 'red', color: C.red, w: 18, segs: [
        [[90, 600], [300, 600], [480, 420], [1110, 420], [1290, 240], [1390, 240]],
        [[880, 420], [940, 360], [1020, 360], [1080, 420]],
      ],
      stations: [
        { kind: 'cap', at: [90, 600], to: [90, 660], r: 13, label: { text: 'Carnegie Mellon', href: 'career.html#cmu', a: 'ne', dx: -16, dy: -30 } },
        { kind: 'tick', at: [275, 600], dir: S.up, label: { text: 'Microsoft', href: 'career.html#microsoft', a: 'n', dy: -30 } },
        { kind: 'tick', at: [390, 510], dir: S.dr, label: { text: 'Susquehanna (SIG)', href: 'career.html#sig', a: 'se', dx: 20, dy: 8 } },
        { kind: 'tick', at: [580, 420], dir: S.down, label: { text: 'Amazon Alexa', href: 'career.html#amazon', dy: 26 } },
        // He is the centre: every line runs through him. The face opens the card; without script it links home.
        { kind: 'ix', at: [800, 420], r: 36, label: { text: 'Sairam Krishnan', href: 'index.html', a: 'c', big: true, cls: 'stn--hub stn--me stn--me-nw', face: '/public/assets/portrait-2026-mobile.webp' } },
        // Apple and the MBA side by side: two tracks at once, the MBA rejoining because it finished.
        { kind: 'tick', at: [980, 420], dir: S.down, label: { text: 'Apple', href: 'career.html#apple', dy: 26 } },
        { kind: 'tick', at: [980, 360], dir: S.up, label: { text: 'Wharton Executive MBA', href: 'career.html#wharton', a: 'n', dy: -24 } },
        { kind: 'end', at: [1390, 240], dir: S.down, label: { text: 'Career', href: 'career.html', a: 'nw', dx: 10, dy: -30, big: true } },
      ] },
  ],
};

/* ---------------- Home, phone ---------------- */
export const homeM = {
  W: 390, H: 1070, cls: 'map--home map--tall', id: '-m', hub: [220, 250],
  lines: [
    { id: 'purple', color: C.purple, w: 10, pts: [[20, 520], [20, 610]],
      stations: [
        { kind: 'end', at: [20, 610], dir: S.right, label: { text: 'Research', href: 'research.html', a: 'e', dx: 16, big: true } },
      ] },
    { id: 'orange', color: C.orange, w: 10, pts: [[200, 1015], [200, 140]], loop: [200, 140, 104, 76],
      stations: [
        { kind: 'end', at: [200, 1015], dir: S.right, label: { text: 'Jacobson Strategic', href: 'speaking.html#jacobson-strategic', a: 'e', dx: 18 } },
        { kind: 'tick', at: [200, 970], dir: S.right, label: { text: 'HP', href: 'speaking.html#hp', a: 'e', dx: 18 } },
        { kind: 'tick', at: [200, 925], dir: S.right, label: { text: 'Morgan Lewis', href: 'speaking.html#morgan-lewis', a: 'e', dx: 18 } },
        { kind: 'tick', at: [200, 880], dir: S.right, label: { text: 'PBS', href: 'speaking.html#pbs', a: 'e', dx: 18 } },
        { kind: 'tick', at: [200, 835], dir: S.right, label: { text: 'Philadelphia Eagles', href: 'speaking.html#eagles', a: 'e', dx: 18 } },
        { kind: 'tick', at: [200, 790], dir: S.right, label: { text: 'Sonova', href: 'speaking.html#sonova', a: 'e', dx: 18 } },
        { kind: 'ix', at: [200, 740], r: 11, label: { text: 'Praxtera AI Institute', href: 'speaking.html#praxtera', a: 'e', dx: 18 } },
        { kind: 'tick', at: [200, 190], dir: S.left, label: { text: 'Atos', href: 'speaking.html#atos', a: 'w', dx: -16 } },
        { at: [200, 102], label: { text: 'Speaking', href: 'speaking.html', a: 'w', dx: -64, big: true } },
      ] },
    { id: 'green', color: C.green, w: 10, pts: [[240, 250], [240, 320], [290, 370], [290, 640]],
      stations: [
        { kind: 'tick', at: [290, 420], dir: S.right, label: { text: 'Ondoway', href: 'projects.html#ondoway', a: 'e', dx: 16 } },
        { kind: 'tick', at: [290, 465], dir: S.right, label: { text: 'Persuaider', href: 'projects.html#persuaider', a: 'e', dx: 16 } },
        { kind: 'tick', at: [290, 510], dir: S.right, label: { text: 'Gestiq', href: 'projects.html#gestiq', a: 'e', dx: 16 } },
        { kind: 'tick', at: [290, 555], dir: S.right, label: { text: 'Lore', href: 'projects.html#lore', a: 'e', dx: 16 } },
        { kind: 'tick', at: [290, 600], dir: S.right, label: { text: 'Crucible', href: 'projects.html#crucible', a: 'e', dx: 16 } },
        { kind: 'end', at: [290, 640], dir: S.right, label: { text: 'Projects', href: 'projects.html', dy: 22, big: true } },
      ] },
    { id: 'blue', color: C.blue, w: 10, pts: [[240, 250], [300, 310], [370, 310]],
      stations: [
        { kind: 'end', at: [370, 310], dir: S.down, label: { text: 'Services', href: 'services.html', a: 'nw', dx: 8, dy: -18, big: true } },
      ] },
    { id: 'black', color: C.black, w: 10, pts: [[200, 250], [160, 210], [40, 210]],
      stations: [
        { kind: 'end', at: [40, 210], dir: S.down, label: { text: 'Contact', href: 'contact.html', a: 'ne', dx: -6, dy: -16, big: true } },
      ] },
    { id: 'red', color: C.red, w: 13, segs: [[[20, 520], [20, 250], [280, 250], [330, 200], [330, 52]], [[330, 198], [305, 173], [305, 105], [330, 80]]],
      stations: [
        { kind: 'ix', at: [20, 520], r: 11, label: { text: 'Carnegie Mellon', href: 'career.html#cmu', a: 'e', dx: 18 } },
        { kind: 'tick', at: [20, 460], dir: S.right, label: { text: 'Microsoft', href: 'career.html#microsoft', a: 'e', dx: 16 } },
        { kind: 'tick', at: [20, 400], dir: S.right, label: { text: 'Susquehanna (SIG)', href: 'career.html#sig', a: 'e', dx: 16 } },
        { kind: 'tick', at: [20, 340], dir: S.right, label: { text: 'Amazon Alexa', href: 'career.html#amazon', a: 'e', dx: 16 } },
        { kind: 'ix', at: [220, 250], r: 24, label: { text: 'Sairam Krishnan', href: 'index.html', a: 'c', big: true, cls: 'stn--hub stn--me stn--me-sw', face: '/public/assets/portrait-2026-mobile.webp' } },
        { kind: 'tick', at: [262, 250], dir: S.up, label: { text: 'Apple', href: 'career.html#apple', a: 'n', dy: -18 } },
        { kind: 'tick', at: [305, 172], dir: S.left, label: { text: 'Wharton<br>Executive<br>MBA', href: 'career.html#wharton', a: 'w', dx: -20 } },
        { kind: 'end', at: [330, 52], dir: S.right, label: { text: 'Career', href: 'career.html', a: 'w', dx: -18, big: true } },
      ] },
  ],
};


/* ---------------- Contact ---------------- */
export const contactD = {
  W: 1200, H: 520, cls: 'map--contact map--wide', id: '-x',
  lines: [
    { id: 'black', color: C.black, w: 16, pts: [[600, 270], [140, 270]],
      stations: [{ kind: 'end', at: [140, 270], dir: S.down, label: { text: 'sairambkrishnan@gmail.com', sub: 'Email', href: 'mailto:sairambkrishnan@gmail.com', a: 'ne', dx: -8, dy: -34, big: true, cls: 'stn--xl' } }] },
    { id: 'blue', color: C.blue, w: 16, pts: [[600, 270], [1060, 270]],
      stations: [{ kind: 'end', at: [1060, 270], dir: S.down, label: { text: 'linkedin.com/in/sairambkrishnan', sub: 'LinkedIn', href: 'https://www.linkedin.com/in/sairambkrishnan', a: 'nw', dx: 8, dy: -34, big: true } }] },
    { id: 'orange', color: C.orange, w: 16, pts: [[600, 270], [600, 450]],
      stations: [
        { kind: 'end', at: [600, 450], dir: S.right, label: { text: '281-513-1263', sub: 'Phone', href: 'tel:+12815131263', a: 'e', dx: 34, big: true } },
        { kind: 'ix', at: [600, 270], r: 30 },
      ] },
  ],
};
export const contactM = {
  W: 390, H: 500, cls: 'map--contact map--tall', id: '-xm',
  lines: [
    { id: 'black', color: C.black, w: 10, pts: [[40, 250], [40, 60], [80, 60], [370, 60]], stations: [{ kind: 'end', at: [370, 60], dir: S.down, label: { text: 'sairambkrishnan@gmail.com', sub: 'Email', href: 'mailto:sairambkrishnan@gmail.com', a: 'nw', dx: 6, dy: -16, big: true } }] },
    { id: 'blue', color: C.blue, w: 10, pts: [[40, 250], [80, 210], [370, 210]], stations: [{ kind: 'end', at: [370, 210], dir: S.down, label: { text: 'linkedin.com/in/sairambkrishnan', sub: 'LinkedIn', href: 'https://www.linkedin.com/in/sairambkrishnan', a: 'nw', dx: 6, dy: -16, big: true } }] },
    { id: 'orange', color: C.orange, w: 10, pts: [[40, 250], [80, 290], [370, 290]], stations: [{ kind: 'end', at: [370, 290], dir: S.down, label: { text: '281-513-1263', sub: 'Phone', href: 'tel:+12815131263', a: 'sw', dx: 6, dy: 16, big: true } },
      { kind: 'ix', at: [40, 250], r: 20 }] },
  ],
};

/* ---------------- Project figures ---------------- */
export const figPersuaider = {
  W: 700, H: 290, cls: 'map--fig', id: '-fp',
  lines: [
    // Labels are his own words, from the Persuaider system record.
    { id: 'red', color: C.red, w: 12, pts: [[30, 60], [200, 60], [280, 140]], stations: [{ at: [30, 60], label: { text: 'Role-conditioned agents with private objectives', a: 'ne', dx: -4, dy: -14 } }] },
    { id: 'blue', color: C.blue, w: 12, pts: [[30, 220], [200, 220], [280, 140]], stations: [{ at: [30, 220], label: { text: 'stateful AI-versus-AI simulations', a: 'se', dx: -4, dy: 14 } }] },
    { id: 'green', color: C.green, w: 12, pts: [[400, 140], [480, 60], [670, 60]], stations: [{ kind: 'end', at: [670, 60], dir: S.down, label: { text: 'deterministic utility, walk-away, and value-left-on-the-table calculations', a: 'nw', dx: 10, dy: -16 } }] },
    { id: 'orange', color: C.orange, w: 12, pts: [[400, 140], [480, 220], [670, 220]], stations: [{ kind: 'end', at: [670, 220], dir: S.down, label: { text: 'configurable weighted coaching rubrics', a: 'sw', dx: 10, dy: 16 } }] },
    { id: 'black', color: C.black, w: 16, pts: [[280, 140], [400, 140]], stations: [{ kind: 'ix', at: [340, 140], r: 14, label: { text: 'LLM deal extraction', a: 's', dy: 24 } }] },
  ],
};
export const figLore = {
  W: 700, H: 300, cls: 'map--fig', id: '-fl',
  lines: [
    { id: 'blue', color: C.blue, w: 12, pts: [[40, 150], [660, 150]], stations: [{ kind: 'tick', at: [150, 150], dir: S.up }, { kind: 'tick', at: [560, 150], dir: S.down }] },
    { id: 'green', color: C.green, w: 12, pts: [[210, 290], [490, 10]], stations: [{ kind: 'tick', at: [440, 60], dir: S.ur }] },
    { id: 'orange', color: C.orange, w: 12, pts: [[350, 20], [350, 280]], stations: [{ kind: 'tick', at: [350, 255], dir: S.right }] },
    { id: 'red', color: C.red, w: 0.01, pts: [[350, 150], [351, 150]], stations: [{ kind: 'ix', at: [350, 150], r: 18, label: { text: 'a dependency change', a: 'nw', dx: -40, dy: -16 } }, { at: [520, 250], label: { text: 'the organization-wide blast radius', a: 'e', dx: 0 } }] },
  ],
  extras: { before: '<circle cx="350" cy="150" r="118" fill="rgba(226,35,26,0.07)" stroke="#E2231A" stroke-width="4" stroke-dasharray="14 10"/>' },
};
export const figCrucible = {
  W: 700, H: 260, cls: 'map--fig', id: '-fc',
  lines: [
    // Labels are his own words, from the Crucible system and lesson records.
    { id: 'black', color: C.black, w: 12, pts: [[30, 70], [380, 70], [440, 130]], stations: [{ at: [30, 70], label: { text: 'model judgment', sub: 'Structured agent reports', a: 'ne', dx: -4, dy: -14 } }] },
    { id: 'green', color: C.green, w: 12, pts: [[30, 190], [380, 190], [440, 130], [670, 130]], stations: [
      { at: [30, 190], label: { text: 'the code that checks evidence structure', sub: 'claim-level evidence checks', a: 'se', dx: -4, dy: 14 } },
      { kind: 'ix', at: [440, 130], r: 14 },
      { kind: 'end', at: [670, 130], dir: S.down, label: { text: 'controls when work can proceed', a: 'nw', dx: 10, dy: -18 } },
    ] },
  ],
};

for (const spec of [homeD, homeM]) {
  for (const L of spec.lines) if (L.loop) {
    L.extra = ''; // loop drawn by extending the path below
  }
}

// Paths with loops need a custom d: monkey-patch via extras after render.
export function render(spec) {
  let html = renderMap(spec);
  // No regular expressions: find the path by its id and append the loop to its d attribute (casing for loops omitted).
  for (const L of spec.lines) if (L.loop) {
    const [x, yb, w, h] = L.loop;
    const at = html.indexOf(`id="${L.id}-path${spec.id}"`);
    if (at >= 0) {
      const d = html.indexOf(' d="', at) + 4, end = html.indexOf('"', d);
      html = html.slice(0, end) + loop(x, yb, w, h) + html.slice(end);
    }
  }
  // A branched line is two entries with one id; keep DOM ids unique.
  const seen = new Set();
  let out = '', i = 0;
  for (let j = html.indexOf(' id="', i); j >= 0; j = html.indexOf(' id="', i)) {
    const s = j + 5, e = html.indexOf('"', s), id = html.slice(s, e);
    let k = id;
    if (id.includes('-path')) { let n = 1; while (seen.has(k)) k = `${id}-${n++}`; seen.add(k); }
    out += html.slice(i, s) + k; i = e;
  }
  return out + html.slice(i);
}

if (process.argv[2] === 'contact' || process.argv[2] === 'all') {
  inject(DIR + 'contact.html', 'map-x', render(contactD));
  inject(DIR + 'contact.html', 'map-xm', render(contactM));
  console.log('contact maps injected');
}
// Every line on the home map is a link to its page: double-click it anywhere to go there.
const LINE_PAGE = { red: 'career.html', orange: 'speaking.html', purple: 'research.html', green: 'projects.html', blue: 'services.html', black: 'contact.html' };
for (const m of [homeD, homeM]) for (const L of m.lines) L.href = LINE_PAGE[L.id];
if (process.argv[2] === 'home' || process.argv[2] === 'all') {
  inject(DIR + 'index.html', 'map-d', render(homeD));
  inject(DIR + 'index.html', 'map-m', render(homeM));
  console.log('home maps injected');
}

/* ---------------- Services: four doors out of one call ---------------- */
const route = (text, x, y, href, dy = 26) => ({ at: [x, y], label: { text, href, dy, cls: 'stn--route' } });
const up = (x, y, text, sub, href) => ({ kind: 'tick', at: [x, y], dir: S.up, label: { text, sub, href, a: 'n', dy: -26 } });
const fin = (x, y, text, sub, href) => ({ kind: 'end', at: [x, y], dir: S.down, label: { text, sub, href, a: 'nw', dx: 12, dy: -28 } });
export const servicesD = {
  W: 1440, H: 500, cls: 'map--svc map--wide', id: '-s',
  lines: [
    { id: 'blue', color: C.blue, w: 16, pts: [[240, 260], [360, 140], [900, 140], [1020, 260]],
      stations: [route('Engineering leaders', 480, 140, '#offers', -52), up(700, 140, 'Architecture Call', '', '#call'), up(850, 140, 'Design Review', '', '#review')] },
    { id: 'orange', color: C.orange, w: 16, pts: [[240, 260], [360, 380], [900, 380], [1020, 260]],
      stations: [route('Executives', 480, 380, '#offers'), up(610, 380, 'Keynote', '', '#keynote'), up(720, 380, 'Masterclass', '', '#masterclass'), up(850, 380, 'AI ROI Review', '', '#roi')] },
    { id: 'red', color: C.red, w: 16, pts: [[1020, 260], [1340, 260]],
      stations: [route('Every month', 1210, 260, '#offers'), up(1110, 260, 'Advisory Retainer', '', '#retainer'), fin(1340, 260, 'Fractional CTO', '', '#cto'),
        { kind: 'ix', at: [240, 260], r: 30, label: { text: 'Fit Call', sub: 'Free', href: '#fit', a: 'w', dx: -44, big: true } }] },
  ],
};
// Phone: the Fit Call at the top, each door its own row; labels alternate sides so names never collide.
const dn = (x, y, text, sub, href, dy = 14) => ({ kind: 'tick', at: [x, y], dir: S.down, label: { text, sub, href, dy } });
const finm = (x, y, text, sub, href) => ({ kind: 'end', at: [x, y], dir: S.down, label: { text, sub, href, a: 'sw', dx: 8, dy: 14 } });
const row = (id, x0, y, name, href, stops) => ({ id, color: C[id], w: 9, pts: [[x0, 46], [x0, y - 22], [x0 + 22, y], [366, y]],
  stations: [{ at: [x0 + 30, y], label: { text: name, href, a: 'ne', dx: 0, dy: -14, cls: 'stn--route' } }, ...stops] });
export const servicesM = {
  W: 390, H: 560, cls: 'map--svc map--tall', id: '-sm',
  lines: [
    row('blue', 34, 150, 'Engineering leaders', '#offers', [dn(165, 150, 'Architecture Call', '', '#call'), finm(366, 150, 'Design Review', '', '#review')]),
    row('orange', 46, 300, 'Executives', '#offers', [dn(140, 300, 'Keynote', '', '#keynote'), dn(240, 300, 'Masterclass', '', '#masterclass', 56), finm(366, 300, 'AI ROI Review', '', '#roi')]),
    row('red', 58, 450, 'Every month', '#offers', [dn(175, 450, 'Advisory Retainer', '', '#retainer'), finm(366, 450, 'Fractional CTO', '', '#cto')]),
    { id: 'black', color: C.black, w: 0, pts: [[46, 46], [46, 46]], stations: [{ kind: 'ix', at: [46, 46], r: 20, label: { text: 'Fit Call', sub: 'Free', href: '#fit', a: 'e', dx: 30, big: true } }] },
  ],
};
