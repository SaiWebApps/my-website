// Site audit: one check per failure a machine can measure. Exit 1 on any FAIL; WARN lines are for a human to read.
// Taste, copy quality, emphasis, answering the owner, scope and asking first can't be measured: the governor judges those.
// Usage: node site/_build/audit.mjs [page ...]   (server on 127.0.0.1:4401)
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { isAbsolute, relative, resolve, sep } from 'path';

const DIR = new URL('..', import.meta.url).pathname;
const PROJECT = new URL('../../', import.meta.url).pathname;
const AUTHORITY = JSON.parse(readFileSync(PROJECT + '.claude/rubric/authority.json', 'utf8'));
const BASE = process.env.RUBRIC_BASE_URL || 'http://127.0.0.1:4401/';
const LOCAL_ORIGIN = new URL(BASE).origin;
const ALL = ['index', 'services', 'speaking', 'career', 'research', 'projects', 'contact'];
const EXPECTED_ROUTE_STYLES = Object.freeze({ index: [], services: [], speaking: ['speaking.css'], career: [], research: ['research.css'], projects: [], contact: [] });
// Flags: --widths 375,1440 limits viewports; --json FILE writes every result line. AUDIT_PLANT (JSON) injects a
// past mistake into one page so .claude/rubric/test.py can prove each check still catches it.
const argv = process.argv.slice(2);
const flag = n => { const i = argv.indexOf(n); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const boolFlag = n => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };
const WIDTHS = (flag('--widths') || '').split(',').filter(Boolean).map(Number);
const JSON_OUT = flag('--json');
const SELF_TEST_ONLY = boolFlag('--self-test');
const PLANT = process.env.AUDIT_PLANT ? JSON.parse(process.env.AUDIT_PLANT) : null;
const plantEvidence = { requested: !!PLANT, applied: false, applications: 0, errors: [] };
const PAGES = argv.length ? argv : ALL;
const SIZES = [[375, 812, 'no-preference'], [768, 1024, 'no-preference'], [1280, 800, 'no-preference'], [1440, 900, 'no-preference'], [1600, 900, 'reduce']].filter(([w]) => !WIDTHS.length || WIDTHS.includes(w));
const FLOOR = JSON.parse(readFileSync(DIR + '_build/floor.json', 'utf8'));
// No regular expressions anywhere (his ban, Oct 29, 2026): text is read with plain string scans.
const stripComments = s => { let out = '', i = 0; for (;;) { const j = s.indexOf('/*', i); if (j < 0) return out + s.slice(i); out += s.slice(i, j); const k = s.indexOf('*/', j + 2); if (k < 0) return out; i = k + 2; } };
const isIdent = c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '-';
const js = readFileSync(DIR + 'main.js', 'utf8');
const html = Object.fromEntries(ALL.map(p => [p, readFileSync(DIR + p + '.html', 'utf8')]));

const banned = AUTHORITY.sources.retirements.supplementalPublicExclusions || [];

let fails = 0, warns = 0;
const results = [];
const controls = { routeOwnership: {}, routeStyles: {}, browserStyles: {} };
const out = (lvl, page, w, check, msg) => { if (lvl === 'FAIL') fails++; else warns++; results.push({ lvl, page, w, check, msg }); console.log(`${lvl} ${page} ${w || '-'} ${check}: ${msg}`); };
if (PLANT?.source_replace) {
  const p = PLANT.page;
  const from = PLANT.source_replace.from;
  const to = PLANT.source_replace.to || '';
  if (!ALL.includes(p) || typeof from !== 'string' || !from || !html[p].includes(from)) throw new Error('AUDIT_PLANT source_replace did not match one known page');
  html[p] = html[p].replace(from, to);
  plantEvidence.applied = true;
  plantEvidence.applications++;
}
const planted = (p, w) => PLANT && PLANT.page === p && (!PLANT.width || PLANT.width === w);
async function plantInto(pg, p, w) {
  if (!planted(p, w)) return;
  try {
    if (PLANT.css) await pg.addStyleTag({ content: PLANT.css });
    if (PLANT.html) await pg.evaluate(h => {
      const main = document.querySelector('main');
      if (!main) throw new Error('render plant target main is absent');
      main.insertAdjacentHTML('afterbegin', h);
    }, PLANT.html);
    if (PLANT.after_js) await pg.evaluate(PLANT.after_js);
    if (PLANT.theme) await pg.evaluate(t => document.documentElement.dataset.theme = t, PLANT.theme);
    await pg.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    plantEvidence.applied = true;
    plantEvidence.applications++;
  } catch (error) {
    plantEvidence.errors.push(String(error && error.message ? error.message : error));
    throw error;
  }
}

