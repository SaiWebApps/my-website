import { AxeBuilder } from '@axe-core/playwright';
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSharedRouteOracle, verifySharedRoutePixels } from './shared-route-oracle.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const base = process.env.SPEAKING_BASE || 'http://127.0.0.1:4417/';
const origin = base.endsWith('/') ? base : base + '/';
const localOrigin = new URL(origin).origin;
const jsonIndex = process.argv.indexOf('--json');
const outputPath = jsonIndex >= 0 ? process.argv[jsonIndex + 1] : '';
const capturesIndex = process.argv.indexOf('--captures');
const capturesPath = capturesIndex >= 0 ? process.argv[capturesIndex + 1] : '';
const speakingOnly = process.argv.includes('--speaking-only');
const mutationTest = process.argv.includes('--mutation-test');
const artifactRoot = process.env.ARTIFACT_ROOT || '';
const EXPECTED_CONTRACT_SHA256 = '0fe285c858bde55d5640253762223b799bf849309079fdc71be52525243231fd';
const EXPECTED_AUTHORITY_CONTRACT_SHA256 = '750bedd6316830dee1f6495feea0fefe1a80ddcc7dab8d427059fa8ee16cacae';

const contractPath = join(ROOT, '.claude/rubric/speaking-proof-contract.json');
const contractBytes = readFileSync(contractPath);
const contract = JSON.parse(contractBytes);
const authorityContractPath = join(ROOT, '.claude/rubric/authority/speaking-evidence-contract.json');
const authorityContractBytes = readFileSync(authorityContractPath);
const authorityManifestPath = join(ROOT, '.claude/rubric/authority.json');
const authorityManifestBytes = readFileSync(authorityManifestPath);
const atomLedgerPath = join(ROOT, contract.proofLedger.factAtomLedger.path);
const atomLedgerBytes = readFileSync(atomLedgerPath);
const atomLedger = JSON.parse(atomLedgerBytes);

class VerificationError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

function fail(message, kind = 'speaking-verifier') {
  throw new VerificationError(kind, message);
}

function assert(value, message, kind = 'speaking-verifier') {
  if (!value) fail(message, kind);
}

async function bounded(promise, label, milliseconds) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new VerificationError('timeout', `${label} exceeded ${milliseconds}ms`)), milliseconds);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function boundedFetch(url, label, milliseconds = 10000) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(milliseconds) });
  } catch (error) {
    fail(`${label} did not respond within ${milliseconds}ms: ${String(error?.message || error)}`, 'network-timeout');
  }
}

function progress(message) {
  process.stderr.write(`[speaking-verifier] ${message}\n`);
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function normalized(value) {
  let output = '';
  let pendingSpace = false;
  for (const char of String(value || '')) {
    if (char.trim() === '') pendingSpace = output.length > 0;
    else {
      if (pendingSpace) output += ' ';
      output += char;
      pendingSpace = false;
    }
  }
  return output;
}

function countExact(haystack, needle) {
  let count = 0;
  let offset = 0;
  while (needle && (offset = haystack.indexOf(needle, offset)) >= 0) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

function repoPath(relativePath) {
  return join(ROOT, ...relativePath.split('/'));
}

function sourceTreeHash(root, omitted = []) {
  const digest = createHash('sha256');
  const omittedPaths = new Set(omitted);
  const walk = directory => {
    const entries = readdirSync(directory).sort();
    const files = entries.filter(name => statSync(join(directory, name)).isFile());
    const directories = entries.filter(name => name !== '__pycache__' && statSync(join(directory, name)).isDirectory());
    for (const name of files) {
      const path = join(directory, name);
      const rel = relative(root, path).split(sep).join('/');
      if (omittedPaths.has(rel)) continue;
      digest.update(Buffer.from(rel, 'utf8'));
      digest.update(readFileSync(path));
    }
    for (const name of directories) walk(join(directory, name));
  };
  walk(root);
  return digest.digest('hex');
}

function verifyContractAndSources() {
  assert(hash(contractBytes) === EXPECTED_CONTRACT_SHA256, 'Speaking proof contract bytes changed', 'contract');
  assert(hash(authorityContractBytes) === EXPECTED_AUTHORITY_CONTRACT_SHA256,
    'Speaking authority evidence contract bytes changed', 'authority');
  assert(contract.schemaVersion === 1, 'Speaking proof contract schema changed', 'contract');
  for (const [name, record] of Object.entries(contract.authority)) {
    const bytes = readFileSync(repoPath(record.path));
    assert(hash(bytes) === record.sha256, `Speaking authority ${name} bytes changed`, 'authority');
  }
  assert(hash(atomLedgerBytes) === contract.proofLedger.factAtomLedger.sha256,
    'Speaking fact-atom ledger bytes changed', 'proof-ledger');
  assert(atomLedger.canonicalProofAtomLedgerSha256 === contract.proofLedger.factAtomLedger.canonicalProofAtomLedgerSha256,
    'Speaking fact-atom ledger canonical hash changed', 'proof-ledger');
  assert(atomLedger.proofCount === contract.proofLedger.count
      && atomLedger.atomCount === contract.proofLedger.atomCount
      && atomLedger.factBackedAtomCount === contract.proofLedger.factBackedAtomCount,
  'Speaking fact-atom ledger counts differ from the proof contract', 'proof-ledger');
  for (const record of Object.values(contract.frozenNonSpeaking.html)) {
    assert(hash(readFileSync(repoPath(record.path))) === record.sha256,
      `Frozen source HTML changed: ${record.path}`, 'frozen-route');
  }
  const sharedBytes = readFileSync(repoPath(contract.frozenNonSpeaking.sharedOracle.path));
  assert(hash(sharedBytes) === contract.frozenNonSpeaking.sharedOracle.sha256,
    'Shared-route oracle bytes changed', 'frozen-route');
  const projectsBytes = readFileSync(repoPath(contract.frozenNonSpeaking.projectsProofContract.path));
  assert(hash(projectsBytes) === contract.frozenNonSpeaking.projectsProofContract.sha256,
    'Projects proof contract bytes changed', 'frozen-route');
}

function verifyHeroCollisionTransition() {
  const record = contract.authority.speakingHeroCollisionTransition;
  assert(record && record.path === '.claude/rubric/authority/speaking-hero-collision-transition.json',
    'Speaking hero collision authority path changed', 'hero-collision');
  const bytes = readFileSync(repoPath(record.path));
  const transition = JSON.parse(bytes);
  assert(hash(bytes) === record.sha256
      && transition.schemaVersion === 1
      && transition.id === 'speaking-wide-hero-collision'
      && transition.status === 'accepted-governed-transition',
  'Speaking hero collision authority identity changed', 'hero-collision');
  const source = transition.sourceTransition;
  assert(source.priorProofContractSha256 === '009430f7c5f95208d89c2db8e5cd2ed318795ad5e3c8f6f03d9bc5667e1d7b20'
      && source.priorSpeakingCssSha256 === '50bfcc62aecb982dfc116eb4ebc1a565f5026ce0a929152d9f279e0cd81add17'
      && source.priorSpeakingHtmlSha256 === '51673ea0d4c45bec0e1f8a7e40a6b629d59a2e25ceb40b2834c8f8a0b4ee13f1'
      && source.candidateSpeakingCssSha256 === contract.styles.speaking.sha256
      && source.candidateSpeakingHtmlSha256 === contract.styles.generatedHtml.sha256,
  'Speaking hero source transition changed', 'hero-collision');
  const visualByKey = new Map(contract.runtime.visualFrames.map(frame => [`${frame.width}:${frame.theme}`, frame.sha256]));
  assert(transition.preservedFrames.length === 4
      && canonicalJson(transition.preservedFrames.map(frame => `${frame.width}:${frame.theme}`))
        === canonicalJson(['375:light', '375:dark', '768:light', '768:dark'])
      && transition.preservedFrames.every(frame => visualByKey.get(`${frame.width}:${frame.theme}`) === frame.sha256),
  'Speaking hero transition did not preserve the exact 375 and 768 frames', 'hero-collision');
  assert(transition.authorizedFrameChanges.length === 2
      && canonicalJson(transition.authorizedFrameChanges.map(frame => `${frame.width}:${frame.theme}`))
        === canonicalJson(['1440:light', '1440:dark'])
      && transition.authorizedFrameChanges.every(frame => visualByKey.get(`${frame.width}:${frame.theme}`) === frame.candidateSha256)
      && transition.authorizedFrameChanges.every(frame => frame.diffBbox.left >= 0
        && frame.diffBbox.top >= 0 && frame.diffBbox.right < frame.width
        && frame.diffBbox.bottom < transition.pixelIsolation.viewportHeight
        && frame.diffBbox.top >= 150 && frame.diffBbox.bottom <= 450),
  'Speaking hero frame transition is not confined to the measured hero', 'hero-collision');
  const isolation = transition.pixelIsolation;
  assert(isolation.method === 'isolated-hero-raster-mask-v1'
      && isolation.viewportHeight === 900 && isolation.differenceThreshold === 0
      && isolation.contexts.length === 4
      && canonicalJson(isolation.contexts.map(item => `${item.width}:${item.theme}`))
        === canonicalJson(['1440:light', '1440:dark', '1600:light', '1600:dark'])
      && isolation.contexts.every(item => item.titleInkPixels > 0
        && item.targets.length === 3
        && item.targets.every(target => target.inkPixels > 0 && target.intersectionPixels === 0
          && target.horizontalClearance > 0)),
  'Speaking hero pixel-isolation contract changed', 'hero-collision');
  const frozen = transition.frozenCollateral;
  assert(frozen.sharedRouteOraclePath === contract.frozenNonSpeaking.sharedOracle.path
      && frozen.sharedRouteOracleSha256 === contract.frozenNonSpeaking.sharedOracle.sha256
      && frozen.sharedAll === '160d42d18e7e31298496705f3ec66d4d1066ba5f91e19f6c499c49a6099e75f8'
      && frozen.projectsProofContractPath === contract.frozenNonSpeaking.projectsProofContract.path
      && frozen.projectsProofContractSha256 === contract.frozenNonSpeaking.projectsProofContract.sha256
      && frozen.nonSpeakingHtmlCount === Object.keys(contract.frozenNonSpeaking.html).length
      && frozen.sharedFrameCount === 68,
  'Speaking hero transition collateral binding changed', 'frozen-route');
  return {
    id: transition.id,
    manifestSha256: hash(bytes),
    priorProofContractSha256: source.priorProofContractSha256,
    priorSpeakingCssSha256: source.priorSpeakingCssSha256,
    candidateSpeakingCssSha256: source.candidateSpeakingCssSha256,
    priorSpeakingHtmlSha256: source.priorSpeakingHtmlSha256,
    candidateSpeakingHtmlSha256: source.candidateSpeakingHtmlSha256,
    preservedFrameCount: transition.preservedFrames.length,
    changedFrameCount: transition.authorizedFrameChanges.length,
    sharedRouteOracleSha256: frozen.sharedRouteOracleSha256,
    sharedAll: frozen.sharedAll,
    projectsProofContractSha256: frozen.projectsProofContractSha256,
  };
}

function collectFiles(root) {
  const files = [];
  const walk = directory => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const record = statSync(path);
      if (record.isDirectory()) walk(path);
      else if (record.isFile()) files.push(path);
    }
  };
  walk(root);
  return files;
}

function verifySourceAssets() {
  const poster = contract.asset.poster;
  const posterBytes = readFileSync(repoPath(poster.path));
  assert(hash(posterBytes) === poster.sha256, 'Source Atos poster bytes changed', 'asset-bytes');
  const deck = contract.asset.deck;
  const deckRoot = repoPath(deck.path);
  const files = collectFiles(deckRoot);
  assert(files.length === deck.fileCount, `Source Atos deck file count is ${files.length}`, 'asset-bytes');
  const expected = new Map(deck.files.map(record => [record.path, record.sha256]));
  const stream = createHash('sha256');
  const actualPaths = [];
  for (const path of files) {
    const rel = relative(deckRoot, path).split(sep).join('/');
    const bytes = readFileSync(path);
    actualPaths.push(rel);
    assert(expected.get(rel) === hash(bytes), `Source Atos deck file changed: ${rel}`, 'asset-bytes');
    stream.update(Buffer.from(rel, 'utf8'));
    stream.update(bytes);
  }
  assert(JSON.stringify(actualPaths) === JSON.stringify(deck.files.map(record => record.path).sort()),
    'Source Atos deck path inventory changed', 'asset-bytes');
  assert(stream.digest('hex') === deck.treeSha256, 'Source Atos deck tree hash changed', 'asset-bytes');
  assert(hash(readFileSync(join(deckRoot, deck.entry.path))) === deck.entry.sha256,
    'Source Atos deck entry bytes changed', 'asset-bytes');
  return { posterSha256: poster.sha256, deckTreeSha256: deck.treeSha256, deckFileCount: files.length };
}

function matchingBrace(source, start) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}' && --depth === 0) return index;
  }
  fail('Speaking stylesheet block has unbalanced braces', 'route-scope');
}

