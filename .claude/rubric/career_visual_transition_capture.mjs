#!/usr/bin/env node
/* Capture and prove the exact Career-only visual transition without changing the shared oracle. */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const ORACLE_PATH = join(ROOT, '.claude/rubric/shared-route-oracle.json');
const sha = value => createHash('sha256').update(value).digest('hex');
const fileSha = path => sha(readFileSync(path));
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const order = (a, b) => compareText(a.page, b.page) || compareText(a.stateKey, b.stateKey)
  || compareText(a.theme, b.theme) || a.width - b.width;
const canonical = records => JSON.stringify([...records].sort(order).map(record => Object.fromEntries(
  Object.keys(record).sort().map(key => [key, record[key]]),
)));

function usage(message) {
  if (message) console.error(message);
  console.error('usage: career_visual_transition_capture.mjs --base-url URL --out FILE --screenshots-dir DIR');
  process.exit(2);
}

function argsOf(values) {
  const allowed = new Set(['--base-url', '--out', '--screenshots-dir']);
  const out = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!allowed.has(key) || value === undefined || value.startsWith('--') || out[key]) usage(`invalid argument ${key || ''}`);
    out[key] = value;
  }
  if (Object.keys(out).length !== allowed.size) usage('all arguments are required');
  return out;
}

const args = argsOf(process.argv.slice(2));
const base = new URL(args['--base-url']);
const reportPath = resolve(args['--out']);
const screenshotDir = resolve(args['--screenshots-dir']);
const oracleBytes = readFileSync(ORACLE_PATH);
const oracle = JSON.parse(oracleBytes);
if (oracle.frames?.length !== 68) throw new Error('shared-route oracle is not the exact 68-frame authority');

mkdirSync(dirname(reportPath), { recursive: true });
mkdirSync(screenshotDir, { recursive: true });

const expected = new Map(oracle.frames.map(frame => [
  `${frame.page}:${frame.width}:${frame.theme}:${frame.stateKey}`, frame,
]));
const allowedChanges = new Set();
for (const stateKey of ['sig', 'amazon', 'apple']) {
  for (const theme of ['light', 'dark']) for (const width of [375, 1440]) {
    allowedChanges.add(`career:${width}:${theme}:${stateKey}`);
  }
}

async function contextFor(browser, width, theme) {
  const context = await browser.newContext({
    viewport: { width, height: 900 }, screen: { width, height: 900 }, deviceScaleFactor: 1,
    isMobile: width < 768, hasTouch: width < 768, colorScheme: theme, reducedMotion: 'reduce',
    locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block',
  });
  await context.addInitScript(value => {
    try { localStorage.setItem('theme', value); } catch {}
    let seed = 1729;
    Math.random = () => { seed = seed * 48271 % 2147483647; return seed / 2147483647; };
    const NativeDate = Date;
    const fixedNow = Date.UTC(2026, 9, 28, 12);
    const clockStart = performance.now();
    const deterministicNow = () => fixedNow + Math.floor(performance.now() - clockStart);
    class FixedDate extends NativeDate {
      constructor(...values) { super(...(values.length ? values : [deterministicNow()])); }
      static now() { return deterministicNow(); }
    }
    Object.setPrototypeOf(FixedDate, NativeDate);
    window.Date = FixedDate;
  }, theme);
  const localOrigin = base.origin;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === localOrigin || url.protocol === 'data:' || url.protocol === 'blob:') await route.continue();
    else await route.abort('blockedbyclient');
  });
  return context;
}

async function settle(page) {
  await page.waitForFunction(() => window.__SITE_READY__ === true
    && document.documentElement.dataset.siteReady === 'true');
  await page.evaluate(async () => {
    if (document.fonts) await document.fonts.ready;
    const images = [...document.images];
    for (const image of images) image.loading = 'eager';
    await Promise.all(images.map(image => new Promise(resolveImage => {
      if (image.complete) { resolveImage(); return; }
      image.addEventListener('load', resolveImage, { once: true });
      image.addEventListener('error', resolveImage, { once: true });
    })));
    await Promise.all(images.map(image => image.decode ? image.decode().catch(() => {}) : Promise.resolve()));
    await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
  });
}

async function open(page, route) {
  await page.goto(new URL(route, base).href, { waitUntil: 'domcontentloaded' });
  await settle(page);
}

async function capture(page, record) {
  const key = `${record.page}:${record.width}:${record.theme}:${record.stateKey}`;
  const pixels = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
  writeFileSync(join(screenshotDir, key.replaceAll(':', '-') + '.png'), pixels);
  return { ...record, sha256: sha(pixels) };
}

