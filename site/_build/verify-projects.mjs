import { AxeBuilder } from '@axe-core/playwright';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { sharedRouteOracle, validateSharedRouteOracle, verifySharedRoutePixels } from './shared-route-oracle.mjs';

const base = process.env.PROJECTS_BASE || 'http://127.0.0.1:4401/';
const origin = base.endsWith('/') ? base : base + '/';
const jsonIndex = process.argv.indexOf('--json');
const outputPath = jsonIndex >= 0 ? process.argv[jsonIndex + 1] : '';
const assetOnly = process.argv.includes('--asset-only');
const projectsOnly = process.argv.includes('--projects-only');
const ventures = [
  ['ondoway', 'Ondoway', 5],
  ['persuaider', 'Persuaider', 4],
  ['gestiq', 'Gestiq', 3],
  ['lore', 'Lore / DependIQ', 3],
  ['crucible', 'Crucible', 3],
];
const proofContractBytes = readFileSync(new URL('../../.claude/rubric/projects-proof-contract.json', import.meta.url));
const proofContract = JSON.parse(proofContractBytes);
const proofAuthority = proofContract.authority;
const sharedRouteOracleBytes = readFileSync(new URL('../../.claude/rubric/shared-route-oracle.json', import.meta.url));
const sharedRouteTransition = proofContract.sharedRouteTransition;
const resumeTransitionLedgerBytes = readFileSync(new URL('../../.claude/rubric/authority/resume-equivalence.json', import.meta.url));
const resumeTransitionLedger = JSON.parse(resumeTransitionLedgerBytes);
const authorityCoverageBytes = readFileSync(new URL('../../.claude/rubric/facts/authority-coverage.json', import.meta.url));
const authorityCoverage = JSON.parse(authorityCoverageBytes);
const acceptedResumeTransition = proofContract.acceptedResumeTransition;
const ondowayAssetHash = 'f018ae04d307873816f2dac332b1889abdddfa8e055e7b86f0fcac05cb2f888a';
const ondowayPaintContract = {
  method: 'full-page-crop-reference-raster-v1',
  assetSha256: ondowayAssetHash,
  pixelDelta: 12,
  maxColumnMismatchRatio: 0.03,
  signalDelta: 20,
  minSignalRowRatio: 0.20,
  // Two identical full-page capture runs calibrated each context. Light and 768 dark tolerate the
  // visually intact rounded raster; 1440 dark and 375 dark bisect the clean/radius failure gap.
  expected: [
    { width: 1440, theme: 'light', left: 989.390625, top: 1212.75, rasterWidth: 300, rasterHeight: 622.1875, cropWidth: 301, cropHeight: 623, minFaithfulColumnRatio: 0.25, maxMismatchRatio: 0.055 },
    { width: 1440, theme: 'dark', left: 989.390625, top: 1212.75, rasterWidth: 300, rasterHeight: 622.1875, cropWidth: 301, cropHeight: 623, minFaithfulColumnRatio: 0.274, maxMismatchRatio: 0.052 },
    { width: 768, theme: 'light', left: 534.421875, top: 1088.671875, rasterWidth: 202.859375, rasterHeight: 420.71875, cropWidth: 204, cropHeight: 422, minFaithfulColumnRatio: 0.03, maxMismatchRatio: 0.0755 },
    { width: 768, theme: 'dark', left: 534.421875, top: 1088.671875, rasterWidth: 202.859375, rasterHeight: 420.71875, cropWidth: 204, cropHeight: 422, minFaithfulColumnRatio: 0.09, maxMismatchRatio: 0.068 },
    { width: 375, theme: 'light', left: 84, top: 2249.703125, rasterWidth: 250, rasterHeight: 518.484375, cropWidth: 250, cropHeight: 520, minFaithfulColumnRatio: 0.84, maxMismatchRatio: 0.0225 },
    { width: 375, theme: 'dark', left: 84, top: 2249.703125, rasterWidth: 250, rasterHeight: 518.484375, cropWidth: 250, cropHeight: 520, minFaithfulColumnRatio: 0.90, maxMismatchRatio: 0.019 },
  ],
};
const ondowayPaintContractSha256 = hash(JSON.stringify(ondowayPaintContract));
const proofSelector = '.pj-venture > .pj-evidence > .pj-proof[data-project-proof][data-proof-unit]';
const expectedHeaderLinks = ['index.html', '/public/assets/Resume.pdf', 'index.html'];
const expectedFooterLinks = [
  'services.html', 'speaking.html', 'career.html', 'contact.html',
  'mailto:sairambkrishnan@gmail.com', 'https://www.linkedin.com/in/sairambkrishnan',
];
const graphNodes = [
  ['private-objectives', 'input', 'Role-conditioned agents with private objectives'],
  ['simulations', 'input', 'stateful AI-versus-AI simulations'],
  ['extraction', 'extract', 'LLM deal extraction'],
  ['utility', 'output', 'deterministic utility, walk-away, and value-left-on-the-table calculations'],
  ['coaching', 'output', 'configurable weighted coaching rubrics'],
];
const graphEdges = [
  ['private-objectives-to-extraction', 'private-objectives', 'extraction'],
  ['simulations-to-extraction', 'simulations', 'extraction'],
  ['extraction-to-utility', 'extraction', 'utility'],
  ['extraction-to-coaching', 'extraction', 'coaching'],
];

