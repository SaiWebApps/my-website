// usage: node peek.mjs <url> <out.png> [d|m] [scrollY] [waitMs] [full]
import { chromium } from '/Users/sairambkrishnan/git/my-website/node_modules/playwright/index.mjs';
const [url, out, mode = 'd', sy = '0', wait = '1800', full = ''] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext(mode === 'm' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(url, { waitUntil: 'networkidle' });
await p.waitForTimeout(+wait);
for (const y of sy.split(',').map(Number)) {
  if (y) { await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(900); }
  const o = sy.includes(',') ? out.replace('.png', `-${y}.png`) : out;
  await p.screenshot({ path: o, fullPage: !!full });
}
const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log('overflowX', ov, 'height', await p.evaluate(() => document.documentElement.scrollHeight), errs.join(' | '));
await b.close();