function selectorsIn(source) {
  const selectors = [];
  let offset = 0;
  while (offset < source.length) {
    const open = source.indexOf('{', offset);
    const semicolon = source.indexOf(';', offset);
    if (semicolon >= 0 && (open < 0 || semicolon < open)) {
      const statement = source.slice(offset, semicolon).trim();
      if (statement.startsWith('@')) {
        fail(`Speaking stylesheet contains unsupported global at-rule: ${statement}`, 'route-scope');
      }
      offset = semicolon + 1;
      continue;
    }
    if (open < 0) break;
    let prelude = source.slice(offset, open);
    while (prelude.includes('/*')) {
      const commentStart = prelude.indexOf('/*');
      const commentEnd = prelude.indexOf('*/', commentStart + 2);
      assert(commentEnd >= 0, 'Speaking stylesheet contains an unterminated comment', 'route-scope');
      prelude = prelude.slice(0, commentStart) + prelude.slice(commentEnd + 2);
    }
    prelude = prelude.trim();
    const close = matchingBrace(source, open);
    const body = source.slice(open + 1, close);
    if (prelude.startsWith('@media') || prelude.startsWith('@supports') || prelude.startsWith('@container')) {
      selectors.push(...selectorsIn(body));
    } else if (prelude.startsWith('@')) {
      fail(`Speaking stylesheet contains unsupported global at-rule: ${prelude}`, 'route-scope');
    } else if (prelude && !prelude.startsWith('@')) {
      selectors.push(...prelude.split(',').map(value => value.trim()).filter(Boolean));
    }
    offset = close + 1;
  }
  return selectors;
}

function verifyRouteScopedCss() {
  const sharedBytes = readFileSync(join(ROOT, 'site/style.css'));
  const sharedCss = sharedBytes.toString('utf8');
  const routeBytes = readFileSync(join(ROOT, 'site/speaking.css'));
  const routeCss = routeBytes.toString('utf8');
  assert(hash(sharedBytes) === '4576d21e5e55bdf9ccd67a2e718a37b2422129fb640fc1e79446eb7fd9192196',
    'Shared stylesheet bytes changed', 'frozen-route');
  assert(!sharedCss.includes('.sp2'), 'Shared stylesheet contains a Speaking selector', 'route-scope');
  const selectors = selectorsIn(routeCss);
  assert(selectors.length > 0, 'Speaking stylesheet block contains no selectors', 'route-scope');
  for (const selector of selectors) {
    assert(selector.startsWith('.sp2'), `Speaking selector is not route-scoped: ${selector}`, 'route-scope');
  }
  return { selectorCount: selectors.length, sharedSha256: hash(sharedBytes), routeSha256: hash(routeBytes) };
}

async function verifyCandidateAssets() {
  for (const name of ['style.css', 'speaking.css']) {
    const styleResponse = await boundedFetch(new URL(name, origin), `Candidate ${name}`);
    assert(styleResponse.ok, `Candidate ${name} returned ${styleResponse.status}`, 'route-scope');
    const candidateBytes = Buffer.from(await styleResponse.arrayBuffer());
    if (name === 'speaking.css') {
      const candidateSelectors = selectorsIn(candidateBytes.toString('utf8'));
      assert(candidateSelectors.length > 0, 'Candidate Speaking stylesheet contains no selectors', 'route-scope');
      for (const selector of candidateSelectors) {
        assert(selector.startsWith('.sp2'),
          `Candidate Speaking selector is not route-scoped: ${selector}`, 'route-scope');
      }
    }
    assert((mutationTest && name === 'speaking.css')
        || hash(candidateBytes) === hash(readFileSync(join(ROOT, 'site', name))),
      `Candidate ${name} differs from source`, 'route-scope');
  }
  const poster = contract.asset.poster;
  const response = await boundedFetch(new URL(poster.path, origin), 'Candidate Atos poster');
  assert(response.ok, `Candidate Atos poster returned ${response.status}`, 'asset-bytes');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(hash(bytes) === poster.sha256, 'Candidate Atos poster bytes changed', 'asset-bytes');
  const deck = contract.asset.deck;
  const stream = createHash('sha256');
  for (const record of [...deck.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
    const fileResponse = await boundedFetch(new URL(`${deck.path}/${record.path}`, origin),
      `Candidate Atos deck file ${record.path}`);
    assert(fileResponse.ok, `Candidate Atos deck file returned ${fileResponse.status}: ${record.path}`, 'asset-bytes');
    const fileBytes = Buffer.from(await fileResponse.arrayBuffer());
    assert(hash(fileBytes) === record.sha256, `Candidate Atos deck file changed: ${record.path}`, 'asset-bytes');
    stream.update(Buffer.from(record.path, 'utf8'));
    stream.update(fileBytes);
  }
  assert(stream.digest('hex') === deck.treeSha256, 'Candidate Atos deck tree hash changed', 'asset-bytes');
  return { posterSha256: hash(bytes), deckTreeSha256: deck.treeSha256, posterBytes: bytes };
}

async function contextFor(browser, runtime, options = {}) {
  const jsOn = runtime.javascript === 'on';
  const context = await browser.newContext({
    viewport: { width: runtime.width, height: 900 }, screen: { width: runtime.width, height: 900 },
    deviceScaleFactor: 1, isMobile: runtime.width < 768, hasTouch: runtime.width < 768,
    colorScheme: runtime.theme, reducedMotion: runtime.motion === 'reduced' ? 'reduce' : 'no-preference',
    javaScriptEnabled: jsOn, locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block',
  });
  if (jsOn) {
    await context.addInitScript(theme => {
      try { localStorage.setItem('theme', theme); } catch {}
      let seed = 1729;
      Math.random = () => { seed = seed * 48271 % 2147483647; return seed / 2147483647; };
      const NativeDate = Date, fixedNow = Date.UTC(2026, 9, 28, 12), started = performance.now();
      const deterministicNow = () => fixedNow + Math.floor(performance.now() - started);
      class FixedDate extends NativeDate {
        constructor(...values) { super(...(values.length ? values : [deterministicNow()])); }
        static now() { return deterministicNow(); }
      }
      Object.setPrototypeOf(FixedDate, NativeDate);
      window.Date = FixedDate;
    }, runtime.theme);
  }
  const trace = { external: [], failed: [], badResponses: [], console: [], pageErrors: [], suppressedScripts: [] };
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (options.suppressSiteScripts && url.origin === localOrigin && route.request().resourceType() === 'script') {
      trace.suppressedScripts.push(url.pathname + url.search);
      await route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '' });
    } else if (url.origin === localOrigin || url.protocol === 'data:' || url.protocol === 'blob:') await route.continue();
    else {
      trace.external.push(url.href);
      await route.abort('blockedbyclient');
    }
  });
  return { context, trace };
}

async function settleStaticTwin(page) {
  await page.evaluate(() => {
    for (const image of document.images) image.loading = 'eager';
  });
  await page.waitForLoadState('load', { timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 });
  await bounded(page.evaluate(async () => {
    if (document.fonts) await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode ? image.decode().catch(() => {}) : Promise.resolve()));
  }), 'static analysis twin settlement', 15000);
}

async function settle(page, jsOn) {
  if (jsOn) {
    await page.waitForFunction(
      () => window.__SITE_READY__ === true && document.documentElement.dataset.siteReady === 'true',
      null,
      { timeout: 15000 },
    );
    await bounded(page.evaluate(async () => {
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
    }), 'JavaScript-on paint settlement', 20000);
    return;
  }
  // JavaScript-disabled documents cannot resolve page-side promises, timers,
  // or animation frames. Make images eager synchronously, then use the browser
  // navigation lifecycle as the bounded external readiness signal.
  await page.evaluate(() => {
    for (const image of document.images) image.loading = 'eager';
  });
  await page.waitForLoadState('load', { timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 });
  const readiness = await page.evaluate(() => ({
    fontStatus: document.fonts ? document.fonts.status : 'loaded',
    images: [...document.images].map(image => ({
      src: image.getAttribute('src') || '', complete: image.complete,
      naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
    })),
  }));
  assert(readiness.fontStatus === 'loaded', 'JavaScript-off fonts did not finish loading', 'runtime');
  const incomplete = readiness.images.filter(image => !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0);
  assert(incomplete.length === 0,
    `JavaScript-off images did not finish loading: ${incomplete.map(image => image.src).join(', ')}`, 'runtime');
}

