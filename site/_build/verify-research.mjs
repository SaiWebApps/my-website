import { AxeBuilder } from '@axe-core/playwright';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RUBRIC = join(ROOT, '.claude/rubric');
const defaultArtifactRoot = join(RUBRIC, 'out/candidate');
const args = process.argv.slice(2);
const valueFlag = name => {
  const index = args.indexOf(name);
  return index < 0 ? '' : args[index + 1] || '';
};
const hasFlag = name => args.includes(name);
const outputPath = valueFlag('--json');
const captureDir = valueFlag('--captures');
const mutationTest = hasFlag('--mutation-test');
const researchOnly = hasFlag('--research-only');
const captureBaseline = hasFlag('--capture-baseline');
const baseValue = process.env.RESEARCH_BASE || 'http://127.0.0.1:4401/';
const base = baseValue.endsWith('/') ? baseValue : baseValue + '/';
const localOrigin = new URL(base).origin;
const progress = message => process.stderr.write(`[research-verifier] ${message}\n`);
const artifactRoot = resolve(process.env.ARTIFACT_ROOT || defaultArtifactRoot);
const contractPath = resolve(mutationTest && process.env.RESEARCH_PROOF_CONTRACT
  ? process.env.RESEARCH_PROOF_CONTRACT : join(RUBRIC, 'research-proof-contract.json'));
const authorityContractPath = resolve(mutationTest && process.env.RESEARCH_AUTHORITY_CONTRACT
  ? process.env.RESEARCH_AUTHORITY_CONTRACT : join(RUBRIC, 'authority/research-evidence-contract.json'));
const figureManifestPath = resolve(mutationTest && process.env.RESEARCH_FIGURE_MANIFEST
  ? process.env.RESEARCH_FIGURE_MANIFEST : join(RUBRIC, 'sources/drone-megaddon-figure-assets.json'));
const dependencyTransitionOverridePath = resolve(mutationTest && process.env.RESEARCH_BUILDER_TRANSITION
  ? process.env.RESEARCH_BUILDER_TRANSITION : join(RUBRIC, 'authority/research-builder-dependency-transition.json'));
const readerSourceTransitionOverridePath = resolve(mutationTest && process.env.RESEARCH_READER_SOURCE_TRANSITION
  ? process.env.RESEARCH_READER_SOURCE_TRANSITION : join(RUBRIC, 'authority/research-reader-source-transition.json'));
const EXPECTED_PROOF_CONTRACT_SHA256 = '806744ae07dd01e527f66b9d6f8fae94aab874a5d8003df3ab479541bdc2c32c';
const EXPECTED_AUTHORITY_CONTRACT_SHA256 = 'b017037b0219185712fda4c4403934863609329f36bb5cd22dadd029628736a7';

const contractBytes = readFileSync(contractPath);
const contract = JSON.parse(contractBytes);
const authorityBytes = readFileSync(authorityContractPath);
const authority = JSON.parse(authorityBytes);
const figureManifestBytes = readFileSync(figureManifestPath);
const figureManifest = JSON.parse(figureManifestBytes);
const sourceContent = JSON.parse(readFileSync(repoPath('site/content.json')));

class VerificationError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

function fail(message, kind = 'research-verifier') {
  throw new VerificationError(kind, message);
}

