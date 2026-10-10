// Regenerates the services deck's menu, service, path, and catalog slides from src/data/services.ts.
// Cover, track-record, and close slides are hand-written. Run: npm run sync:deck
import { writeFileSync } from 'node:fs';
import { services, masterclasses, terms, money, type Service } from '../src/data/services.ts';

const dir = new URL('../decks/services/project/slides/', import.meta.url);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const pad = (n: number) => String(n).padStart(2, '0');
const byId = Object.fromEntries(services.map(s => [s.id, s])) as Record<string, Service>;
const from = (s: Service) => `from ${money(s.price)}${s.unit ? ' a month' : ''}`;
const deckText = (s: string) => s.replace('the catalog below', 'the masterclass catalog');

const SANS = "font-family:'DM Sans', Arial, sans-serif";
const MONO = "font-family:'Martian Mono', 'Courier New', monospace";
const H2 = 'font-size:72px;font-weight:700;letter-spacing:-3px;line-height:1.05';
const section = (id: string, bg: string, body: string) =>
  `<section id="${id}" data-transition="fade" style="background:${bg};color:#14242c;${SANS};padding:128px;display:flex;flex-direction:column;gap:56px">\n${body}\n</section>\n`;
const write = (id: string, html: string) => writeFileSync(new URL(`${id}.html`, dir), html);

write('menu', section('menu', '#ecece4', `<h2 style="${H2}">The menu</h2>
<table style="font-size:28px;color:#14242c;padding:10px 20px">
<tr><th style="width:8%;text-align:left">#</th><th style="width:44%;text-align:left">Service</th><th style="width:26%;text-align:left">Length</th><th style="width:22%;text-align:right">From</th></tr>
${services.map((s, i) => `<tr><td>${pad(i + 1)}</td><td>${esc(s.name)}</td><td>${esc(s.length)}</td><td style="text-align:right">${money(s.price)}${s.unit ? ' a month' : ''}</td></tr>`).join('\n')}
</table>
<p style="font-size:24px;color:#476c56">${esc(terms)}</p>`));

const titles = ['Getting started', 'Teaching and systems', 'Deeper engagements'];
titles.forEach((title, page) => write(`abs${page + 1}`, section(`abs${page + 1}`, '#ecece4', `<h2 style="${H2}">${title}</h2>
<div style="display:flex;gap:48px;flex:1">
${services.slice(page * 3, page * 3 + 3).map((s, i) => `<div style="flex:1;display:flex;flex-direction:column;gap:20px;border-top:2px solid #14242c;padding:32px 0 0 0">
<p style="${MONO};font-size:24px;color:#476c56">${pad(page * 3 + i + 1)} · ${esc(s.length)}${s.priceLabel.includes('travel') ? ', plus travel' : ''}</p>
<h3 style="font-size:40px;font-weight:700;letter-spacing:-1px;line-height:1.1">${esc(s.name)}</h3>
<p style="font-size:44px;font-weight:700;letter-spacing:-1px">${from(s)}</p>
<p style="font-size:26px;line-height:1.5;color:#344d4a">${esc(deckText(s.abstract))}</p>
</div>`).join('\n')}
</div>`)));

[masterclasses.slice(0, 4), masterclasses.slice(4)].forEach((group, page) => write(`classes${page + 1}`, section(`classes${page + 1}`, '#e2e9dd', `<h2 style="${H2}">Masterclass catalog</h2>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:48px 64px">
${group.map(m => `<div style="display:flex;flex-direction:column;gap:14px;border-top:2px solid #14242c;padding:28px 0 0 0">
<p style="${MONO};font-size:24px;color:#476c56">${esc(m.org)}</p>
<h3 style="font-size:36px;font-weight:700;letter-spacing:-1px;line-height:1.15">${esc(m.title)}</h3>
<p style="font-size:24px;line-height:1.45;color:#344d4a">${esc(m.abstract)}</p>
</div>`).join('\n')}
</div>`)));

const path = [
  { id: 'masterclass', step: '01 · Align', text: 'Your leadership team in one room: how AI works and where it fails, privacy and governance first, and where AI ROI starts.' },
  { id: 'roi', step: '02 · Decide', text: 'Every candidate AI initiative scored for readiness, value, and risk, with stage gates that tie each tranche of funding to evidence.' },
  { id: 'retainer', step: '03 · Build', text: 'Design reviews before work starts and standing office hours while your team builds.' },
];
write('path', section('path', '#ecece4', `<div style="display:flex;flex-direction:column;gap:20px">
<p style="${MONO};font-size:24px;letter-spacing:2px;text-transform:uppercase;color:#476c56">Wealth management</p>
<h2 style="${H2}">An AI transformation path</h2>
</div>
<div style="display:flex;gap:48px;flex:1">
${path.map((p, i) => {
  const dark = i === path.length - 1;
  return `<div style="flex:1;display:flex;flex-direction:column;gap:20px;${dark ? 'background:#102630;color:#f2f4ec' : 'background:#f7f7f1;border:1px solid #c3cfc2'};border-radius:20px;padding:44px">
<p style="${MONO};font-size:24px;color:${dark ? '#d8fa77' : '#476c56'}">${p.step}</p>
<h3 style="font-size:40px;font-weight:700;letter-spacing:-1px;line-height:1.1">${esc(byId[p.id].name)}</h3>
<p style="font-size:28px;line-height:1.45;color:${dark ? '#bfd8d5' : '#344d4a'}">${esc(p.text)}</p>
<div style="flex:1"></div>
<p style="font-size:44px;font-weight:700;letter-spacing:-1px">${from(byId[p.id])}</p>
</div>`;
}).join('\n')}
</div>`));