async function openPage(context, trace, route, jsOn, staticTwin = false) {
  const page = await context.newPage();
  page.on('requestfailed', request => trace.failed.push(`${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('response', response => { if (response.status() >= 400) trace.badResponses.push(`${response.status()} ${response.url()}`); });
  page.on('console', message => { if (message.type() === 'error') trace.console.push(message.text()); });
  page.on('pageerror', error => trace.pageErrors.push(String(error.message || error)));
  await page.goto(new URL(route, origin).href, { waitUntil: 'domcontentloaded' });
  if (staticTwin) await settleStaticTwin(page);
  else await settle(page, jsOn);
  return page;
}

function verifyTrace(trace, label) {
  assert(trace.external.length === 0, `${label}: external requests attempted: ${trace.external.join(', ')}`, 'runtime');
  assert(trace.failed.length === 0, `${label}: requests failed: ${trace.failed.join(', ')}`, 'runtime');
  assert(trace.badResponses.length === 0, `${label}: bad responses: ${trace.badResponses.join(', ')}`, 'runtime');
  assert(trace.console.length === 0, `${label}: console errors: ${trace.console.join(', ')}`, 'runtime');
  assert(trace.pageErrors.length === 0, `${label}: page errors: ${trace.pageErrors.join(', ')}`, 'runtime');
}

async function semanticSnapshot(page) {
  return page.evaluate(() => {
    const norm = value => {
      let output = '', pendingSpace = false;
      for (const char of String(value || '')) {
        if (char.trim() === '') pendingSpace = output.length > 0;
        else {
          if (pendingSpace) output += ' ';
          output += char;
          pendingSpace = false;
        }
      }
      return output;
    };
    const inspect = node => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const clippedBy = [];
      let hiddenBy = '';
      let clipPathBy = '';
      let maskBy = '';
      let pseudoOcclusionBy = '';
      let effectiveOpacity = 1;
      let effectiveScaleX = 1;
      let effectiveScaleY = 1;
      let effectiveZoom = 1;
      let effectiveFilterOpacity = 1;
      let nonOpacityFilterBy = '';
      let selfClipped = false;
      let contentVisibilityBy = '';
      const alphaOf = color => {
        const value = String(color || '').trim();
        if (value === 'transparent') return 0;
        if (!value.startsWith('rgba(')) return 1;
        const close = value.indexOf(')');
        const parts = value.slice(5, close < 0 ? value.length : close).split(',').map(part => part.trim());
        return parts.length === 4 ? Number(parts[3]) : 1;
      };
      const filterOpacityOf = filter => {
        const value = String(filter || '');
        const start = value.indexOf('opacity(');
        if (start < 0) return 1;
        const end = value.indexOf(')', start + 8);
        if (end < 0) return 1;
        const amount = value.slice(start + 8, end).trim();
        return amount.endsWith('%') ? Number(amount.slice(0, -1)) / 100 : Number(amount);
      };
      const pixels = value => {
        const text = String(value || '').trim();
        return text.endsWith('px') ? Number(text.slice(0, -2)) : Number.NaN;
      };
      const pseudoOccludes = (owner, pseudo) => {
        const style = getComputedStyle(owner, pseudo);
        if (!style || ['none', 'normal'].includes(style.content)
            || !['absolute', 'fixed'].includes(style.position)
            || style.display === 'none' || style.visibility === 'hidden') return false;
        const opacity = Number(style.opacity);
        if (Number.isFinite(opacity) && opacity < 0.1) return false;
        const zIndex = Number(style.zIndex);
        if (Number.isFinite(zIndex) && zIndex < 0) return false;
        const ownerRect = owner.getBoundingClientRect();
        const left = pixels(style.left), right = pixels(style.right);
        const top = pixels(style.top), bottom = pixels(style.bottom);
        let width = pixels(style.width), height = pixels(style.height);
        if (!Number.isFinite(width) && Number.isFinite(left) && Number.isFinite(right)) width = ownerRect.width - left - right;
        if (!Number.isFinite(height) && Number.isFinite(top) && Number.isFinite(bottom)) height = ownerRect.height - top - bottom;
        const area = Math.max(0, width) * Math.max(0, height);
        const coverage = ownerRect.width > 0 && ownerRect.height > 0 ? area / (ownerRect.width * ownerRect.height) : 0;
        const paints = alphaOf(style.backgroundColor) >= 0.1
          || (style.backgroundImage && style.backgroundImage !== 'none')
          || (style.boxShadow && style.boxShadow !== 'none');
        return coverage >= 0.5 && paints;
      };
      for (let current = node; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        const opacity = Number(style.opacity);
        if (Number.isFinite(opacity)) effectiveOpacity *= opacity;
        if (style.clipPath && style.clipPath !== 'none') clipPathBy ||= current.id || current.className || current.tagName;
        const maskImages = [style.maskImage, style.webkitMaskImage].map(value => String(value || 'none'));
        if (maskImages.some(value => value !== 'none')) maskBy ||= current.id || current.className || current.tagName;
        if (!pseudoOcclusionBy && (pseudoOccludes(current, '::before') || pseudoOccludes(current, '::after'))) {
          pseudoOcclusionBy = current.id || current.className || current.tagName;
        }
        if (style.contentVisibility === 'hidden') contentVisibilityBy ||= current.id || current.className || current.tagName;
        const filterOpacity = filterOpacityOf(style.filter);
        if (Number.isFinite(filterOpacity)) effectiveFilterOpacity *= filterOpacity;
        const filterText = String(style.filter || 'none').trim();
        if (filterText !== 'none') {
          const close = filterText.indexOf(')');
          const pureOpacity = filterText.startsWith('opacity(') && close === filterText.length - 1;
          if (!pureOpacity) nonOpacityFilterBy ||= current.id || current.className || current.tagName;
        }
        const zoom = Number(style.zoom);
        if (Number.isFinite(zoom)) effectiveZoom *= zoom;
        if (style.transform && style.transform !== 'none') {
          const matrix = new DOMMatrixReadOnly(style.transform);
          effectiveScaleX *= Math.hypot(matrix.a, matrix.b);
          effectiveScaleY *= Math.hypot(matrix.c, matrix.d);
        }
        if (current.hidden || current.inert || current.getAttribute('aria-hidden') === 'true'
            || style.display === 'none' || style.visibility === 'hidden' || opacity === 0) {
          hiddenBy = current.id || current.className || current.tagName;
          break;
        }
        const clipsX = ['hidden', 'clip'].includes(style.overflowX);
        const clipsY = ['hidden', 'clip'].includes(style.overflowY);
        if (current === node) {
          selfClipped = (clipsX && current.scrollWidth > current.clientWidth + 1)
            || (clipsY && current.scrollHeight > current.clientHeight + 1);
        } else {
          const parentRect = current.getBoundingClientRect();
          if ((clipsX && (rect.left < parentRect.left - 1 || rect.right > parentRect.right + 1))
              || (clipsY && (rect.top < parentRect.top - 1 || rect.bottom > parentRect.bottom + 1))) {
            clippedBy.push(current.id || current.className || current.tagName);
          }
        }
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      const textRect = range.getBoundingClientRect();
      const nodeStyle = getComputedStyle(node);
      return {
        width: rect.width, height: rect.height, left: rect.left, right: rect.right,
        top: rect.top, bottom: rect.bottom, documentTop: rect.top + scrollY,
        hiddenBy, clippedBy, clipPathBy, maskBy, pseudoOcclusionBy, contentVisibilityBy, selfClipped,
        effectiveOpacity, effectiveFilterOpacity, effectiveScaleX, effectiveScaleY, effectiveZoom, nonOpacityFilterBy,
        colorAlpha: alphaOf(nodeStyle.color), textFillAlpha: alphaOf(nodeStyle.webkitTextFillColor),
        textWidth: textRect.width, textHeight: textRect.height, textLeft: textRect.left,
        textRight: textRect.right, textTop: textRect.top, textBottom: textRect.bottom,
        textDocumentTop: textRect.top + scrollY,
        hasText: norm(node.textContent).length > 0,
      };
    };
    const proofs = [...document.querySelectorAll('[data-speaking-proof]')].map(node => ({
      id: node.dataset.proofId,
      owner: node.dataset.proofUnit,
      contentUnit: node.dataset.contentUnit || null,
      parentClasses: [...node.parentElement.classList],
      nearestMember: node.closest('[data-authority-member]')?.dataset.authorityMember || null,
      nearestMemberBlock: node.closest('[data-authority-member]')?.id || null,
      nearestGroup: node.closest('[data-authority-group]')?.id || null,
      nestedProofs: node.querySelectorAll('[data-speaking-proof]').length,
      state: inspect(node),
      atoms: [...node.querySelectorAll('[data-atom]')].map(atom => ({
        factId: atom.dataset.factId || null,
        fragment: atom.dataset.factFragment || null,
        excerpt: atom.hasAttribute('data-fact-excerpt'),
        text: norm(atom.textContent),
        state: inspect(atom),
      })),
    }));
    const groups = [...document.querySelectorAll('[data-authority-group]')].map(node => {
      const headingId = node.getAttribute('aria-labelledby') || '';
      const heading = headingId ? document.getElementById(headingId) : null;
      return {
        id: node.id, authorityGroup: node.dataset.authorityGroup, headingId,
        heading: norm(heading?.textContent), nestedGroups: node.querySelectorAll('[data-authority-group]').length,
        headingIsDescendant: Boolean(heading && node.contains(heading)), headingTag: heading?.tagName || null,
        members: [...node.querySelectorAll('[data-authority-member]')]
          .filter(member => member.closest('[data-authority-group]') === node)
          .map(member => member.dataset.authorityMember),
        state: inspect(node),
      };
    });
    const members = [...document.querySelectorAll('[data-authority-member]')].map(node => ({
      id: node.id,
      authorityMember: node.dataset.authorityMember,
      label: norm(document.getElementById(node.getAttribute('aria-labelledby') || '')?.textContent),
      headingId: node.getAttribute('aria-labelledby') || '',
      headingIsDescendant: Boolean(document.getElementById(node.getAttribute('aria-labelledby') || '')
        && node.contains(document.getElementById(node.getAttribute('aria-labelledby') || ''))),
      headingTag: document.getElementById(node.getAttribute('aria-labelledby') || '')?.tagName || null,
      group: node.closest('[data-authority-group]')?.id || null,
      nestedMembers: node.querySelectorAll('[data-authority-member]').length,
      state: inspect(node),
    }));
    const sessions = [...document.querySelectorAll('[data-speaking-session]')].map(node => ({
      id: node.dataset.sessionId,
      owner: node.dataset.sessionOwner,
      member: node.closest('[data-authority-member]')?.dataset.authorityMember || null,
      titleFactId: node.querySelector('[data-session-title-fact]')?.dataset.sessionTitleFact || null,
      dateFactId: node.querySelector('[data-session-date-fact]')?.dataset.sessionDateFact || null,
      title: norm(node.querySelector('[data-session-title-fact]')?.textContent),
      date: norm(node.querySelector('[data-session-date-fact]')?.textContent),
      titleState: inspect(node.querySelector('[data-session-title-fact]')),
      dateState: inspect(node.querySelector('[data-session-date-fact]')),
      state: inspect(node),
    }));
    const indexEntries = [...document.querySelectorAll('.sp2-index a')].map(node => ({
      href: node.getAttribute('href'), label: norm(node.textContent),
      kind: node.classList.contains('sp2-index__group') ? 'group' : 'member', state: inspect(node),
    }));
    const headings = [...document.querySelectorAll('.sp2 h1, .sp2 h2, .sp2 h3, .sp2 h4, .sp2 h5, .sp2 h6')]
      .map(node => ({ level: Number(node.tagName.slice(1)), text: norm(node.textContent), state: inspect(node) }));
    const topics = document.querySelector('#talks');
    const topicsHeadingNode = document.querySelector('#sp2-topics-h');
    const topicsHeading = topicsHeadingNode ? {
      id: topicsHeadingNode.id,
      tag: topicsHeadingNode.tagName,
      text: norm(topicsHeadingNode.textContent),
      ownerId: topicsHeadingNode.closest('section')?.id || null,
      isDescendant: Boolean(topics && topics.contains(topicsHeadingNode)),
      state: inspect(topicsHeadingNode),
    } : null;
    const poster = document.querySelector('#atos .sp2-deck img');
    const deckLinks = [...document.querySelectorAll('a')]
      .filter(node => norm(node.textContent) === 'Open the deck')
      .map(node => ({
        href: node.getAttribute('href'), label: norm(node.textContent),
        owner: node.closest('[data-authority-member]')?.dataset.authorityMember || null,
        state: inspect(node),
      }));
    const bookingLinks = [...document.querySelectorAll('a')]
      .filter(node => norm(node.textContent) === 'Book a talk')
      .map(node => ({ href: node.getAttribute('href'), label: norm(node.textContent), state: inspect(node) }));
    const eaglesSources = [...document.querySelectorAll('.sp2-eagles__sources a')]
      .map(node => ({ href: node.getAttribute('href'), label: norm(node.textContent), state: inspect(node) }));
    const main = document.querySelector('#main');
    const routeStyleSheets = [...document.styleSheets].filter(sheet => {
      if (!sheet.href) return false;
      return new URL(sheet.href).pathname === '/speaking.css';
    });
    const routeCss = { sheetCount: routeStyleSheets.length, selectors: [], unsupportedAtRules: [] };
    const groupingRules = new Set([
      'CSSMediaRule', 'CSSSupportsRule', 'CSSContainerRule',
    ]);
    const inspectRules = rules => {
      for (const rule of rules) {
        const name = rule.constructor?.name || 'UnknownRule';
        if (name === 'CSSStyleRule') {
          routeCss.selectors.push(...rule.selectorText.split(',').map(value => value.trim()).filter(Boolean));
        } else if (groupingRules.has(name) && rule.cssRules) {
          inspectRules(rule.cssRules);
        } else {
          routeCss.unsupportedAtRules.push(name + ':' + String(rule.cssText || '').slice(0, 120));
        }
      }
    };
    for (const sheet of routeStyleSheets) inspectRules(sheet.cssRules);
    return {
      proofs, groups, members, sessions, indexEntries, headings, topicsHeading,
      atomsOutsideProof: [...document.querySelectorAll('.sp2 [data-atom]')]
        .filter(node => !node.closest('[data-speaking-proof]')).map(node => norm(node.textContent)),
      contentUnits: [...document.querySelectorAll('#talks [data-content-unit]')]
        .map(node => ({ key: node.dataset.contentUnit, atoms: [...node.querySelectorAll('[data-atom]')].map(atom => norm(atom.textContent)) })),
      oldInteractiveCount: document.querySelectorAll('.sp2 [data-ride], .sp2 [data-stop], .sp2 [role="tab"], .sp2 [role="tablist"], .sp2 [data-cars], .sp2 .cars, .sp2 .coach, .sp2 [data-screen], .sp2 [data-blind], .sp2 [hidden], .sp2 [inert], .sp2 .zone, .sp2 [data-prev], .sp2 [data-next]').length,
      genericInteractiveCount: document.querySelectorAll('.sp2 button, .sp2 input, .sp2 select, .sp2 textarea, .sp2 details, .sp2 [tabindex], .sp2 [role="button"], .sp2 [role="switch"], .sp2 [role="checkbox"], .sp2 [role="radio"], .sp2 [role="slider"], .sp2 [role="combobox"]').length,
      ariaSelectedCount: document.querySelectorAll('.sp2 [aria-selected]').length,
      h1: [...document.querySelectorAll('h1')].map(node => norm(node.textContent)),
      poster: poster ? {
        src: poster.getAttribute('src'), alt: poster.getAttribute('alt'), width: poster.getAttribute('width'),
        height: poster.getAttribute('height'), naturalWidth: poster.naturalWidth, naturalHeight: poster.naturalHeight,
        complete: poster.complete, state: inspect(poster),
      } : null,
      deckLinks, bookingLinks, eaglesSources,
      pageText: norm(main?.innerText),
      noDash: !(main?.innerText || '').includes('–') && !(main?.innerText || '').includes('—'),
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      nestedScrollers: [...document.querySelectorAll('.sp2, .sp2 *')].filter(node => {
        const style = getComputedStyle(node);
        return ['auto', 'scroll'].includes(style.overflowX) && node.scrollWidth > node.clientWidth + 1;
      }).map(node => node.id || node.className || node.tagName),
      viewportWidth: innerWidth,
      documentHeight: document.documentElement.scrollHeight,
      routeCss,
    };
  });
}

function assertRendered(state, label, snapshot) {
  assert(state && state.width > 0 && state.height > 0, `${label} has no rendered box`, 'proof-visibility');
  assert(!state.hiddenBy, `${label} is hidden by ${state.hiddenBy}`, 'proof-visibility');
  assert(!state.clipPathBy, `${label} is clipped by clip-path on ${state.clipPathBy}`, 'proof-visibility');
  assert(!state.maskBy, `${label} is masked by ${state.maskBy}`, 'proof-visibility');
  assert(!state.pseudoOcclusionBy,
    `${label} is occluded by a pseudo-element on ${state.pseudoOcclusionBy}`, 'proof-visibility');
  assert(!state.contentVisibilityBy, `${label} has content-visibility:hidden on ${state.contentVisibilityBy}`, 'proof-visibility');
  assert(!state.selfClipped, `${label} clips its own content`, 'proof-visibility');
  assert(state.clippedBy.length === 0, `${label} is clipped by ${state.clippedBy.join(', ')}`, 'proof-visibility');
  assert(state.effectiveOpacity >= 0.1, `${label} has near-zero effective opacity`, 'proof-visibility');
  assert(state.effectiveFilterOpacity >= 0.1, `${label} has near-zero filter opacity`, 'proof-visibility');
  assert(!state.nonOpacityFilterBy, `${label} has a non-opacity filter on ${state.nonOpacityFilterBy}`, 'proof-visibility');
  assert(state.effectiveScaleX >= 0.5 && state.effectiveScaleY >= 0.5,
    `${label} is collapsed by a transform`, 'proof-visibility');
  assert(state.effectiveZoom >= 0.5, `${label} is collapsed by zoom`, 'proof-visibility');
  if (state.hasText) {
    assert(state.colorAlpha >= 0.1 && state.textFillAlpha >= 0.1,
      `${label} has transparent text`, 'proof-visibility');
    assert(state.textWidth > 1 && state.textHeight > 1,
      `${label} has no visible text range`, 'proof-visibility');
    assert(state.textLeft >= -1 && state.textRight <= snapshot.viewportWidth + 1,
      `${label} text is outside the horizontal canvas`, 'proof-visibility');
    assert(state.textDocumentTop >= -1 && state.textDocumentTop + state.textHeight <= snapshot.documentHeight + 1,
      `${label} text is outside the scrollable document`, 'proof-visibility');
  }
  assert(state.left >= -1 && state.right <= snapshot.viewportWidth + 1,
    `${label} falls outside the horizontal canvas`, 'proof-visibility');
  assert(state.documentTop >= -1 && state.documentTop + state.height <= snapshot.documentHeight + 1,
    `${label} falls outside the scrollable document`, 'proof-visibility');
}

function expectedSessions() {
  return contract.sessions.flatMap(group => group.items.map(item => ({
    id: item.titleFactId, owner: group.member, member: group.member,
    titleFactId: item.titleFactId, dateFactId: item.dateFactId, title: item.title, date: item.date,
  })));
}

function verifySemanticSnapshot(snapshot, label) {
  assert(snapshot.routeCss.sheetCount === 1, `${label}: Speaking stylesheet count changed`, 'route-scope');
  assert(snapshot.routeCss.unsupportedAtRules.length === 0,
    `${label}: Speaking stylesheet contains global or unsupported at-rules: ${snapshot.routeCss.unsupportedAtRules.join(', ')}`,
    'route-scope');
  assert(snapshot.routeCss.selectors.length > 0
      && snapshot.routeCss.selectors.every(selector => selector.startsWith('.sp2')),
  `${label}: Speaking stylesheet contains an unscoped selector`, 'route-scope');
  assert(JSON.stringify(snapshot.h1) === JSON.stringify([contract.structure.h1]),
    `${label}: expected one H1`, 'heading');
  for (let index = 1; index < snapshot.headings.length; index += 1) {
    assert(snapshot.headings[index].level <= snapshot.headings[index - 1].level + 1,
      `${label}: heading level jumps before ${snapshot.headings[index].text}`, 'heading');
  }
  for (const heading of snapshot.headings) assertRendered(heading.state, `${label}: heading ${heading.text}`, snapshot);
  assert(snapshot.topicsHeading && snapshot.topicsHeading.id === 'sp2-topics-h'
      && snapshot.topicsHeading.tag === 'H2' && snapshot.topicsHeading.ownerId === 'talks'
      && snapshot.topicsHeading.isDescendant
      && snapshot.topicsHeading.text === contract.structure.topicsHeading,
  `${label}: Speaking topics heading identity, text, or ownership changed`, 'heading');
  assertRendered(snapshot.topicsHeading.state, `${label}: Speaking topics heading`, snapshot);
  assert(snapshot.groups.length === contract.structure.groups.length, `${label}: authority group count changed`, 'authority-group');
  for (let index = 0; index < contract.structure.groups.length; index += 1) {
    const expected = contract.structure.groups[index];
    const actual = snapshot.groups[index];
    assert(actual.id === expected.id && actual.authorityGroup === expected.authorityGroup,
      `${label}: authority group ${index + 1} identity changed`, 'authority-group');
    assert(actual.heading === expected.heading, `${label}: #${expected.id} heading changed`, 'authority-group');
    assert(actual.headingId && actual.headingIsDescendant && actual.headingTag === 'H2' && actual.nestedGroups === 0,
      `${label}: #${expected.id} must own its exact H2 label`, 'authority-group');
    assert(JSON.stringify(actual.members) === JSON.stringify(expected.members),
      `${label}: #${expected.id} member ancestry/order changed`, 'authority-group');
    assertRendered(actual.state, `${label}: group #${expected.id}`, snapshot);
  }
  assert(snapshot.members.length === Object.keys(contract.structure.memberBlocks).length,
    `${label}: authority member count changed`, 'authority-group');
  for (const [authorityMember, blockId] of Object.entries(contract.structure.memberBlocks)) {
    const actual = snapshot.members.find(member => member.authorityMember === authorityMember);
    const expectedGroup = contract.structure.groups.find(group => group.members.includes(authorityMember));
    assert(actual && actual.id === blockId, `${label}: ${authorityMember} block identity changed`, 'authority-group');
    assert(actual.group === expectedGroup.id, `${label}: ${authorityMember} moved to ${actual.group}`, 'authority-group');
    assert(actual.label === contract.structure.memberLabels[authorityMember],
      `${label}: ${authorityMember} label changed`, 'authority-group');
    assert(actual.headingId && actual.headingIsDescendant && actual.headingTag === 'H3',
      `${label}: ${authorityMember} must own its exact H3 label`, 'authority-group');
    assert(actual.nestedMembers === 0, `${label}: ${authorityMember} contains a nested member marker`, 'authority-group');
    assertRendered(actual.state, `${label}: member #${blockId}`, snapshot);
  }
  assert(JSON.stringify(snapshot.indexEntries.map(({ href, label: text, kind }) => ({ href, label: text, kind })))
      === JSON.stringify(contract.structure.indexEntries), `${label}: permanent Speaking index changed`, 'navigation');
  for (const entry of snapshot.indexEntries) {
    assertRendered(entry.state, `${label}: index ${entry.href}`, snapshot);
    assert(entry.state.width >= 44 && entry.state.height >= 44,
      `${label}: index ${entry.href} is smaller than 44px`, 'navigation');
  }

  const plainProofs = snapshot.proofs.map(proof => ({ id: proof.id, owner: proof.owner, atoms: proof.atoms.map(atom => atom.text) }));
  assert(canonicalJson(plainProofs) === canonicalJson(contract.proofLedger.proofs),
    `${label}: proof IDs, owners, order, or atom text changed`, 'proof-ledger');
  assert(hash(canonicalJson(plainProofs)) === contract.proofLedger.canonicalSha256,
    `${label}: proof text ledger hash changed`, 'proof-ledger');
  const factAtomProofs = snapshot.proofs.map(proof => ({
    proofId: proof.id, owner: proof.owner,
    atoms: proof.atoms.map(atom => ({ factId: atom.factId, textSha256: hash(atom.text) })),
  }));
  assert(canonicalJson(factAtomProofs) === canonicalJson(atomLedger.proofs),
    `${label}: proof fact IDs or atom hashes changed`, 'proof-ledger');
  assert(hash(canonicalJson(factAtomProofs)) === atomLedger.canonicalProofAtomLedgerSha256,
    `${label}: proof fact-atom ledger hash changed`, 'proof-ledger');
  const proofIds = new Set();
  for (const proof of snapshot.proofs) {
    assert(!proofIds.has(proof.id), `${label}: duplicate proof ${proof.id}`, 'proof-ledger');
    proofIds.add(proof.id);
    assert(proof.nestedProofs === 0, `${label}: proof ${proof.id} contains another proof marker`, 'proof-ledger');
    if (proof.owner === 'praxtera') {
      assert(proof.nearestGroup === 'praxtera' && !proof.nearestMember && proof.parentClasses.includes('sp2-branch'),
        `${label}: proof ${proof.id} lost direct Praxtera ownership`, 'proof-ledger');
    } else if (proof.owner === 'talks') {
      assert(proof.parentClasses.includes('sp2-topics__grid'), `${label}: proof ${proof.id} left the topics grid`, 'proof-ledger');
    } else {
      const blockId = contract.structure.memberBlocks[proof.owner];
      assert(blockId && proof.nearestMember === proof.owner && proof.nearestMemberBlock === blockId
          && proof.parentClasses.includes('sp2-member__proofs'),
      `${label}: proof ${proof.id} lost direct owner ${proof.owner}`, 'proof-ledger');
    }
    assertRendered(proof.state, `${label}: proof ${proof.id}`, snapshot);
    for (const atom of proof.atoms) assertRendered(atom.state, `${label}: proof ${proof.id} atom`, snapshot);
    const byFact = new Map();
    for (const atom of proof.atoms) if (atom.factId) byFact.set(atom.factId, [...(byFact.get(atom.factId) || []), atom]);
    for (const [factId, atoms] of byFact) {
      if (atoms.length > 1) {
        assert(atoms.every((atom, index) => atom.fragment === `${index + 1}/${atoms.length}`),
          `${label}: ${factId} fragments are not exact and ordered`, 'proof-ledger');
      }
    }
  }
  assert(snapshot.atomsOutsideProof.length === 0, `${label}: atoms exist outside sealed proofs`, 'proof-ledger');
  assert(JSON.stringify(snapshot.contentUnits) === JSON.stringify([
    { key: 'speakingTopics/architecture-adoption', atoms: ['From architecture to adoption', 'Why technical decisions only matter when teams can carry them into the organization.'] },
    { key: 'speakingTopics/agentic-leadership', atoms: ['Engineering leadership in the agentic era', 'How management systems change when software production becomes abundant.'] },
  ]), `${label}: Speaking topic identity/ownership changed`, 'proof-ledger');

  assert(canonicalJson(snapshot.sessions.map(({ state, titleState, dateState, ...session }) => session)) === canonicalJson(expectedSessions()),
    `${label}: session IDs, owners, dates, titles, or order changed`, 'session-ledger');
  for (const session of snapshot.sessions) {
    assertRendered(session.state, `${label}: session ${session.id}`, snapshot);
    assertRendered(session.titleState, `${label}: session ${session.id} title`, snapshot);
    assertRendered(session.dateState, `${label}: session ${session.id} date`, snapshot);
  }
  assert(snapshot.oldInteractiveCount === 0, `${label}: retired ride/carousel/tab/hidden structure returned`, 'retired-interaction');
  assert(snapshot.genericInteractiveCount === 0, `${label}: generic interactive evidence control returned`, 'retired-interaction');
  assert(snapshot.ariaSelectedCount === 0, `${label}: illegal aria-selected returned`, 'retired-interaction');
  assert(snapshot.noDash, `${label}: rendered main contains an en or em dash`, 'visible-copy');
  assert(snapshot.pageOverflow <= 1, `${label}: page overflows horizontally by ${snapshot.pageOverflow}px`, 'layout');
  assert(snapshot.nestedScrollers.length === 0, `${label}: nested horizontal scrollers: ${snapshot.nestedScrollers.join(', ')}`, 'layout');

  assert(canonicalJson(snapshot.eaglesSources.map(({ state, ...link }) => link)) === canonicalJson(contract.links.eaglesSources),
    `${label}: Eagles source links changed`, 'links');
  assert(canonicalJson(snapshot.deckLinks.map(({ state, ...link }) => link)) === canonicalJson([{
    href: contract.links.atosDeck.href, label: contract.links.atosDeck.label, owner: 'atos',
  }]), `${label}: Atos deck link changed or duplicated`, 'links');
  assert(canonicalJson(snapshot.bookingLinks.map(({ state, ...link }) => link)) === canonicalJson([{
    href: contract.links.booking.href, label: contract.links.booking.label,
  }]), `${label}: booking link changed or duplicated`, 'links');
  for (const link of [...snapshot.eaglesSources, ...snapshot.deckLinks, ...snapshot.bookingLinks]) {
    assertRendered(link.state, `${label}: link ${link.label}`, snapshot);
  }
  assert(countExact(snapshot.pageText, contract.links.fee) === 1, `${label}: keynote fee changed or duplicated`, 'links');
  for (const transition of contract.consolidations.sourceMirrorCanonicalizations) {
    assert(countExact(snapshot.pageText, transition.text) === 1,
      `${label}: canonical session detail “${transition.text}” is omitted or duplicated`, 'proof-ledger');
  }
  assert(countExact(snapshot.pageText, contract.cmu.detailedText) === contract.cmu.detailedFactRenderedCount,
    `${label}: detailed CMU curriculum fact changed or duplicated`, 'proof-ledger');
  const uniqueSecond = contract.proofLedger.proofs.find(proof => proof.id === 'cmu-accepted').atoms[2];
  assert(countExact(snapshot.pageText, uniqueSecond) === contract.cmu.uniqueSecondSentenceRenderedCount,
    `${label}: CMU 105+ sentence changed or duplicated`, 'proof-ledger');
  assert(countExact(snapshot.pageText, '20-lecture semester') === contract.cmu.twentyLecturePhraseRenderedCount,
    `${label}: CMU 20-lecture detail changed or duplicated`, 'proof-ledger');
  assert(countExact(snapshot.pageText, contract.cmu.acceptedCombinedText) === 0,
    `${label}: overlapping combined CMU résumé paragraph returned`, 'proof-ledger');

  const poster = snapshot.poster;
  assert(poster && poster.src === '/' + contract.asset.poster.path && poster.alt === contract.asset.poster.alt,
    `${label}: Atos poster path/alt changed`, 'asset');
  assert(poster.width === String(contract.asset.poster.width) && poster.height === String(contract.asset.poster.height),
    `${label}: Atos poster attributes changed`, 'asset');
  assert(poster.complete && poster.naturalWidth === contract.asset.poster.width
      && poster.naturalHeight === contract.asset.poster.height,
  `${label}: Atos poster did not decode at 1280x720`, 'asset');
  assertRendered(poster.state, `${label}: Atos poster`, snapshot);
}

async function analyzePosterPaint(analysisPage, screenshot, posterState, posterBytes) {
  const screenshotUrl = 'data:image/png;base64,' + screenshot.toString('base64');
  const referenceUrl = 'data:image/webp;base64,' + posterBytes.toString('base64');
  const rect = {
    left: posterState.left,
    top: posterState.documentTop,
    width: posterState.width,
    height: posterState.height,
  };
  return analysisPage.evaluate(async ({ screenshotUrl: shotUrl, referenceUrl: refUrl, rect: box }) => {
    const load = source => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = source;
    });
    const [shot, reference] = await Promise.all([load(shotUrl), load(refUrl)]);
    const left = Math.max(0, Math.floor(box.left));
    const top = Math.max(0, Math.floor(box.top));
    const width = Math.min(shot.naturalWidth - left, Math.ceil(box.width));
    const height = Math.min(shot.naturalHeight - top, Math.ceil(box.height));
    const observedCanvas = document.createElement('canvas');
    observedCanvas.width = width;
    observedCanvas.height = height;
    const observedContext = observedCanvas.getContext('2d', { willReadFrequently: true });
    observedContext.drawImage(shot, left, top, width, height, 0, 0, width, height);
    const expectedCanvas = document.createElement('canvas');
    expectedCanvas.width = width;
    expectedCanvas.height = height;
    const expectedContext = expectedCanvas.getContext('2d', { willReadFrequently: true });
    expectedContext.drawImage(reference, 0, 0, width, height);
    const observed = observedContext.getImageData(0, 0, width, height).data;
    const expected = expectedContext.getImageData(0, 0, width, height).data;
    let samples = 0, mismatch = 0, luminance = 0, luminanceSquared = 0, edges = 0, edgeSamples = 0;
    const colors = new Set();
    const columns = [];
    const inset = Math.min(4, Math.floor(Math.min(width, height) / 20));
    const step = Math.max(1, Math.floor(Math.max(width, height) / 700));
    for (let x = inset; x < width - inset; x += step) {
      let columnSamples = 0, columnMismatch = 0;
      for (let y = inset; y < height - inset; y += step) {
        const index = (y * width + x) * 4;
        const delta = Math.max(
          Math.abs(observed[index] - expected[index]),
          Math.abs(observed[index + 1] - expected[index + 1]),
          Math.abs(observed[index + 2] - expected[index + 2]),
        );
        if (delta > 32) { mismatch += 1; columnMismatch += 1; }
        const light = 0.2126 * observed[index] + 0.7152 * observed[index + 1] + 0.0722 * observed[index + 2];
        luminance += light;
        luminanceSquared += light * light;
        colors.add(`${observed[index] >> 4}:${observed[index + 1] >> 4}:${observed[index + 2] >> 4}`);
        if (x + step < width - inset) {
          const next = (y * width + x + step) * 4;
          if (Math.max(
            Math.abs(observed[index] - observed[next]),
            Math.abs(observed[index + 1] - observed[next + 1]),
            Math.abs(observed[index + 2] - observed[next + 2]),
          ) > 20) edges += 1;
          edgeSamples += 1;
        }
        samples += 1;
        columnSamples += 1;
      }
      columns.push(columnSamples ? columnMismatch / columnSamples : 1);
    }
    const mean = luminance / samples;
    const variance = Math.max(0, luminanceSquared / samples - mean * mean);
    return {
      crop: { left, top, width, height }, samples,
      mismatchRatio: mismatch / samples,
      faithfulColumnRatio: columns.filter(value => value <= 0.12).length / columns.length,
      uniqueQuantizedColors: colors.size,
      luminanceStdDev: Math.sqrt(variance),
      edgeRatio: edgeSamples ? edges / edgeSamples : 0,
      sourceWidth: reference.naturalWidth,
      sourceHeight: reference.naturalHeight,
      screenshotWidth: shot.naturalWidth,
      screenshotHeight: shot.naturalHeight,
    };
  }, { screenshotUrl, referenceUrl, rect });
}

