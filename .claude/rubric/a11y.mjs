// Deterministic accessibility and keyboard verification for the exact served candidate.
// The state contract defines every supported interactive structure; discovery fails closed on another structure.
// The release governor invokes this verifier through score.py; direct runs are mutation-tested as bypasses.
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT = JSON.parse(readFileSync(join(HERE, 'a11y-contract.json'), 'utf8'));
const BASE = process.env.RUBRIC_BASE_URL || 'http://127.0.0.1:4401/';
const LOCAL_ORIGIN = new URL(BASE).origin;
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : ''; };
const JSON_OUT = option('--json');
const routeFilter = option('--routes').split(',').filter(Boolean);
const widthFilter = option('--widths').split(',').filter(Boolean).map(Number);
const themeFilter = option('--themes').split(',').filter(Boolean);
const ROUTES = CONTRACT.routes.filter(route => !routeFilter.length || routeFilter.includes(route.id));
const VIEWPORTS = CONTRACT.viewports.filter(viewport => !widthFilter.length || widthFilter.includes(viewport.width));
const THEMES = CONTRACT.themes.filter(theme => !themeFilter.length || themeFilter.includes(theme));
const PLANT = process.env.A11Y_PLANT ? JSON.parse(process.env.A11Y_PLANT) : null;
const plantEvidence = { requested: !!PLANT, applied: false, applications: 0, errors: [] };
const BLOCKING_IMPACTS = new Set(['critical', 'serious']);
const CONTRACT_SHA256 = createHash('sha256').update(readFileSync(join(HERE, 'a11y-contract.json'))).digest('hex');
const artifactRoot = process.env.ARTIFACT_ROOT || '';
const provenance = artifactRoot ? JSON.parse(readFileSync(join(artifactRoot, '.site-provenance.json'), 'utf8')) : {};
const failures = [];
const warnings = [];
const contexts = [];

if ((routeFilter.length && ROUTES.length !== routeFilter.length)
    || (widthFilter.length && VIEWPORTS.length !== widthFilter.length)
    || (themeFilter.length && THEMES.length !== themeFilter.length)) {
  throw new Error('unknown accessibility matrix filter');
}

function finding(kind, page, width, theme, state, message, extra = {}) {
  return { kind, page, width, theme, state, message, ...extra };
}

function fail(kind, page, width, theme, state, message, extra = {}) {
  const item = finding(kind, page, width, theme, state, message, extra);
  failures.push(item);
  console.log(`FAIL ${page} ${width} ${theme} ${state} ${kind}: ${message}`);
}

function warn(kind, page, width, theme, state, message, extra = {}) {
  warnings.push(finding(kind, page, width, theme, state, message, extra));
}