function assert(value, message, kind = 'research-verifier') {
  if (!value) fail(message, kind);
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
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

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function repoPath(path) {
  return join(ROOT, ...path.split('/'));
}

function artifactPath(path) {
  return join(artifactRoot, ...path.split('/'));
}

function fileHash(path) {
  return hash(readFileSync(path));
}

function reportUrl(value) {
  const url = new URL(value);
  return url.origin === localOrigin ? `${url.pathname}${url.search}${url.hash}` : url.href;
}

function treeHash(root, omitted = []) {
  const digest = createHash('sha256');
  const skip = new Set(omitted);
  const walk = directory => {
    const entries = readdirSync(directory).sort();
    const files = entries.filter(name => !statSync(join(directory, name)).isDirectory());
    const directories = entries.filter(name => statSync(join(directory, name)).isDirectory() && name !== '__pycache__');
    for (const name of files) {
      const path = join(directory, name);
      const key = relative(root, path).split(sep).join('/');
      if (skip.has(key)) continue;
      digest.update(Buffer.from(key));
      digest.update(readFileSync(path));
    }
    for (const name of directories) walk(join(directory, name));
  };
  walk(root);
  return digest.digest('hex');
}

function pending(value) {
  return value === 'PENDING';
}

function exactHash(path, expected, label, kind) {
  if (pending(expected) && captureBaseline) return fileHash(path);
  assert(!pending(expected), `${label} hash has not been promoted`, 'contract');
  const actual = fileHash(path);
  assert(actual === expected, `${label} bytes changed: ${actual} != ${expected}`, kind);
  return actual;
}

function reverseSubstitutionText(sourceText, substitutions, label) {
  let text = sourceText;
  for (const item of substitutions) {
    assert(typeof item.current === 'string' && typeof item.previous === 'string' && item.current.length > 0,
      `${label} has an invalid reverse substitution`, 'transition');
    const applications = text.split(item.current).length - 1;
    assert(applications === 1, `${label} reverse substitution applied ${applications} times`, 'transition');
    text = text.replace(item.current, item.previous);
  }
  return text;
}

function reverseSubstitutionHash(path, substitutions, label) {
  return hash(Buffer.from(reverseSubstitutionText(readFileSync(path, 'utf8'), substitutions, label)));
}

function removeLedgerEntryText(sourceText, entryId) {
  const needle = `   "id": "${entryId}",`;
  const at = sourceText.indexOf(needle);
  assert(at >= 0 && sourceText.indexOf(needle, at + 1) < 0,
    `Research reader-source ledger entry ${entryId} was not unique`, 'transition');
  const start = sourceText.lastIndexOf('  {', at);
  assert(start >= 0, `Research reader-source ledger entry ${entryId} had no object boundary`, 'transition');
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let index = start; index < sourceText.length; index++) {
    const character = sourceText[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth++;
    else if (character === '}' && --depth === 0) {
      end = index;
      break;
    }
  }
  assert(end >= 0 && sourceText.slice(end + 1, end + 3) === ',\n',
    `Research reader-source ledger entry ${entryId} had no removable object tail`, 'transition');
  return sourceText.slice(0, start) + sourceText.slice(end + 3);
}

function verifyAuthorityTransitions() {
  const sourceTransitionRecord = contract.authority.sourceReviewTransition;
  const sourceTransition = JSON.parse(readFileSync(repoPath(sourceTransitionRecord.path)));
  assert(sourceTransition.schemaVersion === 1 && sourceTransition.status === 'accepted-hermetic-provenance-reseal'
      && sourceTransition.route === 'research', 'Research source-review transition identity changed', 'transition');
  const sourceContract = sourceTransition.contractPath;
  const sourceReverse = reverseSubstitutionHash(repoPath(sourceContract), [{
    current: sourceTransition.substitution.current,
    previous: sourceTransition.substitution.sourceReviewed,
  }], 'Research source-review contract');
  assert(fileHash(repoPath(sourceContract)) === sourceTransition.currentContractSha256
      && sourceReverse === sourceTransition.sourceReviewedContractSha256
      && sourceReverse === sourceTransition.reverseSubstitutionExpectedSha256,
  'Research source-review provenance-only reverse substitution failed', 'transition');
  const provenance = sourceTransition.provenanceManifest;
  assert(fileHash(repoPath(provenance.path)) === provenance.currentSha256
      && provenance.currentSha256 === contract.authority.figureAssetManifest.sha256,
  'Hermetic Research provenance manifest binding changed', 'transition');

  const dependencyRecord = contract.authority.builderDependencyTransition;
  const dependency = JSON.parse(readFileSync(mutationTest && process.env.RESEARCH_BUILDER_TRANSITION
    ? dependencyTransitionOverridePath : repoPath(dependencyRecord.path)));
  assert(dependency.schemaVersion === 1 && dependency.status === 'accepted-dependency-only'
      && dependency.route === 'research', 'Research shared-builder transition identity changed', 'transition');
  const builder = dependency.builder;
  assert(fileHash(repoPath(builder.path)) === builder.currentSha256
      && reverseSubstitutionHash(repoPath(builder.path), builder.reverseSubstitutions, 'Shared builder') === builder.reverseSubstitutionExpectedSha256,
  'Shared builder does not reverse to its exact pre-Research bytes', 'transition');
  const career = dependency.careerContract;
  assert(fileHash(repoPath(career.path)) === career.currentSha256
      && reverseSubstitutionHash(repoPath(career.path), [{current: builder.currentSha256, previous: builder.previousSha256}], 'Career contract') === career.reverseSubstitutionExpectedSha256,
  'Career contract dependency-only reverse substitution failed', 'transition');
  const visual = dependency.careerVisualTransition;
  assert(fileHash(repoPath(visual.path)) === visual.currentSha256
      && reverseSubstitutionHash(repoPath(visual.path), visual.reverseSubstitutions, 'Career visual transition') === visual.reverseSubstitutionExpectedSha256,
  'Career visual dependency-only reverse substitution failed', 'transition');
  const authorityManifest = dependency.authorityManifest;
  const manifestPath = repoPath(authorityManifest.path);
  assert(fileHash(manifestPath) === authorityManifest.currentSha256, 'Authority manifest transition current bytes changed', 'transition');
  const intermediate = reverseSubstitutionHash(manifestPath, [{
    current: authorityManifest.researchRegistration.exactCurrentText,
    previous: authorityManifest.researchRegistration.previousText,
  }], 'Authority Research registration');
  assert(intermediate === authorityManifest.dependencyOnlyIntermediateSha256
      && intermediate === authorityManifest.researchRegistration.resultSha256,
  'Removing Research registration did not reproduce the dependency-only authority intermediate', 'transition');
  const careerOnly = reverseSubstitutionHash(
    manifestPath, authorityManifest.dependencyReverseSubstitutions, 'Authority Career dependency',
  );
  assert(careerOnly === authorityManifest.careerDependencyOnlyResultSha256,
    'Reversing only Career dependencies did not reproduce the Research-only authority intermediate', 'transition');
  let intermediateText = readFileSync(manifestPath, 'utf8').replace(
    authorityManifest.researchRegistration.exactCurrentText,
    authorityManifest.researchRegistration.previousText,
  );
  for (const item of authorityManifest.dependencyReverseSubstitutions) {
    const applications = intermediateText.split(item.current).length - 1;
    assert(applications === 1, `Authority dependency reverse applied ${applications} times`, 'transition');
    intermediateText = intermediateText.replace(item.current, item.previous);
  }
  assert(hash(Buffer.from(intermediateText)) === authorityManifest.score100BoundarySha256
      && authorityManifest.score100BoundarySha256 === authorityManifest.combinedResearchRemovalAndCareerReverseSha256,
  'Authority dependency-only intermediate did not reverse to the score-100 boundary', 'transition');
  for (const [path, expected] of Object.entries(dependency.byteStableNonResearchSources)) {
    assert(fileHash(repoPath(path)) === expected, `Dependency transition changed frozen non-Research source: ${path}`, 'frozen-route');
  }
  for (const [name, item] of Object.entries(dependency.downstream)) {
    if (name === 'speakingProofContract') continue;
    if (pending(item.currentSha256) && captureBaseline) continue;
    assert(fileHash(repoPath(item.path)) === item.currentSha256,
      `Dependency transition downstream hash changed: ${item.path}`, 'transition');
  }
  const sharedOracle = dependency.downstream.sharedRouteOracle;
  const projectsProof = dependency.downstream.projectsProofContract;
  assert(sharedOracle.currentSha256 === sharedOracle.previousSha256
      && projectsProof.currentSha256 === projectsProof.previousSha256,
  'Unchanged downstream authorities were silently reseeded', 'transition');
  const readerRecord = contract.authority.readerSourceTransition;
  const readerTransition = JSON.parse(readFileSync(mutationTest && process.env.RESEARCH_READER_SOURCE_TRANSITION
    ? readerSourceTransitionOverridePath : repoPath(readerRecord.path)));
  assert(readerTransition.schemaVersion === 1
      && readerTransition.status === 'accepted-reader-source-and-regression-ledger-only'
      && readerTransition.route === 'research', 'Research reader-source transition identity changed', 'transition');
  assert(readerTransition.predecessor.path === dependencyRecord.path
      && readerTransition.predecessor.sha256 === dependencyRecord.sha256,
  'Research reader-source transition lost its builder-transition predecessor', 'transition');
  const factStore = readerTransition.factStore;
  assert(fileHash(repoPath(factStore.facts.path)) === factStore.facts.currentSha256
      && fileHash(repoPath(factStore.sourceHashes.path)) === factStore.sourceHashes.currentSha256
      && fileHash(repoPath(factStore.authorityCoverage.path)) === factStore.authorityCoverage.currentSha256
      && factStore.authorityCoverage.currentSha256 === factStore.authorityCoverage.previousSha256
      && factStore.previousRecordCount === 1536 && factStore.currentRecordCount === 1539
      && canonical(factStore.addedFactIds) === canonical([
        'authority:research-drone-megaddon-2014:figure:image-alt',
        'authority:research-drone-megaddon-2026:figure:image-alt',
        'authority:research-who-trains:figure:group-label',
      ])
      && factStore.replacedFactId === 'authority:research-who-trains:qualifier:0',
  'Research reader-source fact-store transition changed scope', 'transition');
  const ledgerRecord = readerTransition.regressionLedger;
  const ledgerText = readFileSync(repoPath(ledgerRecord.path), 'utf8');
  const ledger = JSON.parse(ledgerText);
  const expectedLedgerIds = [
    'facts-research-2014-figure-alt-removal',
    'facts-research-2026-figure-alt-drift',
    'facts-research-who-group-label-misownership',
    'facts-research-who-qualifier-shortening',
  ];
  const expectedLedgerCases = [
    'research-2014-figure-alt-fact-removal',
    'research-2026-figure-alt-fact-drift',
    'research-who-group-label-fact-misownership',
    'research-who-qualifier-fact-shortening',
  ];
  const ledgerEntries = ledger.entries;
  const ledgerIds = ledgerEntries.map(entry => entry.id);
  const addedIndexes = expectedLedgerIds.map(id => ledgerIds.indexOf(id));
  const reviewerOnlyCount = ledgerEntries.filter(entry => entry.plant == null).length;
  const addedCases = expectedLedgerIds.map(id => ledgerEntries.find(entry => entry.id === id)?.plant?.case);
  assert(fileHash(repoPath(ledgerRecord.path)) === ledgerRecord.currentSha256
      && ledgerRecord.previousCounts.total === 175 && ledgerRecord.previousCounts.executable === 162
      && ledgerRecord.previousCounts.reviewerOnly === 13
      && ledgerRecord.currentCounts.total === 179 && ledgerRecord.currentCounts.executable === 166
      && ledgerRecord.currentCounts.reviewerOnly === 13
      && ledgerEntries.length === ledgerRecord.currentCounts.total
      && ledgerEntries.length - reviewerOnlyCount === ledgerRecord.currentCounts.executable
      && reviewerOnlyCount === ledgerRecord.currentCounts.reviewerOnly
      && canonical(ledgerRecord.addedEntryIds) === canonical(expectedLedgerIds)
      && canonical(ledgerRecord.addedFactMutationCases) === canonical(expectedLedgerCases)
      && canonical(addedCases) === canonical(expectedLedgerCases)
      && addedIndexes.every((index, position) => index >= 0 && (position === 0 || index === addedIndexes[position - 1] + 1)),
  'Research reader-source regression-ledger transition changed scope', 'transition');
  let priorLedgerText = ledgerText;
  for (const id of expectedLedgerIds) priorLedgerText = removeLedgerEntryText(priorLedgerText, id);
  assert(hash(Buffer.from(priorLedgerText)) === ledgerRecord.previousSha256
      && hash(Buffer.from(priorLedgerText)) === ledgerRecord.reverseRemovalExpectedSha256,
  'Research reader-source regression ledger did not reverse exactly', 'transition');
  for (const [path, expected] of Object.entries(readerTransition.byteStableReaderAuthority)) {
    assert(fileHash(repoPath(path)) === expected,
      `Research reader-source transition changed frozen reader authority: ${path}`, 'frozen-route');
  }
  const liveSpeakingText = readFileSync(repoPath(readerTransition.speakingProof.path), 'utf8');
  const readerPointers = readerTransition.speakingProof.reverseSubstitutions.map(item => item.jsonPointer);
  assert(canonical(readerPointers) === canonical(readerTransition.speakingProof.changedJsonPointers)
      && canonical(readerPointers) === canonical(['/authority/facts/sha256', '/authority/sourceHashes/sha256']),
  'Research reader-source Speaking pointer set changed', 'transition');
  const priorSpeakingText = reverseSubstitutionText(
    liveSpeakingText, readerTransition.speakingProof.reverseSubstitutions, 'Research reader-source Speaking proof',
  );
  assert(fileHash(repoPath(readerTransition.speakingProof.path)) === readerTransition.speakingProof.currentSha256
      && hash(Buffer.from(priorSpeakingText)) === readerTransition.speakingProof.previousSha256
      && hash(Buffer.from(priorSpeakingText)) === readerTransition.speakingProof.reverseSubstitutionExpectedSha256,
  'Research reader-source transition did not reverse to the post-builder Speaking proof', 'transition');
  const speaking = dependency.downstream.speakingProofContract;
  assert(readerTransition.speakingProof.previousSha256 === speaking.currentSha256,
    'Research reader-source transition does not stage into the builder transition', 'transition');
  const expectedSpeakingPointers = [
    '/authority/sourceHashes/sha256',
    '/authority/authorityManifest/sha256',
    '/frozenNonSpeaking/research/html/sha256',
    '/frozenNonSpeaking/research/frames/0/sha256',
    '/frozenNonSpeaking/research/frames/1/sha256',
    '/frozenNonSpeaking/research/frames/2/sha256',
    '/frozenNonSpeaking/research/frames/3/sha256',
    '/frozenNonSpeaking/research/frames/4/sha256',
    '/frozenNonSpeaking/research/frames/5/sha256',
    '/frozenNonSpeaking/html/research/sha256',
  ].sort();
  assert(canonical(speaking.reverseSubstitutions.map(item => item.jsonPointer).sort()) === canonical(expectedSpeakingPointers),
    'Speaking dependency transition pointer set changed', 'transition');
  const rendererReferences = speaking.reverseSubstitutions.filter(item => item.stage === 'renderer-reference');
  assert(rendererReferences.length === 8
      && hash(Buffer.from(reverseSubstitutionText(priorSpeakingText, rendererReferences, 'Speaking renderer references'))) === speaking.rendererReferencesReversedSha256,
  'Speaking Research renderer references did not reverse to the staged intermediate', 'transition');
  assert(hash(Buffer.from(reverseSubstitutionText(priorSpeakingText, speaking.reverseSubstitutions, 'Speaking dependency'))) === speaking.reverseSubstitutionExpectedSha256
      && speaking.reverseSubstitutionExpectedSha256 === speaking.previousSha256,
  'Speaking dependency-only transition did not reverse to the score-100 contract', 'transition');
}

function recordByClaim(id) {
  return authority.records.find(record => record.authorityClaimId === id);
}

function verifyAuthorityAndSources() {
  assert(hash(contractBytes) === EXPECTED_PROOF_CONTRACT_SHA256, 'Research proof contract bytes changed', 'contract');
  assert(hash(authorityBytes) === EXPECTED_AUTHORITY_CONTRACT_SHA256, 'Research authority contract bytes changed', 'authority');
  assert(contract.schemaVersion === 1 && contract.route === 'research', 'Research proof contract identity changed', 'contract');
  if (!captureBaseline) assert(contract.status === 'accepted-quiescent-renderer', 'Research proof contract was not promoted from a quiescent renderer', 'contract');
  assert(authority.schemaVersion === 2 && authority.status === 'accepted-static-open-authority'
    && authority.route === 'research', 'Research authority contract identity changed', 'authority');
  assert(canonical(authority.articleOrder) === canonical(contract.structure.articleOrder),
    'Research article order differs between authority and proof contracts', 'authority');
  const authorityRecord = contract.authority.researchEvidenceContract;
  assert(resolve(repoPath(authorityRecord.path)) === resolve(authorityContractPath)
    && authorityRecord.sha256 === EXPECTED_AUTHORITY_CONTRACT_SHA256,
  'Research authority contract binding changed', 'authority');
  const figureRecord = contract.authority.figureAssetManifest;
  assert((mutationTest && process.env.RESEARCH_FIGURE_MANIFEST)
    || resolve(repoPath(figureRecord.path)) === resolve(figureManifestPath),
    'Research figure manifest path changed', 'figure-provenance');
  assert(hash(figureManifestBytes) === figureRecord.sha256
    && figureRecord.sha256 === authority.figureAssetManifest.sha256,
  'Research figure manifest bytes changed', 'figure-provenance');
  for (const [name, record] of Object.entries(contract.authority)) {
    if (name === 'researchEvidenceContract' || name === 'figureAssetManifest') continue;
    exactHash(repoPath(record.path), record.sha256, `Research authority ${name}`, 'authority');
  }
  verifyAuthorityTransitions();
  const authorityManifest = JSON.parse(readFileSync(repoPath(contract.authority.authorityManifest.path)));
  const manifestRecord = authorityManifest.sources?.researchEvidenceContract || {};
  assert(manifestRecord.path === contract.authority.researchEvidenceContract.path
      && manifestRecord.sha256 === contract.authority.researchEvidenceContract.sha256
      && manifestRecord.status === 'accepted-static-open-authority',
  'Authority manifest does not seal the exact Research authority contract', 'authority');
  const facts = JSON.parse(readFileSync(repoPath(contract.authority.facts.path)));
  const factsById = new Map(facts.map(item => [item.id, item]));
  for (const record of authority.records) {
    const accepted = factsById.get(record.acceptedResume.factId);
    assert(accepted && hash(accepted.text) === record.acceptedResume.textSha256,
      `${record.authorityClaimId} accepted résumé fact changed`, 'accepted-resume');
    for (const atom of record.acceptedResume.atoms) {
      assert(hash(atom.text) === atom.textSha256, `${record.authorityClaimId} atom hash changed: ${atom.id}`, 'accepted-resume');
      assert(normalized(accepted.text).toLocaleLowerCase().includes(normalized(atom.text).toLocaleLowerCase()),
        `${record.authorityClaimId} accepted résumé atom is absent: ${atom.id}`, 'accepted-resume');
    }
    const sourceRecord = sourceContent.research.find(item => item.slug === record.block);
    assert(sourceRecord, `${record.authorityClaimId} has no active source record`, 'authority');
    assert(hash(sourceRecord.summary) === record.summary.textSha256,
      `${record.authorityClaimId} summary no longer matches authority`, 'authority');
    if (record.legacyClaimProvenance) {
      assert(sourceRecord.title === record.title.text
        && sourceRecord.claim?.value === record.legacyClaimProvenance.value
        && sourceRecord.claim?.sourcePath === record.legacyClaimProvenance.sourcePath
        && sourceRecord.claim?.sourceLine === record.legacyClaimProvenance.sourceLine,
      'AI ROI manuscript title and legacy-claim provenance were conflated', 'legacy-provenance');
    }
  }
  const manifestById = new Map(figureManifest.assets.map(item => [item.id, item]));
  for (const asset of contract.figurePolicy.nativeAssets) {
    const source = asset.record.endsWith('2014') ? manifestById.get('research-drone-2014') : manifestById.get('research-drone-2026');
    assert(source && source.installedPdf.sha256 === asset.pdfSha256
      && source.figure.output.sha256 === asset.imageSha256
      && source.figure.readerPageNumber === asset.sourcePage
      && canonical(Object.values(source.figure.cropBoxPdfPoints)) === canonical(asset.cropBoxPdfPoints),
    `${asset.record} native crop provenance changed`, 'figure-provenance');
    exactHash(repoPath(asset.pdfPath), asset.pdfSha256, `${asset.record} source PDF`, 'figure-provenance');
    exactHash(repoPath(asset.imagePath), asset.imageSha256, `${asset.record} native crop`, 'figure-provenance');
    exactHash(artifactPath(asset.pdfPath), asset.pdfSha256, `${asset.record} candidate source PDF`, 'figure-provenance');
    exactHash(artifactPath(asset.imagePath), asset.imageSha256, `${asset.record} candidate native crop`, 'figure-provenance');
  }
  exactHash(repoPath(contract.routeStyle.sourcePath), contract.routeStyle.sourceSha256,
    'Research route stylesheet', 'route-style');
  exactHash(repoPath(contract.routeStyle.generatedHtmlPath), contract.routeStyle.generatedHtmlSha256,
    'Generated Research HTML', 'candidate');
}

function verifyFrozen() {
  const evidence = { html: {}, sharedSources: {}, authorities: {} };
  for (const [name, expected] of Object.entries(contract.frozenNonResearch.html)) {
    const actual = fileHash(artifactPath(name));
    if (!(pending(expected) && captureBaseline)) assert(actual === expected, `Frozen candidate HTML changed: ${name}`, 'frozen-route');
    evidence.html[name] = actual;
  }
  for (const [name, expected] of Object.entries(contract.frozenNonResearch.sharedSources)) {
    const actual = fileHash(artifactPath(name));
    if (!(pending(expected) && captureBaseline)) assert(actual === expected, `Frozen shared candidate source changed: ${name}`, 'frozen-route');
    evidence.sharedSources[name] = actual;
  }
  for (const key of ['sharedRouteOracle', 'projectsProofContract', 'speakingProofContract']) {
    const record = contract.frozenNonResearch[key];
    const actual = fileHash(repoPath(record.path));
    if (!(pending(record.sha256) && captureBaseline)) assert(actual === record.sha256, `Frozen authority changed: ${record.path}`, 'frozen-route');
    evidence.authorities[key] = actual;
  }
  return evidence;
}

async function settle(page, theme) {
  await page.waitForLoadState('domcontentloaded', {timeout: 10000});
  await page.evaluate(value => {
    document.documentElement.dataset.theme = value;
    for (const image of document.images) image.loading = 'eager';
    const finite = document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity);
    for (const animation of finite) {
      try { animation.finish(); } catch (_error) { animation.cancel(); }
    }
  }, theme);
  await page.waitForLoadState('networkidle', {timeout: 5000}).catch(() => {});
  await page.waitForTimeout(100);
}