function verifyPosterPaint(paint, label) {
  assert(paint.sourceWidth === contract.asset.poster.width && paint.sourceHeight === contract.asset.poster.height,
    `${label}: poster reference did not decode at 1280x720`, 'asset-paint');
  assert(paint.crop.width > 0 && paint.crop.height > 0 && paint.samples > 1000,
    `${label}: poster screenshot crop is empty`, 'asset-paint');
  assert(paint.mismatchRatio <= 0.10,
    `${label}: poster/reference mismatch is ${(paint.mismatchRatio * 100).toFixed(2)}%`, 'asset-paint');
  assert(paint.faithfulColumnRatio >= 0.80,
    `${label}: only ${(paint.faithfulColumnRatio * 100).toFixed(2)}% of poster columns paint faithfully`, 'asset-paint');
  assert(paint.uniqueQuantizedColors >= 96 && paint.luminanceStdDev >= 18 && paint.edgeRatio >= 0.003,
    `${label}: poster crop is visually blank or collapsed (${JSON.stringify({ colors: paint.uniqueQuantizedColors, stdDev: paint.luminanceStdDev, edgeRatio: paint.edgeRatio, mismatch: paint.mismatchRatio, faithfulColumns: paint.faithfulColumnRatio })})`, 'asset-paint');
}