async function settle(page) {
  await page.waitForFunction(() => window.__SITE_READY__ === true && document.documentElement.dataset.siteReady === 'true');
  await page.evaluate(async () => {
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
}

async function openPage(page, file) {
  await page.goto(BASE + file, { waitUntil: 'domcontentloaded' });
  await settle(page);
}

async function applyPlant(page, route, width, theme) {
  if (!PLANT || PLANT.page !== route || PLANT.width !== width || PLANT.theme !== theme) return;
  try {
    const changed = await page.evaluate(plant => {
      const nodes = [...document.querySelectorAll(plant.selector)];
      if (!nodes.length) throw new Error(`accessibility plant target is absent: ${plant.selector}`);
      if (plant.operation === 'insert') {
        for (const node of nodes) node.insertAdjacentHTML('beforeend', plant.html);
      } else if (plant.operation === 'remove_attribute') {
        for (const node of nodes) node.removeAttribute(plant.attribute);
      } else {
        throw new Error(`unknown accessibility plant operation: ${plant.operation}`);
      }
      return nodes.length;
    }, PLANT);
    if (!changed) throw new Error('accessibility plant changed no targets');
    plantEvidence.applied = true;
    plantEvidence.applications++;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  } catch (error) {
    plantEvidence.errors.push(String(error && error.message ? error.message : error));
    throw error;
  }
}

async function scan(page, route, width, theme, state) {
  const report = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  contexts.push({ page: route, width, theme, state, violations: report.violations.length });
  for (const violation of report.violations) {
    const targets = violation.nodes.map(node => node.target.join(' ')).sort();
    const message = `${violation.id}: ${violation.help}; ${targets.join(' | ')}`;
    const extra = { rule: violation.id, impact: violation.impact || 'unknown', targets };
    if (BLOCKING_IMPACTS.has(violation.impact)) fail('axe', route, width, theme, state, message, extra);
    else warn('axe', route, width, theme, state, message, extra);
  }
}

async function discover(page, route, width, theme) {
  const result = await page.evaluate(contract => {
    const candidates = [...document.querySelectorAll(contract.discoverySelector)];
    const familyRoots = contract.families.map(family => ({
      id: family.id,
      roots: [...document.querySelectorAll(family.root)],
      triggers: family.trigger ? [...document.querySelectorAll(family.trigger)] : [],
    }));
    const unknown = [];
    for (const candidate of candidates) {
      let covered = false;
      for (const family of familyRoots) {
        if (family.roots.some(root => root === candidate || root.contains(candidate)) || family.triggers.includes(candidate)) {
          covered = true;
          break;
        }
      }
      if (!covered) unknown.push(candidate.outerHTML.slice(0, 180));
    }
    const stateProblems = [];
    for (const root of document.querySelectorAll('[data-ride]')) {
      const states = [...root.querySelectorAll('.platform')].filter(node => node.closest('[data-ride]') === root).map(node => node.id).filter(Boolean);
      const triggers = [...root.querySelectorAll('[data-stop]')].filter(node => node.closest('[data-ride]') === root).map(node => node.dataset.stop).filter(Boolean);
      if (triggers.length) {
        const stateSet = new Set(states), triggerSet = new Set(triggers);
        for (const state of stateSet) if (!triggerSet.has(state)) stateProblems.push(`ride state ${state} has no trigger`);
        for (const trigger of triggerSet) if (!stateSet.has(trigger)) stateProblems.push(`ride trigger ${trigger} has no state`);
      }
    }
    for (const root of document.querySelectorAll('[data-career-ride]')) {
      const states = [...root.querySelectorAll('.cr-st')].map(node => node.id).filter(Boolean);
      const triggers = [...root.querySelectorAll('.cr-strip__s')].map(node => node.dataset.go).filter(Boolean);
      const stateSet = new Set(states), triggerSet = new Set(triggers);
      for (const state of stateSet) if (!triggerSet.has(state)) stateProblems.push(`Career state ${state} has no station link`);
      for (const trigger of triggerSet) if (!stateSet.has(trigger)) stateProblems.push(`Career station link ${trigger} has no state`);
    }
    for (const screen of document.querySelectorAll('[data-screen]')) {
      if (!screen.closest('[data-cars], [data-career-ride], [data-blind]')) stateProblems.push('data-screen exists outside a registered horizontal, blind, or Career structure');
    }
    return { unknown, stateProblems };
  }, CONTRACT);
  for (const message of result.unknown) fail('state-discovery', route, width, theme, 'default', `unregistered interactive structure: ${message}`);
  for (const message of result.stateProblems) fail('state-discovery', route, width, theme, 'default', message);
}

async function assertPageGeometry(page, route, width, theme, state) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) fail('keyboard', route, width, theme, state, `document has ${Math.round(overflow)}px horizontal overflow`);
}