async function inspectDom(page) {
  const dom = await page.evaluate(({ authorityData, proofData, sourceSummaries }) => {
    const norm = value => String(value || '').split('\n').join(' ').split('\r').join(' ').split('\t').join(' ').split(' ').filter(Boolean).join(' ');
    const lower = value => norm(value).toLocaleLowerCase();
    const one = (root, selector, label) => {
      const found = [...root.querySelectorAll(selector)];
      if (found.length !== 1) throw new Error(`${label} expected exactly one node, found ${found.length}`);
      return found[0];
    };
    const collectionNodes = [...document.querySelectorAll(proofData.structure.collectionSelector)];
    if (collectionNodes.length !== 1) throw new Error(`Research collection expected exactly once, found ${collectionNodes.length}`);
    const collection = collectionNodes[0];
    if (lower(document.documentElement.getAttribute('lang')) !== 'en'
        || document.documentElement.hasAttribute('xml:lang')
        || getComputedStyle(document.documentElement).direction !== 'ltr') {
      throw new Error('Research document language or direction changed');
    }
    for (let ancestor = collection.parentElement; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
      if (ancestor.hasAttribute('lang') || ancestor.hasAttribute('xml:lang') || ancestor.hasAttribute('dir')) {
        throw new Error('Research language or direction ancestry changed');
      }
    }
    const records = [...collection.querySelectorAll(proofData.structure.recordSelector)];
    if (records.length !== authorityData.records.length) throw new Error(`Research record count ${records.length} != ${authorityData.records.length}`);
    const direct = [...collection.children].filter(node => node.matches(proofData.structure.recordSelector));
    if (direct.length !== records.length || records.some(node => node.parentElement !== collection)) throw new Error('Research records are not four direct siblings');
    if (records.some(node => node.querySelector(proofData.structure.recordSelector))) throw new Error('Research records may not nest');
    const actualOrder = records.map(node => node.dataset.researchAuthorityClaim);
    const acceptedClaims = new Set(authorityData.articleOrder);
    const unknownClaim = actualOrder.find(claim => !acceptedClaims.has(claim));
    if (unknownClaim) throw new Error(`Research record researchAuthorityClaim changed: ${unknownClaim}`);
    if (JSON.stringify(actualOrder) !== JSON.stringify(authorityData.articleOrder)) throw new Error(`Research article order changed: ${actualOrder.join(',')}`);
    for (let index = 0; index < records.length; index++) {
      const node = records[index];
      const spec = authorityData.records[index];
      const subtitles = [...node.querySelectorAll('[data-research-subtitle]')];
      if ((spec.subtitle === null && subtitles.length) || (spec.subtitle !== null && subtitles.length !== 1)) {
        throw new Error(`${spec.authorityClaimId} subtitle changed`);
      }
      if (node.querySelectorAll('[data-research-status]').length !== 1) {
        throw new Error(`${spec.authorityClaimId} status expected exactly one node`);
      }
      if (node.querySelectorAll('a[data-research-doi]').length !== 1) {
        throw new Error(`${spec.authorityClaimId} DOI expected exactly one node`);
      }
    }
    const globalCounts = {
      '[data-research-record]': authorityData.records.length,
      '[data-research-title]': authorityData.records.length,
      '[data-research-subtitle]': authorityData.records.filter(item => item.subtitle !== null).length,
      '[data-research-authors]': authorityData.records.length,
      '[data-research-status]': authorityData.records.length,
      '[data-research-summary]': authorityData.records.length,
      '[data-research-qualifier]': authorityData.records.reduce((total, item) => total + item.qualifiers.length, 0),
      '[data-research-evidence]': authorityData.records.length,
      '[data-research-doi]': authorityData.records.length,
      '[data-research-figure]': authorityData.records.length,
      '[data-research-native-figure]': authorityData.records.filter(item => item.figure.kind === 'native-pdf-crop').length,
      '[data-research-source-pdf]': authorityData.records.filter(item => item.figure.kind === 'native-pdf-crop').length,
      '[data-diagram-node]': authorityData.records.reduce((total, item) => total + (item.figure.labels?.filter(label => label.id).length || 0), 0),
      '[data-diagram-edge]': authorityData.records.reduce((total, item) => total + (item.figure.edges?.length || 0), 0),
      '[data-diagram-group]': authorityData.records.filter(item => item.figure.grouping).length,
      '[data-diagram-group-label]': authorityData.records.filter(item => item.figure.grouping).length,
    };
    for (const [selector, expectedCount] of Object.entries(globalCounts)) {
      const matches = [...document.querySelectorAll(selector)];
      if (matches.length !== expectedCount) throw new Error(`global Research marker count changed for ${selector}: ${matches.length} != ${expectedCount}`);
      if (selector !== '[data-research-record]' && matches.some(item => !collection.contains(item))) throw new Error(`global Research marker escaped the governed collection: ${selector}`);
    }
    for (const item of document.querySelectorAll('*')) {
      for (const attribute of item.getAttributeNames()) {
        if (!attribute.startsWith('data-research')) continue;
        if (item === collection && attribute === 'data-research-collection') continue;
        if (!collection.contains(item)) throw new Error(`global Research marker escaped the governed collection: [${attribute}]`);
      }
    }
    const allRecords = [...document.querySelectorAll('[data-research-record]')];
    if (allRecords.length !== records.length) throw new Error('A Research record exists outside the governed collection');
    for (const selector of proofData.structure.forbiddenSelectors) {
      if (collection.querySelector(selector)) throw new Error(`forbidden static/carousel state present: ${selector}`);
    }
    for (const hidden of collection.querySelectorAll('[aria-hidden="true"]')) {
      if (!hidden.matches('[data-diagram-edge]')) throw new Error('forbidden static/carousel state present: [aria-hidden=true] on substantive evidence');
    }
    for (const control of collection.querySelectorAll('a, button, [role=button]')) {
      const accessible = norm(control.getAttribute('aria-label') || control.textContent).toLocaleLowerCase();
      if (proofData.structure.forbiddenControlText.includes(accessible)) throw new Error(`forbidden Research control present: ${norm(control.textContent || control.getAttribute('aria-label'))}`);
    }
    const results = [];
    for (let index = 0; index < records.length; index++) {
      const node = records[index];
      const spec = authorityData.records[index];
      const expected = {
        researchAuthorityClaim: spec.authorityClaimId,
        researchUnit: spec.unit,
        researchStableId: spec.stableId,
        researchClaimId: spec.claimId,
        researchBuiltStatus: spec.status.builtStatus,
      };
      for (const [key, value] of Object.entries(expected)) if (node.dataset[key] !== value) throw new Error(`${spec.authorityClaimId} ${key} changed`);
      if (node.id !== spec.block) throw new Error(`${spec.authorityClaimId} deep-link id changed`);
      const heading = one(node, '[data-research-title]', `${spec.authorityClaimId} title`);
      if (heading.tagName !== 'H2' || norm(heading.textContent) !== spec.title.text) throw new Error(`${spec.authorityClaimId} manuscript title changed`);
      if (heading.hasAttribute('aria-label') || heading.hasAttribute('aria-labelledby') || heading.hasAttribute('title')) throw new Error(`${spec.authorityClaimId} title accessible name is overridden`);
      if (node.getAttribute('aria-labelledby') !== heading.id || document.getElementById(heading.id) !== heading) throw new Error(`${spec.authorityClaimId} must own its exact H2 label`);
      const subtitles = [...node.querySelectorAll('[data-research-subtitle]')];
      if (spec.subtitle === null) {
        if (subtitles.length) throw new Error(`${spec.authorityClaimId} null subtitle rendered a node`);
      } else if (subtitles.length !== 1 || norm(subtitles[0].textContent) !== spec.subtitle.text) throw new Error(`${spec.authorityClaimId} subtitle changed`);
      const authors = one(node, '[data-research-authors]', `${spec.authorityClaimId} authors`);
      if (norm(authors.textContent) !== spec.authors.displayText) throw new Error(`${spec.authorityClaimId} accepted author order changed`);
      const status = one(node, '[data-research-status]', `${spec.authorityClaimId} status`);
      if (norm(status.textContent) !== spec.status.text) throw new Error(`${spec.authorityClaimId} exact publication status changed`);
      const summary = one(node, '[data-research-summary]', `${spec.authorityClaimId} summary`);
      const evidence = one(node, '[data-research-evidence]', `${spec.authorityClaimId} evidence`);
      for (const atom of spec.acceptedResume.atoms.filter(item => item.surface.length === 1 && item.surface[0] === 'evidence')) {
        if (!lower(norm(evidence.textContent)).includes(lower(atom.text))) {
          throw new Error(`${spec.authorityClaimId} accepted résumé atom missing: ${atom.id}`);
        }
      }
      const qualifiers = [...node.querySelectorAll('[data-research-qualifier]')].map(item => norm(item.textContent));
      const expectedQualifiers = spec.qualifiers.map(item => item.text);
      const qualifierSurface = norm(summary.textContent + ' ' + evidence.textContent);
      if (qualifiers.length !== expectedQualifiers.length || new Set(qualifiers).size !== qualifiers.length
          || expectedQualifiers.some(item => !lower(qualifierSurface).includes(lower(item)))
          || qualifiers.some(actual => !expectedQualifiers.some(expected => lower(expected).includes(lower(actual)) || lower(actual).includes(lower(expected))))) {
        throw new Error(`${spec.authorityClaimId} causal limitations changed`);
      }
      const doi = one(node, 'a[data-research-doi]', `${spec.authorityClaimId} DOI`);
      if (doi.getAttribute('href') !== spec.doiLink.href || norm(doi.textContent) !== spec.doiLink.bareText) throw new Error(`${spec.authorityClaimId} DOI identity/href/bare text changed`);
      if (doi.hasAttribute('aria-label') || doi.hasAttribute('aria-labelledby') || doi.hasAttribute('title')) throw new Error(`${spec.authorityClaimId} DOI accessible name is overridden`);
      if (node.dataset.researchStableId !== 'doi:' + norm(doi.textContent)) throw new Error(`${spec.authorityClaimId} stable DOI identity no longer matches its bare visible DOI`);
      const summaryText = [...summary.querySelectorAll('[data-research-summary-fragment]')]
        .map(item => norm(item.textContent)).join(' ');
      const surfaces = {
        title: norm(heading.textContent),
        subtitle: subtitles.length ? norm(subtitles[0].textContent) : '',
        authors: norm(authors.textContent),
        status: norm(status.textContent),
        summary: summaryText,
        qualifier: qualifiers.join(' '),
        evidence: norm(evidence.textContent),
        doiIdentity: 'doi:' + norm(doi.textContent),
      };
      for (const atom of spec.acceptedResume.atoms) {
        const available = atom.id === 'title-and-subtitle'
          ? surfaces.title + (surfaces.title.endsWith('?') || surfaces.title.endsWith('!') ? ' ' : ': ') + surfaces.subtitle
          : atom.surface.map(key => surfaces[key] || '').join(' ');
        if (!lower(available).includes(lower(atom.text))) throw new Error(`${spec.authorityClaimId} accepted résumé atom missing: ${atom.id}`);
      }
      for (const phrase of spec.summary.requiredPhrases) {
        const combined = [surfaces.summary, surfaces.qualifier, surfaces.evidence].join(' ');
        if (!lower(combined).includes(lower(phrase))) throw new Error(`${spec.authorityClaimId} protected limitation/evidence missing: ${phrase}`);
      }
      if (summaryText !== norm(sourceSummaries[spec.block])) throw new Error(`${spec.authorityClaimId} exact accepted summary changed`);
      if (spec.legacyClaimProvenance && norm(heading.textContent) === spec.legacyClaimProvenance.value) throw new Error('AI ROI legacy claim replaced the manuscript title');
      const figure = one(node, 'figure[data-research-figure]', `${spec.authorityClaimId} figure`);
      if (figure.dataset.researchFigureId !== spec.figure.id
          || figure.dataset.researchOwner !== spec.unit
          || figure.dataset.figureKind !== spec.figure.kind
          || figure.dataset.sourceSnapshotSha256 !== spec.figure.sourceSnapshotSha256) throw new Error(`${spec.authorityClaimId} figure ownership/provenance changed`);
      if (figure.hasAttribute('aria-label') || figure.hasAttribute('aria-labelledby') || figure.hasAttribute('title')) throw new Error(`${spec.authorityClaimId} figure accessible name is overridden`);
      const caption = one(figure, 'figcaption', `${spec.authorityClaimId} figcaption`);
      if (norm(caption.textContent) !== spec.figure.figcaption.text) throw new Error(`${spec.authorityClaimId} editorial figure caption changed`);
      const nodes = [...figure.querySelectorAll('[data-diagram-node]')];
      const edges = [...figure.querySelectorAll('[data-diagram-edge]')];
      if (spec.figure.kind === 'native-pdf-crop') {
        const image = one(figure, 'img[data-research-native-figure]', `${spec.authorityClaimId} native image`);
        const pdf = one(figure, 'a[data-research-source-pdf]', `${spec.authorityClaimId} source PDF`);
        if (image.getAttribute('src') !== spec.figure.assetHref) throw new Error(`${spec.authorityClaimId} native image href changed`);
        if (image.getAttribute('alt') !== spec.figure.imageAlt.text) throw new Error(`${spec.authorityClaimId} native image description changed`);
        if (image.hasAttribute('aria-label') || image.hasAttribute('aria-labelledby') || image.hasAttribute('title')) throw new Error(`${spec.authorityClaimId} native image accessible name is overridden`);
        if (pdf.getAttribute('href') !== spec.figure.sourcePdfHref) throw new Error(`${spec.authorityClaimId} source PDF href changed`);
        if (pdf.hasAttribute('aria-label') || pdf.hasAttribute('aria-labelledby') || pdf.hasAttribute('title')) throw new Error(`${spec.authorityClaimId} PDF accessible name is overridden`);
        if (nodes.length || edges.length) throw new Error(`${spec.authorityClaimId} native crop may not masquerade as a reconstructed graph`);
      } else {
        const nodeIds = nodes.map(item => item.dataset.diagramNode);
        const expectedNodeIds = spec.figure.labels.map(item => item.id);
        if (JSON.stringify(nodeIds) !== JSON.stringify(expectedNodeIds) || new Set(nodeIds).size !== nodeIds.length) throw new Error(`${spec.authorityClaimId} diagram nodes changed`);
        for (let i = 0; i < nodes.length; i++) if (norm(nodes[i].textContent) !== spec.figure.labels[i].text) throw new Error(`${spec.authorityClaimId} diagram node text changed`);
        const actualEdges = edges.map(item => `${item.dataset.edgeFrom}->${item.dataset.edgeTo}`);
        const expectedEdges = spec.figure.edges.map(item => `${item.from}->${item.to}`);
        if (JSON.stringify(actualEdges) !== JSON.stringify(expectedEdges) || new Set(actualEdges).size !== actualEdges.length) throw new Error(`${spec.authorityClaimId} directed diagram topology changed`);
        for (const edge of spec.figure.forbiddenEdges || []) if (actualEdges.includes(`${edge.from}->${edge.to}`)) throw new Error(`${spec.authorityClaimId} diagram added a forbidden causal edge`);
        for (const edge of edges) if (!nodeIds.includes(edge.dataset.edgeFrom) || !nodeIds.includes(edge.dataset.edgeTo)) throw new Error(`${spec.authorityClaimId} diagram edge has an unknown endpoint`);
        if (spec.figure.allDirectedEdgesForbidden && edges.length) throw new Error(`${spec.authorityClaimId} diagram added a forbidden causal edge`);
        if (spec.figure.grouping) {
          const grouping = spec.figure.grouping;
          const group = one(figure, grouping.selector, `${spec.authorityClaimId} diagram group`);
          if (group.dataset.diagramGroup !== grouping.id) throw new Error(`${spec.authorityClaimId} diagram group identity changed`);
          const label = one(group, grouping.labelSelector, `${spec.authorityClaimId} diagram group label`);
          const direct = [...group.children];
          const directNodeIds = direct.slice(1).map(item => item.dataset.diagramNode || '');
          if (direct[0] !== label || norm(label.textContent) !== grouping.labelText
              || JSON.stringify(directNodeIds) !== JSON.stringify(grouping.memberNodeIds)) {
            throw new Error(`${spec.authorityClaimId} diagram group topology changed`);
          }
          for (const id of grouping.conceptNodeIds) {
            const concept = nodes.find(item => item.dataset.diagramNode === id);
            if (!concept || concept.parentElement !== group.parentElement || group.contains(concept)) throw new Error(`${spec.authorityClaimId} concept node moved into the management-moves group`);
          }
          for (const id of grouping.memberNodeIds) {
            const member = nodes.find(item => item.dataset.diagramNode === id);
            if (!member || member.parentElement !== group) throw new Error(`${spec.authorityClaimId} management move escaped its exact group`);
          }
        }
        if (spec.figure.orderedList) {
          const list = one(figure, 'ol', `${spec.authorityClaimId} semantic ordered list`);
          const children = [...list.children];
          const orderedIds = children.map(item => item.dataset.diagramNode || '');
          if (list.tagName !== spec.figure.orderedList.tag
              || children.some(item => item.tagName !== spec.figure.orderedList.itemTag)
              || JSON.stringify(orderedIds) !== JSON.stringify(spec.figure.orderedList.directNodeIds)) {
            throw new Error(`${spec.authorityClaimId} ordered diagram topology changed`);
          }
        }
      }
      const textParts = [];
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = norm(walker.currentNode.textContent);
        if (!text) continue;
        const parent = walker.currentNode.parentElement;
        const textOwner = parent?.closest(proofData.structure.ownedTextSelectors.join(','));
        if (!textOwner || !node.contains(textOwner)) throw new Error(`${spec.authorityClaimId} has unowned substantive text: ${text}`);
        textParts.push(text);
      }
      results.push({claim: spec.authorityClaimId, id: node.id, doi: norm(doi.textContent), nodeCount: nodes.length, edgeCount: edges.length, textParts});
    }
    const nativeImages = [...collection.querySelectorAll('img')];
    if (nativeImages.length !== proofData.figurePolicy.nativeAssets.length
        || nativeImages.some(item => !item.matches('img[data-research-native-figure]'))) {
      throw new Error('Research has unowned alt-bearing media');
    }
    if (collection.querySelector('area, audio, canvas, embed, iframe, math, object, svg, video')) {
      throw new Error('Research has unowned accessible media');
    }
    for (const item of [collection, ...collection.querySelectorAll('*')]) {
      if (item.hasAttribute('inert')) throw new Error('Research governed content is inert');
      if (item.hasAttribute('contenteditable') || item.isContentEditable) throw new Error('Research governed content is editable');
      if (item.matches('bdi, bdo') || item.hasAttribute('lang') || item.hasAttribute('xml:lang')
          || item.hasAttribute('dir') || getComputedStyle(item).direction !== 'ltr') {
        throw new Error('Research has an unowned local language or direction override');
      }
      if ((item.getAttribute('aria-hidden') || '').toLocaleLowerCase() === 'true' && !item.matches('[data-diagram-edge]')) {
        throw new Error('forbidden static/carousel state present: [aria-hidden=true] on substantive evidence');
      }
      if (item.hasAttribute('role')) throw new Error('Research governed content has an unowned explicit role');
      if (item.hasAttribute('aria-label') || item.hasAttribute('aria-description')
          || item.hasAttribute('aria-describedby') || item.hasAttribute('title')) {
        throw new Error('Research governed content has an unowned accessible-name override');
      }
      if (item.hasAttribute('aria-labelledby') && !item.matches('article[data-research-record]')) {
        throw new Error('Research governed content has an unowned aria-labelledby override');
      }
      for (const attribute of item.getAttributeNames().filter(name => name.startsWith('aria-'))) {
        const ownedArticleLabel = item.matches('article[data-research-record]') && attribute === 'aria-labelledby';
        const ownedDecorativeEdge = item.matches('[data-diagram-edge]') && attribute === 'aria-hidden'
          && item.getAttribute(attribute).toLocaleLowerCase() === 'true';
        if (!ownedArticleLabel && !ownedDecorativeEdge) throw new Error(`Research governed content has an unowned ARIA state: ${attribute}`);
      }
      const behaviorAttributes = new Set(['accesskey', 'autofocus', 'command', 'commandfor', 'download', 'popover', 'popovertarget', 'target']);
      for (const attribute of item.getAttributeNames()) {
        if (attribute.startsWith('on')) throw new Error(`Research has an unowned inline event handler: ${attribute}`);
        if (behaviorAttributes.has(attribute)) throw new Error(`Research has an unowned stateful attribute: ${attribute}`);
      }
    }
    const ownedSelectors = ['[data-research-title]', '[data-research-subtitle]', '[data-research-authors]', '[data-research-status]', '[data-research-summary]', '[data-research-qualifier]', '[data-research-evidence]', '[data-research-doi]', '[data-research-figure]'];
    for (const selector of ownedSelectors) for (const item of document.querySelectorAll(selector)) {
      const owner = item.closest('[data-research-record]');
      if (!owner || owner.parentElement !== collection || !collection.contains(item)) throw new Error(`Research field is stray or nested: ${selector}`);
    }
    const ids = new Map();
    for (const item of document.querySelectorAll('[id]')) ids.set(item.id, (ids.get(item.id) || 0) + 1);
    const governedIds = records.flatMap(item => [item.id, item.getAttribute('aria-labelledby')]);
    for (const id of governedIds) if (!id || ids.get(id) !== 1) throw new Error(`Research governed id is missing or duplicated: ${id}`);
    const expectedInteractions = records.flatMap(item => {
      const owned = [one(item, 'a[data-research-doi]', `${item.id} DOI interaction`)];
      if (item.dataset.researchBuiltStatus === 'built-prototype' || item.dataset.researchBuiltStatus === 'proposal') {
        owned.push(one(item, 'a[data-research-source-pdf]', `${item.id} PDF interaction`));
      }
      return owned;
    });
    const interactiveSelector = 'a[href], button, input, select, textarea, [contenteditable], [role]';
    const interactions = [...collection.querySelectorAll(interactiveSelector)];
    if (interactions.length !== expectedInteractions.length || interactions.some((item, index) => item !== expectedInteractions[index])) {
      throw new Error(`Research interaction set changed: ${interactions.length} != ${expectedInteractions.length}`);
    }
    for (const interaction of interactions) {
      if (interaction.closest('[hidden], [inert], [aria-hidden=true]') || interaction.hasAttribute('aria-expanded')
          || interaction.hasAttribute('aria-selected') || interaction.getAttribute('aria-disabled') === 'true') {
        throw new Error('Research interaction is hidden, inert, stateful, or disabled');
      }
      const accessible = norm(interaction.getAttribute('aria-label') || interaction.textContent).toLocaleLowerCase();
      if (proofData.structure.forbiddenControlText.includes(accessible)) throw new Error(`forbidden Research control present: ${norm(interaction.textContent || interaction.getAttribute('aria-label'))}`);
    }
    const routeStyles = [...document.querySelectorAll('link[rel~="stylesheet"]')].map(link => {
      const url = new URL(link.href);
      return url.pathname.split('/').filter(Boolean).pop();
    }).filter(name => name !== 'style.css');
    if (JSON.stringify(routeStyles) !== JSON.stringify(proofData.routeStyle.expectedLinked)) throw new Error(`Research route stylesheet ownership changed: ${routeStyles.join(',')}`);
    return {records: results, routeStyles};
  }, {authorityData: authority, proofData: contract, sourceSummaries: Object.fromEntries(sourceContent.research.map(item => [item.slug, item.summary]))});
  for (const record of dom.records) {
    const expected = contract.structure.ownedTextSha256ByRecord[record.id];
    const actual = hash(Buffer.from(JSON.stringify(record.textParts)));
    assert(actual === expected,
      `${record.claim} normalized owned text changed: ${actual} != ${expected}`, 'research-dom');
    record.ownedTextSha256 = actual;
    delete record.textParts;
    const expectedAxSha256 = contract.structure.accessibilityTreeSha256ByRecord[record.id];
    let axSnapshot = await page.locator('#' + record.id).ariaSnapshot();
    axSnapshot = axSnapshot.split('\r\n').join('\n').split('\n').map(line => line.trimEnd()).join('\n').trim();
    const axSha256 = hash(Buffer.from(axSnapshot));
    assert(axSha256 === expectedAxSha256,
      `${record.claim} accessibility tree changed: ${axSha256} != ${expectedAxSha256}`, 'research-dom');
    record.accessibilityTreeSha256 = axSha256;
  }
  return dom;
}

