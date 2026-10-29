import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const oracleUrl = new URL('../../.claude/rubric/shared-route-oracle.json', import.meta.url);
export const sharedRouteOracle = JSON.parse(readFileSync(oracleUrl, 'utf8'));
const careerTransitionUrl = new URL('../../.claude/rubric/authority/career-amazon-transition.json', import.meta.url);
const careerTransitionBytes = readFileSync(careerTransitionUrl);
const careerTransition = JSON.parse(careerTransitionBytes);
const careerEvidenceTransitionUrl = new URL('../../.claude/rubric/authority/career-evidence-visual-transition.json', import.meta.url);
const careerEvidenceTransitionBytes = readFileSync(careerEvidenceTransitionUrl);
const researchBuilderTransitionUrl = new URL('../../.claude/rubric/authority/research-builder-dependency-transition.json', import.meta.url);
const researchBuilderTransitionBytes = readFileSync(researchBuilderTransitionUrl);
const researchBuilderTransition = JSON.parse(researchBuilderTransitionBytes);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const order = (a, b) => compareText(a.page, b.page) || compareText(a.stateKey, b.stateKey)
  || compareText(a.theme, b.theme) || a.width - b.width;
const canonical = records => JSON.stringify([...records].sort(order).map(record => Object.fromEntries(
  Object.keys(record).sort().map(key => [key, record[key]]),
)));

function assert(value, message) { if (!value) throw new Error(message); }

function reverseExact(text, substitutions, label) {
  let result = text;
  for (const item of substitutions) {
    assert(typeof item.current === 'string' && item.current.length > 0 && typeof item.previous === 'string',
      `${label} has an invalid reverse substitution`);
    const applications = result.split(item.current).length - 1;
    assert(applications === 1, `${label} reverse substitution applied ${applications} times`);
    result = result.replace(item.current, item.previous);
  }
  return result;
}

function reverseTransition(frames, transition, label) {
  const changesByKey = new Map((transition.changes || []).map(change => [
    `${change.page}:${change.width}:${change.theme}:${change.stateKey}`, change,
  ]));
  assert(changesByKey.size === transition.changedFrameCount, `${label} pairs are duplicated`);
  const priorFrames = frames.map(frame => {
    const key = `${frame.page}:${frame.width}:${frame.theme}:${frame.stateKey}`;
    const change = changesByKey.get(key);
    if (!change) return frame;
    assert(frame.sha256 === change.candidateSha256, `${key} does not contain its ${label} candidate frame`);
    return { ...frame, sha256: change.priorSha256 };
  });
  assert(frames.length - changesByKey.size === transition.unchangedFrameCount,
    `${label} unchanged frame count changed`);
  assert(sha256(canonical(priorFrames)) === transition.priorSharedAll,
    `reversing ${label} does not reproduce its prior 68-frame aggregate`);
  return priorFrames;
}