async function assertHorizontalRegions(page, route, width, theme, state) {
  const visibleCars = page.locator('[data-cars]:visible');
  const count = await visibleCars.count();
  for (let index = 0; index < count; index++) {
    const cars = visibleCars.nth(index);
    const track = cars.locator('.cars__track');
    const dimensions = await track.evaluate(node => ({
      client: node.clientWidth,
      scroll: node.scrollWidth,
      focusable: node.tabIndex === 0,
      role: node.getAttribute('role') || '',
      name: node.getAttribute('aria-label') || '',
    }));
    if (!dimensions.focusable || dimensions.role !== 'region' || !dimensions.name.trim()) {
      fail('accessible-name', route, width, theme, state, `scroll region ${index + 1} lacks a named keyboard-focusable region`);
    } else {
      await track.focus();
      if (!await track.evaluate(node => document.activeElement === node)) fail('focus', route, width, theme, state, `scroll region ${index + 1} cannot receive keyboard focus`);
    }
    if (dimensions.scroll <= dimensions.client + 2) continue;
    const previous = cars.locator('[data-car="-1"]');
    const next = cars.locator('[data-car="1"]');
    if (await previous.count() !== 1 || await next.count() !== 1) {
      fail('horizontal-scroll', route, width, theme, state, `scroll region ${index + 1} lacks previous and next controls`);
      continue;
    }
    const names = await cars.locator('[data-car]').evaluateAll(buttons => buttons.map(button => {
      const direct = button.getAttribute('aria-label');
      if (direct) return direct.trim();
      const labelled = (button.getAttribute('aria-labelledby') || '').split(' ').filter(Boolean)
        .map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
      if (labelled) return labelled;
      const copy = button.cloneNode(true);
      copy.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove());
      return copy.textContent.trim();
    }));
    if (names.some(name => !name)) fail('accessible-name', route, width, theme, state, `scroll region ${index + 1} has an unnamed control`);
    await cars.locator('.cars__track').evaluate(track => { track.scrollLeft = 0; });
    await next.focus();
    await next.press('Enter');
    try {
      await page.waitForFunction(i => {
        const roots = [...document.querySelectorAll('[data-cars]')].filter(root => root.getClientRects().length > 0);
        const track = roots[i]?.querySelector('.cars__track');
        return !!track && track.scrollLeft > 1;
      }, index);
    } catch {
      fail('horizontal-scroll', route, width, theme, state, `next control did not move scroll region ${index + 1}`);
    }
    const nextKeptFocus = await next.evaluate(button => document.activeElement === button);
    if (!nextKeptFocus) fail('focus', route, width, theme, state, `next control lost focus in scroll region ${index + 1}`);
    const afterNext = await track.evaluate(node => node.scrollLeft);
    await previous.focus();
    await previous.press('Enter');
    try {
      await page.waitForFunction(({ i, before }) => {
        const roots = [...document.querySelectorAll('[data-cars]')].filter(root => root.getClientRects().length > 0);
        const node = roots[i]?.querySelector('.cars__track');
        return !!node && node.scrollLeft < before - 1;
      }, { i: index, before: afterNext });
    } catch {
      fail('horizontal-scroll', route, width, theme, state, `previous control did not move scroll region ${index + 1} backward`);
    }
    const previousKeptFocus = await previous.evaluate(button => document.activeElement === button);
    if (!previousKeptFocus) fail('focus', route, width, theme, state, `previous control lost focus in scroll region ${index + 1}`);
  }
}

async function assertCareer(page, route, width, theme) {
  if (route !== 'career') return;
  const problems = await page.evaluate(() => {
    const nameOf = element => {
      const direct = element.getAttribute('aria-label');
      if (direct) return direct.trim();
      const labelled = (element.getAttribute('aria-labelledby') || '').split(' ').filter(Boolean)
        .map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
      return labelled || element.textContent.trim();
    };
    const out = [];
    for (const link of document.querySelectorAll('.cr-strip__s, .cr-foot a')) if (!nameOf(link)) out.push('Career navigation contains an unnamed link');
    for (const nav of document.querySelectorAll('.cr-foot')) {
      const id = nav.getAttribute('aria-labelledby');
      if (!id || !document.getElementById(id)?.textContent.trim()) out.push('Career station navigation lacks a station-heading label');
    }
    for (const pane of document.querySelectorAll('[data-career-ride] [data-screen]')) {
      if (pane.tabIndex !== 0) out.push(`${pane.dataset.screen} is not keyboard focusable`);
      if (!pane.textContent.trim()) out.push(`${pane.dataset.screen} has no readable content`);
    }
    return out;
  });
  for (const message of problems) fail('career-semantics', route, width, theme, 'default', message);

  const stations = page.locator('.cr-strip__s');
  const stationCount = await stations.count();
  if (stationCount < 2) {
    fail('career-keyboard', route, width, theme, 'default', 'Career needs at least two keyboard-reachable stations');
    return;
  }
  await stations.first().focus();
  await stations.first().press('Enter');
  await stations.first().press('ArrowDown');
  const arrowState = await page.evaluate(() => ({
    focus: document.activeElement?.getAttribute('data-go') || '',
    current: document.querySelector('.cr-strip__s[aria-current=step]')?.getAttribute('data-go') || '',
    visible: document.querySelector('.cr-st.is-on')?.id || '',
  }));
  const expected = await stations.nth(1).getAttribute('data-go');
  if (arrowState.focus !== expected || arrowState.current !== expected || arrowState.visible !== expected) {
    fail('career-keyboard', route, width, theme, 'default', `ArrowDown did not focus and activate ${expected}`);
  }
  await stations.nth(1).press('Home');
  const home = await page.evaluate(() => document.activeElement?.getAttribute('data-go') || '');
  if (home !== await stations.first().getAttribute('data-go')) fail('career-keyboard', route, width, theme, 'default', 'Home did not focus the first Career station');
  await stations.first().press('Tab');
  const proofFocus = await page.evaluate(() => ({
    screen: document.activeElement?.getAttribute('data-screen') || '',
    activeStation: document.activeElement?.closest('.cr-st.is-on')?.id || '',
  }));
  if (!proofFocus.screen || !proofFocus.activeStation) fail('career-focus', route, width, theme, 'default', 'Tab from the active station did not reach its first proof');
}