async function settlePage(pg) {
  await pg.waitForFunction(() => window.__SITE_READY__ === true && document.documentElement.dataset.siteReady === 'true');
  await pg.waitForFunction(() => !document.querySelector('.map.is-loading'));
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
    const finite = document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity);
    await Promise.all(finite.map(animation => animation.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function openPage(pg, url) {
  await pg.goto(url, { waitUntil: 'domcontentloaded' });
  await settlePage(pg);
}

/* ---------- Static checks ---------- */
const isSpace = c => c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f';
const tagEnd = (source, start) => {
  let quote = '';
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '>') return i;
  }
  return -1;
};
const stripHtmlComments = source => {
  let out = '', i = 0;
  for (;;) {
    const start = source.indexOf('<!--', i);
    if (start < 0) return out + source.slice(i);
    out += source.slice(i, start);
    const end = source.indexOf('-->', start + 4);
    if (end < 0) return out;
    i = end + 3;
  }
};
const scanMarkupTags = (clean, wanted, startAt, endAt) => {
  const lower = clean.toLowerCase(), found = [];
  const raw = new Set(['script', 'style', 'template', 'noscript']);
  for (let i = startAt; i < endAt;) {
    const start = clean.indexOf('<', i);
    if (start < 0 || start >= endAt) break;
    let nameStart = start + 1;
    const closing = clean[nameStart] === '/'; if (closing) nameStart++;
    if (clean[nameStart] === '!') { i = tagEnd(clean, start) + 1; continue; }
    let nameEnd = nameStart;
    while (nameEnd < endAt && !isSpace(clean[nameEnd]) && clean[nameEnd] !== '>' && clean[nameEnd] !== '/') nameEnd++;
    const name = clean.slice(nameStart, nameEnd).toLowerCase();
    const end = tagEnd(clean, start);
    if (end < 0 || end > endAt) break;
    if (!closing && name === wanted.toLowerCase()) found.push(clean.slice(start, end + 1));
    if (!closing && raw.has(name) && clean[end - 1] !== '/') {
      const rawClose = lower.indexOf('</' + name, end + 1);
      if (rawClose < 0 || rawClose >= endAt) break;
      const rawEnd = tagEnd(clean, rawClose); i = rawEnd < 0 ? endAt : rawEnd + 1;
    } else i = end + 1;
  }
  return found;
};
const headTags = (source, wanted) => {
  const clean = stripHtmlComments(source), lower = clean.toLowerCase();
  const headStart = lower.indexOf('<head');
  if (headStart < 0) return [];
  const openEnd = tagEnd(clean, headStart);
  if (openEnd < 0) return [];
  const headClose = lower.indexOf('</head', openEnd + 1);
  return headClose < 0 ? [] : scanMarkupTags(clean, wanted, openEnd + 1, headClose);
};
const documentTags = (source, wanted) => {
  const clean = stripHtmlComments(source);
  return scanMarkupTags(clean, wanted, 0, clean.length);
};
const attributes = tag => {
  const attrs = new Map(); let i = 1;
  while (i < tag.length && !isSpace(tag[i]) && tag[i] !== '>') i++;
  while (i < tag.length) {
    while (i < tag.length && (isSpace(tag[i]) || tag[i] === '/')) i++;
    if (i >= tag.length || tag[i] === '>') break;
    const start = i;
    while (i < tag.length && !isSpace(tag[i]) && tag[i] !== '=' && tag[i] !== '>' && tag[i] !== '/') i++;
    const name = tag.slice(start, i).toLowerCase();
    while (i < tag.length && isSpace(tag[i])) i++;
    let value = '';
    if (tag[i] === '=') {
      i++; while (i < tag.length && isSpace(tag[i])) i++;
      if (tag[i] === '"' || tag[i] === "'") {
        const q = tag[i++], valueStart = i;
        while (i < tag.length && tag[i] !== q) i++;
        value = tag.slice(valueStart, i); if (tag[i] === q) i++;
      } else {
        const valueStart = i;
        while (i < tag.length && !isSpace(tag[i]) && tag[i] !== '>') i++;
        value = tag.slice(valueStart, i);
      }
    }
    if (name) attrs.set(name, value);
  }
  return attrs;
};
const words = value => {
  const found = []; let word = '';
  for (const c of String(value)) {
    if (isSpace(c)) { if (word) found.push(word); word = ''; }
    else word += c;
  }
  if (word) found.push(word);
  return found;
};
const stylesheetHrefs = (p, source, report = msg => out('FAIL', p, null, '15 stylesheet', msg)) => {
  const hrefs = [];
  for (const tag of headTags(source, 'link')) {
    const attrs = attributes(tag);
    if (!words(attrs.get('rel') || '').map(x => x.toLowerCase()).includes('stylesheet')) continue;
    const href = attrs.get('href');
    if (!href) report('stylesheet link has no href');
    else hrefs.push(href);
  }
  return hrefs;
};
const LOCAL_ASSET_ORIGIN = 'https://audit.invalid';
const localAsset = (p, href, kind, report = msg => out('FAIL', p, null, kind, msg)) => {
  let decodedRaw = '';
  try { decodedRaw = decodeURIComponent(href.split('#')[0].split('?')[0]); }
  catch { report(`cannot decode local asset reference ${href}`); return null; }
  if (decodedRaw.includes('\\') || decodedRaw.split('/').includes('..')) { report(`traversal in local asset reference ${href}`); return null; }
  let url;
  try { url = new URL(href, LOCAL_ASSET_ORIGIN + '/' + p + '.html'); }
  catch { report(`invalid local asset reference ${href}`); return null; }
  if (url.origin !== LOCAL_ASSET_ORIGIN) { report(`remote asset reference ${href}`); return null; }
  let pathname = '';
  try { pathname = decodeURIComponent(url.pathname); }
  catch { report(`cannot decode local asset path ${href}`); return null; }
  const path = resolve(DIR, '.' + pathname);
  const fromSite = relative(DIR, path);
  if (!fromSite || isAbsolute(fromSite) || fromSite === '..' || fromSite.startsWith('..' + sep)) { report(`asset escapes site root ${href}`); return null; }
  let bytes;
  try { bytes = readFileSync(path); }
  catch (error) { report(`unreadable local asset ${href}: ${error.code || error.message}`); return null; }
  return { href, url, path, fromSite, bytes };
};
const classNames = css => {
  const styled = new Set();
  for (let i = css.indexOf('.'); i >= 0; i = css.indexOf('.', i + 1)) {
    let j = i + 1; while (j < css.length && isIdent(css[j])) j++;
    const nm = css.slice(i + 1, j); if (nm && !(nm[0] >= '0' && nm[0] <= '9')) styled.add(nm);
  }
  return styled;
};
const stylesForPage = (p, source, load = (page, href) => localAsset(page, href, '15 stylesheet'), report = msg => out('FAIL', p, null, '15 stylesheet', msg)) => {
  const pageStyles = [], seen = new Set();
  for (const href of stylesheetHrefs(p, source, report)) {
    const asset = load(p, href);
    if (!asset) continue;
    if (!asset.fromSite.toLowerCase().endsWith('.css')) { report(`stylesheet is not CSS: ${href}`); continue; }
    if (seen.has(asset.fromSite)) { report(`stylesheet linked more than once: ${asset.fromSite}`); continue; }
    seen.add(asset.fromSite);
    let css = asset.bytes.toString('utf8');
    if (asset.fromSite === 'style.css') css += PLANT?.css_file_append || '';
    pageStyles.push({ ...asset, css: stripComments(css) });
  }
  return { pageStyles, styled: [...classNames(pageStyles.map(x => x.css).join('\n'))] };
};
const sameOrdered = (actual, expected) => actual.length === expected.length && actual.every((value, i) => value === expected[i]);
const versionError = (asset, expected) => {
  const versions = asset.url.searchParams.getAll('v');
  return versions.length === 1 && versions[0] === expected ? '' : `${asset.fromSite}?v=${versions.join(',') || '(missing)'} expected ${expected}`;
};
const stylesheetBalanceError = css => {
  let depth = 0, line = 1, bad = '', q = '';
  for (const ch of css) {
    if (q) { if (ch === q) q = ''; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === '\n') line++;
    if (ch === '{') depth++;
    if (ch === '}' && --depth < 0) { bad = `stray } near line ${line}`; break; }
  }
  if (!bad && depth) bad = `${depth} unclosed {`;
  return bad;
};
const startupSelfTests = () => {
  const passed = [];
  const check = (name, ok) => { if (!ok) throw new Error(`audit startup self-test failed: ${name}`); passed.push(name); };
  const routeBytes = Buffer.from('.route-only-probe{}');
  const routeVersion = createHash('sha1').update(routeBytes).digest('hex').slice(0, 8);
  const fakeBytes = { 'style.css': Buffer.from('.base-probe{}'), 'route.css': routeBytes };
  const fakeLoad = (_p, href) => {
    const url = new URL(href, LOCAL_ASSET_ORIGIN + '/fixture.html');
    const fromSite = url.pathname.slice(1), bytes = fakeBytes[fromSite];
    return bytes ? { href, url, path: fromSite, fromSite, bytes } : null;
  };
  const messages = [];
  const report = msg => messages.push(msg);
  const documentWith = body => '<html><head>' + body + '</head><body></body></html>';
  const baseLink = '<link rel="stylesheet" href="style.css?v=base">';
  const routeLink = `<link rel="stylesheet" href="route.css?v=${routeVersion}">`;
  const withRoute = stylesForPage('fixture', documentWith(baseLink + routeLink), fakeLoad, report);
  const withoutRoute = stylesForPage('fixture', documentWith(baseLink), fakeLoad, report);
  check('route-only selector enters linked page inventory', withRoute.styled.includes('route-only-probe'));
  check('omitted route sheet removes its selector from page inventory', !withoutRoute.styled.includes('route-only-probe'));
  check('route ownership rejects remove-and-move bypass', !sameOrdered(withoutRoute.pageStyles.filter(x => x.fromSite !== 'style.css').map(x => x.fromSite), ['route.css']));
  const commented = stylesForPage('fixture', documentWith(baseLink + '<!--' + routeLink + '--><style>.route-only-probe{}</style>'), fakeLoad, report);
  check('commented route link and inline replacement are not linked inventory', !commented.pageStyles.some(x => x.fromSite === 'route.css'));
  messages.length = 0; stylesForPage('fixture', documentWith(baseLink + routeLink + routeLink), fakeLoad, report);
  check('duplicate stylesheet link is rejected', messages.some(x => x.includes('more than once')));
  messages.length = 0; stylesForPage('fixture', documentWith('<link rel="stylesheet">'), fakeLoad, report);
  check('missing stylesheet href is rejected', messages.some(x => x.includes('no href')));
  const routeAsset = withRoute.pageStyles.find(x => x.fromSite === 'route.css');
  check('fresh route version passes', versionError(routeAsset, routeVersion) === '');
  const versionAsset = query => ({ ...routeAsset, url: new URL('route.css' + query, LOCAL_ASSET_ORIGIN + '/fixture.html') });
  check('stale route version is rejected', versionError(versionAsset('?v=00000000'), routeVersion).includes('expected'));
  check('missing route version is rejected', versionError(versionAsset(''), routeVersion).includes('(missing)'));
  check('duplicate route version is rejected', versionError(versionAsset(`?v=${routeVersion}&v=${routeVersion}`), routeVersion).includes(','));
  const rejected = href => { const errors = []; const asset = localAsset('fixture', href, 'self-test', msg => errors.push(msg)); return { asset, text: errors.join(' | ') }; };
  const missing = rejected('missing-route-self-test.css');
  check('missing stylesheet is rejected', !missing.asset && missing.text.includes('ENOENT'));
  const unreadable = rejected('_build');
  check('unreadable stylesheet is rejected', !unreadable.asset && unreadable.text.includes('EISDIR'));
  check('stylesheet traversal is rejected', rejected('../route.css').text.includes('traversal'));
  check('stylesheet backslash is rejected', rejected('..\\route.css').text.includes('traversal'));
  check('remote stylesheet is rejected', rejected('https://example.com/route.css').text.includes('remote'));
  check('malformed stylesheet link is rejected', rejected('http://[').text.includes('invalid'));
  check('unclosed route stylesheet is rejected', stylesheetBalanceError('.route-only-probe{').includes('unclosed'));
  check('stray route stylesheet brace is rejected', stylesheetBalanceError('.route-only-probe{} }').includes('stray'));
  check('selector removal leaves route class out of inventory', !classNames('.different-selector{}').has('route-only-probe'));
  return passed;
};
const SELF_TEST_RESULTS = startupSelfTests();
if (SELF_TEST_ONLY) {
  console.log(JSON.stringify({ passed: SELF_TEST_RESULTS.length, tests: SELF_TEST_RESULTS }, null, 2));
  process.exit(0);
}
const CSS_BY_PATH = new Map(), STYLED_BY_PAGE = {}, BASE_STYLED_BY_PAGE = {}, ROUTE_STYLES_BY_PAGE = {}, ROUTE_ONLY_BY_PAGE = {}, SOURCE_STYLE_HREFS_BY_PAGE = {}, STYLES_BY_PAGE = {};
for (const p of PAGES) {
  const { pageStyles, styled } = stylesForPage(p, html[p]);
  for (const asset of pageStyles) CSS_BY_PATH.set(asset.path, asset);
  STYLES_BY_PAGE[p] = pageStyles;
  STYLED_BY_PAGE[p] = styled;
  const baseStyles = pageStyles.filter(x => x.fromSite === 'style.css');
  BASE_STYLED_BY_PAGE[p] = [...classNames(baseStyles.map(x => x.css).join('\n'))];
  ROUTE_STYLES_BY_PAGE[p] = pageStyles.filter(x => x.fromSite !== 'style.css').map(x => x.fromSite);
  SOURCE_STYLE_HREFS_BY_PAGE[p] = pageStyles.map(x => x.fromSite + x.url.search);
  const expectedRoutes = EXPECTED_ROUTE_STYLES[p];
  const ownershipExact = sameOrdered(ROUTE_STYLES_BY_PAGE[p], expectedRoutes);
  controls.routeOwnership[p] = { page: p, expected: expectedRoutes, discovered: ROUTE_STYLES_BY_PAGE[p], exact: ownershipExact };
  if (!ownershipExact) out('FAIL', p, null, '15 stylesheet ownership', `route stylesheet inventory ${ROUTE_STYLES_BY_PAGE[p].join(',') || '(none)'} expected ${expectedRoutes.join(',') || '(none)'}`);
  const baseNames = new Set(BASE_STYLED_BY_PAGE[p]);
  ROUTE_ONLY_BY_PAGE[p] = styled.filter(x => !baseNames.has(x));
}
// Words the script uses (a superset of the class names it toggles).
const scripted = new Set(); { let cur = ''; for (const c of js) { if (isIdent(c)) cur += c; else { if (cur) scripted.add(cur); cur = ''; } } }
// 6 stale assets: shared style/script use their build hash; route styles use their own content hash.
const ver = createHash('sha1').update(readFileSync(DIR + 'style.css')).update(readFileSync(DIR + 'main.js')).digest('hex').slice(0, 8);
for (const p of PAGES) {
  const commonStyles = STYLES_BY_PAGE[p].filter(x => x.fromSite === 'style.css');
  if (commonStyles.length !== 1) out('FAIL', p, null, '6 stale assets', `style.css linked ${commonStyles.length} times; expected once`);
  for (const asset of STYLES_BY_PAGE[p]) {
    const expected = asset.fromSite === 'style.css' ? ver : createHash('sha1').update(asset.bytes).digest('hex').slice(0, 8);
    const problem = versionError(asset, expected); if (problem) out('FAIL', p, null, '6 stale assets', problem);
  }
  const mainRefs = [];
  for (const tag of documentTags(html[p], 'script')) {
    const src = attributes(tag).get('src');
    if (!src || !src.split('#')[0].split('?')[0].endsWith('main.js')) continue;
    const asset = localAsset(p, src, '6 stale assets'); if (asset) mainRefs.push(asset);
  }
  if (mainRefs.length !== 1) out('FAIL', p, null, '6 stale assets', `main.js linked ${mainRefs.length} times; expected once`);
  for (const asset of mainRefs) {
    if (asset.fromSite !== 'main.js') { out('FAIL', p, null, '6 stale assets', `unexpected main.js path ${asset.href}`); continue; }
    const problem = versionError(asset, ver); if (problem) out('FAIL', p, null, '6 stale assets', problem);
  }
}