class VerificationError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

function fail(message, kind = 'projects-verifier') {
  throw new VerificationError(kind, message);
}

function assert(value, message, kind = 'projects-verifier') {
  if (!value) fail(message, kind);
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
  let out = '';
  let gap = false;
  for (const char of value) {
    if (char <= ' ') gap = out.length > 0;
    else {
      if (gap) out += ' ';
      out += char;
      gap = false;
    }
  }
  return out.trim();
}

function canonicalText(value) {
  let out = '';
  let index = 0;
  while (index < value.length) {
    if (value[index] === '–') {
      let rightIndex = index + 1;
      while (rightIndex < value.length && value[rightIndex] === ' ') rightIndex += 1;
      const left = out.trimEnd().slice(-1);
      const right = value.slice(rightIndex, rightIndex + 1);
      if (left >= '0' && left <= '9' && right >= '0' && right <= '9') {
        out = out.trimEnd() + '-';
        index = rightIndex;
        continue;
      }
    }
    out += value[index];
    index += 1;
  }
  return normalized(out.split(' – ').join(' to ').split('–').join('-').split('—').join(', '));
}

function verifyAcceptedResumeTransition(unitAtomLedger) {
  assert(acceptedResumeTransition && typeof acceptedResumeTransition === 'object', 'Projects accepted-resume transition contract is missing');
  assert(hash(resumeTransitionLedgerBytes) === acceptedResumeTransition.ledgerSha256,
    'Projects accepted-resume transition ledger bytes changed');
  assert(acceptedResumeTransition.ledgerPath === '.claude/rubric/authority/resume-equivalence.json',
    'Projects accepted-resume transition ledger path changed');
  assert(acceptedResumeTransition.authorityCoveragePath === '.claude/rubric/facts/authority-coverage.json'
      && hash(authorityCoverageBytes) === acceptedResumeTransition.authorityCoverageSha256,
  'Projects accepted-resume authority coverage bytes changed');
  const governed = resumeTransitionLedger.projectsTransition || {};
  assert(JSON.stringify(governed.factIds) === JSON.stringify(acceptedResumeTransition.factIds),
    'Projects accepted-resume transition IDs changed');
  assert(governed.transitionSha256 === acceptedResumeTransition.transitionSha256,
    'Projects accepted-resume transition payload hash changed');
  assert(governed.canonicalProjectsLedgerSha256 === proofAuthority.canonicalUnitAtomLedgerSha256,
    'Projects accepted-resume transition does not govern the canonical proof ledger');
  const mirrored = authorityCoverage.acceptedResumeTransitions || {};
  assert(mirrored.canonicalProjectsLedgerSha256 === proofAuthority.canonicalUnitAtomLedgerSha256
      && mirrored.transitionSha256 === acceptedResumeTransition.transitionSha256
      && JSON.stringify(mirrored.factIds) === JSON.stringify(acceptedResumeTransition.factIds)
      && Array.isArray(mirrored.coverage) && mirrored.coverage.length === acceptedResumeTransition.authorizedTransitionAtomCount,
  'Projects accepted-resume authority coverage does not mirror the exact transition');

  const byId = new Map((resumeTransitionLedger.equivalences || []).map(item => [item.factId, item]));
  const transitionPayload = acceptedResumeTransition.factIds.map(factId => {
    const item = byId.get(factId);
    assert(item, `Projects accepted-resume transition ${factId} is missing`);
    return {
      factId: item.factId,
      legacyText: item.legacyText,
      acceptedText: item.acceptedText,
      transition: item.transition,
    };
  });
  assert(hash(canonicalJson(transitionPayload)) === acceptedResumeTransition.transitionSha256,
    'Projects accepted-resume transition payload cannot reproduce its sealed hash');
  const scoped = (resumeTransitionLedger.equivalences || []).filter(item => item.transition?.scope === 'projects-proof-atom');
  assert(scoped.length === acceptedResumeTransition.authorizedTransitionAtomCount,
    'Projects accepted-resume transition count changed');

  const legacyLedger = unitAtomLedger.map(unit => ({ ...unit, atoms: [...unit.atoms] }));
  let replacements = 0;
  for (const item of transitionPayload) {
    const accepted = canonicalText(normalized(item.acceptedText));
    const legacy = canonicalText(normalized(item.legacyText));
    const acceptedGap = accepted.indexOf(' ');
    const legacyGap = legacy.indexOf(' ');
    assert(acceptedGap > 0 && legacyGap > 0 && accepted.slice(acceptedGap + 1) === legacy.slice(legacyGap + 1),
      `Projects accepted-resume transition ${item.factId} changes more than its leading verb`);
    const matches = [];
    for (let unitIndex = 0; unitIndex < legacyLedger.length; unitIndex += 1) {
      for (let atomIndex = 0; atomIndex < legacyLedger[unitIndex].atoms.length; atomIndex += 1) {
        if (legacyLedger[unitIndex].atoms[atomIndex] === accepted) matches.push([unitIndex, atomIndex]);
      }
    }
    assert(matches.length === 1, `Projects accepted-resume transition ${item.factId} does not own exactly one proof atom`);
    const [unitIndex, atomIndex] = matches[0];
    legacyLedger[unitIndex].atoms[atomIndex] = legacy;
    legacyLedger[unitIndex].atoms.sort();
    replacements += 1;
  }
  const totalAtoms = legacyLedger.reduce((count, unit) => count + unit.atoms.length, 0);
  assert(replacements === acceptedResumeTransition.authorizedTransitionAtomCount,
    'Projects accepted-resume transition replacement count changed');
  assert(totalAtoms - replacements === acceptedResumeTransition.unchangedNormalizedTextAtomCount,
    'Projects unchanged proof atom count changed');
  assert(hash(JSON.stringify(legacyLedger)) === acceptedResumeTransition.previousCanonicalUnitAtomLedgerSha256,
    'Projects accepted-resume transitions do not reconstruct the previous canonical ledger');
  return {
    ledgerSha256: acceptedResumeTransition.ledgerSha256,
    authorityCoverageSha256: acceptedResumeTransition.authorityCoverageSha256,
    transitionSha256: acceptedResumeTransition.transitionSha256,
    factIds: acceptedResumeTransition.factIds,
    authorizedTransitionAtomCount: replacements,
    unchangedNormalizedTextAtomCount: totalAtoms - replacements,
    reconstructedPreviousCanonicalUnitAtomLedgerSha256: hash(JSON.stringify(legacyLedger)),
  };
}

