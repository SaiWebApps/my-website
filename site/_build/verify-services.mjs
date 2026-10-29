import { AxeBuilder } from '@axe-core/playwright';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { verifySharedRoutePixels } from './shared-route-oracle.mjs';

const base = process.env.SERVICES_BASE || 'http://127.0.0.1:4414/';
const origin = base.endsWith('/') ? base : base + '/';
const expectedOffers = [
  ['fit', 'Fit Call'],
  ['call', 'Architecture Call'],
  ['review', 'Design Review'],
  ['keynote', 'Keynote'],
  ['masterclass', 'Masterclass'],
  ['roi', 'AI ROI Review'],
  ['retainer', 'Advisory Retainer'],
  ['cto', 'Fractional CTO'],
];
const expectedGroups = ['Engineering leaders', 'Executives', 'Every month'];
const expectedScreens = { fit: 1, call: 1, review: 1, keynote: 1, masterclass: 2, roi: 2, retainer: 1, cto: 2 };
const expectedOfferHash = 'a20b8d96a9a680fddb4eaea69daef052d3203778eb4c3adbdbb9086232082639';
const expectedScreenHash = 'cfc56dd74c6dc5b6e5e61b2b4c458a9e7952167ea6222b38a701de7de6a9916a';

function fail(message) {
  throw new Error(message);
}

function assert(value, message) {
  if (!value) fail(message);
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalized(value) {
  let out = '';
  let gap = false;
  for (const char of value) {
    if (char <= ' ') {
      gap = out.length > 0;
    } else {
      if (gap) out += ' ';
      out += char;
      gap = false;
    }
  }
  return out.trim();
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

const mapBuilder = readFileSync(new URL('./maps.mjs', import.meta.url), 'utf8');
assert(!mapBuilder.includes("inject(DIR + 'services.html'"), 'legacy Services map injection remains in the candidate builder');

async function contextFor(browser, width, theme) {
  const height = width === 375 ? 812 : 900;
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion: 'reduce' });
  await context.addInitScript(value => localStorage.setItem('theme', value), theme);
  return context;
}