async function captureHeroLayer(page, extraRules = '') {
  const style = await page.addStyleTag({ content: [
    '.sp2-hero > *{visibility:hidden!important}',
    extraRules,
  ].join('\n') });
  try {
    return await page.screenshot({ fullPage: false, animations: 'disabled', caret: 'hide' });
  } finally {
    await style.evaluate(node => node.remove());
  }
}

async function analyzeHeroLayers(analysisPage, blank, title, targets) {
  const toUrl = value => 'data:image/png;base64,' + value.toString('base64');
  return analysisPage.evaluate(async payload => {
    const loadPixels = source => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        resolve({ width: canvas.width, height: canvas.height, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data });
      };
      image.onerror = reject;
      image.src = source;
    });
    const base = await loadPixels(payload.blank);
    const titleImage = await loadPixels(payload.title);
    const targetImages = [];
    for (const target of payload.targets) targetImages.push({ id: target.id, image: await loadPixels(target.source) });
    const mask = image => {
      if (image.width !== base.width || image.height !== base.height) throw new Error('Hero layer dimensions changed');
      const values = new Uint8Array(base.width * base.height);
      let count = 0, left = base.width, top = base.height, right = -1, bottom = -1;
      for (let index = 0, pixel = 0; index < base.pixels.length; index += 4, pixel += 1) {
        const changed = base.pixels[index] !== image.pixels[index]
          || base.pixels[index + 1] !== image.pixels[index + 1]
          || base.pixels[index + 2] !== image.pixels[index + 2]
          || base.pixels[index + 3] !== image.pixels[index + 3];
        if (!changed) continue;
        values[pixel] = 1;
        count += 1;
        const x = pixel % base.width;
        const y = Math.floor(pixel / base.width);
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
      return {
        values, count,
        box: count ? { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 } : null,
      };
    };
    const titleMask = mask(titleImage);
    const results = [];
    for (const target of targetImages) {
      const targetMask = mask(target.image);
      let intersectionPixels = 0;
      for (let index = 0; index < titleMask.values.length; index += 1) {
        if (titleMask.values[index] && targetMask.values[index]) intersectionPixels += 1;
      }
      results.push({
        id: target.id,
        inkPixels: targetMask.count,
        intersectionPixels,
        horizontalClearance: targetMask.box && titleMask.box
          ? targetMask.box.left - titleMask.box.right - 1 : null,
        box: targetMask.box,
      });
    }
    return { titleInkPixels: titleMask.count, titleBox: titleMask.box, targets: results };
  }, {
    blank: toUrl(blank), title: toUrl(title),
    targets: targets.map(item => ({ id: item.id, source: toUrl(item.image) })),
  });
}

async function verifyWideHeroIsolation(browser, analysisPage, transition) {
  const results = [];
  const isolation = transition.pixelIsolation;
  for (const expected of isolation.contexts) {
    const runtime = {
      label: `${expected.width}:${expected.theme}:hero-isolation`,
      width: expected.width, theme: expected.theme, javascript: 'on', motion: 'normal',
    };
    const { context, trace } = await contextFor(browser, runtime);
    try {
      const page = await openPage(context, trace, 'speaking.html', true);
      const heroBox = await page.locator('.sp2-hero').evaluate(node => {
        const rect = node.getBoundingClientRect();
        return {
          left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
          width: rect.width, height: rect.height,
        };
      });
      const authorizedChange = transition.authorizedFrameChanges.find(
        item => item.width === expected.width && item.theme === expected.theme,
      );
      const diffBboxWithinHero = !authorizedChange || (
        authorizedChange.diffBbox.left >= Math.floor(heroBox.left)
        && authorizedChange.diffBbox.top >= Math.floor(heroBox.top)
        && authorizedChange.diffBbox.right <= Math.ceil(heroBox.right) - 1
        && authorizedChange.diffBbox.bottom <= Math.ceil(heroBox.bottom) - 1
      );
      assert(diffBboxWithinHero,
        `${runtime.label}: authorized pixel-diff bbox leaves the measured hero`, 'hero-collision');
      const fullPage = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
      const blank = await captureHeroLayer(page);
      const title = await captureHeroLayer(page, `${isolation.titleSelector}{visibility:visible!important}`);
      const layers = [];
      for (const target of isolation.targets) {
        const decoration = target.id === 'praxtera'
          ? '.sp2-index__branch:first-child::before{visibility:visible!important}' : '';
        layers.push({
          id: target.id,
          image: await captureHeroLayer(page, `${target.selector}{visibility:visible!important}\n${decoration}`),
        });
      }
      const measured = await analyzeHeroLayers(analysisPage, blank, title, layers);
      for (const target of measured.targets) {
        assert(target.intersectionPixels === 0,
          `${runtime.label}: hero title ink intersects ${target.id} (${target.intersectionPixels} pixels)`, 'hero-collision');
      }
      const actual = {
        width: expected.width,
        theme: expected.theme,
        fullPageSha256: hash(fullPage),
        heroBox,
        authorizedDiffBbox: authorizedChange ? authorizedChange.diffBbox : null,
        diffBboxWithinHero,
        ...measured,
      };
      assert(canonicalJson(actual.titleBox) === canonicalJson(expected.titleBox)
          && actual.titleInkPixels === expected.titleInkPixels
          && canonicalJson(actual.targets) === canonicalJson(expected.targets),
      `${runtime.label}: hero ink geometry changed`, 'hero-collision');
      assert(actual.fullPageSha256 === expected.fullPageSha256,
        `${runtime.label}: full-page pixels changed: ${actual.fullPageSha256}`, 'visual-paint');
      verifyTrace(trace, runtime.label);
      if (capturesPath) writeFileSync(join(capturesPath, `speaking-${expected.width}-${expected.theme}-wide.png`), fullPage);
      results.push(actual);
    } finally {
      await context.close();
    }
  }
  return results;
}

function governedLinkSelector() {
  return [
    '.sp2-index a', '.sp2-eagles__sources a',
    `#atos a[href="${contract.links.atosDeck.href}"]`,
    `.sp2 a[href="${contract.links.booking.href}"]`,
  ].join(', ');
}