function verifySharedRouteTransition() {
  validateSharedRouteOracle();
  assert(sharedRouteTransition?.oraclePath === '.claude/rubric/shared-route-oracle.json'
      && hash(sharedRouteOracleBytes) === sharedRouteTransition.oracleSha256,
  'Projects shared-route oracle bytes differ from the exact proof contract');
  assert(JSON.stringify(sharedRouteOracle.authority?.authorizedTransitions) === JSON.stringify(sharedRouteTransition.authorities),
    'Projects shared-route transition differs from the oracle authority');
  return sharedRouteTransition;
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function verifySourceAsset() {
  const asset = readFileSync(new URL('../../public/assets/ondoway-journey-wireframe.png', import.meta.url));
  if (hash(asset) !== ondowayAssetHash) fail('Ondoway source wireframe asset bytes changed', 'asset-bytes');
  if (asset.readUInt32BE(16) !== 392 || asset.readUInt32BE(20) !== 813) fail('Ondoway source wireframe dimensions changed', 'asset-dimensions');
  if (asset[24] !== 8 || asset[25] !== 2) fail('Ondoway source wireframe must remain 8-bit RGB PNG', 'asset-format');
}

async function verifyRuntimeAsset() {
  const response = await fetch(origin + 'public/assets/ondoway-journey-wireframe.png', { cache: 'no-store' });
  if (!response.ok) fail(`candidate Ondoway wireframe returned ${response.status}`, 'asset-bytes');
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = hash(bytes);
  if (actual !== ondowayAssetHash) fail(`candidate Ondoway wireframe bytes changed: ${actual}`, 'asset-bytes');
  if (bytes.readUInt32BE(16) !== 392 || bytes.readUInt32BE(20) !== 813) fail('candidate Ondoway wireframe dimensions changed', 'asset-dimensions');
  if (bytes[24] !== 8 || bytes[25] !== 2) fail('candidate Ondoway wireframe must remain 8-bit RGB PNG', 'asset-format');
  return { actual, bytes };
}

async function contextFor(browser, width, theme, javaScriptEnabled = true) {
  const context = await browser.newContext({
    viewport: { width, height: width === 375 ? 812 : 900 },
    colorScheme: theme,
    reducedMotion: 'reduce',
    javaScriptEnabled,
  });
  if (javaScriptEnabled) await context.addInitScript(value => localStorage.setItem('theme', value), theme);
  return context;
}

async function open(context, route) {
  const page = await context.newPage();
  await page.goto(origin + route, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function paintReferencePage(browser) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, colorScheme: 'light' });
  const page = await context.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  return { context, page };
}