async function open(context, route) {
  const page = await context.newPage();
  await page.goto(origin + route, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function verifyServices(browser, width, theme) {
  const context = await contextFor(browser, width, theme);
  const page = await open(context, 'services.html');
  const label = `${width}:${theme}`;

  assert(await page.locator('main .svc2').count() === 1, `${label}: missing Services root`);
  assert(await page.locator('.svc2-route').count() === 3, `${label}: buyer route count changed`);
  const groups = (await page.locator('.svc2-route__name').allTextContents()).map(normalized);
  assert(JSON.stringify(groups) === JSON.stringify(expectedGroups), `${label}: buyer route labels changed`);

  const links = await page.locator('.svc2-map a[href^="#"]').evaluateAll(nodes => nodes.map(node => [node.getAttribute('href').slice(1), node.textContent.trim()]));
  assert(JSON.stringify(links) === JSON.stringify(expectedOffers), `${label}: offer anchors changed`);
  assert(hash(JSON.stringify(links)) === expectedOfferHash, `${label}: offer preservation hash changed`);

  const forbidden = '.svc[data-ride], .platform, [data-cars], .cars, .cars__track, .coach, [data-screen], .doors-panel, .door[data-off], [role="tab"], [aria-selected]';
  assert(await page.locator(forbidden).count() === 0, `${label}: retired carousel or hidden-panel structure remains`);
  assert(await page.locator('.svc2-group').count() === 0, `${label}: duplicate group inventory wrapper remains`);
  assert(await page.locator('.svc2-atlas > .svc2-offer').count() === 8, `${label}: atlas must own eight direct offer articles`);
  assert(await page.locator('.svc2 [hidden], .svc2 [data-off]').count() === 0, `${label}: Services content is hidden`);
  assert(await page.locator('main img, main picture, main video').count() === 0, `${label}: unapproved Services imagery exists`);
  assert(await page.locator('.svc2 .ticket, .svc2 [class*="fare"], .svc2 [class*="time"]').count() === 0, `${label}: fee or duration presentation returned`);

  const screens = await page.locator('.svc2-proof').evaluateAll(nodes => nodes.map(node => ({
    id: node.closest('.svc2-offer').id,
    text: node.textContent,
    visible: Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length),
    ariaHidden: node.getAttribute('aria-hidden'),
  })));
  assert(screens.length === 11, `${label}: expected 11 evidence screens, found ${screens.length}`);
  const counts = {};
  for (const screen of screens) {
    counts[screen.id] = (counts[screen.id] || 0) + 1;
    assert(screen.visible && screen.ariaHidden !== 'true', `${label}: evidence hidden for ${screen.id}`);
  }
  assert(JSON.stringify(counts) === JSON.stringify(expectedScreens), `${label}: evidence screen ownership changed`);
  const screenHash = hash(JSON.stringify(screens.map(screen => normalized(screen.text)).sort()));
  assert(screenHash === expectedScreenHash, `${label}: evidence multiset hash changed`);

  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const overflow = [...document.querySelectorAll('.svc2, .svc2 *')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.className || node.tagName);
    const scrollers = [...document.querySelectorAll('.svc2, .svc2 *')].filter(node => {
      const style = getComputedStyle(node);
      return (style.overflowX === 'auto' || style.overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 1;
    }).map(node => node.className || node.tagName);
    const offers = [...document.querySelectorAll('.svc2-offer')].map(node => {
      const style = getComputedStyle(node);
      return { borderTop: style.borderTopWidth, borderRight: style.borderRightWidth, borderBottom: style.borderBottomWidth, borderLeft: style.borderLeftWidth, background: style.backgroundColor };
    });
    return { pageOverflow: root.scrollWidth - root.clientWidth, overflow, scrollers, offers };
  });
  assert(layout.pageOverflow <= 1, `${label}: page overflows horizontally by ${layout.pageOverflow}px`);
  assert(layout.scrollers.length === 0, `${label}: nested horizontal scroller remains`);
  assert(layout.overflow.length === 0, `${label}: Services descendant overflows its own width: ${layout.overflow.join(', ')}`);
  for (const box of layout.offers) {
    assert(box.borderTop === '0px' && box.borderRight === '0px' && box.borderBottom === '0px' && box.borderLeft === '0px', `${label}: bordered offer container remains`);
    assert(box.background === 'rgba(0, 0, 0, 0)', `${label}: filled offer container remains`);
  }

  if (width === 1440) {
    const firstView = await page.locator('.svc2-hero h1, .svc2-route__name, .svc2-route__offers a, .svc2-book a').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { text: node.textContent.trim(), left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    }));
    assert(firstView.length === 13, `${label}: first-view decision set is incomplete`);
    for (const item of firstView) assert(item.left >= 0 && item.top >= 0 && item.right <= 1440 && item.bottom <= 900, `${label}: ${item.text} falls outside the first viewport`);
  }

  if (width === 375) {
    const targets = await page.locator('.svc2-route__offers a').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { text: node.textContent.trim(), width: rect.width, height: rect.height };
    }));
    for (const target of targets) assert(target.width >= 44 && target.height >= 44, `${label}: ${target.text} is smaller than 44px`);
    const labels = await page.locator('.svc2-route__name, .svc2-route__offers a span').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { text: node.textContent.trim(), left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    }));
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) assert(!overlaps(labels[i], labels[j]), `${label}: labels collide: ${labels[i].text} / ${labels[j].text}`);
    }
  }

  await page.locator('body').focus();
  const reached = new Set();
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('Tab');
    const href = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('href'));
    if (href && href.startsWith('#')) reached.add(href.slice(1));
  }
  for (const [id] of expectedOffers) assert(reached.has(id), `${label}: keyboard did not reach ${id} within 20 tabs`);

  const axe = await new AxeBuilder({ page }).analyze();
  assert(axe.violations.length === 0, `${label}: axe violations: ${axe.violations.map(item => item.id).join(', ')}`);
  const serviceShot = await page.screenshot({ fullPage: true, animations: 'disabled' });
  const serviceHash = hash(serviceShot);
  await context.close();
  return { label, offerHash: expectedOfferHash, screenHash, serviceHash };
}

const browser = await chromium.launch({ headless: true });
try {
  const serviceResults = [];
  for (const width of [1440, 375]) {
    for (const theme of ['light', 'dark']) serviceResults.push(await verifyServices(browser, width, theme));
  }
  const sharedRouteResult = await verifySharedRoutePixels(browser, origin);
  console.log(JSON.stringify({ ok: true, serviceResults, sharedRouteResult }, null, 2));
} finally {
  await browser.close();
}