async function inspectRuntime(page, contextLabel) {
  const result = await page.evaluate(label => {
    const selectors = [
      '[data-research-record]', '[data-research-title]', '[data-research-authors]', '[data-research-status]',
      '[data-research-doi]', '[data-research-summary]', '[data-research-qualifier]', '[data-research-evidence]',
      '[data-research-figure]', '[data-research-source-pdf]', '[data-research-native-figure]',
      '[data-diagram-node]', '[data-diagram-group-label]', 'figcaption',
    ];
    const textual = new Set([
      '[data-research-title]', '[data-research-authors]', '[data-research-status]', '[data-research-doi]',
      '[data-research-summary]', '[data-research-qualifier]', '[data-research-evidence]', '[data-diagram-node]',
      '[data-diagram-group-label]', 'figcaption',
    ]);
    const alpha = value => {
      const text = String(value || '').trim().toLocaleLowerCase();
      if (text === 'transparent') return 0;
      const slash = text.lastIndexOf('/');
      if (slash >= 0) {
        const tail = text.slice(slash + 1).replace(')', '').trim();
        const parsed = Number(tail.endsWith('%') ? tail.slice(0, -1) : tail);
        return Number.isFinite(parsed) ? (tail.endsWith('%') ? parsed / 100 : parsed) : 1;
      }
      if (text.startsWith('rgba(')) {
        const inner = text.slice(5, text.lastIndexOf(')'));
        const parts = inner.split(',').map(item => item.trim());
        const parsed = Number(parts[3]);
        return Number.isFinite(parsed) ? parsed : 1;
      }
      return 1;
    };
    const textRects = element => {
      const rects = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        for (const rect of range.getClientRects()) if (rect.width >= 1 && rect.height >= 1) rects.push(rect);
      }
      return rects;
    };
    const samples = rect => [
      [rect.left + rect.width * 0.25, rect.top + rect.height * 0.25],
      [rect.left + rect.width * 0.5, rect.top + rect.height * 0.5],
      [rect.left + rect.width * 0.75, rect.top + rect.height * 0.75],
    ];
    const concealedEffect = value => Boolean(value && value !== 'none');
    const inspect = (element, selector) => {
      element.scrollIntoView({block: 'center', inline: 'nearest'});
      let effectiveOpacity = 1;
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        effectiveOpacity *= Number(style.opacity || 1);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse'
            || style.contentVisibility === 'hidden' || effectiveOpacity < 0.15) {
          throw new Error(`${selector} is not static-open and visible`);
        }
        if (concealedEffect(style.clipPath) || concealedEffect(style.webkitClipPath) || concealedEffect(style.maskImage)
            || concealedEffect(style.webkitMaskImage) || concealedEffect(style.filter)) {
          throw new Error(`${selector} is clipped, masked, or filtered`);
        }
      }
      if (element.closest('[hidden], [inert], [aria-hidden="true"], details:not([open])')) throw new Error(`${selector} is hidden or inert`);
      const style = getComputedStyle(element);
      if (textual.has(selector) && alpha(style.color) < 0.15) throw new Error(`${selector} has transparent text`);
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1 || rect.right <= 0 || rect.left >= innerWidth || rect.bottom <= 0 || rect.top >= innerHeight) {
        throw new Error(`${selector} is transformed or off-screen`);
      }
      if (rect.left < -1 || rect.right > innerWidth + 1) throw new Error(`${selector} leaves the horizontal viewport`);
      const candidates = textual.has(selector) ? textRects(element) : [rect];
      let painted = false;
      for (const candidate of candidates.slice(0, 12)) {
        for (const [x, y] of samples(candidate)) {
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
          const stack = document.elementsFromPoint(x, y);
          if (stack.some(hit => hit === element || element.contains(hit))) painted = true;
        }
      }
      if (!painted) throw new Error(`${selector} is fully occluded or has no painted hit region`);
      return {left: rect.left, right: rect.right, height: rect.height};
    };
    const records = [];
    const collection = document.querySelector('[data-research-collection]');
    if (!collection) throw new Error('Research collection is absent at runtime');
    for (const selector of selectors) {
      for (const element of collection.querySelectorAll(selector)) {
        const geometry = inspect(element, selector);
        if (selector === '[data-research-record]') records.push({id: element.id, ...geometry});
      }
    }
    const images = [];
    for (const image of document.querySelectorAll('img[data-research-native-figure]')) {
      if (!image.complete || image.naturalWidth < 1 || image.naturalHeight < 1) throw new Error('A native Research figure did not decode');
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(image.naturalWidth, 64);
      canvas.height = Math.min(image.naturalHeight, 64);
      const context = canvas.getContext('2d', {willReadFrequently: true});
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let opaque = 0;
      const colors = new Set();
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] < 16) continue;
        opaque += 1;
        colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
      }
      if (opaque < 64 || colors.size < 8) throw new Error('A native Research figure has no substantive decoded paint');
      images.push({src: image.getAttribute('src'), complete: image.complete, width: image.naturalWidth, height: image.naturalHeight, opaque, colors: colors.size});
    }
    const diagramGeometry = [...collection.querySelectorAll('#ai-roi .rs-layers li')].map((item, index) => {
      const label = item.querySelector(':scope > span');
      if (!label) throw new Error(`AI ROI step ${index + 1} has no owned label`);
      const itemRect = item.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      const ordinal = getComputedStyle(item, '::before');
      const ordinalTopOffset = Number.parseFloat(ordinal.top);
      const ordinalLineHeight = Number.parseFloat(ordinal.lineHeight);
      const ordinalFontSize = Number.parseFloat(ordinal.fontSize);
      const lineHeight = Number.isFinite(ordinalLineHeight) ? ordinalLineHeight : ordinalFontSize * 1.2;
      const ordinalTop = itemRect.top + ordinalTopOffset;
      const ordinalBottom = ordinalTop + lineHeight;
      return {
        node: item.getAttribute('data-diagram-node'),
        ordinal: index + 1,
        ordinalTransform: ordinal.transform,
        ordinalTranslate: ordinal.translate,
        ordinalScale: ordinal.scale,
        ordinalRotate: ordinal.rotate,
        ordinalZoom: ordinal.zoom,
        ordinalTop,
        ordinalBottom,
        labelTop: labelRect.top,
        labelBottom: labelRect.bottom,
        gapPx: labelRect.top - ordinalBottom,
      };
    });
    const overflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth;
    if (overflow > 1) throw new Error(`Research page overflows horizontally by ${overflow}px`);
    scrollTo(0, 0);
    return {contextLabel: label, records, images, diagramGeometry, overflow, scrollHeight: document.documentElement.scrollHeight};
  }, contextLabel);
  const native = new Map(contract.figurePolicy.nativeAssets.map(item => [item.imageHref, item]));
  for (const image of result.images) {
    const expected = native.get(image.src);
    assert(expected && image.width === expected.width && image.height === expected.height,
      `Native Research image dimensions changed: ${image.src} ${image.width}x${image.height}`, 'figure-provenance');
  }
  const expectedDiagramNodes = ['scale', 'roic', 'stage-gate', 'scorecard'];
  assert(result.diagramGeometry.length === expectedDiagramNodes.length
    && result.diagramGeometry.every((item, index) => item.node === expectedDiagramNodes[index] && item.ordinal === index + 1),
  'AI ROI diagram geometry ownership changed', 'diagram-geometry');
  for (const item of result.diagramGeometry) {
    assert(item.ordinalTransform === 'none' && item.ordinalTranslate === 'none'
      && item.ordinalScale === 'none' && item.ordinalRotate === 'none'
      && (item.ordinalZoom === '1' || item.ordinalZoom === 'normal'),
    `AI ROI ordinal geometry is transformed or zoomed: ${item.node}`, 'diagram-geometry');
    assert(item.gapPx >= contract.runtime.minimumAiRoiOrdinalLabelGapPx,
      `AI ROI step number overlaps its label: ${item.node} gap ${item.gapPx.toFixed(3)}px`, 'diagram-geometry');
  }
  return result;
}