async function verifyOndowayPaint(page, referencePage, fullPagePng, width, theme, assetDataUrl) {
  const expected = ondowayPaintContract.expected.find(item => item.width === width && item.theme === theme);
  assert(expected, `${width}:${theme}: missing Ondoway paint contract`, 'asset-paint');
  const observed = await page.locator('#ondoway .pf__phone img').evaluate(node => {
    const rect = node.getBoundingClientRect();
    return {
      left: rect.left + scrollX,
      top: rect.top + scrollY,
      width: rect.width,
      height: rect.height,
      background: getComputedStyle(document.body).backgroundColor,
    };
  });
  const geometryTolerance = 0.01;
  assert(Math.abs(observed.left - expected.left) <= geometryTolerance
      && Math.abs(observed.top - expected.top) <= geometryTolerance
      && Math.abs(observed.width - expected.rasterWidth) <= geometryTolerance
      && Math.abs(observed.height - expected.rasterHeight) <= geometryTolerance,
  `${width}:${theme}: Ondoway paint box moved or changed size`,
  'asset-paint');

  const fullPageDataUrl = 'data:image/png;base64,' + fullPagePng.toString('base64');
  const metrics = await referencePage.evaluate(async input => {
    document.documentElement.style.colorScheme = 'light';
    const load = source => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('paint oracle could not decode an input image'));
      image.src = source;
    });
    const [fullPage, asset] = await Promise.all([load(input.fullPageDataUrl), load(input.assetDataUrl)]);
    const left = Math.floor(input.expected.left);
    const top = Math.floor(input.expected.top);
    const right = Math.ceil(input.expected.left + input.expected.rasterWidth);
    const bottom = Math.ceil(input.expected.top + input.expected.rasterHeight);
    const cropWidth = right - left;
    const cropHeight = bottom - top;
    const canvas = document.createElement('canvas');
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    context.fillStyle = input.observed.background;
    context.fillRect(0, 0, cropWidth, cropHeight);
    context.drawImage(
      asset,
      input.expected.left - left,
      input.expected.top - top,
      input.expected.rasterWidth,
      input.expected.rasterHeight,
    );
    const reference = context.getImageData(0, 0, cropWidth, cropHeight).data;
    context.clearRect(0, 0, cropWidth, cropHeight);
    context.drawImage(fullPage, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    const painted = context.getImageData(0, 0, cropWidth, cropHeight).data;

    const mismatchesByColumn = new Array(cropWidth).fill(0);
    const referenceSignalByColumn = new Array(cropWidth).fill(0);
    const paintedSignalByColumn = new Array(cropWidth).fill(0);
    const backgroundCanvas = document.createElement('canvas');
    backgroundCanvas.width = 1;
    backgroundCanvas.height = 1;
    const backgroundContext = backgroundCanvas.getContext('2d', { willReadFrequently: true });
    backgroundContext.fillStyle = input.observed.background;
    backgroundContext.fillRect(0, 0, 1, 1);
    const background = backgroundContext.getImageData(0, 0, 1, 1).data;
    let mismatchCount = 0;
    let totalMaxDelta = 0;
    for (let y = 0; y < cropHeight; y += 1) {
      for (let x = 0; x < cropWidth; x += 1) {
        const at = (y * cropWidth + x) * 4;
        const delta = Math.max(
          Math.abs(painted[at] - reference[at]),
          Math.abs(painted[at + 1] - reference[at + 1]),
          Math.abs(painted[at + 2] - reference[at + 2]),
        );
        totalMaxDelta += delta;
        if (delta > input.contract.pixelDelta) {
          mismatchCount += 1;
          mismatchesByColumn[x] += 1;
        }
        const referenceSignal = Math.max(
          Math.abs(reference[at] - background[0]),
          Math.abs(reference[at + 1] - background[1]),
          Math.abs(reference[at + 2] - background[2]),
        );
        const paintedSignal = Math.max(
          Math.abs(painted[at] - background[0]),
          Math.abs(painted[at + 1] - background[1]),
          Math.abs(painted[at + 2] - background[2]),
        );
        if (referenceSignal > input.contract.signalDelta) referenceSignalByColumn[x] += 1;
        if (paintedSignal > input.contract.signalDelta) paintedSignalByColumn[x] += 1;
      }
    }
    const faithfulColumns = mismatchesByColumn.filter(count => count / cropHeight <= input.contract.maxColumnMismatchRatio).length;
    const referenceSignalColumns = referenceSignalByColumn.filter(count => count / cropHeight >= input.contract.minSignalRowRatio).length;
    const paintedSignalColumns = paintedSignalByColumn.filter(count => count / cropHeight >= input.contract.minSignalRowRatio).length;
    const pixelCount = cropWidth * cropHeight;
    return {
      fullPageWidth: fullPage.naturalWidth,
      cropWidth,
      cropHeight,
      faithfulColumnRatio: faithfulColumns / cropWidth,
      referenceSignalColumnRatio: referenceSignalColumns / cropWidth,
      paintedSignalColumnRatio: paintedSignalColumns / cropWidth,
      mismatchRatio: mismatchCount / pixelCount,
      meanMaxDelta: totalMaxDelta / pixelCount,
    };
  }, {
    fullPageDataUrl,
    assetDataUrl,
    observed,
    expected,
    contract: ondowayPaintContract,
  });

  assert(metrics.fullPageWidth === width, `${width}:${theme}: Ondoway paint capture came from the wrong viewport`, 'asset-paint');
  assert(metrics.cropWidth === expected.cropWidth && metrics.cropHeight === expected.cropHeight,
    `${width}:${theme}: Ondoway full-page crop changed from ${expected.cropWidth}x${expected.cropHeight} to ${metrics.cropWidth}x${metrics.cropHeight}`,
    'asset-paint');
  assert(metrics.paintedSignalColumnRatio >= metrics.referenceSignalColumnRatio - 0.02,
    `${width}:${theme}: rendered Ondoway device occupies too little of its image box`, 'asset-paint');
  assert(metrics.faithfulColumnRatio >= expected.minFaithfulColumnRatio,
    `${width}:${theme}: rendered Ondoway crop has faithful horizontal coverage ${metrics.faithfulColumnRatio.toFixed(4)} below ${expected.minFaithfulColumnRatio}`,
    'asset-paint');
  assert(metrics.mismatchRatio <= expected.maxMismatchRatio,
    `${width}:${theme}: rendered Ondoway crop divergence ${metrics.mismatchRatio.toFixed(4)} exceeds ${expected.maxMismatchRatio}`,
    'asset-paint');
  return {
    contractSha256: ondowayPaintContractSha256,
    cropWidth: metrics.cropWidth,
    cropHeight: metrics.cropHeight,
    faithfulColumnRatio: metrics.faithfulColumnRatio,
    referenceSignalColumnRatio: metrics.referenceSignalColumnRatio,
    paintedSignalColumnRatio: metrics.paintedSignalColumnRatio,
    mismatchRatio: metrics.mismatchRatio,
    meanMaxDelta: metrics.meanMaxDelta,
  };
}