export function validateSharedRouteOracle() {
  const oracle = sharedRouteOracle;
  assert(oracle.version === 1, 'shared-route oracle version changed');
  assert(oracle.authority?.baselineId === 'transit-v4', 'shared-route oracle baseline changed');
  assert(oracle.frames?.length === 68, `shared-route oracle must contain 68 frames, found ${oracle.frames?.length}`);
  const keys = new Set();
  for (const frame of oracle.frames) {
    const key = `${frame.page}:${frame.width}:${frame.theme}:${frame.stateKey}`;
    assert(!keys.has(key), `shared-route oracle duplicates ${key}`);
    keys.add(key);
    assert(['index', 'services', 'career', 'contact'].includes(frame.page), `shared-route oracle contains ${frame.page}`);
    assert([375, 768, 1280, 1440, 1600].includes(frame.width), `shared-route oracle contains width ${frame.width}`);
    assert(['light', 'dark'].includes(frame.theme), `shared-route oracle contains theme ${frame.theme}`);
    assert(typeof frame.sha256 === 'string' && frame.sha256.length === 64, `shared-route oracle has invalid SHA for ${key}`);
  }
  const defaults = oracle.frames.filter(frame => frame.stateKey === 'default');
  assert(defaults.length === 40, `shared-route oracle must contain 40 default frames, found ${defaults.length}`);
  assert(sha256(canonical(defaults)) === oracle.aggregates.sharedDefault, 'shared default aggregate does not reproduce');
  assert(sha256(canonical(oracle.frames)) === oracle.aggregates.sharedAll, 'shared 68-frame aggregate does not reproduce');

  const transitions = oracle.authority?.authorizedTransitions;
  assert(Array.isArray(transitions) && transitions.length === 2,
    'shared-route oracle needs its two accepted Career transitions');
  const [transition, evidenceTransition] = transitions;
  assert(transition.id === 'career-amazon-accepted-resume', 'shared-route transition identity changed');
  assert(transition.manifestPath === '.claude/rubric/authority/career-amazon-transition.json', 'shared-route transition manifest path changed');
  assert(transition.manifestSha256 === 'ee386e57627353eeeb7152ca4684dd4fcc1f5fb67ebb18a25e4c6267f6948760'
      && sha256(careerTransitionBytes) === transition.manifestSha256,
  'shared-route transition manifest bytes changed');
  assert(transition.priorOracleSha256 === '70881f429b4ec8938b78782f8c453c0dd04750cecf8353011d006085c78a14ee',
    'shared-route prior oracle identity changed');
  assert(transition.priorSharedAll === '17df777b9a5e3caf9020b48b7829de6fce75b6061c579da2c481301da6f7179e'
      && transition.currentSharedAll === evidenceTransition.priorSharedAll,
  'shared-route transition aggregate binding changed');
  assert(transition.changedFrameCount === 4 && transition.unchangedFrameCount === 64,
    'shared-route transition partition changed');
  assert(careerTransition.status === 'accepted-independent-review'
      && careerTransition.frameEvidence?.oracleSha256 === transition.priorOracleSha256
      && careerTransition.frameEvidence?.capturedCareerFrames === 38
      && careerTransition.frameEvidence?.unchangedCareerFrames === 34,
  'Career transition is not independently accepted against the prior oracle');
  const acceptedReviewers = new Set((careerTransition.independentReviews || [])
    .filter(review => review.verdict === 'ACCEPT').map(review => review.reviewer));
  assert(acceptedReviewers.has('rubric_forensics') && acceptedReviewers.has('experience_audit'),
    'Career transition lacks both independent acceptances');
  const manifestChanges = (careerTransition.frameEvidence?.changedFrames || []).map(change => ({
    page: 'career', width: change.width, theme: change.theme, stateKey: 'amazon',
    priorSha256: change.priorSha256, candidateSha256: change.candidateSha256,
  })).sort(order);
  const boundChanges = [...(transition.changes || [])].sort(order);
  assert(JSON.stringify(boundChanges) === JSON.stringify(manifestChanges),
    'shared-route transition pairs differ from the accepted Career manifest');

  assert(evidenceTransition.id === 'career-evidence-accepted-resume',
    'Career evidence transition identity changed');
  assert(evidenceTransition.manifestPath === '.claude/rubric/authority/career-evidence-visual-transition.json',
    'Career evidence transition manifest path changed');
  assert(sha256(researchBuilderTransitionBytes) === '492666bb11d2873476355922254fad4ab8f1f07badc1363dbbcd4b8611cd37cb'
      && researchBuilderTransition.schemaVersion === 1
      && researchBuilderTransition.status === 'accepted-dependency-only'
      && researchBuilderTransition.route === 'research',
  'Research builder dependency transition bytes or identity changed');
  const careerBridge = researchBuilderTransition.careerVisualTransition;
  assert(careerBridge.path === evidenceTransition.manifestPath
      && careerBridge.currentSha256 === 'e0af218a0266fd0ff8357e3387e9c7525cfac1dd84579be080a679e8a071b73a'
      && careerBridge.previousSha256 === evidenceTransition.manifestSha256
      && careerBridge.reverseSubstitutionExpectedSha256 === evidenceTransition.manifestSha256
      && sha256(careerEvidenceTransitionBytes) === careerBridge.currentSha256,
  'Live Career evidence manifest is not bound to the accepted Research builder transition');
  const historicalCareerEvidenceBytes = Buffer.from(reverseExact(
    careerEvidenceTransitionBytes.toString('utf8'), careerBridge.reverseSubstitutions,
    'Career evidence dependency bridge',
  ));
  assert(sha256(historicalCareerEvidenceBytes) === evidenceTransition.manifestSha256,
    'Career evidence dependency bridge does not reproduce the accepted visual manifest');
  const careerEvidenceTransition = JSON.parse(historicalCareerEvidenceBytes);
  assert(evidenceTransition.priorOracleSha256 === '2ce51c293a3cd60d83bd2d47c5ff5d93cc4a21de6e995a344785ef8bce7f6477',
    'Career evidence transition prior oracle identity changed');
  assert(evidenceTransition.priorSharedAll === '0aea8d9d26b4bf1b10660376ba73af4b213e94512946f6e4fbc509d3ce72d589'
      && evidenceTransition.currentSharedAll === oracle.aggregates.sharedAll,
  'Career evidence transition aggregate binding changed');
  assert(evidenceTransition.changedFrameCount === 12 && evidenceTransition.unchangedFrameCount === 56,
    'Career evidence transition partition changed');
  assert(careerEvidenceTransition.status === 'accepted-independent-review'
      && careerEvidenceTransition.captureEvidence?.capturedFrames === 68
      && careerEvidenceTransition.captureEvidence?.changedFrames === 12
      && careerEvidenceTransition.captureEvidence?.unchangedFrames === 56
      && careerEvidenceTransition.frameAuthority?.oracleSha256 === evidenceTransition.priorOracleSha256
      && careerEvidenceTransition.frameAuthority?.priorSharedAll === evidenceTransition.priorSharedAll
      && careerEvidenceTransition.frameAuthority?.candidateSharedAll === evidenceTransition.currentSharedAll
      && careerEvidenceTransition.frameAuthority?.reverseReconstructedSharedAll === evidenceTransition.priorSharedAll,
  'Career evidence transition is not independently accepted against the prior shared oracle');
  const evidenceReviewers = new Set((careerEvidenceTransition.independentReviews || [])
    .filter(review => review.verdict === 'ACCEPT').map(review => review.reviewer));
  assert(evidenceReviewers.has('rubric_forensics') && evidenceReviewers.has('experience_audit'),
    'Career evidence transition lacks both independent acceptances');
  const evidenceManifestChanges = [...(careerEvidenceTransition.frameAuthority?.changedFrames || [])].sort(order);
  const evidenceBoundChanges = [...(evidenceTransition.changes || [])].sort(order);
  assert(JSON.stringify(evidenceBoundChanges) === JSON.stringify(evidenceManifestChanges),
    'Career evidence transition pairs differ from the accepted manifest');
  const intermediateFrames = reverseTransition(oracle.frames, evidenceTransition, 'twelve-frame Career evidence transition');
  reverseTransition(intermediateFrames, transition, 'four-frame Career Amazon transition');
  for (const page of ['index', 'services', 'career', 'contact']) {
    const frames = defaults.filter(frame => frame.page === page);
    assert(frames.length === 10, `shared-route oracle must contain 10 default ${page} frames`);
    assert(sha256(canonical(frames)) === oracle.aggregates.routes[page], `${page} aggregate does not reproduce`);
  }
  return oracle;
}