async function inspectInteractionHits(page, contextLabel) {
  return page.evaluate(label => {
    const collection = document.querySelector('[data-research-collection]');
    if (!collection) throw new Error('Research collection is absent for interaction proof');
    const links = [...collection.querySelectorAll('a[data-research-doi], a[data-research-source-pdf]')];
    if (links.length !== 6) throw new Error(`Research interaction hit set changed: ${links.length} != 6`);
    const result = [];
    for (const link of links) {
      link.scrollIntoView({block: 'center', inline: 'nearest'});
      const rect = link.getBoundingClientRect();
      const insetX = Math.min(4, rect.width / 4);
      const insetY = Math.min(4, rect.height / 4);
      const xs = [rect.left + insetX, rect.left + rect.width / 2, rect.right - insetX];
      const ys = [rect.top + insetY, rect.top + rect.height / 2, rect.bottom - insetY];
      const points = [];
      for (const rawX of xs) for (const rawY of ys) {
        const x = Math.max(0, Math.min(innerWidth - 1, rawX));
        const y = Math.max(0, Math.min(innerHeight - 1, rawY));
        const top = document.elementFromPoint(x, y);
        if (!top || top.closest('a') !== link) throw new Error(`Research interaction is not the topmost actionable hit: ${link.getAttribute('href')}`);
        points.push({x, y, top: top.tagName});
      }
      if (getComputedStyle(link).pointerEvents === 'none') throw new Error(`Research interaction rejects pointer input: ${link.getAttribute('href')}`);
      result.push({context: label, href: link.getAttribute('href'), points});
    }
    scrollTo(0, 0);
    return result;
  }, contextLabel);
}

async function inspectNeutralCaptureState(page, contextLabel, expectedHash = '') {
  const state = await page.evaluate(expected => {
    scrollTo(0, 0);
    const active = document.activeElement;
    return {
      activeTag: active?.tagName || '',
      activeId: active?.id || '',
      focusVisibleCount: document.querySelectorAll(':focus-visible').length,
      scrollX,
      scrollY,
      hash: location.hash,
      expectedHash: expected,
    };
  }, expectedHash);
  assert((state.activeTag === 'BODY' || state.activeTag === 'HTML') && !state.activeId,
    `${contextLabel} capture has an active authored element: ${state.activeTag}#${state.activeId}`, 'visual-state');
  assert(state.focusVisibleCount === 0,
    `${contextLabel} capture has ${state.focusVisibleCount} focus-visible elements`, 'visual-state');
  assert(state.scrollX === 0 && state.scrollY === 0 && state.hash === expectedHash,
    `${contextLabel} capture state is not neutral: scroll=${state.scrollX},${state.scrollY} hash=${state.hash}`, 'visual-state');
  return state;
}

async function verifySequentialFocusTopology(page, contextLabel) {
  const topology = await page.evaluate(() => {
    const collection = document.querySelector('[data-research-collection]');
    const expected = [...collection.querySelectorAll('a[data-research-doi], a[data-research-source-pdf]')];
    const sequential = [...collection.querySelectorAll('*')].filter(item => item.tabIndex >= 0 && !item.disabled);
    if (sequential.length !== expected.length || sequential.some((item, index) => item !== expected[index])) {
      throw new Error(`Research sequential focus set changed: ${sequential.length} != ${expected.length}`);
    }
    return expected.map(item => ({href: item.getAttribute('href'), kind: item.hasAttribute('data-research-doi') ? 'doi' : 'pdf'}));
  });
  const links = page.locator('[data-research-collection] a[data-research-doi], [data-research-collection] a[data-research-source-pdf]');
  await links.first().focus();
  for (let index = 0; index < topology.length; index++) {
    const state = await page.evaluate(() => {
      const active = document.activeElement;
      return {href: active?.getAttribute('href') || '', kind: active?.hasAttribute('data-research-doi') ? 'doi' : active?.hasAttribute('data-research-source-pdf') ? 'pdf' : ''};
    });
    assert(canonical(state) === canonical(topology[index]),
      `${contextLabel} sequential focus order changed at ${index}: ${state.href}`, 'interaction');
    if (index + 1 < topology.length) await page.keyboard.press('Tab');
  }
  return topology;
}