async function verifyPersuaiderGraph(page, label) {
  const graph = await page.locator('.pj-system--persuaider').evaluate(root => {
    const rectObject = rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height });
    const visuallyVisible = node => {
      let current = node;
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) <= 0 || current.hidden) return false;
        current = current.parentElement;
      }
      return true;
    };
    const screenReaderVisible = node => {
      let current = node;
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        if (current.hidden || current.inert || current.getAttribute('aria-hidden') === 'true') return false;
        current = current.parentElement;
      }
      return true;
    };
    const strokeAlpha = value => {
      if (!value || value === 'none' || value === 'transparent') return 0;
      const open = value.indexOf('(');
      const close = value.lastIndexOf(')');
      if (open < 0 || close < open) return 1;
      const name = value.slice(0, open).trim();
      const parts = value.slice(open + 1, close).split(',').map(part => part.trim());
      if (name === 'rgba' && parts.length === 4) return Number(parts[3]);
      return 1;
    };
    const nodes = [...root.querySelectorAll('[data-graph-node]')].map(node => {
      return {
        id: node.dataset.nodeId,
        role: node.dataset.nodeRole,
        label: node.textContent,
        rect: rectObject(node.getBoundingClientRect()),
        visible: visuallyVisible(node),
        screenReaderVisible: screenReaderVisible(node),
      };
    });
    const svg = root.querySelector('svg.pj-system__edges');
    const svgRect = svg ? rectObject(svg.getBoundingClientRect()) : null;
    const edges = svg ? [...svg.querySelectorAll('line[data-graph-edge]')].map(edge => {
      const style = getComputedStyle(edge);
      const matrix = edge.getScreenCTM();
      const point = (x, y) => {
        const transformed = new DOMPoint(x, y).matrixTransform(matrix);
        return { x: transformed.x, y: transformed.y };
      };
      const start = point(edge.x1.baseVal.value, edge.y1.baseVal.value);
      const end = point(edge.x2.baseVal.value, edge.y2.baseVal.value);
      return {
        id: edge.dataset.edgeId,
        source: edge.dataset.source,
        target: edge.dataset.target,
        start,
        end,
        length: edge.getTotalLength(),
        stroke: style.stroke,
        strokeWidth: Number.parseFloat(style.strokeWidth),
        strokeOpacity: Number.parseFloat(style.strokeOpacity),
        opacity: Number.parseFloat(style.opacity),
        display: style.display,
        visibility: style.visibility,
        markerEnd: style.markerEnd,
        strokeAlpha: strokeAlpha(style.stroke),
        ancestorVisible: visuallyVisible(edge),
      };
    }) : [];
    return {
      nodes,
      edges,
      svgRect,
      rootRect: rectObject(root.getBoundingClientRect()),
      svgCount: root.querySelectorAll('svg.pj-system__edges').length,
      rootVisible: visuallyVisible(root),
      rootScreenReaderVisible: screenReaderVisible(root),
      svgVisible: svg ? visuallyVisible(svg) : false,
    };
  });

  const topology = (value, message) => assert(value, `${label}: ${message}`, 'graph-topology');
  topology(graph.rootVisible && graph.rootScreenReaderVisible, 'Persuaider graph is hidden from pixels or the accessibility tree');
  topology(graph.svgCount === 1 && graph.svgVisible && graph.svgRect && graph.svgRect.width > 0 && graph.svgRect.height > 0, 'Persuaider needs one rendered semantic edge plane');
  const actualNodes = graph.nodes.map(node => [node.id, node.role, normalized(node.label)]);
  topology(JSON.stringify(actualNodes) === JSON.stringify(graphNodes), 'Persuaider node IDs, roles, labels, or semantic DOM order changed');
  const actualEdges = graph.edges.map(edge => [edge.id, edge.source, edge.target]);
  topology(JSON.stringify(actualEdges) === JSON.stringify(graphEdges), 'Persuaider directed edge set changed');
  topology(graph.nodes.every(node => node.visible && node.screenReaderVisible && node.rect.width > 0 && node.rect.height > 0),
    'a Persuaider node is hidden from pixels or the accessibility tree');

  const byId = Object.fromEntries(graph.nodes.map(node => [node.id, node]));
  const distanceToRect = (point, rect) => {
    const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
    const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
    return Math.hypot(dx, dy);
  };
  const nearestNode = point => graph.nodes.map(node => ({ id: node.id, distance: distanceToRect(point, node.rect) }))
    .sort((left, right) => left.distance - right.distance || (left.id < right.id ? -1 : 1))[0];
  const onPlane = point => point.x >= graph.svgRect.left - 1 && point.x <= graph.svgRect.right + 1
    && point.y >= graph.svgRect.top - 1 && point.y <= graph.svgRect.bottom + 1;
  const rectOnGraph = rect => rect.left >= graph.rootRect.left - 1 && rect.right <= graph.rootRect.right + 1
    && rect.top >= graph.rootRect.top - 1 && rect.bottom <= graph.rootRect.bottom + 1;
  topology(rectOnGraph(graph.svgRect) && graph.nodes.every(node => rectOnGraph(node.rect)), 'graph plane or node leaves the Persuaider canvas');
  for (const edge of graph.edges) {
    topology(edge.length > 1, `${edge.id} has zero rendered length`);
    topology(edge.ancestorVisible && edge.display !== 'none' && edge.visibility === 'visible' && edge.opacity > 0 && edge.strokeOpacity > 0,
      `${edge.id} is not visibly rendered`);
    topology(edge.stroke !== 'none' && edge.stroke !== 'transparent' && edge.strokeAlpha > 0 && edge.strokeWidth >= 2, `${edge.id} has no visible stroke`);
    topology(edge.markerEnd !== 'none', `${edge.id} has no visible direction marker`);
    topology(onPlane(edge.start) && onPlane(edge.end), `${edge.id} leaves its declared edge plane`);
    const incidenceTolerance = Math.max(1, edge.strokeWidth);
    topology(nearestNode(edge.start).id === edge.source, `${edge.id} begins nearest the wrong node`);
    topology(nearestNode(edge.end).id === edge.target, `${edge.id} ends nearest the wrong node`);
    topology(distanceToRect(edge.start, byId[edge.source].rect) <= incidenceTolerance, `${edge.id} does not begin at ${edge.source}`);
    topology(distanceToRect(edge.end, byId[edge.target].rect) <= incidenceTolerance, `${edge.id} does not end at ${edge.target}`);
  }

  const inputBottom = Math.max(byId['private-objectives'].rect.bottom, byId.simulations.rect.bottom);
  const outputTop = Math.min(byId.utility.rect.top, byId.coaching.rect.top);
  topology(inputBottom + 12 <= byId.extraction.rect.top && byId.extraction.rect.bottom + 12 <= outputTop,
    'rendered flow must place both inputs before extraction and both outputs after extraction');
  topology(!overlaps(byId['private-objectives'].rect, byId.simulations.rect), 'the two input nodes overlap');
  topology(!overlaps(byId.utility.rect, byId.coaching.rect), 'the two output nodes overlap');
  for (const edge of graph.edges) topology(edge.start.y < edge.end.y, `${edge.id} points against the rendered flow`);
  return { nodeCount: graph.nodes.length, edgeCount: graph.edges.length };
}