async function scanDialogStates(page, route, width, theme) {
  const dialogs = page.locator('dialog');
  for (let index = 0; index < await dialogs.count(); index++) {
    const dialog = dialogs.nth(index);
    const id = await dialog.getAttribute('id');
    const trigger = page.locator(`[aria-controls="${id}"]:visible`).first();
    if (!id || await trigger.count() !== 1) {
      fail('dialog', route, width, theme, `dialog:${index}`, 'dialog has no unique controlling trigger');
      continue;
    }
    await trigger.focus();
    await trigger.press('Enter');
    try { await page.waitForFunction(dialogId => document.getElementById(dialogId)?.open === true, id); }
    catch { fail('dialog', route, width, theme, `dialog:${id}`, 'keyboard activation did not open the dialog'); continue; }
    await scan(page, route, width, theme, `dialog:${id}`);
    await page.keyboard.press('Escape');
    try { await page.waitForFunction(dialogId => document.getElementById(dialogId)?.open === false, id); }
    catch { fail('dialog', route, width, theme, `dialog:${id}`, 'Escape did not close the dialog'); }
    const returned = await trigger.evaluate(element => document.activeElement === element);
    if (!returned) fail('focus', route, width, theme, `dialog:${id}`, 'dialog close did not return focus to its trigger');
  }
}

async function scanRideStates(page, route, width, theme) {
  const roots = page.locator('[data-ride]');
  for (let rootIndex = 0; rootIndex < await roots.count(); rootIndex++) {
    const root = roots.nth(rootIndex);
    const triggers = root.locator('[data-stop]');
    for (let triggerIndex = 0; triggerIndex < await triggers.count(); triggerIndex++) {
      const trigger = triggers.nth(triggerIndex);
      const state = await trigger.getAttribute('data-stop');
      await trigger.focus();
      await trigger.press('Enter');
      await page.waitForFunction(id => {
        const panel = document.getElementById(id);
        return !!panel && !panel.hidden;
      }, state);
      await assertHorizontalRegions(page, route, width, theme, `ride:${rootIndex}:${state}`);
      await scan(page, route, width, theme, `ride:${rootIndex}:${state}`);
    }
  }
}

async function scanCareerStates(page, route, width, theme) {
  if (route !== 'career') return;
  const stations = page.locator('.cr-strip__s');
  for (let index = 0; index < await stations.count(); index++) {
    const station = stations.nth(index);
    const state = await station.getAttribute('data-go');
    await station.focus();
    await station.press('Enter');
    await page.waitForFunction(id => document.getElementById(id)?.classList.contains('is-on') === true, state);
    await scan(page, route, width, theme, `career:${state}`);
  }
}

async function scanDisclosureRepresentative(page, route, width, theme) {
  const count = await page.locator('details').count();
  if (!count) return;
  await page.locator('details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await scan(page, route, width, theme, 'disclosures:all-open');
}

async function scanBlindStates(page, route, width, theme) {
  const blinds = page.locator('[data-blind]');
  for (let rootIndex = 0; rootIndex < await blinds.count(); rootIndex++) {
    const blind = blinds.nth(rootIndex);
    const items = blind.locator('.blind__stop');
    const itemCount = await items.count();
    if (!itemCount) {
      fail('state-discovery', route, width, theme, `blind:${rootIndex}`, 'blind has no states');
      continue;
    }
    const previous = blind.locator('[data-blind-prev]');
    const next = blind.locator('[data-blind-next]');
    if (await previous.count() !== 1 || await next.count() !== 1) {
      fail('blind-keyboard', route, width, theme, `blind:${rootIndex}`, 'blind lacks one previous and one next control');
      continue;
    }
    const names = await blind.locator('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label') || button.textContent.trim()));
    if (names.some(name => !name)) fail('accessible-name', route, width, theme, `blind:${rootIndex}`, 'blind has an unnamed control');
    await scan(page, route, width, theme, `blind:${rootIndex}:0`);
    for (let stateIndex = 1; stateIndex < itemCount; stateIndex++) {
      const before = await blind.locator('.blind__roll').evaluate(node => node.style.transform);
      await next.focus();
      await next.press('Enter');
      try {
        await page.waitForFunction(({ rootIndex: i, before: value }) => document.querySelectorAll('[data-blind]')[i]?.querySelector('.blind__roll')?.style.transform !== value, { rootIndex, before });
      } catch {
        fail('blind-keyboard', route, width, theme, `blind:${rootIndex}:${stateIndex}`, 'Next did not change the blind state');
      }
      const keptFocus = await next.evaluate(button => document.activeElement === button);
      if (!keptFocus) fail('focus', route, width, theme, `blind:${rootIndex}:${stateIndex}`, 'blind control lost focus');
      await scan(page, route, width, theme, `blind:${rootIndex}:${stateIndex}`);
    }
    if (itemCount > 1) {
      const before = await blind.locator('.blind__roll').evaluate(node => node.style.transform);
      await previous.focus();
      await previous.press('Enter');
      try {
        await page.waitForFunction(({ rootIndex: i, before: value }) => document.querySelectorAll('[data-blind]')[i]?.querySelector('.blind__roll')?.style.transform !== value, { rootIndex, before });
      } catch {
        fail('blind-keyboard', route, width, theme, `blind:${rootIndex}:previous`, 'Previous did not change the blind state');
      }
      const keptFocus = await previous.evaluate(button => document.activeElement === button);
      if (!keptFocus) fail('focus', route, width, theme, `blind:${rootIndex}:previous`, 'blind previous control lost focus');
    }
  }
}