async function contextFor(browser, width, theme, origin) {
  const context = await browser.newContext({
    viewport: { width, height: 900 }, screen: { width, height: 900 }, deviceScaleFactor: 1,
    isMobile: width < 768, hasTouch: width < 768, colorScheme: theme, reducedMotion: 'reduce',
    locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block',
  });
  await context.addInitScript(value => {
    try { localStorage.setItem('theme', value); } catch {}
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
  const localOrigin = new URL(origin).origin;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === localOrigin || url.protocol === 'data:' || url.protocol === 'blob:') await route.continue();
    else await route.abort('blockedbyclient');
  });
  return context;
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

async function open(page, origin, route) {
  await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
  await settle(page);
}
const frameHash = async page => sha256(await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' }));

export async function verifySharedRoutePixels(browser, origin) {
  const oracle = validateSharedRouteOracle();
  const expected = new Map(oracle.frames.map(frame => [`${frame.page}:${frame.width}:${frame.theme}:${frame.stateKey}`, frame.sha256]));
  const actual = [];
  for (const theme of ['light', 'dark']) for (const width of [375, 768, 1280, 1440, 1600]) {
    const context = await contextFor(browser, width, theme, origin);
    for (const pageName of ['index', 'career', 'services', 'contact']) {
      const page = await context.newPage();
      await open(page, origin, pageName + '.html');
      const record = { page: pageName, width, theme, stateKey: 'default', sha256: await frameHash(page) };
      const key = `${pageName}:${width}:${theme}:default`;
      assert(record.sha256 === expected.get(key), `${key} changed: ${record.sha256}`);
      actual.push(record);
      await page.close();
    }
    await context.close();
  }
  for (const theme of ['light', 'dark']) for (const width of [375, 1440]) {
    const context = await contextFor(browser, width, theme, origin);
    const page = await context.newPage();
    await open(page, origin, 'career.html');
    const stations = await page.locator('.cr-st').evaluateAll(nodes => nodes.map(node => node.id));
    for (const stateKey of stations) {
      await page.locator(`.cr-strip__s[data-go="${stateKey}"]`).evaluate(node => node.click());
      await page.waitForFunction(id => document.getElementById(id)?.classList.contains('is-on') === true, stateKey);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const record = { page: 'career', width, theme, stateKey, sha256: await frameHash(page) };
      const key = `career:${width}:${theme}:${stateKey}`;
      assert(record.sha256 === expected.get(key), `${key} changed: ${record.sha256}`);
      actual.push(record);
    }
    await page.close();
    await context.close();
  }
  assert(actual.length === 68, `shared-route verification captured ${actual.length} frames`);
  assert(sha256(canonical(actual)) === oracle.aggregates.sharedAll, 'captured shared-route aggregate changed');
  return { frameCount: actual.length, sharedAggregate: oracle.aggregates.sharedAll,
    oracleAuthority: oracle.authority, authorizedTransitions: oracle.authority.authorizedTransitions,
    oracleSha256: sha256(readFileSync(oracleUrl)) };
}