async function verifyProjects(browser, referencePage, width, theme, assetDataUrl) {
  const context = await contextFor(browser, width, theme);
  const page = await open(context, 'projects.html');
  const label = `${width}:${theme}`;

  assert(await page.locator('main > .pj').count() === 1, `${label}: missing Projects root`);
  const mainText = await page.locator('#main').textContent();
  assert(!mainText.includes('–') && !mainText.includes('—'), `${label}: rendered Projects text contains an en or em dash`, 'visible-dash');
  const links = (await page.locator('.pj-index a').evaluateAll(nodes => nodes.map(node => [
    node.getAttribute('href').slice(1),
    node.textContent,
  ]))).map(([id, name]) => [id, normalized(name)]);
  assert(JSON.stringify(links) === JSON.stringify(ventures.map(([id, name]) => [id, name])), `${label}: venture link inventory changed`);
  for (const [id, name, count] of ventures) {
    assert(await page.locator(`#${id}`).count() === 1, `${label}: deep link #${id} is missing or duplicated`);
    assert(normalized(await page.locator(`#${id} > .pj-venture__head h2`).textContent()) === name, `${label}: #${id} heading changed`);
    assert(await page.locator(`#${id} > .pj-evidence > .pj-proof[data-project-proof][data-proof-unit="${id}"]`).count() === count, `${label}: #${id} proof ownership changed`);
  }

  const forbidden = '.pj [data-ride], .pj [data-stop], .pj [role="tablist"], .pj [role="tab"], .pj [aria-selected], .pj [data-cars], .pj .cars, .pj .cars__track, .pj .coach, .pj [data-screen], .pj .platform, .pj .loopwrap, .pj .strip__scroll, .pj .pf__nav';
  assert(await page.locator(forbidden).count() === 0, `${label}: retired ride, panel, or carousel structure remains`);
  assert(await page.locator('.pj [hidden], .pj [aria-hidden="true"] .pj-proof').count() === 0, `${label}: Projects evidence is hidden`);
  const inventedMedia = '#persuaider :is(img,canvas,video), #persuaider svg:not(.pj-system__edges), #gestiq :is(img,svg,canvas,video), #lore :is(img,svg,canvas,video), #crucible :is(img,svg,canvas,video)';
  assert(await page.locator(inventedMedia).count() === 0, `${label}: invented non-Ondoway imagery exists`);

  const markerAudit = await page.locator('.pj [data-project-proof], .pj .pj-proof').evaluateAll(nodes => nodes.map(node => ({
    id: node.id,
    direct: node.matches('.pj-venture > .pj-evidence > .pj-proof[data-project-proof][data-proof-unit]'),
  })));
  assert(markerAudit.length === 18 && markerAudit.every(item => item.direct), `${label}: stray or nested Projects proof marker exists`);
  const proofData = await page.locator(proofSelector).evaluateAll(nodes => nodes.map(node => {
    const atoms = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      atoms.push(textNode.data);
      textNode = walker.nextNode();
    }
    return {
      id: node.id,
      owner: node.dataset.proofUnit,
      marker: node.hasAttribute('data-project-proof'),
      text: node.textContent,
      atoms,
      visible: Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length),
    };
  }));
  const proofs = proofData.map(proof => ({ ...proof, text: normalized(proof.text) }));
  assert(proofs.length === 18, `${label}: expected 18 proofs, found ${proofs.length}`);
  assert(new Set(proofs.map(proof => proof.id)).size === 18, `${label}: proof IDs are not unique`);
  assert(JSON.stringify(proofs.map(proof => proof.id)) === JSON.stringify(proofAuthority.evidenceUnitIds), `${label}: stable proof inventory changed`);
  for (const [id, , count] of ventures) {
    const owned = proofs.filter(proof => proof.owner === id);
    assert(owned.length === count && proofAuthority.ownerCounts[id] === count, `${label}: ${id} proof ownership changed`);
    for (let index = 0; index < owned.length; index += 1) {
      assert(owned[index].id === `${id}-proof-${index + 1}`, `${label}: unstable proof ID ${owned[index].id}`);
      assert(owned[index].marker, `${label}: ${owned[index].id} lacks its static proof marker`);
      assert(owned[index].visible, `${label}: ${owned[index].id} is not rendered`);
    }
  }
  const unitAtomLedger = proofData.map(proof => {
    const atoms = proof.atoms.map(atom => normalized(atom)).filter(Boolean).map(canonicalText);
    atoms.sort();
    return { id: proof.id, owner: proof.owner, atoms };
  });
  const atomCount = unitAtomLedger.reduce((count, unit) => count + unit.atoms.length, 0);
  const canonicalUnitAtomLedgerHash = hash(JSON.stringify(unitAtomLedger));
  assert(unitAtomLedger.length === proofAuthority.evidenceUnitCount, `${label}: canonical proof unit count changed`);
  assert(atomCount === proofAuthority.normalizedTextAtomCount, `${label}: normalized proof atom count changed`);
  assert(canonicalUnitAtomLedgerHash === proofAuthority.canonicalUnitAtomLedgerSha256, `${label}: canonical 18-unit evidence ledger changed`);
  const acceptedTransition = verifyAcceptedResumeTransition(unitAtomLedger);
  const grouped = ventures.map(([id]) => [id, proofs.filter(proof => proof.owner === id).map(proof => proof.text)]);
  const rawProofHash = hash(JSON.stringify(grouped));

  const graph = await verifyPersuaiderGraph(page, label);
  assert(rawProofHash === proofContract.derivedRawTransition.currentSha256,
    `${label}: derived reader-visible Projects proof hash changed`);
  const image = await page.locator('#ondoway .pf__phone img').evaluate(node => ({
    src: node.getAttribute('src'), alt: node.getAttribute('alt'), width: node.getAttribute('width'), height: node.getAttribute('height'),
    complete: node.complete, naturalWidth: node.naturalWidth, naturalHeight: node.naturalHeight,
  }));
  assert(JSON.stringify(image) === JSON.stringify({
    src: '/public/assets/ondoway-journey-wireframe.png',
    alt: 'A travel companion that adapts as you walk.',
    width: '392',
    height: '813',
    complete: true,
    naturalWidth: 392,
    naturalHeight: 813,
  }), `${label}: Ondoway wireframe or alt text changed`);

  const shellLinks = await page.evaluate(() => ({
    header: [...document.querySelectorAll('body > header a')].map(link => link.getAttribute('href')),
    footer: [...document.querySelectorAll('body > footer a')].map(link => link.getAttribute('href')),
  }));
  assert(JSON.stringify(shellLinks.header) === JSON.stringify(expectedHeaderLinks), `${label}: header links changed`);
  assert(JSON.stringify(shellLinks.footer) === JSON.stringify(expectedFooterLinks), `${label}: footer or cross-route links changed`);

  const geometry = await page.evaluate(() => {
    const selector = [
      '.pj-venture--ondoway .pj-evidence',
      '.pj-venture--gestiq .pj-evidence',
      '.pj-system--lore',
      '.pj-system--crucible',
    ];
    return selector.map(value => {
      const node = document.querySelector(value);
      const before = getComputedStyle(node, '::before');
      const rect = node.getBoundingClientRect();
      return { value, content: before.content, width: rect.width, height: rect.height };
    });
  });
  for (const item of geometry) {
    assert(item.content !== 'none' && item.content !== 'normal', `${label}: ${item.value} lost its connecting geometry`);
    assert(item.width > 0 && item.height > 0, `${label}: ${item.value} has no rendered geometry`);
  }

  const layout = await page.evaluate(() => ({
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    nestedScrollers: [...document.querySelectorAll('.pj, .pj *')].filter(node => {
      const style = getComputedStyle(node);
      return (style.overflowX === 'auto' || style.overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 1;
    }).map(node => node.className || node.tagName),
    descendantOverflow: [...document.querySelectorAll('.pj, .pj *')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.className || node.tagName),
  }));
  assert(layout.pageOverflow <= 1, `${label}: page overflows horizontally by ${layout.pageOverflow}px`);
  assert(layout.nestedScrollers.length === 0, `${label}: nested horizontal scroller remains`);
  assert(layout.descendantOverflow.length === 0, `${label}: Projects descendant overflows: ${layout.descendantOverflow.join(', ')}`);

  if (width === 1440) {
    const firstView = (await page.locator('.pj-hero h1, .pj-index a').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { text: node.textContent, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    }))).map(item => ({ ...item, text: normalized(item.text) }));
    assert(firstView.length === 6, `${label}: first-view venture inventory is incomplete`);
    for (const item of firstView) assert(item.left >= 0 && item.top >= 0 && item.right <= 1440 && item.bottom <= 900, `${label}: ${item.text} falls outside the first viewport`);
  }

  if (width === 375) {
    const targets = (await page.locator('.pj-index a').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { text: node.textContent, width: rect.width, height: rect.height };
    }))).map(item => ({ ...item, text: normalized(item.text) }));
    for (const target of targets) assert(target.width >= 44 && target.height >= 44, `${label}: ${target.text} is smaller than 44px`);
    const labels = (await page.locator('.pj-index a span').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { text: node.textContent, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    }))).map(item => ({ ...item, text: normalized(item.text) }));
    for (let first = 0; first < labels.length; first += 1) {
      for (let second = first + 1; second < labels.length; second += 1) assert(!overlaps(labels[first], labels[second]), `${label}: venture labels collide`);
    }
  }

  await page.locator('body').focus();
  const reached = new Set();
  for (let index = 0; index < 14; index += 1) {
    await page.keyboard.press('Tab');
    const href = await page.evaluate(() => document.activeElement?.getAttribute('href') || '');
    if (href.startsWith('#')) reached.add(href.slice(1));
  }
  for (const [id] of ventures) assert(reached.has(id), `${label}: keyboard did not reach #${id} within 14 tabs`);

  const axe = await new AxeBuilder({ page }).analyze();
  assert(axe.violations.length === 0, `${label}: axe violations: ${axe.violations.map(item => item.id).join(', ')}`);
  const shot = await page.screenshot({ fullPage: true, animations: 'disabled' });
  const assetPaint = await verifyOndowayPaint(page, referencePage, shot, width, theme, assetDataUrl);
  await context.close();
  return { label, canonicalUnitAtomLedgerHash, rawProofHash, acceptedTransition, graph, assetPaint, screenshotHash: hash(shot) };
}