const browser = await chromium.launch();
try {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      for (const route of ROUTES) {
        const blocked = [];
        const context = await browser.newContext({
          viewport,
          screen: viewport,
          deviceScaleFactor: 1,
          isMobile: viewport.width < 768,
          hasTouch: viewport.width < 768,
          colorScheme: theme,
          reducedMotion: 'reduce',
          locale: 'en-US',
          timezoneId: 'UTC',
          serviceWorkers: 'block',
        });
        await context.addInitScript(selectedTheme => {
          try { localStorage.setItem('theme', selectedTheme); } catch {}
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
        await context.route('**/*', async routeHandler => {
          const requestUrl = new URL(routeHandler.request().url());
          if (requestUrl.origin === LOCAL_ORIGIN || requestUrl.protocol === 'data:' || requestUrl.protocol === 'blob:') await routeHandler.continue();
          else { blocked.push(requestUrl.origin + requestUrl.pathname); await routeHandler.abort('blockedbyclient'); }
        });
        const page = await context.newPage();
        const runtimeErrors = [];
        page.on('pageerror', error => runtimeErrors.push(error.message));
        page.on('console', message => {
          if (message.type() === 'error' && !message.text().includes('Failed to load resource')) runtimeErrors.push(message.text());
        });
        page.on('requestfailed', request => {
          const url = new URL(request.url());
          if (url.origin === LOCAL_ORIGIN) runtimeErrors.push(`local request failed: ${url.pathname}`);
        });
        try {
          await openPage(page, route.file);
          await applyPlant(page, route.id, viewport.width, theme);
          await discover(page, route.id, viewport.width, theme);
          await assertPageGeometry(page, route.id, viewport.width, theme, 'default');
          await assertCareer(page, route.id, viewport.width, theme);
          await assertHorizontalRegions(page, route.id, viewport.width, theme, 'default');
          await scan(page, route.id, viewport.width, theme, 'default');
          await scanDialogStates(page, route.id, viewport.width, theme);
          await scanRideStates(page, route.id, viewport.width, theme);
          await scanCareerStates(page, route.id, viewport.width, theme);
          await scanBlindStates(page, route.id, viewport.width, theme);
          await scanDisclosureRepresentative(page, route.id, viewport.width, theme);
        } catch (error) {
          fail('runner', route.id, viewport.width, theme, 'default', error.message);
        }
        for (const message of runtimeErrors) fail('runtime', route.id, viewport.width, theme, 'default', message);
        for (const url of [...new Set(blocked)].sort()) warn('network-blocked', route.id, viewport.width, theme, 'default', url);
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

const evidence = {
  contractVersion: CONTRACT.version,
  contractSha256: CONTRACT_SHA256,
  baselineId: provenance.baselineId || '',
  sourceHash: provenance.sourceHash || '',
  artifactHash: provenance.artifactHash || '',
  routes: CONTRACT.routes.map(route => route.id),
  viewports: CONTRACT.viewports,
  themes: CONTRACT.themes,
  contexts,
  plant: plantEvidence,
  failures,
  warnings,
};
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(evidence, null, 2) + '\n');
console.log(`\n${failures.length} accessibility failure(s), ${warnings.length} warning(s), ${contexts.length} axe context(s)`);
process.exit(failures.length ? 1 : 0);