// 15 broken stylesheet: browsers skip everything after an unbalanced brace without a word.
for (const { fromSite, css } of CSS_BY_PATH.values()) {
  const bad = stylesheetBalanceError(css);
  if (bad) out('FAIL', fromSite, null, '15 stylesheet', bad + ' (comments stripped, so line numbers run short)');
}

/* ---------- Rendered checks ---------- */
const b = await chromium.launch();
const SCRIPTED = [...scripted];
const ids = {};
for (const [w, h, rm] of SIZES) {
  const ctx = await b.newContext({
    viewport: { width: w, height: h },
    screen: { width: w, height: h },
    deviceScaleFactor: 1,
    reducedMotion: rm,
    isMobile: w < 768,
    hasTouch: w < 768,
    locale: 'en-US',
    timezoneId: 'UTC',
    serviceWorkers: 'block',
  });
  await ctx.addInitScript(() => {
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
  });
  await ctx.route('**/*', async routeHandler => {
    const requestUrl = new URL(routeHandler.request().url());
    if (requestUrl.origin === LOCAL_ORIGIN || requestUrl.protocol === 'data:' || requestUrl.protocol === 'blob:') await routeHandler.continue();
    else await routeHandler.abort('blockedbyclient');
  });
  for (const p of PAGES) {
    const STYLED = STYLED_BY_PAGE[p] || [];
    const BASE_STYLED = BASE_STYLED_BY_PAGE[p] || [];
    const ROUTE_STYLES = ROUTE_STYLES_BY_PAGE[p] || [];
    const ROUTE_ONLY = ROUTE_ONLY_BY_PAGE[p] || [];
    const EXPECTED_ROUTE = EXPECTED_ROUTE_STYLES[p] || [];
    const SOURCE_STYLE_HREFS = SOURCE_STYLE_HREFS_BY_PAGE[p] || [];
    const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errs.push(m.text()); });
    pg.on('requestfailed', request => { const url = new URL(request.url()); if (url.origin === LOCAL_ORIGIN) errs.push(`local request failed: ${url.pathname}`); });
    if (planted(p, w) && PLANT.js) await pg.addInitScript(PLANT.js);
    await openPage(pg, BASE + p + '.html');
    await plantInto(pg, p, w);
    // 9 errors
    if (errs.length) out('FAIL', p, w, '9 errors', errs.join(' | '));
    const r = await pg.evaluate(({ banned, w, STYLED, BASE_STYLED, SCRIPTED }) => {
      // Plain string helpers: no regular expressions.
      const wordsOf = s => String(s).split('\n').join(' ').split('\t').join(' ').split(' ').filter(Boolean);
      const isWord = c => !!c && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_');
      const res = { off: [], joined: [], hits: [], clipped: [], small: [], taps: [], meta: [], walls: [], lists: [], sparse: [], text: wordsOf(document.body.textContent).join(' '), ids: [...document.querySelectorAll('[id]')].map(e => e.id), links: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')), imgs: [...document.querySelectorAll('img')].map(i => i.getAttribute('src')) };
      const probe = document.createElement('i'); probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--gutter)'; document.body.appendChild(probe);
      const gutter = probe.getBoundingClientRect().width; probe.remove();
      const vw = document.documentElement.clientWidth;
      const name = el => (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + wordsOf(el.className).join('.') : el.tagName.toLowerCase());
      const shown = el => {
        if (el.closest('dialog:not([open]), details:not([open]) > :not(summary), [hidden], svg')) return false;
        for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); if (s.clipPath === 'inset(50%)' || (s.position === 'absolute' && e.offsetWidth <= 1)) return false; }
        let o = 1;
        for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return false; o *= +s.opacity; }
        return o > 0.05;
      };
      const scroller = el => { for (let e = el.parentElement; e; e = e.parentElement) { const s = getComputedStyle(e).overflowX; if (s === 'auto' || s === 'scroll') return e; } return null; };
      const clipOf = el => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (s.overflowX === 'auto' || s.overflowX === 'scroll') return null; if (s.overflowX !== 'visible' || s.overflowY !== 'visible') return { a, r: a.getBoundingClientRect() }; } return null; };
      // Every visible run of text, measured as rendered.
      const runs = [];
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => n.textContent.trim() ? 1 : 2 });
      for (let n; (n = tw.nextNode());) {
        const el = n.parentElement; if (!el || !shown(el) || el.closest('script,style,noscript,.skip')) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        const clip = clipOf(el);
        for (const rc of rg.getClientRects()) {
          if (rc.width <= 1 || rc.height <= 1) continue;
          // Fully outside an overflow-hidden ancestor = hidden on purpose (a rolled blind); partly outside = clipped.
          if (clip && (rc.right <= clip.r.left || rc.left >= clip.r.right || rc.bottom <= clip.r.top || rc.top >= clip.r.bottom)) continue;
          // A car scrolled out of its track is out of sight until the rider brings it in.
          const scr = scroller(el), sr = scr && scr.getBoundingClientRect();
          if (sr && (rc.right <= sr.left + 1 || rc.left >= sr.right - 1)) continue;
          runs.push({ el, rc, clip, t: n.textContent.trim().slice(0, 40) });
        }
      }
      const sy = scrollY;
      for (const { el, rc, t, clip } of runs) {
        // 2 off-gutter / off-screen text: maps and full-bleed figures may reach the viewport edge, never past it.
        const sc = scroller(el);
        const lim = sc ? sc.getBoundingClientRect() : null;
        const edge = el.closest('.map, .hd, .cr-strip, .stadium__stage, .me') ? 0 : gutter - 1;
        if (!lim && (rc.left < edge - 0.5 || rc.right > vw - edge + 0.5)) res.off.push(`${name(el)} "${t}" [${Math.round(rc.left)}..${Math.round(rc.right)}] gutter ${Math.round(gutter)}`);
        // 5 clipping: cut by an ancestor that hides overflow.
        if (clip && (rc.left < clip.r.left - 1 || rc.right > clip.r.right + 1 || rc.top < clip.r.top - 1 || rc.bottom > clip.r.bottom + 1)) res.clipped.push(`${name(el)} "${t}" by ${name(clip.a)}`);
        // 10 small text
        if (w < 768 && parseFloat(getComputedStyle(el).fontSize) < 12) res.small.push(`${name(el)} "${t}"`);
        // 7 small all-caps labels above headings. (Meta copy itself cannot pass the static check: it is no fact of his.)
        const cs = getComputedStyle(el);
        if (cs.textTransform === 'uppercase' && parseFloat(cs.fontSize) < 15 && t.length > 3) res.meta.push(`eyebrow ${name(el)} "${t}"`);
      }
      // 3 run-together text: two pieces of text on one line with nothing between them.
      for (const el of document.querySelectorAll('body *')) {
        if (!shown(el) || el.closest('svg')) continue;
        const kids = [...el.childNodes];
        for (let i = 0; i + 1 < kids.length; i++) {
          const a = kids[i], c = kids[i + 1];
          if (a.nodeType !== 1 || c.nodeType !== 1 || !a.textContent.trim() || !c.textContent.trim()) continue;
          // Only text that flows together: absolutely placed labels and grid cells are covered by the collision check.
          if (![a, c].every(x => { const s = getComputedStyle(x); return s.position !== 'absolute' && s.position !== 'fixed' && s.display.startsWith('inline'); })) continue;
          const ra = a.getClientRects(), rb = c.getClientRects(); if (!ra.length || !rb.length) continue;
          const last = ra[ra.length - 1], first = rb[0];
          const sameLine = Math.abs(last.top - first.top) < 3 && Math.abs(last.bottom - first.bottom) < 3;
          const at = a.textContent.trim(), ct = c.textContent.trim();
          if (sameLine && first.left - last.right < 2 && isWord(at[at.length - 1]) && isWord(ct[0]))
            res.joined.push(`${name(el)} "${a.textContent.trim().slice(-20)}|${c.textContent.trim().slice(0, 20)}"`);
        }
      }
      // 4 collisions: text over other text, and labels under a train.
      // Compare ink, not line boxes: trim the font's built-in ascent and descent (about a fifth of the box each side).
      const boxes = runs.map(r => { const d = r.rc.height * 0.2; return { ...r, b: { left: r.rc.left, right: r.rc.right, top: r.rc.top + d, bottom: r.rc.bottom - d } }; });
      const trains = [...document.querySelectorAll('.cr-train, .train')].filter(shown).map(e => e.getBoundingClientRect());
      for (let i = 0; i < boxes.length; i++) {
        const A = boxes[i].b;
        for (let j = i + 1; j < boxes.length; j++) {
          const B = boxes[j].b; if (boxes[i].el === boxes[j].el) continue;
          const ix = Math.min(A.right, B.right) - Math.max(A.left, B.left), iy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
          if (ix > 2 && iy > 3) res.hits.push(`"${boxes[i].t}" × "${boxes[j].t}"`);
        }
        for (const T of trains) { const ix = Math.min(A.right, T.right) - Math.max(A.left, T.left), iy = Math.min(A.bottom, T.bottom) - Math.max(A.top, T.top); if (ix > 2 && iy > 2) res.hits.push(`"${boxes[i].t}" under the train`); }
      }
      // 10 tap targets: links and buttons outside running text need 24px (AA); under 44px is a warning.
      for (const el of document.querySelectorAll('a[href], button, summary, [role=button]')) {
        if (!shown(el)) continue;
        const inFlow = el.parentElement && getComputedStyle(el).display === 'inline' && [...el.parentElement.childNodes].filter(n => n !== el && n.nodeType === 3).map(n => n.textContent).join('').trim().length > 0;
        if (inFlow) continue;
        const rc = el.getBoundingClientRect(); if (!rc.width) continue;
        let hgt = rc.height;
        const af = getComputedStyle(el, '::after');
        if (af.content !== 'none' && af.position === 'absolute') hgt = Math.max(hgt, rc.height - (parseFloat(af.top) || 0) - (parseFloat(af.bottom) || 0));
        if (w < 768 && hgt < 24) res.taps.push(`FAIL ${name(el)} "${el.textContent.trim().slice(0, 30)}" ${Math.round(hgt)}px`);
        else if (w < 768 && hgt < 44) res.taps.push(`WARN ${name(el)} "${el.textContent.trim().slice(0, 30)}" ${Math.round(hgt)}px`);
      }
      // 14 walls and lists (warnings): long paragraphs, long bulleted lists outside line diagrams.
      for (const pEl of document.querySelectorAll('p')) if (shown(pEl) && wordsOf(pEl.textContent).length > 70) res.walls.push(`${name(pEl)} ${wordsOf(pEl.textContent).length} words`);
      for (const l of document.querySelectorAll('ul, ol')) if (shown(l) && !l.closest('.route, .strip, .blind, .map, .seq__line') && l.children.length > 6) res.lists.push(`${name(l)} ${l.children.length} items`);
      // 17 giant empty surfaces: a large Career content region cannot leave most of its lower area blank.
      for (const surface of document.querySelectorAll('.cr-entry, .cr-proof__panes, .cr-r')) {
        if (!shown(surface)) continue;
        const box = surface.getBoundingClientRect();
        if (box.height < 240) continue;
        const content = [...surface.querySelectorAll('p, strong, span, a, button, img, h2, h3')].filter(el => shown(el)).map(el => el.getBoundingClientRect()).filter(rc => rc.width > 1 && rc.height > 1);
        if (!content.length) { res.sparse.push(`${name(surface)} has no visible content in ${Math.round(box.height)}px`); continue; }
        const top = Math.min(...content.map(rc => rc.top));
        const bottom = Math.max(...content.map(rc => rc.bottom));
        const occupied = Math.max(0, bottom - top);
        const lowerBlank = Math.max(0, box.bottom - bottom);
        if (occupied / box.height < 0.45 && lowerBlank > 96 && lowerBlank / box.height > 0.35)
          res.sparse.push(`${name(surface)} uses ${Math.round(occupied / box.height * 100)}% of ${Math.round(box.height)}px and leaves ${Math.round(lowerBlank)}px blank below`);
      }
      res.overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      res.banned = banned.filter(s => document.documentElement.outerHTML.includes(s));
      // 1 unstyled markup: an element none of whose classes is styled or scripted, that holds text itself
      // or wraps other bare elements, is a component nobody laid out. A bare wrapper of styled parts is fine.
      const J = new Set(SCRIPTED);
      const bareWith = styleNames => {
        const S = new Set(styleNames), bare = [];
        const isBare = el => el.classList.length && [...el.classList].every(c => !S.has(c) && !J.has(c));
        for (const el of document.querySelectorAll('body [class]')) {
          if (el.closest('svg') || !isBare(el)) continue;
          const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
          const bareKids = [...el.querySelectorAll('[class]')].filter(k => !k.closest('svg') && isBare(k)).length;
          if (ownText || bareKids >= 2) bare.push(`${name(el)}${ownText ? ' holds text' : ` wraps ${bareKids} bare elements`}`);
        }
        return bare;
      };
      res.bare = bareWith(STYLED);
      res.withoutRouteBare = bareWith(BASE_STYLED);
      res.styleSheets = [...document.styleSheets].map(sheet => {
        if (!sheet.href) return { kind: 'inline', href: '' };
        const url = new URL(sheet.href);
        if (url.origin !== location.origin) return { kind: 'remote', href: sheet.href };
        let path = decodeURIComponent(url.pathname); if (path.startsWith('/')) path = path.slice(1);
        return { kind: 'local', href: path + url.search };
      });
      return res;
    }, { banned, w, STYLED, BASE_STYLED, SCRIPTED });
    if (w === 1440) {
      const browserLinked = r.styleSheets.filter(x => x.kind === 'local').map(x => x.href);
      const inlineSheets = r.styleSheets.filter(x => x.kind === 'inline').length;
      const remoteSheets = r.styleSheets.filter(x => x.kind === 'remote').map(x => x.href);
      const browserExact = sameOrdered(browserLinked, SOURCE_STYLE_HREFS) && !inlineSheets && !remoteSheets.length;
      controls.browserStyles[p] = { page: p, expectedLinked: SOURCE_STYLE_HREFS, actualLinked: browserLinked, inlineSheets, remoteSheets, exact: browserExact };
      if (!browserExact) out('FAIL', p, null, '15 stylesheet runtime', `browser styles linked=${browserLinked.join(',') || '(none)'} inline=${inlineSheets} remote=${remoteSheets.length}; source expected ${SOURCE_STYLE_HREFS.join(',') || '(none)'}`);
    }
    if (w === 1440 && EXPECTED_ROUTE.length) {
      controls.routeStyles[p] = { page: p, expected: EXPECTED_ROUTE, sourceLinked: ROUTE_STYLES, routeOnlySelectors: ROUTE_ONLY, withRouteBare: r.bare.length, withoutRouteBare: r.withoutRouteBare.length };
      if (!ROUTE_ONLY.length) out('FAIL', p, null, '1 audit control', `linked route styles (${ROUTE_STYLES.join(', ')}) contribute no page-only selectors`);
      if (r.bare.length) out('FAIL', p, null, '1 audit control', `linked route styles did not produce a clean bare-markup result (${r.bare.length} finding(s))`);
      if (!r.withoutRouteBare.length) out('FAIL', p, null, '1 audit control', `removing linked route selectors (${ROUTE_STYLES.join(', ')}) exposed no bare markup`);
    }
    if (w === 1440) for (const m of new Set(r.bare)) out('FAIL', p, null, '1 unstyled', m);
    if (w === 1440) {
      const toggleText = await pg.evaluate(() => document.querySelector('[data-theme-toggle]')?.textContent?.trim() || '');
      if (toggleText) out('FAIL', p, w, '35 theme icon', `theme switch contains visible words in its markup: "${toggleText}"`);
      if (p === 'contact') {
        const repeatedName = await pg.evaluate(() => !!document.querySelector('header') && [...document.querySelectorAll('.map--contact .stn')].some(el => el.textContent.includes('Sairam Krishnan')));
        if (repeatedName) out('FAIL', p, w, '4 repeat-name', 'the contact map repeats Sairam Krishnan from the header');
      }
    }
    if (r.overflow > 0) out('FAIL', p, w, '2 off-screen', `page scrolls sideways by ${r.overflow}px`);
    for (const m of new Set(r.off)) out('FAIL', p, w, '2 off-gutter', m);
    for (const m of new Set(r.joined)) out('FAIL', p, w, '3 run-together', m);
    for (const m of new Set(r.hits)) out('FAIL', p, w, '4 collision', m);
    for (const m of new Set(r.clipped)) out('FAIL', p, w, '5 clipped', m);
    if (r.banned.length) out('FAIL', p, w, '7 banned', `${r.banned.length} never-listed name(s) present`);
    for (const m of new Set(r.meta)) out('FAIL', p, w, '7 meta copy', m);
    for (const m of new Set(r.small)) out('FAIL', p, w, '10 small text', m);
    for (const m of new Set(r.taps)) out(m.startsWith('FAIL') ? 'FAIL' : 'WARN', p, w, '10 tap target', m.slice(5));
    for (const m of new Set(r.sparse)) out('FAIL', p, w, '17 sparse surface', m);
    if (w === 1440) {
      for (const m of r.walls) out('FAIL', p, w, '14 wall', m);
      for (const m of r.lists) out('FAIL', p, w, '14 list', m);
      // 8 facts floor
      const f = FLOOR[p] || {};
      for (const s of f.text || []) if (!r.text.includes(s)) out('FAIL', p, w, '8 floor', `missing "${s}"`);
      for (const s of f.absent || []) if (r.text.includes(s)) out('FAIL', p, w, '8 floor', `retired "${s}" is back`);
      for (const s of f.images || []) if (!r.imgs.some(i => i && i.includes(s))) out('FAIL', p, w, '8 floor', `image ${s} missing`);
      ids[p] = { ids: r.ids, links: r.links };
    }
    // 12 behaviour: rides stop at their ends; the home card opens and closes cleanly.
    if (w === 1440 && p === 'career') {
      for (const end of ['wharton', 'praxtera']) {
        await openPage(pg, BASE + 'career.html#' + end);
        await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(500);
        if (!pg.url().endsWith('#' + end)) out('FAIL', p, w, '12 ride end', `→ at ${end} went to ${pg.url().split('#')[1]}`);
      }
    }
    if (w === 1440) {
      const ends = await pg.evaluate(() => [...document.querySelectorAll('[data-ride]')].map((r, i) => { const s = [...r.querySelectorAll('[data-stop]')]; return s.length ? i : -1; }).filter(i => i >= 0));
      for (const i of ends) {
        const res = await pg.evaluate(i => { const r = document.querySelectorAll('[data-ride]')[i]; const s = [...r.querySelectorAll('[data-stop]')]; const last = s[s.length - 1]; last.click(); last.focus(); last.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); return [last.dataset.stop, document.activeElement?.dataset?.stop]; }, i);
        if (res[1] && res[1] !== res[0]) out('FAIL', p, w, '12 ride end', `→ at ${res[0]} wrapped to ${res[1]}`);
      }
    }
    if (p === 'index' && (w === 1440 || w === 375)) {
      const sel = w === 1440 ? '.map--wide .stn--me' : '.map--tall .stn--me';
      const rest = await pg.evaluate(() => [document.scrollingElement.scrollWidth, document.scrollingElement.scrollHeight]);
      await pg.click(sel); await pg.waitForTimeout(1200);
      const open = await pg.evaluate(() => [document.getElementById('me').open, document.scrollingElement.scrollWidth, document.scrollingElement.scrollHeight]);
      await pg.keyboard.press('Escape'); await pg.waitForTimeout(1200);
      const after = await pg.evaluate(() => [document.getElementById('me').open, document.activeElement?.classList.contains('stn--me')]);
      if (!open[0]) out('FAIL', p, w, '12 card', 'face did not open the card');
      if (open[1] !== rest[0] || open[2] !== rest[1]) out('FAIL', p, w, '12 card', `scroll size changed ${rest} → ${open.slice(1)}`);
      if (after[0] || !after[1]) out('FAIL', p, w, '12 card', 'Esc did not close the card and return focus to the face');
    }
    // 19 touching: two stacked blocks whose text comes within 12px of each other.
    if (w >= 768) {
      const touch = await pg.evaluate(() => {
        const res = [];
        const vis = el => el.offsetParent !== null && getComputedStyle(el).display !== 'none' && !el.closest('dialog:not([open]), [hidden]');
        const textBox = el => {
          let t = Infinity, b = -Infinity, l = Infinity, r = -Infinity;
          const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => n.textContent.trim() ? 1 : 2 });
          for (let n; (n = tw.nextNode());) {
            const pe = n.parentElement; if (!pe || pe.closest('svg,script,style,.skip')) continue;
            const cs = getComputedStyle(pe); if (cs.visibility === 'hidden' || +cs.opacity === 0 || cs.position === 'absolute') continue;
            const rg = document.createRange(); rg.selectNodeContents(n);
            for (const rc of rg.getClientRects()) { if (rc.width < 1 || rc.height < 1) continue; t = Math.min(t, rc.top); b = Math.max(b, rc.bottom); l = Math.min(l, rc.left); r = Math.max(r, rc.right); }
          }
          return t < Infinity ? { t, b, l, r } : null;
        };
        for (const el of document.querySelectorAll('main > *, main article, main section, main [data-screen]')) {
          if (!vis(el)) continue;
          let nx = el.nextElementSibling;
          while (nx && (!vis(nx) || ['SCRIPT', 'STYLE'].includes(nx.tagName))) nx = nx.nextElementSibling;
          if (!nx) continue;
          const A = textBox(el), B = textBox(nx); if (!A || !B) continue;
          const ra = el.getBoundingClientRect(), rb = nx.getBoundingClientRect();
          if (rb.top < ra.bottom - 2) continue; // side by side, not stacked
          if (Math.min(A.r, B.r) - Math.max(A.l, B.l) <= 0) continue;
          const gap = B.t - A.b;
          if (gap >= -1 && gap < 12) res.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} → ${nx.tagName.toLowerCase()}${nx.id ? '#' + nx.id : ''}: text ${Math.round(gap)}px apart`);
        }
        return res;
      });
      for (const m of new Set(touch)) out('FAIL', p, w, '19 touching', m);
    }
    // 35 theme: the switch flips the theme, the choice persists, and text is legible in both themes.
    if (w === 1440) {
      const contrast = () => {
        const nums = c => { const i = c.indexOf('('), j = c.indexOf(')'); if (i < 0 || j < 0) return null; return c.slice(i + 1, j).split(',').join(' ').split('/').join(' ').split(' ').filter(Boolean).map(Number); };
        const lum = c => { const m = nums(c); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(v => { v = v / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const alpha = c => { const m = nums(c); return m && m.length > 3 ? +m[3] : 1; };
        const bgOf = el => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.backgroundColor && alpha(s.backgroundColor) > 0.5) return s.backgroundColor; } return getComputedStyle(document.documentElement).backgroundColor || 'rgb(255,255,255)'; };
        const seen = new Set(), res = [];
        const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => n.textContent.trim() ? 1 : 2 });
        for (let n; (n = tw.nextNode());) {
          const el = n.parentElement; if (!el || seen.has(el) || el.closest('svg,script,style,.skip,dialog:not([open])')) continue; seen.add(el);
          if (el.offsetParent === null) continue;
          const s = getComputedStyle(el); if (s.visibility === 'hidden' || +s.opacity < 0.2) continue;
          const a = lum(s.color), b = lum(bgOf(el)); if (a == null || b == null) continue;
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          const fs = parseFloat(s.fontSize), big = fs >= 24 || (fs >= 18.66 && +s.fontWeight >= 700);
          if (ratio < (big ? 3 : 4.5)) res.push(`"${n.textContent.trim().slice(0, 30)}" ${ratio.toFixed(2)}:1 (${s.color} on ${bgOf(el)})`);
        }
        return res;
      };
      const th = await pg.evaluate(async () => {
        const b = document.querySelector('[data-theme-toggle]'); if (!b) return { none: true };
        const bg = () => getComputedStyle(document.body).backgroundColor;
        const t0 = document.documentElement.dataset.theme || '', c0 = bg();
        b.click(); await new Promise(r => setTimeout(r, 500));
        return { t0, t1: document.documentElement.dataset.theme || '', c0, c1: bg() };
      });
      if (th.none) out('FAIL', p, w, '35 theme', 'no theme switch on the page');
      else if (th.t0 === th.t1 || th.c0 === th.c1) out('FAIL', p, w, '35 theme', `the switch did not change the theme (${th.t0 || 'unset'} → ${th.t1 || 'unset'})`);
      else {
        await pg.reload({ waitUntil: 'domcontentloaded' }); await settlePage(pg);
        const t2 = await pg.evaluate(() => document.documentElement.dataset.theme || '');
        if (t2 !== th.t1) out('FAIL', p, w, '35 theme', 'the chosen theme did not survive a reload');
        await plantInto(pg, p, w);
        for (const m of new Set(await pg.evaluate(contrast))) out('FAIL', p, w, '35 contrast', `${t2} theme: ${m}`);
        await pg.evaluate(() => document.querySelector('[data-theme-toggle]').click()); await pg.waitForTimeout(500);
        const t3 = await pg.evaluate(() => document.documentElement.dataset.theme || '');
        for (const m of new Set(await pg.evaluate(contrast))) out('FAIL', p, w, '35 contrast', `${t3} theme: ${m}`);
      }
    }
    // 24 zoom and 36 line links on the home map.
    if (p === 'index' && w === 1440 && rm !== 'reduce') {
      const wait = async () => { await settlePage(pg); await plantInto(pg, p, w); };
      for (const href of ['career.html', 'speaking.html', 'research.html', 'projects.html', 'services.html', 'contact.html']) {
        await pg.goto(BASE + 'index.html', { waitUntil: 'domcontentloaded' }); await wait();
        const sent = await pg.evaluate(href => { const el = document.querySelector(`.map--wide path[data-href^="${href}"]`); if (!el) return false; el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window })); return true; }, href);
        if (!sent) { out('FAIL', p, w, '36 line link', `no line on the map leads to ${href}`); continue; }
        await pg.waitForURL(u => u.toString().includes(href), { timeout: 4000 }).catch(() => {});
        if (!pg.url().includes(href)) out('FAIL', p, w, '36 line link', `double-clicking the line did not open ${href}`);
      }
      await pg.goto(BASE + 'index.html', { waitUntil: 'domcontentloaded' }); await wait();
      await pg.evaluate(() => {
        sessionStorage.setItem('zf', '0');
        const red = document.querySelector('.map--wide .ln[data-line="red"]'); let last = null, n = 0;
        const loop = () => { const r = red.getBoundingClientRect(); const k = [r.x, r.y, r.width, r.height].map(Math.round).join(','); if (last !== null && k !== last) sessionStorage.setItem('zf', String(++n)); last = k; requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
      });
      const pt = await pg.evaluate(() => { const pth = document.querySelector('.map--wide .ln[data-line="red"]'); const q = pth.getPointAtLength(pth.getTotalLength() * 0.42); const m = pth.getScreenCTM(); return [q.x * m.a + m.e, q.y * m.d + m.f]; });
      await Promise.all([pg.waitForURL(u => u.toString().includes('career.html'), { timeout: 5000 }).catch(() => {}), pg.mouse.click(pt[0], pt[1])]);
      await pg.waitForTimeout(300);
      const frames = +(await pg.evaluate(() => sessionStorage.getItem('zf')) || 0);
      if (!pg.url().includes('career.html')) out('FAIL', p, w, '24 zoom', 'clicking the red line did not ride into Career');
      else if (frames < 6) out('FAIL', p, w, '24 zoom', `the map jumped to Career in ${frames} animated frames; the zoom must be continuous`);
    }
    await pg.close();
  }
  await ctx.close();
}
await b.close();
if (SIZES.some(([w]) => w === 1440)) {
  for (const p of PAGES) if ((EXPECTED_ROUTE_STYLES[p] || []).length && !controls.routeStyles[p])
    out('FAIL', p, null, '1 audit control', 'route-styles production control did not run');
  for (const p of PAGES) if (!controls.browserStyles[p]) out('FAIL', p, null, '15 stylesheet runtime', 'browser stylesheet inventory control did not run');
}

// 11 links: every internal page and #id resolves.
for (const [p, { links }] of Object.entries(ids)) {
  for (const href of new Set(links)) {
    if (['http:', 'https:', 'mailto:', 'tel:'].some(x => href.startsWith(x)) || href.startsWith('/public/')) { if (href.startsWith('/public/') && !existsSync(PROJECT + decodeURI(href.split('#')[0]).slice(1))) out('FAIL', p, null, '11 link', href); continue; }
    const [file, hash] = href.split('#');
    const target = file ? file.replace('.html', '') : p;
    if (file && !ALL.includes(target)) { out('FAIL', p, null, '11 link', href); continue; }
    const idsIn = s => { const out = []; for (let i = s.indexOf('id="'); i >= 0; i = s.indexOf('id="', i + 4)) out.push(s.slice(i + 4, s.indexOf('"', i + 4))); return out; };
    const tids = ids[target]?.ids || idsIn(html[target] || '');
    if (hash && !tids.includes(hash)) out('FAIL', p, null, '11 link', `${href} (no #${hash})`);
  }
}

console.log(`\n${fails} fail, ${warns} warn`);
if (JSON_OUT) (await import('fs')).writeFileSync(JSON_OUT, JSON.stringify({ t: Date.now() / 1000, pages: PAGES, widths: SIZES.map(s => s[0]), fails, warns, plant: plantEvidence, controls, results }, null, 1));
process.exit(fails ? 1 : 0);