const browser = await chromium.launch();
const actual = [];
try {
  for (const theme of ['light', 'dark']) for (const width of [375, 768, 1280, 1440, 1600]) {
    const context = await contextFor(browser, width, theme);
    for (const pageName of ['index', 'career', 'services', 'contact']) {
      const page = await context.newPage();
      await open(page, `${pageName}.html`);
      actual.push(await capture(page, { page: pageName, width, theme, stateKey: 'default' }));
      await page.close();
    }
    await context.close();
  }
  for (const theme of ['light', 'dark']) for (const width of [375, 1440]) {
    const context = await contextFor(browser, width, theme);
    const page = await context.newPage();
    await open(page, 'career.html');
    const stations = await page.locator('.cr-st').evaluateAll(nodes => nodes.map(node => node.id));
    if (JSON.stringify(stations) !== JSON.stringify(['cmu', 'microsoft', 'sig', 'amazon', 'apple', 'wharton', 'praxtera'])) {
      throw new Error(`Career station order changed: ${JSON.stringify(stations)}`);
    }
    for (const stateKey of stations) {
      await page.locator(`.cr-strip__s[data-go="${stateKey}"]`).evaluate(node => node.click());
      await page.waitForFunction(id => document.getElementById(id)?.classList.contains('is-on') === true, stateKey);
      await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
      actual.push(await capture(page, { page: 'career', width, theme, stateKey }));
    }
    await page.close();
    await context.close();
  }
} finally {
  await browser.close();
}

const changes = [];
for (const record of actual) {
  const key = `${record.page}:${record.width}:${record.theme}:${record.stateKey}`;
  const prior = expected.get(key);
  if (!prior) throw new Error(`captured unknown frame ${key}`);
  if (prior.sha256 !== record.sha256) {
    changes.push({ page: record.page, width: record.width, theme: record.theme,
      stateKey: record.stateKey, priorSha256: prior.sha256, candidateSha256: record.sha256 });
  }
}
const actualChangeKeys = new Set(changes.map(change =>
  `${change.page}:${change.width}:${change.theme}:${change.stateKey}`));
const exactAllowedChanges = actualChangeKeys.size === allowedChanges.size
  && [...actualChangeKeys].every(key => allowedChanges.has(key));
const currentAggregate = sha(canonical(actual));
const reversed = actual.map(record => {
  const key = `${record.page}:${record.width}:${record.theme}:${record.stateKey}`;
  const prior = expected.get(key);
  return actualChangeKeys.has(key) ? { ...record, sha256: prior.sha256 } : record;
});
const reversedAggregate = sha(canonical(reversed));
const nonCareerChanges = changes.filter(change => change.page !== 'career');
const report = {
  schemaVersion: 1,
  status: 'proposed-independent-review-required',
  ok: actual.length === 68 && exactAllowedChanges && nonCareerChanges.length === 0
    && reversedAggregate === oracle.aggregates.sharedAll,
  capture: {
    frameCount: actual.length,
    changedFrameCount: changes.length,
    unchangedFrameCount: actual.length - changes.length,
    changedStateKeys: [...actualChangeKeys].sort(),
  },
  authority: {
    oraclePath: '.claude/rubric/shared-route-oracle.json',
    oracleSha256: sha(oracleBytes),
    priorSharedAll: oracle.aggregates.sharedAll,
    candidateSharedAll: currentAggregate,
    reverseReconstructedSharedAll: reversedAggregate,
    exactAllowedChanges,
    nonCareerChanges,
  },
  candidate: {
    contentSha256: fileSha(join(ROOT, 'site/content.json')),
    builderSha256: fileSha(join(ROOT, 'site/_build/build.py')),
    careerHtmlSha256: fileSha(join(ROOT, 'site/career.html')),
    styleSha256: fileSha(join(ROOT, 'site/style.css')),
    mainJsSha256: fileSha(join(ROOT, 'site/main.js')),
    routeHtmlSha256: Object.fromEntries(['index', 'services', 'contact'].map(page => [
      page, fileSha(join(ROOT, `site/${page}.html`)),
    ])),
  },
  changes: changes.sort(order),
  frames: actual.sort(order),
};
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Career transition: ${changes.length} changed / ${actual.length} captured; ${report.ok ? 'candidate proved' : 'KILL'}`);
if (!report.ok) process.exit(1);