async function verifyWithoutJavaScript(browser) {
  const context = await contextFor(browser, 375, 'light', false);
  const page = await open(context, 'projects.html');
  assert(await page.locator('.pj-index a').count() === 5, 'no-JavaScript: venture links are missing');
  const proofs = await page.locator(proofSelector).evaluateAll(nodes => nodes.map(node => ({
    visible: Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length),
    owner: node.dataset.proofUnit,
  })));
  assert(proofs.length === 18 && proofs.every(proof => proof.visible && proof.owner), 'no-JavaScript: not every owned proof renders');
  assert(await page.locator('.pj [hidden]').count() === 0, 'no-JavaScript: evidence is hidden');
  assert(await page.locator('.pj-system--persuaider [data-graph-node]').count() === 5, 'no-JavaScript: Persuaider nodes are missing', 'graph-topology');
  assert(await page.locator('.pj-system--persuaider [data-graph-edge]').count() === 4, 'no-JavaScript: Persuaider edges are missing', 'graph-topology');
  await context.close();
}

let browser;
let report;
try {
  const certifiedSharedRouteTransition = verifySharedRouteTransition();
  const runtimeAsset = await verifyRuntimeAsset();
  if (assetOnly) {
    report = { ok: true, ondowayAssetHash: runtimeAsset.actual, failures: [] };
  } else {
    verifySourceAsset();
    const mapBuilder = readFileSync(new URL('./maps.mjs', import.meta.url), 'utf8');
    assert(!mapBuilder.includes("inject(DIR + 'projects.html'"), 'legacy Projects figure injection remains');
    browser = await chromium.launch({ headless: true });
    const paintReference = await paintReferencePage(browser);
    const assetDataUrl = 'data:image/png;base64,' + runtimeAsset.bytes.toString('base64');
    const projectResults = [];
    for (const width of [1440, 768, 375]) {
      for (const theme of ['light', 'dark']) projectResults.push(await verifyProjects(browser, paintReference.page, width, theme, assetDataUrl));
    }
    await paintReference.context.close();
    await verifyWithoutJavaScript(browser);
    const sharedRouteResult = projectsOnly ? null : await verifySharedRoutePixels(browser, origin);
    let provenance = {};
    if (!projectsOnly) {
      const response = await fetch(origin + '.site-provenance.json');
      assert(response.ok, 'candidate provenance is unavailable');
      provenance = await response.json();
    }
    report = {
      ok: true,
      baselineId: provenance.baselineId,
      sourceHash: provenance.sourceHash,
      artifactHash: provenance.artifactHash,
      ondowayAssetHash,
      ondowayPaintContract,
      ondowayPaintContractSha256,
      proofContractSha256: hash(proofContractBytes),
      canonicalUnitAtomLedgerSha256: proofAuthority.canonicalUnitAtomLedgerSha256,
      normalizedTextAtomCount: proofAuthority.normalizedTextAtomCount,
      derivedRawTransition: proofContract.derivedRawTransition,
      acceptedResumeTransition,
      sharedRouteTransition: certifiedSharedRouteTransition,
      projectResults,
      sharedRouteResult,
      failures: [],
    };
  }
} catch (error) {
  report = {
    ok: false,
    failures: [{ kind: error?.kind || 'projects-verifier', message: String(error?.message || error) }],
  };
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
const serialized = JSON.stringify(report, null, 2) + '\n';
if (outputPath) writeFileSync(outputPath, serialized);
else process.stdout.write(serialized);