async function installFocusInspector(page) {
  await page.evaluate(() => {
    window.__speakingFocusState = node => {
      const colorAlpha = color => {
        const value = String(color || '').trim().toLowerCase();
        if (!value || value === 'transparent') return 0;
        if (value.startsWith('rgba(')) {
          const close = value.lastIndexOf(')');
          const body = value.slice(5, close < 0 ? value.length : close);
          if (body.includes('/')) {
            const alphaText = body.slice(body.lastIndexOf('/') + 1).trim();
            return alphaText.endsWith('%') ? Number(alphaText.slice(0, -1)) / 100 : Number(alphaText);
          }
          const parts = body.split(',').map(part => part.trim());
          return parts.length === 4 ? Number(parts[3]) : 1;
        }
        if (value.startsWith('rgb(') && value.includes('/')) {
          const close = value.lastIndexOf(')');
          const body = value.slice(4, close < 0 ? value.length : close);
          const alphaText = body.slice(body.lastIndexOf('/') + 1).trim();
          return alphaText.endsWith('%') ? Number(alphaText.slice(0, -1)) / 100 : Number(alphaText);
        }
        return 1;
      };
      const style = getComputedStyle(node);
      let effectiveOpacity = 1;
      let hiddenBy = '';
      let filteredBy = '';
      for (let current = node; current; current = current.parentElement) {
        const currentStyle = getComputedStyle(current);
        const opacity = Number(currentStyle.opacity);
        if (Number.isFinite(opacity)) effectiveOpacity *= opacity;
        if (!hiddenBy && (current.hidden || current.inert || current.getAttribute('aria-hidden') === 'true'
            || currentStyle.display === 'none' || currentStyle.visibility !== 'visible'
            || currentStyle.contentVisibility === 'hidden')) {
          hiddenBy = current.id || current.className || current.tagName;
        }
        if (!filteredBy && String(currentStyle.filter || 'none') !== 'none') {
          filteredBy = current.id || current.className || current.tagName;
        }
      }
      const outlineWidth = Number.parseFloat(style.outlineWidth);
      const outlineAlpha = colorAlpha(style.outlineColor);
      const outlineVisible = style.outlineStyle !== 'none' && style.outlineStyle !== 'hidden'
        && Number.isFinite(outlineWidth) && outlineWidth > 0 && outlineAlpha >= 0.1;
      let checkVisible = true;
      if (typeof node.checkVisibility === 'function') {
        checkVisible = node.checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true,
          contentVisibilityAuto: true,
        });
      }
      return {
        href: node.getAttribute('href'), label: node.textContent.trim(),
        focusVisible: node.matches(':focus-visible'), opacity: Number(style.opacity),
        visibility: style.visibility, outlineStyle: style.outlineStyle,
        outlineWidth, outlineColor: style.outlineColor, outlineAlpha, outlineVisible,
        effectiveOpacity, hiddenBy, filteredBy, checkVisible,
      };
    };
  });
}

function assertVisibleFocus(state, label) {
  assert(state.focusVisible && state.outlineVisible && state.effectiveOpacity >= 0.1
      && !state.hiddenBy && !state.filteredBy && state.checkVisible,
    `${label}: ${state.label} loses its visible focus indicator`, 'link-interaction');
}

async function verifyInteractiveLinks(page, label) {
  await installFocusInspector(page);
  const selector = governedLinkSelector();
  const links = page.locator(selector);
  const count = await links.count();
  const expectedCount = contract.structure.indexEntries.length + contract.links.eaglesSources.length + 2;
  assert(count === expectedCount, `${label}: interactive link inventory is ${count}, expected ${expectedCount}`, 'links');
  await page.evaluate(() => {
    window.__speakingActivationProbe = [];
    window.addEventListener('click', event => {
      const link = event.target.closest('a');
      if (!link || !link.closest('.sp2')) return;
      window.__speakingActivationProbe.push({
        href: link.getAttribute('href'), label: link.textContent.trim(), detail: event.detail,
        previouslyPrevented: event.defaultPrevented,
      });
      event.preventDefault();
    });
  });
  const expectedTabOrder = await links.evaluateAll(nodes => nodes.map(node => ({
    href: node.getAttribute('href'), label: node.textContent.trim(),
  })));
  const traversalLimit = await page.evaluate(() => {
    const sentinel = document.createElement('span');
    sentinel.id = 'speaking-tab-order-sentinel';
    sentinel.tabIndex = 0;
    document.body.prepend(sentinel);
    sentinel.focus();
    return [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
      .filter(node => !node.disabled && node.tabIndex >= 0 && getComputedStyle(node).display !== 'none'
        && getComputedStyle(node).visibility !== 'hidden').length + 2;
  });
  const actualTabOrder = [];
  for (let index = 0; index < traversalLimit && actualTabOrder.length < expectedTabOrder.length; index += 1) {
    await page.keyboard.press('Tab');
    const active = await page.evaluate(selectorValue => {
      const node = document.activeElement;
      if (!node || !node.matches(selectorValue)) return null;
      return window.__speakingFocusState(node);
    }, selector);
    if (active) {
      assertVisibleFocus(active, label);
      actualTabOrder.push({ href: active.href, label: active.label });
    }
  }
  await page.evaluate(() => document.getElementById('speaking-tab-order-sentinel')?.remove());
  assert(canonicalJson(actualTabOrder) === canonicalJson(expectedTabOrder),
    `${label}: actionable links are not all present in sequential Tab order`, 'link-interaction');
  for (let index = 0; index < count; index += 1) {
    const link = links.nth(index);
    await link.evaluate(node => node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
    const state = await link.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const hit = [0.2, 0.5, 0.8].flatMap(xPortion => [0.2, 0.5, 0.8].map(yPortion => {
        const top = document.elementFromPoint(
          rect.left + rect.width * xPortion,
          rect.top + rect.height * yPortion,
        );
        return Boolean(top && (top === node || node.contains(top) || top.closest('a') === node));
      }));
      node.focus();
      const focus = window.__speakingFocusState(node);
      return {
        href: node.getAttribute('href'), label: node.textContent.trim(), hit,
        focused: document.activeElement === node, tabIndex: node.tabIndex,
        ...focus,
        disabled: node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true'
          || Boolean(node.closest('[inert]')),
        inlineHandlerBy: (() => {
          for (let current = node; current && current.closest('.sp2'); current = current.parentElement) {
            if ([...current.attributes].some(attribute => attribute.name.startsWith('on'))) {
              return current.id || current.className || current.tagName;
            }
          }
          return '';
        })(),
        box: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      };
    });
    assert(state.hit.every(Boolean), `${label}: ${state.label} is blocked from pointer hit-testing`, 'link-interaction');
    assert(state.focused && state.tabIndex >= 0 && !state.disabled && !state.inlineHandlerBy,
      `${label}: ${state.label} is not sequentially keyboard reachable`, 'link-interaction');
    assertVisibleFocus(state, label);
    const beforePointer = await page.evaluate(() => window.__speakingActivationProbe.length);
    await page.mouse.click(state.box.left + state.box.width / 2, state.box.top + state.box.height / 2);
    const pointer = await page.evaluate(probeIndex => window.__speakingActivationProbe[probeIndex] || null, beforePointer);
    assert(pointer && pointer.href === state.href && pointer.label === state.label
        && pointer.detail > 0 && pointer.previouslyPrevented === false,
      `${label}: ${state.label} did not activate by pointer`, 'link-interaction');
    await link.focus();
    const beforeKeyboard = await page.evaluate(() => window.__speakingActivationProbe.length);
    await page.keyboard.press('Enter');
    const keyboard = await page.evaluate(probeIndex => window.__speakingActivationProbe[probeIndex] || null, beforeKeyboard);
    assert(keyboard && keyboard.href === state.href && keyboard.label === state.label
        && keyboard.detail === 0 && keyboard.previouslyPrevented === false,
      `${label}: ${state.label} did not activate by keyboard`, 'link-interaction');
  }
  return count;
}

async function verifyJsOffHostActionability(page, label) {
  await installFocusInspector(page);
  const selector = governedLinkSelector();
  const links = page.locator(selector);
  const count = await links.count();
  const expectedCount = contract.structure.indexEntries.length + contract.links.eaglesSources.length + 2;
  assert(count === expectedCount, `${label}: JS-off link inventory is ${count}`, 'link-interaction');
  const expectedTabOrder = await links.evaluateAll(nodes => nodes.map(node => ({
    href: node.getAttribute('href'), label: node.textContent.trim(),
  })));
  const traversalLimit = await page.evaluate(() => {
    const sentinel = document.createElement('span');
    sentinel.id = 'speaking-js-off-tab-sentinel';
    sentinel.tabIndex = 0;
    document.body.prepend(sentinel);
    sentinel.focus();
    return [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
      .filter(node => !node.disabled && node.tabIndex >= 0 && getComputedStyle(node).display !== 'none'
        && getComputedStyle(node).visibility !== 'hidden').length + 2;
  });
  const actualTabOrder = [];
  for (let index = 0; index < traversalLimit && actualTabOrder.length < expectedTabOrder.length; index += 1) {
    await page.keyboard.press('Tab');
    const active = await page.evaluate(selectorValue => {
      const node = document.activeElement;
      if (!node || !node.matches(selectorValue)) return null;
      return window.__speakingFocusState(node);
    }, selector);
    if (active) {
      assertVisibleFocus(active, label);
      actualTabOrder.push({ href: active.href, label: active.label });
    }
  }
  await page.evaluate(() => document.getElementById('speaking-js-off-tab-sentinel')?.remove());
  assert(canonicalJson(actualTabOrder) === canonicalJson(expectedTabOrder),
    `${label}: real JS-off links are missing from sequential Tab order`, 'link-interaction');
  for (let index = 0; index < count; index += 1) {
    const link = links.nth(index);
    await link.evaluate(node => node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
    const state = await link.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const hit = [0.2, 0.5, 0.8].flatMap(xPortion => [0.2, 0.5, 0.8].map(yPortion => {
        const top = document.elementFromPoint(rect.left + rect.width * xPortion, rect.top + rect.height * yPortion);
        return Boolean(top && (top === node || node.contains(top) || top.closest('a') === node));
      }));
      return {
        label: node.textContent.trim(), hit, tabIndex: node.tabIndex,
        pointerEvents: getComputedStyle(node).pointerEvents,
        disabled: node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true'
          || Boolean(node.closest('[inert]')),
      };
    });
    assert(state.hit.every(Boolean) && state.pointerEvents !== 'none' && state.tabIndex >= 0 && !state.disabled,
      `${label}: ${state.label} is not actionable in the real JS-off page`, 'link-interaction');
    try {
      await link.click({ trial: true, timeout: 5000 });
    } catch (error) {
      fail(`${label}: ${state.label} failed real JS-off trial click: ${String(error?.message || error)}`,
        'link-interaction');
    }
  }
  return count;
}

async function accessibilityForRuntime(browser, actualPage, runtime) {
  if (runtime.javascript === 'on') {
    return {
      result: await bounded(new AxeBuilder({ page: actualPage }).analyze(), `${runtime.label} axe`, 30000),
      mode: 'runtime-page', suppressedScripts: [],
    };
  }
  const actualFingerprint = await actualPage.evaluate(() => {
    const styles = node => {
      const style = getComputedStyle(node);
      return {
        color: style.color, backgroundColor: style.backgroundColor,
        display: style.display, fontFamily: style.fontFamily,
      };
    };
    const clone = document.documentElement.cloneNode(true);
    for (const script of clone.querySelectorAll('script')) script.remove();
    return {
      scriptlessDocumentHtml: clone.outerHTML,
      stylesheets: [...document.styleSheets].map(sheet => sheet.href ? new URL(sheet.href).pathname + new URL(sheet.href).search : ''),
      externalScripts: [...document.scripts].map(script => script.getAttribute('src')).filter(Boolean)
        .map(source => { const url = new URL(source, location.href); return url.pathname + url.search; }),
      executableInlineScripts: [...document.scripts]
        .filter(script => !script.getAttribute('src') && ['', 'text/javascript', 'module'].includes(script.getAttribute('type') || ''))
        .map(script => script.textContent),
      bodyStyle: styles(document.body), mainStyle: styles(document.querySelector('#main')),
    };
  });
  const twinRuntime = { ...runtime, javascript: 'on' };
  const { context, trace } = await contextFor(browser, twinRuntime);
  try {
    const twinUrl = new URL('speaking-static-twin.html', origin).href;
    await context.route(twinUrl, route => route.fulfill({
      status: 200, contentType: 'text/html; charset=utf-8',
      body: '<!doctype html>' + actualFingerprint.scriptlessDocumentHtml,
    }));
    const page = await context.newPage();
    page.on('requestfailed', request => trace.failed.push(`${request.url()} ${request.failure()?.errorText || ''}`));
    page.on('response', response => { if (response.status() >= 400) trace.badResponses.push(`${response.status()} ${response.url()}`); });
    page.on('console', message => { if (message.type() === 'error') trace.console.push(message.text()); });
    page.on('pageerror', error => trace.pageErrors.push(String(error.message || error)));
    await page.goto(twinUrl, { waitUntil: 'load' });
    await settleStaticTwin(page);
    const twinFingerprint = await page.evaluate(() => {
      const styles = node => {
        const style = getComputedStyle(node);
        return {
          color: style.color, backgroundColor: style.backgroundColor,
          display: style.display, fontFamily: style.fontFamily,
        };
      };
      return {
        scriptlessDocumentHtml: document.documentElement.outerHTML,
        stylesheets: [...document.styleSheets].map(sheet => sheet.href ? new URL(sheet.href).pathname + new URL(sheet.href).search : ''),
        executableInlineScripts: [...document.scripts]
          .filter(script => !script.getAttribute('src') && ['', 'text/javascript', 'module'].includes(script.getAttribute('type') || ''))
          .map(script => script.textContent),
        siteReady: window.__SITE_READY__ === true || document.documentElement.dataset.siteReady === 'true',
        themeAttribute: document.documentElement.getAttribute('data-theme'),
        scriptCount: document.scripts.length,
        bodyStyle: styles(document.body), mainStyle: styles(document.querySelector('#main')),
      };
    });
    assert(twinFingerprint.scriptlessDocumentHtml === actualFingerprint.scriptlessDocumentHtml,
      `${runtime.label}: static axe twin document DOM differs from JavaScript-off page`, 'accessibility');
    assert(canonicalJson(twinFingerprint.stylesheets) === canonicalJson(actualFingerprint.stylesheets)
        && canonicalJson(twinFingerprint.bodyStyle) === canonicalJson(actualFingerprint.bodyStyle)
        && canonicalJson(twinFingerprint.mainStyle) === canonicalJson(actualFingerprint.mainStyle),
    `${runtime.label}: static axe twin styles differ from JavaScript-off page`, 'accessibility');
    assert(twinFingerprint.executableInlineScripts.length === 0
        && canonicalJson(actualFingerprint.executableInlineScripts.map(value => hash(value)))
          === canonicalJson(contract.runtime.executableInlineScriptSha256),
    `${runtime.label}: executable inline script inventory changed`, 'accessibility');
    assert(canonicalJson([...actualFingerprint.externalScripts].sort())
        === canonicalJson([...contract.runtime.externalScriptSources].sort()),
    `${runtime.label}: external script inventory changed`, 'accessibility');
    assert(!twinFingerprint.siteReady && twinFingerprint.themeAttribute === null && twinFingerprint.scriptCount === 0,
      `${runtime.label}: page script executed in the JavaScript-off axe twin`, 'accessibility');
    const result = await bounded(new AxeBuilder({ page }).analyze(), `${runtime.label} static-twin axe`, 30000);
    const interactionCount = await bounded(
      verifyInteractiveLinks(page, `${runtime.label}:static-axe-twin`),
      `${runtime.label} static-twin interactions`, 30000,
    );
    assert(context.serviceWorkers().length === 0, `${runtime.label}: static axe twin registered a service worker`, 'runtime');
    verifyTrace(trace, `${runtime.label}:static-axe-twin`);
    return {
      result, mode: 'scriptless-js-off-dom-clone', scriptsRemovedBeforeAnalysis: true,
      externalScripts: [...actualFingerprint.externalScripts].sort(),
      suppressedScripts: [...actualFingerprint.externalScripts].sort(), interactionCount,
    };
  } finally {
    await context.close();
  }
}