async function verifyFocusIndicators(page, contextLabel) {
  const links = page.locator('[data-research-collection] a[data-research-doi], [data-research-collection] a[data-research-source-pdf]');
  const results = [];
  for (let index = 0; index < await links.count(); index++) {
    const link = links.nth(index);
    await page.evaluate(() => document.activeElement?.blur());
    await link.scrollIntoViewIfNeeded();
    await page.waitForTimeout(50);
    const box = await link.boundingBox();
    const viewport = page.viewportSize();
    assert(box && viewport, `${contextLabel} focus target has no box`, 'interaction');
    const clip = {
      x: Math.max(0, box.x - 6),
      y: Math.max(0, box.y - 6),
      width: Math.min(viewport.width - Math.max(0, box.x - 6), box.width + 12),
      height: Math.min(viewport.height - Math.max(0, box.y - 6), box.height + 12),
    };
    const unfocused = await page.screenshot({clip, animations: 'disabled'});
    await page.keyboard.press('Tab');
    await link.focus();
    await page.waitForTimeout(50);
    const style = await link.evaluate(item => {
      const parse = value => {
        const open = value.indexOf('(');
        const close = value.lastIndexOf(')');
        if (open < 0 || close <= open) return {r: 0, g: 0, b: 0, a: 0};
        const parts = value.slice(open + 1, close).split(',').map(part => Number(part.trim()));
        return {r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: Number.isFinite(parts[3]) ? parts[3] : 1};
      };
      const luminance = color => {
        const channel = value => {
          const scaled = value / 255;
          return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
      };
      const computed = getComputedStyle(item);
      const seconds = value => value.split(',').some(part => {
        const clean = part.trim();
        const amount = Number.parseFloat(clean);
        if (!Number.isFinite(amount)) return false;
        return clean.endsWith('ms') ? amount > 0 : amount > 0;
      });
      const activeTimings = [];
      for (let current = item; current; current = current.parentElement) {
        for (const pseudo of [null, '::before', '::after']) {
          const timing = getComputedStyle(current, pseudo);
          if (timing.animationName !== 'none' || seconds(timing.animationDelay) || seconds(timing.transitionDelay)) {
            activeTimings.push(`${current.tagName}${pseudo || ''}:${timing.animationName}:${timing.animationDuration}:${timing.animationDelay}:${timing.transitionDuration}:${timing.transitionDelay}`);
          }
        }
        if (current.hasAttribute('data-research-record')) break;
      }
      let ancestor = item.parentElement;
      let background = {r: 0, g: 0, b: 0, a: 0};
      while (ancestor && background.a < 0.5) {
        background = parse(getComputedStyle(ancestor).backgroundColor);
        ancestor = ancestor.parentElement;
      }
      const outline = parse(computed.outlineColor);
      const high = Math.max(luminance(outline), luminance(background));
      const low = Math.min(luminance(outline), luminance(background));
      return {
        focusVisible: item.matches(':focus-visible'),
        outlineStyle: computed.outlineStyle,
        outlineWidth: Number.parseFloat(computed.outlineWidth),
        outlineAlpha: outline.a,
        contrast: (high + 0.05) / (low + 0.05),
        activeTimings,
        activeAnimations: item.closest('[data-research-record]').getAnimations({subtree: true})
          .filter(animation => animation.playState === 'running' || animation.pending).length,
      };
    });
    assert(style.activeTimings.length === 0 && style.activeAnimations === 0,
      `${contextLabel} focus indicator is transient or animated: ${style.activeTimings.join(',')}`, 'interaction');
    assert(style.focusVisible && style.outlineStyle !== 'none' && style.outlineWidth >= 2
      && style.outlineAlpha >= 0.75 && style.contrast >= 3,
    `${contextLabel} focus indicator is missing, transparent, too thin, or low contrast`, 'interaction');
    const focused = await page.screenshot({clip, animations: 'disabled'});
    const unfocusedSha256 = hash(unfocused);
    const focusedSha256 = hash(focused);
    assert(unfocusedSha256 !== focusedSha256,
      `${contextLabel} focus indicator produces no bounded pixel delta`, 'interaction');
    await page.waitForTimeout(100);
    const persistent = await link.evaluate(item => {
      const computed = getComputedStyle(item);
      return {
        focusVisible: item.matches(':focus-visible'),
        outlineStyle: computed.outlineStyle,
        outlineWidth: computed.outlineWidth,
        outlineColor: computed.outlineColor,
        activeAnimations: item.closest('[data-research-record]').getAnimations({subtree: true})
          .filter(animation => animation.playState === 'running' || animation.pending).length,
      };
    });
    const persistentPixelsSha256 = hash(await page.screenshot({clip, animations: 'disabled'}));
    assert(persistent.focusVisible && persistent.activeAnimations === 0
      && persistent.outlineStyle === style.outlineStyle && persistent.outlineWidth === `${style.outlineWidth}px`
      && persistentPixelsSha256 === focusedSha256,
    `${contextLabel} focus indicator did not persist unchanged`, 'interaction');
    // Crop PNG bytes can vary when Chromium composites adjacent decoded native images even
    // though the focus paint assertion above remains exact. Serialize only the governed,
    // deterministic outcomes; keep the raw bytes local to this run's assertions.
    results.push({
      href: await link.getAttribute('href'), style, persistent, clip,
      pixelDelta: true, persistentPixelMatch: true,
    });
  }
  await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
  return results;
}

async function verifyRealInputScroll(page, context, spec) {
  const computed = await page.evaluate(() => {
    const collection = document.querySelector('[data-research-collection]');
    const chain = [];
    for (let item = collection; item; item = item.parentElement) chain.push(item);
    return chain.map(item => {
      const style = getComputedStyle(item);
      const touch = style.touchAction.split(' ').filter(Boolean);
      return {
        tag: item.tagName,
        touchAction: style.touchAction,
        touchLocked: touch.includes('none') || (touch.includes('pan-x') && !touch.includes('pan-y')),
        overflowY: style.overflowY,
        overflowLocked: (style.overflowY === 'hidden' || style.overflowY === 'clip')
          && (item === document.documentElement || item === document.body || item.scrollHeight > item.clientHeight + 1),
      };
    });
  });
  assert(!computed.some(item => item.touchLocked || item.overflowLocked),
    `${spec.label} Research input scrolling is locked by touch-action or overflow`, 'research-runtime');
  const scrollPolicy = contract.runtime.realInputScroll;
  const neutralPolicy = scrollPolicy.neutralReset;
  const wheelPolicy = scrollPolicy.wheelAcknowledgement;
  const bottomTolerance = scrollPolicy.bottomTolerancePx;
  const scriptlessProtocol = spec.javaScriptEnabled ? null : await context.newCDPSession(page);
  const layoutState = async () => {
    const metrics = await scriptlessProtocol.send('Page.getLayoutMetrics');
    const viewport = metrics.cssVisualViewport || metrics.visualViewport;
    const content = metrics.cssContentSize || metrics.contentSize;
    const state = {y: viewport?.pageY, target: Math.max(0, (content?.height || 0) - (viewport?.clientHeight || 0))};
    assert(Number.isFinite(state.y) && Number.isFinite(state.target),
      `${spec.label} scriptless layout metrics are unavailable`, 'research-runtime');
    return state;
  };
  const compositorBarrier = async () => {
    const capture = await scriptlessProtocol.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: false,
    });
    assert(typeof capture?.data === 'string' && capture.data.length > 0,
      `${spec.label} scriptless compositor barrier failed`, 'research-runtime');
  };
  const bottomState = () => spec.javaScriptEnabled
    ? page.evaluate(() => ({y: scrollY, target: Math.max(0, document.documentElement.scrollHeight - innerHeight)}))
    : layoutState();
  const assertBottom = (state, kind) => assert(state.target > 500 && state.y >= state.target - bottomTolerance,
    `${spec.label} repeated real ${kind} input did not reach the Research reading bottom within tolerance`, 'research-runtime');
  const governedOutcome = (state, kind) => ({
    kind, target: state.target, tolerance: bottomTolerance, reachedBottom: true,
  });
  let scriptlessRequestCount = 0;
  const onScriptlessRequest = () => { scriptlessRequestCount++; };
  const scriptlessCheckpoints = [];
  let scriptlessBaseline = null;
  const scriptlessSnapshot = async () => {
    const snapshot = await page.evaluate(() => {
      const collection = document.querySelector('[data-research-collection]');
      const nodes = [document.documentElement, document.body, collection,
        ...document.querySelectorAll('[data-research-record], [data-research-summary], [data-research-native-figure]')];
      const styles = nodes.filter(Boolean).map(item => {
        const style = getComputedStyle(item);
        return {
          tag: item.tagName, id: item.id, display: style.display, visibility: style.visibility,
          opacity: style.opacity, position: style.position, transform: style.transform,
          filter: style.filter, clipPath: style.clipPath, maskImage: style.maskImage,
          color: style.color, backgroundColor: style.backgroundColor, pointerEvents: style.pointerEvents,
        };
      });
      return {
        scriptingNone: matchMedia('(scripting: none)').matches,
        dom: document.documentElement.outerHTML,
        styles,
        authorSentinel: {gsap: typeof window.gsap, scrollTrigger: typeof window.ScrollTrigger},
      };
    });
    return {
      scriptingNone: snapshot.scriptingNone,
      domSha256: hash(snapshot.dom),
      styleSha256: hash(canonical(snapshot.styles)),
      authorSentinelSha256: hash(canonical(snapshot.authorSentinel)),
      authorScriptsAbsent: snapshot.authorSentinel.gsap === 'undefined'
        && snapshot.authorSentinel.scrollTrigger === 'undefined',
    };
  };
  const checkScriptlessInvariant = async checkpoint => {
    const current = await scriptlessSnapshot();
    assert(current.scriptingNone === true,
      `${spec.label} scriptless scrolling changed the scripting:none environment`, 'research-runtime');
    assert(current.domSha256 === scriptlessBaseline.domSha256,
      `${spec.label} scriptless scrolling changed the governed DOM`, 'research-runtime');
    assert(current.styleSha256 === scriptlessBaseline.styleSha256,
      `${spec.label} scriptless scrolling changed governed computed styles`, 'research-runtime');
    assert(current.authorSentinelSha256 === scriptlessBaseline.authorSentinelSha256,
      `${spec.label} scriptless scrolling executed or changed author script state`, 'research-runtime');
    assert(current.authorScriptsAbsent === true,
      `${spec.label} scriptless scrolling executed author scripts`, 'research-runtime');
    assert(scriptlessRequestCount === 0,
      `${spec.label} scriptless scrolling emitted unexpected network requests`, 'network');
    scriptlessCheckpoints.push(checkpoint);
  };
  if (!spec.javaScriptEnabled) {
    page.on('request', onScriptlessRequest);
    scriptlessBaseline = await scriptlessSnapshot();
    assert(scriptlessBaseline.scriptingNone === true,
      `${spec.label} did not preserve the scripting:none environment`, 'research-runtime');
    assert(scriptlessBaseline.authorScriptsAbsent === true,
      `${spec.label} began with an executed author-script sentinel`, 'research-runtime');
    await checkScriptlessInvariant('before-input');
  }
  const neutral = [];
  const restoreNeutral = async phase => {
    let state;
    if (spec.javaScriptEnabled) {
      state = await page.evaluate(async policy => {
        for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
          let advancing = 0;
          const onScroll = () => { if (scrollY > 0) advancing++; };
          addEventListener('scroll', onScroll, {passive: true});
          scrollTo(0, 0);
          const samples = [];
          for (let frame = 0; frame < policy.consecutiveAnimationFrames; frame++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            samples.push(scrollY);
          }
          removeEventListener('scroll', onScroll);
          if (samples.every(value => value === 0) && advancing === 0) return {stable: true};
        }
        return {stable: false};
      }, neutralPolicy);
    } else {
      state = {stable: false};
      for (let attempt = 0; attempt < neutralPolicy.maxAttempts; attempt++) {
        await page.evaluate(() => scrollTo(0, 0));
        const samples = [];
        for (let frame = 0; frame < neutralPolicy.consecutiveAnimationFrames; frame++) {
          await compositorBarrier();
          samples.push((await layoutState()).y);
        }
        if (samples.every(value => value === 0)) { state.stable = true; break; }
      }
    }
    assert(state.stable === true,
      `${spec.label} Research scroll reset did not reach stable neutral top before ${phase}`, 'research-runtime');
    const outcome = {
      phase,
      method: spec.javaScriptEnabled ? neutralPolicy.javascriptMethod : neutralPolicy.scriptlessMethod,
      stable: true,
      consecutiveFrames: neutralPolicy.consecutiveAnimationFrames,
      noAdvancingScrollEvent: spec.javaScriptEnabled ? true : null,
      noAdvancingLayoutMovement: spec.javaScriptEnabled ? null : true,
      maxAttempts: neutralPolicy.maxAttempts,
    };
    neutral.push(outcome);
    return outcome;
  };
  const result = {computed, touch: null, wheel: null, keyboard: null, neutral, wheelAcknowledgement: null, scriptlessInvariant: null};
  if (spec.width <= 768) {
    await restoreNeutral('before-touch');
    const session = scriptlessProtocol || await context.newCDPSession(page);
    const x = Math.round(spec.width / 2);
    const startY = Math.round(spec.height * 0.8);
    const endY = Math.round(spec.height * 0.2);
    for (let swipe = 0; swipe < 20; swipe++) {
      await session.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y: startY}]});
      for (let step = 1; step <= 4; step++) {
        await session.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y: startY + (endY - startY) * step / 4}]});
      }
      await session.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      if (spec.javaScriptEnabled) await page.waitForTimeout(20);
      else await compositorBarrier();
      const state = await bottomState();
      if (state.y >= state.target - bottomTolerance) break;
    }
    const touchState = await bottomState();
    if (spec.javaScriptEnabled) await session.detach();
    assertBottom(touchState, 'touch');
    result.touch = governedOutcome(touchState, 'touch');
    if (!spec.javaScriptEnabled) await checkScriptlessInvariant('after-touch');
  }
  await restoreNeutral('before-wheel');
  if (spec.javaScriptEnabled) {
    await page.evaluate(() => {
      const probe = window.__researchWheelProbe = {events: 0, trustedEvents: 0, scrollEvents: 0};
      probe.onWheel = event => {
        probe.events++;
        if (event.isTrusted) probe.trustedEvents++;
      };
      probe.onScroll = () => { probe.scrollEvents++; };
      addEventListener('wheel', probe.onWheel, {capture: true, passive: true});
      addEventListener('scroll', probe.onScroll, {passive: true});
    });
    try {
      await page.mouse.move(Math.round(spec.width / 2), Math.round(spec.height / 2));
      let trustedWheelEvents = true;
      let wheelProgressObserved = true;
      for (let step = 0; step < wheelPolicy.dispatchCap; step++) {
        const before = await page.evaluate(() => ({
          y: scrollY,
          target: Math.max(0, document.documentElement.scrollHeight - innerHeight),
          events: window.__researchWheelProbe.events,
          trustedEvents: window.__researchWheelProbe.trustedEvents,
          scrollEvents: window.__researchWheelProbe.scrollEvents,
        }));
        if (before.y >= before.target - bottomTolerance) break;
        await page.mouse.wheel(0, wheelPolicy.deltaY);
        await page.waitForFunction(({beforeState, tolerance}) => {
          const probe = window.__researchWheelProbe;
          const target = Math.max(0, document.documentElement.scrollHeight - innerHeight);
          const trusted = probe.events > beforeState.events && probe.trustedEvents > beforeState.trustedEvents;
          const progressed = (probe.scrollEvents > beforeState.scrollEvents && scrollY > beforeState.y)
            || scrollY >= target - tolerance;
          return trusted && progressed;
        }, {beforeState: before, tolerance: bottomTolerance}, {timeout: wheelPolicy.progressTimeoutMs})
          .catch(() => {});
        const after = await page.evaluate(() => ({
          y: scrollY,
          target: Math.max(0, document.documentElement.scrollHeight - innerHeight),
          events: window.__researchWheelProbe.events,
          trustedEvents: window.__researchWheelProbe.trustedEvents,
          scrollEvents: window.__researchWheelProbe.scrollEvents,
        }));
        const delivered = after.events > before.events && after.trustedEvents > before.trustedEvents;
        const progressed = (after.scrollEvents > before.scrollEvents && after.y > before.y)
          || after.y >= after.target - bottomTolerance;
        trustedWheelEvents = trustedWheelEvents && delivered;
        wheelProgressObserved = wheelProgressObserved && delivered && progressed;
        if (after.y >= after.target - bottomTolerance) break;
      }
      const wheelState = await bottomState();
      assertBottom(wheelState, 'wheel');
      assert(trustedWheelEvents,
        `${spec.label} real wheel input did not deliver a trusted wheel event`, 'research-runtime');
      assert(wheelProgressObserved,
        `${spec.label} real wheel input was delivered without observed scroll progress`, 'research-runtime');
      result.wheel = governedOutcome(wheelState, 'wheel');
      result.wheelAcknowledgement = {
        method: wheelPolicy.javascriptMethod,
        dispatchCap: wheelPolicy.dispatchCap,
        deltaY: wheelPolicy.deltaY,
        scriptlessMaxCompositorBarriersPerDispatch: null,
        scriptlessWheelPoint: null,
        trustedEvents: true,
        protocolDispatch: null,
        observedProgress: true,
      };
    } finally {
      const cleaned = await page.evaluate(() => {
        const probe = window.__researchWheelProbe;
        if (!probe) return false;
        const before = {events: probe.events, trustedEvents: probe.trustedEvents, scrollEvents: probe.scrollEvents};
        EventTarget.prototype.removeEventListener.call(window, 'wheel', probe.onWheel, true);
        EventTarget.prototype.removeEventListener.call(window, 'scroll', probe.onScroll, false);
        EventTarget.prototype.dispatchEvent.call(window, new WheelEvent('wheel', {deltaY: 1}));
        EventTarget.prototype.dispatchEvent.call(window, new Event('scroll'));
        const detached = probe.events === before.events && probe.trustedEvents === before.trustedEvents
          && probe.scrollEvents === before.scrollEvents;
        delete window.__researchWheelProbe;
        return detached && !('__researchWheelProbe' in window);
      });
      assert(cleaned === true, `${spec.label} Research wheel probe cleanup failed`, 'research-runtime');
    }
  } else {
    await page.mouse.move(wheelPolicy.scriptlessWheelPoint.x, wheelPolicy.scriptlessWheelPoint.y);
    let protocolDispatch = true;
    let wheelProgressObserved = true;
    for (let step = 0; step < wheelPolicy.dispatchCap; step++) {
      const before = await layoutState();
      if (before.y >= before.target - bottomTolerance) break;
      try { await page.mouse.wheel(0, wheelPolicy.deltaY); }
      catch (_error) { protocolDispatch = false; break; }
      let after = before;
      for (let barrier = 0; barrier < wheelPolicy.scriptlessMaxCompositorBarriersPerDispatch; barrier++) {
        await compositorBarrier();
        after = await layoutState();
        if (after.y > before.y || after.y >= after.target - bottomTolerance) break;
      }
      const progressed = after.y > before.y || after.y >= after.target - bottomTolerance;
      wheelProgressObserved = wheelProgressObserved && progressed;
      if (after.y >= after.target - bottomTolerance) break;
    }
    const wheelState = await bottomState();
    assert(protocolDispatch,
      `${spec.label} scriptless wheel input did not complete its protocol dispatch`, 'research-runtime');
    assert(wheelProgressObserved,
      `${spec.label} scriptless wheel input was dispatched without observed layout progress`, 'research-runtime');
    assertBottom(wheelState, 'wheel');
    result.wheel = governedOutcome(wheelState, 'wheel');
    result.wheelAcknowledgement = {
      method: wheelPolicy.scriptlessMethod,
      dispatchCap: wheelPolicy.dispatchCap,
      deltaY: wheelPolicy.deltaY,
      scriptlessMaxCompositorBarriersPerDispatch: wheelPolicy.scriptlessMaxCompositorBarriersPerDispatch,
      scriptlessWheelPoint: wheelPolicy.scriptlessWheelPoint,
      trustedEvents: null,
      protocolDispatch: true,
      observedProgress: true,
    };
    await checkScriptlessInvariant('after-wheel');
  }
  await page.evaluate(() => document.activeElement?.blur());
  await restoreNeutral('before-keyboard');
  for (let step = 0; step < 16; step++) {
    await page.keyboard.press('PageDown');
    if (spec.javaScriptEnabled) await page.waitForTimeout(20);
    else await compositorBarrier();
    const state = await bottomState();
    if (state.y >= state.target - 100) break;
  }
  const keyboardState = await bottomState();
  assertBottom(keyboardState, 'keyboard');
  result.keyboard = governedOutcome(keyboardState, 'keyboard');
  await page.evaluate(() => document.activeElement?.blur());
  await restoreNeutral('final-capture');
  if (!spec.javaScriptEnabled) {
    await checkScriptlessInvariant('after-keyboard');
    const expectedCheckpoints = spec.width <= 768
      ? neutralPolicy.scriptlessMobileInvariantCheckpoints : neutralPolicy.scriptlessDesktopInvariantCheckpoints;
    assert(canonical(scriptlessCheckpoints) === canonical(expectedCheckpoints),
      `${spec.label} scriptless scrolling invariant checkpoints changed`, 'research-runtime');
    result.scriptlessInvariant = {
      method: neutralPolicy.scriptlessMethod,
      checkpoints: expectedCheckpoints,
      scriptingNone: true,
      domStable: true,
      styleStable: true,
      networkStable: true,
      authorSentinelStable: true,
    };
    page.off('request', onScriptlessRequest);
    await scriptlessProtocol.detach();
  }
  return result;
}

