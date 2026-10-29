// Bounded full-page evidence: every route at five widths and both themes, plus seven Career stations at the
// two review widths. Proof panes are exhaustively covered by automated DOM/a11y checks, not redundant PNGs.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const BASE = process.env.RUBRIC_BASE_URL || 'http://127.0.0.1:4401/';
const LOCAL_ORIGIN = new URL(BASE).origin;
const PAGES = ['index', 'career', 'speaking', 'research', 'projects', 'services', 'contact'];
const W = [375, 768, 1280, 1440, 1600];
const b = await chromium.launch();
const frames = [];
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const contextFor = async (w, theme) => {
  const ctx = await b.newContext({
    viewport: { width: w, height: 900 }, screen: { width: w, height: 900 }, deviceScaleFactor: 1,
    isMobile: w < 768, hasTouch: w < 768, colorScheme: theme, reducedMotion: 'reduce',
    locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block',
  });
  await ctx.addInitScript(t => {
    try { localStorage.setItem('theme', t); } catch {}
    let seed = 1729;
    Math.random = () => { seed = seed * 48271 % 2147483647; return seed / 2147483647; };
    const NativeDate = Date, fixedNow = Date.UTC(2026, 9, 28, 12), clockStart = performance.now();
    const deterministicNow = () => fixedNow + Math.floor(performance.now() - clockStart);
    class FixedDate extends NativeDate {
      constructor(...values) { super(...(values.length ? values : [deterministicNow()])); }
      static now() { return deterministicNow(); }
    }
    Object.setPrototypeOf(FixedDate, NativeDate);
    window.Date = FixedDate;
  }, theme);
  await ctx.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === LOCAL_ORIGIN || url.protocol === 'data:' || url.protocol === 'blob:') await route.continue();
    else await route.abort('blockedbyclient');
  });
  return ctx;
};
const settle = async pg => {
  await pg.waitForFunction(() => window.__SITE_READY__ === true && document.documentElement.dataset.siteReady === 'true');
  await pg.evaluate(async () => {
    if (document.fonts) await document.fonts.ready;
    const images = [...document.images];
    for (const image of images) image.loading = 'eager';
    await Promise.all(images.map(image => new Promise(resolve => {
      if (image.complete) { resolve(); return; }
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    })));
    await Promise.all(images.map(image => image.decode ? image.decode().catch(() => {}) : Promise.resolve()));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
};
const open = async (pg, path) => { await pg.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await settle(pg); };
const capture = async (pg, path, details) => {
  await pg.screenshot({ path, fullPage: true, animations: 'disabled', caret: 'hide' });
  frames.push({ file: relative(process.cwd(), path), sha256: sha256(path), ...details });
};
for (const theme of ['light', 'dark']) {
  for (const w of W) {
    const ctx = await contextFor(w, theme);
    for (const p of PAGES) {
      const pg = await ctx.newPage();
      await open(pg, p + '.html');
      const path = `${out}/${p}-${w}-${theme}.png`;
      await capture(pg, path, { page: p, width: w, theme, stateKey: 'default' });
      await pg.close();
    }
    await ctx.close();
  }
}
// One frame per Career station proves the seven complete compositions; every proof remains machine-scanned.
for (const theme of ['light', 'dark']) {
  for (const w of [375, 1440]) {
    const ctx = await contextFor(w, theme);
    const pg = await ctx.newPage();
    await open(pg, 'career.html');
    const stations = await pg.locator('.cr-st').evaluateAll(nodes => nodes.map(node => node.id));
    for (const station of stations) {
      await pg.locator(`.cr-strip__s[data-go="${station}"]`).evaluate(node => node.click());
      await pg.waitForFunction(id => document.getElementById(id)?.classList.contains('is-on') === true, station);
      await pg.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const path = `${out}/career-${w}-${theme}-${station}.png`;
      await capture(pg, path, { page: 'career', width: w, theme, stateKey: station, station });
    }
    await pg.close();
    await ctx.close();
  }
}
await b.close();
const artifactRoot = process.env.ARTIFACT_ROOT || join(process.cwd(), 'dist');
const provenance = JSON.parse(readFileSync(join(artifactRoot, '.site-provenance.json'), 'utf8'));
const manifest = { baselineId: provenance.baselineId, sourceHash: provenance.sourceHash, artifactHash: provenance.artifactHash, baseFrameCount: PAGES.length * W.length * 2, frames };
const manifestPath = join(process.cwd(), '.claude', 'rubric', 'out', 'visual-manifest.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${frames.length} frames in ${out}; manifest ${manifestPath}`);