async function verifyRuntimeContext(browser, analysisPage, runtime, posterBytes) {
  const { context, trace } = await contextFor(browser, runtime);
  progress(`runtime phase open ${runtime.label}`);
  const page = await bounded(openPage(context, trace, 'speaking.html', runtime.javascript === 'on'),
    `${runtime.label} open`, 30000);
  progress(`runtime phase semantic ${runtime.label}`);
  const snapshot = await bounded(semanticSnapshot(page), `${runtime.label} semantic snapshot`, 15000);
  verifySemanticSnapshot(snapshot, runtime.label);
  progress(`runtime phase axe ${runtime.label}`);
  const accessibility = await accessibilityForRuntime(browser, page, runtime);
  const axe = accessibility.result;
  const severe = axe.violations.filter(item => item.impact === 'serious' || item.impact === 'critical');
  assert(severe.length === 0, `${runtime.label}: axe serious/critical violations: ${severe.map(item => item.id).join(', ')}`, 'accessibility');
  const serviceWorkerCount = context.serviceWorkers().length;
  assert(serviceWorkerCount === 0, `${runtime.label}: service worker registered`, 'runtime');
  const primaryVisual = runtime.javascript === 'on' && runtime.motion === 'normal';
  const screenshot = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
  const screenshotHash = hash(screenshot);
  const expectedFrame = contract.runtime.visualFrames.find(
    frame => frame.width === runtime.width && frame.theme === runtime.theme,
  );
  assert(expectedFrame && screenshotHash === expectedFrame.sha256,
    `${runtime.label}: full-page pixels changed: ${screenshotHash}`, 'visual-paint');
  let posterPaint = null;
  if (primaryVisual) {
    posterPaint = await analyzePosterPaint(analysisPage, screenshot, snapshot.poster.state, posterBytes);
    verifyPosterPaint(posterPaint, runtime.label);
    if (capturesPath) {
      mkdirSync(capturesPath, { recursive: true });
      writeFileSync(join(capturesPath, `speaking-${runtime.width}-${runtime.theme}.png`), screenshot);
    }
  }
  const interactionCount = runtime.javascript === 'on'
    ? await bounded(verifyInteractiveLinks(page, runtime.label), `${runtime.label} interactions`, 30000)
    : accessibility.interactionCount;
  const jsOffHostActionabilityCount = runtime.javascript === 'off'
    ? await bounded(verifyJsOffHostActionability(page, runtime.label), `${runtime.label} real JS-off actionability`, 30000)
    : null;
  assert(interactionCount === contract.structure.indexEntries.length + contract.links.eaglesSources.length + 2,
    `${runtime.label}: interaction coverage is incomplete`, 'link-interaction');
  assert(runtime.javascript === 'on' || jsOffHostActionabilityCount === interactionCount,
    `${runtime.label}: real JS-off actionability coverage is incomplete`, 'link-interaction');
  verifyTrace(trace, runtime.label);
  await context.close();
  return {
    label: runtime.label, width: runtime.width, theme: runtime.theme,
    javascript: runtime.javascript, motion: runtime.motion,
    proofCount: snapshot.proofs.length, atomCount: snapshot.proofs.reduce((sum, proof) => sum + proof.atoms.length, 0),
    sessionCount: snapshot.sessions.length, severeAxeViolations: 0,
    accessibilityMode: accessibility.mode, suppressedScripts: accessibility.suppressedScripts,
    interactionCount, jsOffHostActionabilityCount, primaryVisual, screenshotHash, posterPaint,
  };
}

function ownersForTarget(target) {
  if (target === 'praxtera') return ['praxtera'];
  if (target === 'independent-speaking-teaching') return ['cmu-teaching', 'atos'];
  if (target === 'cmu') return ['cmu-teaching'];
  return [target];
}

async function verifyDeepLinkInteractions(browser, actualPage, runtime, target) {
  const scriptlessHtml = await actualPage.evaluate(() => {
    const clone = document.documentElement.cloneNode(true);
    for (const script of clone.querySelectorAll('script')) script.remove();
    return clone.outerHTML;
  });
  const twinRuntime = { ...runtime, javascript: 'on' };
  const { context, trace } = await contextFor(browser, twinRuntime);
  try {
    const twinUrl = new URL('speaking-static-target.html', origin);
    twinUrl.hash = target;
    await context.route(new URL('speaking-static-target.html', origin).href, route => route.fulfill({
      status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html>' + scriptlessHtml,
    }));
    const page = await openPage(context, trace, twinUrl.pathname + twinUrl.hash, true, true);
    const parity = await page.evaluate(() => {
      const clone = document.documentElement.cloneNode(true);
      for (const script of clone.querySelectorAll('script')) script.remove();
      return { html: clone.outerHTML, hash: location.hash, scriptCount: document.scripts.length };
    });
    assert(parity.html === scriptlessHtml && parity.hash === `#${target}` && parity.scriptCount === 0,
      `JS-off #${target} interaction twin differs from the real document`, 'deep-link');
    const count = await verifyInteractiveLinks(page, `deep-link:#${target}`);
    verifyTrace(trace, `deep-link:#${target}:interaction-twin`);
    return count;
  } finally {
    await context.close();
  }
}

async function verifyDeepLink(browser, target) {
  const runtime = { width: 375, theme: 'light', javascript: 'off', motion: 'reduced' };
  const { context, trace } = await contextFor(browser, runtime);
  const page = await openPage(context, trace, `speaking.html#${target}`, false);
  const screenshot = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
  const screenshotHash = hash(screenshot);
  const expectedFrame = contract.runtime.visualFrames.find(frame => frame.width === 375 && frame.theme === 'light');
  assert(expectedFrame && screenshotHash === expectedFrame.sha256,
    `JS-off deep link #${target} pixels changed: ${screenshotHash}`, 'visual-paint');
  const actual = await page.locator(`#${target}`).evaluate(node => {
    const norm = value => {
      let output = '', pendingSpace = false;
      for (const char of String(value || '')) {
        if (char.trim() === '') pendingSpace = output.length > 0;
        else {
          if (pendingSpace) output += ' ';
          output += char;
          pendingSpace = false;
        }
      }
      return output;
    };
    const inspect = element => {
      const rect = element.getBoundingClientRect();
      const clippedBy = [];
      let hiddenBy = '', clipPathBy = '', maskBy = '', pseudoOcclusionBy = '', contentVisibilityBy = '';
      let effectiveOpacity = 1, effectiveFilterOpacity = 1, effectiveScaleX = 1, effectiveScaleY = 1, effectiveZoom = 1;
      let nonOpacityFilterBy = '';
      let selfClipped = false;
      const alphaOf = color => {
        const value = String(color || '').trim();
        if (value === 'transparent') return 0;
        if (!value.startsWith('rgba(')) return 1;
        const close = value.indexOf(')');
        const parts = value.slice(5, close < 0 ? value.length : close).split(',').map(part => part.trim());
        return parts.length === 4 ? Number(parts[3]) : 1;
      };
      const filterOpacityOf = filter => {
        const value = String(filter || '');
        const start = value.indexOf('opacity(');
        if (start < 0) return 1;
        const end = value.indexOf(')', start + 8);
        if (end < 0) return 1;
        const amount = value.slice(start + 8, end).trim();
        return amount.endsWith('%') ? Number(amount.slice(0, -1)) / 100 : Number(amount);
      };
      const pixels = value => {
        const text = String(value || '').trim();
        return text.endsWith('px') ? Number(text.slice(0, -2)) : Number.NaN;
      };
      const pseudoOccludes = (owner, pseudo) => {
        const style = getComputedStyle(owner, pseudo);
        if (!style || ['none', 'normal'].includes(style.content)
            || !['absolute', 'fixed'].includes(style.position)
            || style.display === 'none' || style.visibility === 'hidden') return false;
        const opacity = Number(style.opacity);
        if (Number.isFinite(opacity) && opacity < 0.1) return false;
        const zIndex = Number(style.zIndex);
        if (Number.isFinite(zIndex) && zIndex < 0) return false;
        const ownerRect = owner.getBoundingClientRect();
        const left = pixels(style.left), right = pixels(style.right);
        const top = pixels(style.top), bottom = pixels(style.bottom);
        let width = pixels(style.width), height = pixels(style.height);
        if (!Number.isFinite(width) && Number.isFinite(left) && Number.isFinite(right)) width = ownerRect.width - left - right;
        if (!Number.isFinite(height) && Number.isFinite(top) && Number.isFinite(bottom)) height = ownerRect.height - top - bottom;
        const area = Math.max(0, width) * Math.max(0, height);
        const coverage = ownerRect.width > 0 && ownerRect.height > 0 ? area / (ownerRect.width * ownerRect.height) : 0;
        const paints = alphaOf(style.backgroundColor) >= 0.1
          || (style.backgroundImage && style.backgroundImage !== 'none')
          || (style.boxShadow && style.boxShadow !== 'none');
        return coverage >= 0.5 && paints;
      };
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        const opacity = Number(style.opacity);
        if (Number.isFinite(opacity)) effectiveOpacity *= opacity;
        if (style.clipPath && style.clipPath !== 'none') clipPathBy ||= current.id || current.className || current.tagName;
        const maskImages = [style.maskImage, style.webkitMaskImage].map(value => String(value || 'none'));
        if (maskImages.some(value => value !== 'none')) maskBy ||= current.id || current.className || current.tagName;
        if (!pseudoOcclusionBy && (pseudoOccludes(current, '::before') || pseudoOccludes(current, '::after'))) {
          pseudoOcclusionBy = current.id || current.className || current.tagName;
        }
        if (style.contentVisibility === 'hidden') contentVisibilityBy ||= current.id || current.className || current.tagName;
        const filterOpacity = filterOpacityOf(style.filter);
        if (Number.isFinite(filterOpacity)) effectiveFilterOpacity *= filterOpacity;
        const filterText = String(style.filter || 'none').trim();
        if (filterText !== 'none') {
          const close = filterText.indexOf(')');
          const pureOpacity = filterText.startsWith('opacity(') && close === filterText.length - 1;
          if (!pureOpacity) nonOpacityFilterBy ||= current.id || current.className || current.tagName;
        }
        const zoom = Number(style.zoom);
        if (Number.isFinite(zoom)) effectiveZoom *= zoom;
        if (style.transform && style.transform !== 'none') {
          const matrix = new DOMMatrixReadOnly(style.transform);
          effectiveScaleX *= Math.hypot(matrix.a, matrix.b);
          effectiveScaleY *= Math.hypot(matrix.c, matrix.d);
        }
        if (current.hidden || current.inert || current.getAttribute('aria-hidden') === 'true'
            || style.display === 'none' || style.visibility === 'hidden' || opacity === 0) {
          hiddenBy = current.id || current.className || current.tagName;
          break;
        }
        const clipsX = ['hidden', 'clip'].includes(style.overflowX);
        const clipsY = ['hidden', 'clip'].includes(style.overflowY);
        if (current === element) {
          selfClipped = (clipsX && current.scrollWidth > current.clientWidth + 1)
            || (clipsY && current.scrollHeight > current.clientHeight + 1);
        } else {
          const parentRect = current.getBoundingClientRect();
          if ((clipsX && (rect.left < parentRect.left - 1 || rect.right > parentRect.right + 1))
              || (clipsY && (rect.top < parentRect.top - 1 || rect.bottom > parentRect.bottom + 1))) {
            clippedBy.push(current.id || current.className || current.tagName);
          }
        }
      }
      const range = document.createRange();
      range.selectNodeContents(element);
      const textRect = range.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        width: rect.width, height: rect.height, left: rect.left, right: rect.right,
        top: rect.top, bottom: rect.bottom, documentTop: rect.top + scrollY,
        hiddenBy, clippedBy, clipPathBy, maskBy, pseudoOcclusionBy, contentVisibilityBy, selfClipped,
        effectiveOpacity, effectiveFilterOpacity, effectiveScaleX, effectiveScaleY, effectiveZoom, nonOpacityFilterBy,
        colorAlpha: alphaOf(style.color), textFillAlpha: alphaOf(style.webkitTextFillColor),
        textWidth: textRect.width, textHeight: textRect.height, textLeft: textRect.left,
        textRight: textRect.right, textTop: textRect.top, textBottom: textRect.bottom,
        textDocumentTop: textRect.top + scrollY, hasText: norm(element.textContent).length > 0,
      };
    };
    const ownerState = inspect(node);
    return {
      hash: location.hash,
      ownerState,
      viewportWidth: innerWidth,
      documentHeight: document.documentElement.scrollHeight,
      proofs: [...node.querySelectorAll('[data-speaking-proof]')].map(proof => ({
        proofId: proof.dataset.proofId,
        owner: proof.dataset.proofUnit,
        state: inspect(proof),
        atoms: [...proof.querySelectorAll('[data-atom]')].map(atom => ({
          factId: atom.dataset.factId || null,
          text: norm(atom.textContent),
          state: inspect(atom),
        })),
      })),
    };
  });
  assert(actual.hash === `#${target}`, `JS-off deep link #${target} did not retain its fragment`, 'deep-link');
  assertRendered(actual.ownerState, `JS-off deep link #${target} owner`, actual);
  assert(actual.ownerState.bottom > 0 && actual.ownerState.top < 900,
    `JS-off deep link #${target} owner is not in the viewport after hash navigation`, 'deep-link');
  assert(actual.ownerState.left >= -1 && actual.ownerState.right <= 376,
    `JS-off deep link #${target} owner leaves the horizontal canvas`, 'deep-link');
  const owners = new Set(ownersForTarget(target));
  const expected = atomLedger.proofs.filter(proof => owners.has(proof.owner));
  const actualById = new Map(actual.proofs.map(proof => [proof.proofId, proof]));
  for (const proof of expected) {
    const rendered = actualById.get(proof.proofId);
    assert(rendered && rendered.owner === proof.owner, `JS-off #${target} lost proof ${proof.proofId}`, 'deep-link');
    assertRendered(rendered.state, `JS-off #${target} proof ${proof.proofId}`, actual);
    for (let index = 0; index < rendered.atoms.length; index += 1) {
      assertRendered(rendered.atoms[index].state,
        `JS-off #${target} proof ${proof.proofId} atom ${index + 1}`, actual);
    }
    const ledger = rendered.atoms.map(({ factId, text }) => ({ factId, textSha256: hash(text) }));
    assert(canonicalJson(ledger) === canonicalJson(proof.atoms),
      `JS-off #${target} changed proof ${proof.proofId}`, 'deep-link');
  }
  const jsOffHostActionabilityCount = await bounded(
    verifyJsOffHostActionability(page, `deep-link:#${target}`),
    `deep-link #${target} real JS-off actionability`, 30000,
  );
  const interactionCount = await bounded(
    verifyDeepLinkInteractions(browser, page, runtime, target),
    `deep-link #${target} interactions`, 30000,
  );
  verifyTrace(trace, `deep-link:${target}`);
  await context.close();
  return {
    target, hash: actual.hash, inViewport: true, ownerProofCount: expected.length,
    javascript: 'off', screenshotHash, interactionCount, jsOffHostActionabilityCount,
  };
}