async function verifyInteractionActions(page, contextLabel, verifyNavigationIntent, intentionalUrls, intentionalHandledUrls) {
  const links = page.locator('[data-research-collection] a[data-research-doi], [data-research-collection] a[data-research-source-pdf]');
  const count = await links.count();
  assert(count === 6, `${contextLabel} actionability set changed: ${count} != 6`, 'interaction');
  const results = [];
  for (let index = 0; index < count; index++) {
    const link = links.nth(index);
    const href = await link.evaluate(item => item.href);
    const stableHref = reportUrl(href);
    const activate = async kind => {
      const previousTarget = await link.getAttribute('target');
      await link.evaluate(item => item.setAttribute('target', '_blank'));
      intentionalHandledUrls.delete(href);
      intentionalUrls.add(href);
      let popup = null;
      const observed = [];
      const observe = request => {
        if (request.url() === href) observed.push({url: request.url(), method: request.method(), navigation: request.isNavigationRequest(), resourceType: request.resourceType()});
      };
      page.context().on('request', observe);
      try {
        if (verifyNavigationIntent) {
          await page.evaluate(itemIndex => {
            const candidates = [...document.querySelectorAll('[data-research-collection] a[data-research-doi], [data-research-collection] a[data-research-source-pdf]')];
            const linkNode = candidates[itemIndex];
            window.__researchActivationProbe = null;
            window.addEventListener('click', event => {
              if (event.target !== linkNode && !linkNode.contains(event.target)) return;
              window.__researchActivationProbe = {trusted: event.isTrusted, preCanceled: event.defaultPrevented};
            }, {once: true});
          }, index);
        }
        const requestPromise = page.context().waitForEvent('request', {
          predicate: request => request.url() === href && request.isNavigationRequest() && request.resourceType() === 'document',
          timeout: 5000,
        });
        const popupPromise = page.context().waitForEvent('page', {
          predicate: candidate => candidate !== page,
          timeout: 5000,
        });
        if (kind === 'keyboard') {
          await link.focus();
          await page.keyboard.press('Enter');
        } else {
          const box = await link.boundingBox();
          assert(box && box.width > 8 && box.height > 8, `${contextLabel} pointer target has no interior sample: ${stableHref}`, 'interaction');
          await link.click({position: {x: Math.min(4, box.width / 4), y: Math.min(4, box.height / 4)}, timeout: 5000});
        }
        const [request, opened] = await Promise.all([requestPromise, popupPromise]);
        popup = opened;
        let event = {trusted: true, preCanceled: false, trustSource: 'playwright-user-input-document-navigation'};
        if (verifyNavigationIntent) {
          await page.waitForFunction(() => window.__researchActivationProbe !== null, null, {timeout: 3000});
          event = await page.evaluate(() => window.__researchActivationProbe);
          assert(event?.trusted === true && event?.preCanceled === false,
            `${contextLabel} ${kind} activation was canceled: ${stableHref}`, 'interaction');
        }
        assert(request.method() === 'GET' && request.frame().page() === popup,
          `${contextLabel} ${kind} activation did not create the exact document popup: ${stableHref}`, 'interaction');
        await new Promise(resolve => setTimeout(resolve, 20));
        assert(observed.length === 1 && observed[0].navigation === true && observed[0].resourceType === 'document',
          `${contextLabel} ${kind} activation emitted an inexact request set: ${stableHref}`, 'interaction');
        if (new URL(href).origin !== localOrigin) {
          for (let attempt = 0; attempt < 100 && !intentionalHandledUrls.has(href); attempt++) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          assert(intentionalHandledUrls.has(href),
            `${contextLabel} external navigation intent was not intercepted exactly: ${stableHref}`, 'interaction');
        }
        return {url: reportUrl(request.url()), method: request.method(), isNavigationRequest: request.isNavigationRequest(), resourceType: request.resourceType(), popup: true, event};
      } catch (_error) {
        fail(`${contextLabel} trusted ${kind} produced no document navigation intent: ${stableHref}`, 'interaction');
      } finally {
        page.context().off('request', observe);
        intentionalUrls.delete(href);
        await link.evaluate((item, target) => {
          if (target === null) item.removeAttribute('target');
          else item.setAttribute('target', target);
        }, previousTarget);
        if (popup) await popup.close().catch(() => {});
        for (const other of page.context().pages()) if (other !== page) await other.close().catch(() => {});
      }
    };
    const keyboard = await activate('keyboard');
    let pointerIntent = null;
    if (verifyNavigationIntent) pointerIntent = await activate('pointer');
    results.push({href: stableHref, keyboard, pointerIntent});
  }
  return results;
}