async function verifyFrozenHtmlCandidate() {
  const results = [];
  for (const [page, record] of Object.entries(contract.frozenNonSpeaking.html)) {
    const route = record.path.startsWith('site/') ? record.path.slice(5) : record.path;
    const response = await boundedFetch(new URL(route, origin), `Frozen candidate route ${route}`);
    assert(response.ok, `Frozen candidate route ${route} returned ${response.status}`, 'frozen-route');
    const actual = hash(Buffer.from(await response.arrayBuffer()));
    assert(actual === record.sha256, `Frozen candidate HTML changed: ${route}`, 'frozen-route');
    results.push({ page, sha256: actual });
  }
  return results;
}

async function verifyResearchPixels(browser) {
  const records = [];
  for (const expected of contract.frozenNonSpeaking.research.frames) {
    const runtime = { width: expected.width, theme: expected.theme, javascript: 'on', motion: 'reduced' };
    const { context, trace } = await contextFor(browser, runtime);
    const page = await openPage(context, trace, 'research.html', true);
    const screenshot = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
    const actual = hash(screenshot);
    assert(actual === expected.sha256,
      `Frozen Research ${expected.width}:${expected.theme} changed: ${actual}`, 'frozen-route');
    verifyTrace(trace, `research:${expected.width}:${expected.theme}`);
    records.push({ width: expected.width, theme: expected.theme, sha256: actual });
    await context.close();
  }
  return records;
}

function verifyProjectsCandidate() {
  const directory = mkdtempSync(join(tmpdir(), 'verify-speaking-projects-'));
  const reportPath = join(directory, 'projects.json');
  try {
    const result = spawnSync(process.execPath, [join(ROOT, 'site/_build/verify-projects.mjs'), '--projects-only', '--json', reportPath], {
      cwd: ROOT, env: { ...process.env, PROJECTS_BASE: origin }, encoding: 'utf8', timeout: 240000,
    });
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    assert(result.status === 0 && report.ok, `Frozen Projects verifier failed: ${JSON.stringify(report.failures || [])}`, 'frozen-route');
    const labels = report.projectResults.map(item => item.label).sort();
    assert(JSON.stringify(labels) === JSON.stringify([
      '1440:dark', '1440:light', '375:dark', '375:light', '768:dark', '768:light',
    ]), 'Frozen Projects verifier did not certify six exact contexts', 'frozen-route');
    assert(report.proofContractSha256 === contract.frozenNonSpeaking.projectsProofContract.sha256,
      'Frozen Projects verifier certified a different proof contract', 'frozen-route');
    return {
      proofContractSha256: report.proofContractSha256,
      contexts: labels,
      ledgerSha256: report.canonicalUnitAtomLedgerSha256,
      assetSha256: report.ondowayAssetHash,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function verifyCandidateProvenance() {
  const response = await boundedFetch(new URL('.site-provenance.json', origin), 'Candidate provenance');
  assert(response.ok, 'Candidate provenance is unavailable', 'candidate');
  const provenance = await response.json();
  assert(provenance.baselineId === 'transit-v4', 'Candidate baseline identity changed', 'candidate');
  assert(artifactRoot && statSync(artifactRoot).isDirectory(),
    'ARTIFACT_ROOT must identify the exact served candidate directory', 'candidate');
  const liveSourceHash = sourceTreeHash(join(ROOT, 'site'));
  assert(provenance.sourceHash === liveSourceHash,
    `Candidate source provenance is stale: ${provenance.sourceHash} != ${liveSourceHash}`, 'candidate');
  const speakingResponse = await boundedFetch(new URL('speaking.html', origin), 'Candidate speaking.html');
  assert(speakingResponse.ok, `Candidate speaking.html returned ${speakingResponse.status}`, 'candidate');
  const candidateHtmlSha256 = hash(Buffer.from(await speakingResponse.arrayBuffer()));
  const sourceHtmlSha256 = hash(readFileSync(join(ROOT, 'site/speaking.html')));
  assert(mutationTest || candidateHtmlSha256 === sourceHtmlSha256,
    'Candidate Speaking HTML differs from source', 'candidate');
  const liveArtifactHash = sourceTreeHash(artifactRoot, ['.site-provenance.json']);
  assert(mutationTest || provenance.artifactHash === liveArtifactHash,
    `Candidate artifact provenance is stale: ${provenance.artifactHash} != ${liveArtifactHash}`, 'candidate');
  return { ...provenance, liveSourceHash, liveArtifactHash, speakingHtmlSha256: candidateHtmlSha256 };
}

let browser;
let report;
try {
  verifyContractAndSources();
  const heroTransition = verifyHeroCollisionTransition();
  const sourceAssets = verifySourceAssets();
  const routeCss = verifyRouteScopedCss();
  validateSharedRouteOracle();
  const candidateAssets = await verifyCandidateAssets();
  const posterBytes = candidateAssets.posterBytes;
  delete candidateAssets.posterBytes;
  const provenance = await verifyCandidateProvenance();

  assert(contract.runtime.contexts.length === contract.runtime.contextCount,
    'Speaking runtime context count changed', 'contract');
  const contextLabels = contract.runtime.contexts.map(item => item.label);
  assert(new Set(contextLabels).size === 24, 'Speaking runtime labels are duplicated', 'contract');
  const expectedLabels = [];
  for (const width of [375, 768, 1440]) for (const theme of ['light', 'dark']) {
    for (const javascript of ['on', 'off']) for (const motion of ['normal', 'reduced']) {
      expectedLabels.push(`${width}:${theme}:js-${javascript}:motion-${motion}`);
    }
  }
  assert(JSON.stringify([...contextLabels].sort()) === JSON.stringify(expectedLabels.sort()),
    'Speaking runtime matrix is not the exact 3×2×2×2 set', 'contract');

  browser = await chromium.launch({ headless: true });
  const analysisPage = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const runtimeResults = [];
  for (const runtime of contract.runtime.contexts) {
    progress(`runtime start ${runtime.label}`);
    runtimeResults.push(await bounded(
      verifyRuntimeContext(browser, analysisPage, runtime, posterBytes),
      `runtime ${runtime.label}`,
      90000,
    ));
    progress(`runtime pass ${runtime.label}`);
  }
  const visualResults = runtimeResults.filter(item => item.primaryVisual);
  assert(visualResults.length === 6, `Speaking visual context count is ${visualResults.length}`, 'runtime');
  assert(new Set(visualResults.map(item => `${item.width}:${item.theme}`)).size === 6,
    'Speaking visual contexts are duplicated or omitted', 'runtime');

  const deepLinkResults = [];
  for (const target of contract.runtime.deepLinkTargets) {
    progress(`deep-link start #${target}`);
    deepLinkResults.push(await bounded(verifyDeepLink(browser, target), `deep-link #${target}`, 30000));
    progress(`deep-link pass #${target}`);
  }
  assert(deepLinkResults.length === 10 && new Set(deepLinkResults.map(item => item.target)).size === 10,
    'Speaking JS-off deep-link results are incomplete', 'deep-link');

  progress('wide hero pixel-isolation start');
  const transitionManifest = JSON.parse(readFileSync(repoPath(contract.authority.speakingHeroCollisionTransition.path)));
  const wideHeroResults = await bounded(
    verifyWideHeroIsolation(browser, analysisPage, transitionManifest),
    'wide hero pixel-isolation', 120000,
  );
  await analysisPage.close();
  progress('wide hero pixel-isolation pass');

  let frozen = null;
  if (!speakingOnly) {
    const html = await verifyFrozenHtmlCandidate();
    const research = await bounded(verifyResearchPixels(browser), 'frozen Research pixels', 180000);
    const projects = verifyProjectsCandidate();
    const shared = await bounded(verifySharedRoutePixels(browser, origin), 'shared-route pixels', 240000);
    frozen = { html, research, projects, shared };
  }

  report = {
    ok: true,
    mutationTest,
    baselineId: provenance.baselineId,
    sourceHash: provenance.sourceHash,
    artifactHash: provenance.artifactHash,
    liveArtifactHash: provenance.liveArtifactHash,
    speakingHtmlSha256: provenance.speakingHtmlSha256,
    proofContractSha256: hash(contractBytes),
    authoritySpeakingContractSha256: hash(authorityContractBytes),
    authorityManifestSha256: hash(authorityManifestBytes),
    factAtomLedgerSha256: hash(atomLedgerBytes),
    canonicalProofAtomLedgerSha256: atomLedger.canonicalProofAtomLedgerSha256,
    heroTransition,
    proofCount: contract.proofLedger.count,
    atomCount: contract.proofLedger.atomCount,
    sessionCount: expectedSessions().length,
    sourceAssets,
    candidateAssets,
    routeCss,
    runtimeResults,
    visualResults,
    deepLinkResults,
    wideHeroResults,
    frozen,
    failures: [],
  };
} catch (error) {
  report = {
    ok: false,
    failures: [{ kind: error?.kind || 'speaking-verifier', message: String(error?.message || error) }],
  };
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}

const serialized = JSON.stringify(report, null, 2) + '\n';
if (outputPath) writeFileSync(outputPath, serialized);
else process.stdout.write(serialized);