function contextSpecs() {
  return contract.runtime.contexts.map(label => {
    const [widthText, theme, motion, script] = label.split(':');
    const width = Number(widthText);
    return {label, width, height: width === 375 ? 812 : width === 768 ? 1024 : 900, theme, motion, javaScriptEnabled: script === 'js'};
  });
}

async function verifyRuntime() {
  const browser = await chromium.launch({headless: true});
  const contexts = [];
  const visualFrames = [];
  const deepLinks = [];
  const visualPixelsByKey = new Map();
  const temp = mkdtempSync(join(tmpdir(), 'research-proof-'));
  try {
    for (const spec of contextSpecs()) {
      progress(`${spec.label} start`);
      const context = await browser.newContext({
        viewport: {width: spec.width, height: spec.height},
        hasTouch: spec.width <= 768,
        javaScriptEnabled: spec.javaScriptEnabled,
        colorScheme: spec.theme,
        reducedMotion: spec.motion,
        locale: contract.runtime.locale,
        timezoneId: contract.runtime.timezone,
        deviceScaleFactor: contract.runtime.deviceScaleFactor,
      });
      context.setDefaultTimeout(10000);
      const contextDeadline = setTimeout(() => {
        progress(`${spec.label} exceeded 120s context deadline; closing context`);
        context.close().catch(() => {});
      }, 120000);
      const external = [];
      const intentionalUrls = new Set();
      const intentionalHandledUrls = new Set();
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === localOrigin || url.protocol === 'data:' || url.protocol === 'blob:') await route.continue();
        else if (intentionalUrls.has(url.href) && route.request().isNavigationRequest()
            && route.request().resourceType() === 'document') {
          intentionalHandledUrls.add(url.href);
          await route.abort('blockedbyclient');
        }
        else { external.push(url.href); await route.abort('blockedbyclient'); }
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(String(error.message || error)));
      progress(`${spec.label} navigate and settle`);
      await page.goto(base + 'research.html', {waitUntil: 'domcontentloaded', timeout: 10000});
      await settle(page, spec.theme);
      let runtime;
      if (!spec.javaScriptEnabled) {
        try { runtime = await inspectRuntime(page, spec.label); }
        catch (error) { fail(error.message, error.kind || 'research-runtime'); }
      }
      progress(`${spec.label} DOM and accessibility`);
      let dom;
      try { dom = await inspectDom(page); }
      catch (error) { fail(error.message, error.kind || 'research-dom'); }
      if (spec.javaScriptEnabled) {
        try { runtime = await inspectRuntime(page, spec.label); }
        catch (error) { fail(error.message, error.kind || 'research-runtime'); }
      }
      let inputScroll;
      progress(`${spec.label} real-input scrolling`);
      try { inputScroll = await verifyRealInputScroll(page, context, spec); }
      catch (error) { fail(error.message, error.kind || 'research-runtime'); }
      let interactionHits;
      try { interactionHits = await inspectInteractionHits(page, spec.label); }
      catch (error) { fail(error.message, error.kind || 'interaction'); }
      assert(!pageErrors.length, `${spec.label} emitted runtime errors: ${pageErrors.join('; ')}`, 'runtime-error');
      assert(!external.length, `${spec.label} attempted external network: ${external.join(', ')}`, 'network');
      let axe = {critical: 0, serious: 0};
      if (spec.javaScriptEnabled) {
        const report = await new AxeBuilder({page}).analyze();
        axe = {
          critical: report.violations.filter(item => item.impact === 'critical').length,
          serious: report.violations.filter(item => item.impact === 'serious').length,
        };
        assert(axe.critical === 0 && axe.serious === 0,
          `${spec.label} has ${axe.critical} critical and ${axe.serious} serious axe violations`, 'accessibility');
      }
      const visual = contract.runtime.visualFrames.find(frame => frame.width === spec.width && frame.theme === spec.theme);
      assert(visual, `${spec.label} has no six-frame pixel authority`, 'visual-matrix');
      const isPrimary = spec.javaScriptEnabled && spec.motion === 'no-preference';
      let captureState;
      try { captureState = await inspectNeutralCaptureState(page, spec.label); }
      catch (error) { fail(error.message, error.kind || 'visual-state'); }
      const path = isPrimary ? join(captureDir || temp, `research-${visual.width}-${visual.theme}.png`) : undefined;
      const bytes = await page.screenshot({path, fullPage: true, animations: 'disabled'});
      const actual = hash(bytes);
      const key = `${visual.width}:${visual.theme}`;
      if (!visualPixelsByKey.has(key)) visualPixelsByKey.set(key, actual);
      assert(actual === visualPixelsByKey.get(key),
        `${spec.label} pixels differ from the ${visual.label} primary frame`, 'visual-matrix');
      if (!(pending(visual.sha256) && captureBaseline)) assert(actual === visual.sha256,
        `${spec.label} Research visual frame changed: ${actual} != ${visual.sha256}`, 'visual-matrix');
      if (isPrimary) visualFrames.push({...visual, actualSha256: actual, path: captureDir ? path : ''});
      let focusTopology;
      progress(`${spec.label} focus and activation`);
      try { focusTopology = await verifySequentialFocusTopology(page, spec.label); }
      catch (error) { fail(error.message, error.kind || 'interaction'); }
      let focusIndicators;
      try { focusIndicators = await verifyFocusIndicators(page, spec.label); }
      catch (error) { fail(error.message, error.kind || 'interaction'); }
      let interactionActions;
      try {
        interactionActions = await verifyInteractionActions(
          page, spec.label, spec.javaScriptEnabled, intentionalUrls, intentionalHandledUrls,
        );
      } catch (error) { fail(error.message, error.kind || 'interaction'); }
      if (!spec.javaScriptEnabled) {
        for (const id of contract.runtime.scriptlessDeepLinks) {
          await page.goto(base + 'research.html#' + id, {waitUntil: 'domcontentloaded'});
          await settle(page, spec.theme);
          try { await inspectRuntime(page, `${spec.label}#${id}`); }
          catch (error) { fail(`${spec.label} scriptless deep link #${id} is not static-open: ${error.message}`, 'scriptless-deep-link'); }
          try { await inspectDom(page); }
          catch (error) { fail(`${spec.label} deep link #${id}: ${error.message}`, 'scriptless-deep-link'); }
          try { await inspectInteractionHits(page, `${spec.label}#${id}`); }
          catch (error) { fail(`${spec.label} scriptless deep link #${id}: ${error.message}`, 'scriptless-deep-link'); }
          const state = await page.evaluate(targetId => {
            const target = document.getElementById(targetId);
            if (!target) return {exists: false};
            const style = getComputedStyle(target);
            const rect = target.getBoundingClientRect();
            return {exists: true, hash: location.hash, display: style.display, visibility: style.visibility, opacity: Number(style.opacity), width: rect.width, height: rect.height};
          }, id);
          assert(state.exists && state.hash === '#' + id && state.display !== 'none'
            && state.visibility !== 'hidden' && state.opacity >= 0.15 && state.width > 0 && state.height > 0,
          `${spec.label} scriptless deep link #${id} is not static-open`, 'scriptless-deep-link');
          let targetCaptureState;
          try { targetCaptureState = await inspectNeutralCaptureState(page, `${spec.label}#${id}`, '#' + id); }
          catch (error) { fail(error.message, error.kind || 'visual-state'); }
          const targetBytes = await page.screenshot({fullPage: true, animations: 'disabled'});
          const targetSha256 = hash(targetBytes);
          assert(targetSha256 === actual,
            `${spec.label} scriptless deep link #${id} changes or conceals governed pixels`, 'scriptless-deep-link');
          deepLinks.push({context: spec.label, id, state, captureState: targetCaptureState, screenshotSha256: targetSha256});
        }
      }
      assert(!pageErrors.length, `${spec.label} emitted runtime errors during interaction activation: ${pageErrors.join('; ')}`, 'runtime-error');
      assert(!external.length, `${spec.label} attempted unexpected external network during interaction activation: ${external.join(', ')}`, 'network');
      contexts.push({...runtime, dom, axe, interactionHits, inputScroll, focusTopology, focusIndicators, interactionActions, captureState, screenshotSha256: actual, pixelAuthority: visual.label, externalRequests: external});
      clearTimeout(contextDeadline);
      await Promise.race([
        context.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${spec.label} context close timed out`)), 10000)),
      ]);
      progress(`${spec.label} complete`);
    }
  } finally {
    await Promise.race([
      browser.close(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Research browser close timed out')), 10000)),
    ]).catch(error => progress(error.message));
    if (!captureDir) rmSync(temp, {recursive: true, force: true});
  }
  assert(canonical(contexts.map(item => item.contextLabel)) === canonical(contract.runtime.contexts),
    'Research runtime did not cover the exact ordered 24-context matrix', 'runtime-matrix');
  assert(visualFrames.length === 6, `Research visual matrix emitted ${visualFrames.length} frames instead of 6`, 'visual-matrix');
  assert(deepLinks.length === contract.runtime.contexts.filter(item => item.endsWith(':no-js')).length * contract.runtime.scriptlessDeepLinks.length,
    'Research scriptless deep-link matrix is incomplete', 'scriptless-deep-link');
  return {contexts, visualFrames, deepLinks};
}

async function verifyCandidateProvenance() {
  const response = await fetch(new URL('.site-provenance.json', base), {signal: AbortSignal.timeout(10000)});
  assert(response.ok, 'Candidate provenance is unavailable', 'candidate');
  const provenance = await response.json();
  assert(provenance.baselineId === 'transit-v4', 'Candidate baseline identity changed', 'candidate');
  const liveSourceHash = treeHash(join(ROOT, 'site'));
  assert(provenance.sourceHash === liveSourceHash,
    `Candidate source provenance is stale: ${provenance.sourceHash} != ${liveSourceHash}`, 'candidate');
  const liveArtifactHash = treeHash(artifactRoot, ['.site-provenance.json']);
  if (!mutationTest) assert(provenance.artifactHash === liveArtifactHash,
    `Candidate artifact provenance is stale: ${provenance.artifactHash} != ${liveArtifactHash}`, 'candidate');
  return {...provenance, liveSourceHash, liveArtifactHash};
}

async function main() {
  const report = {
    schemaVersion: 1,
    ok: false,
    mutationTest,
    captureBaseline,
    researchOnly,
    proofContractSha256: hash(contractBytes),
    authorityContractSha256: hash(authorityBytes),
    figureAssetManifestSha256: hash(figureManifestBytes),
    failures: [],
  };
  try {
    verifyAuthorityAndSources();
    const provenance = await verifyCandidateProvenance();
    const runtime = await verifyRuntime();
    const frozen = researchOnly ? null : verifyFrozen();
    Object.assign(report, {
      ok: true,
      baselineId: provenance.baselineId,
      sourceHash: provenance.sourceHash,
      artifactHash: provenance.artifactHash,
      liveArtifactHash: provenance.liveArtifactHash,
      contexts: runtime.contexts,
      visualFrames: runtime.visualFrames,
      scriptlessDeepLinks: runtime.deepLinks,
      frozen,
    });
  } catch (error) {
    report.failures.push({
      kind: error.kind || 'research-verifier',
      message: String(error.message || error).split(localOrigin).join(''),
    });
  }
  if (outputPath) writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ok: report.ok, failures: report.failures, contexts: report.contexts?.length || 0}) + '\n');
  return report.ok ? 0 : 1;
}

process.exit(await main());
