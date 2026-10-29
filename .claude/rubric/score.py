#!/usr/bin/env python3
"""The scripts' score: every rubric check on every page, pass or fail. Writes out/score.json.

Runs guard.py (static), audit.mjs (rendered layout), a11y.mjs (axe, keyboard, and registered states),
the Projects, Speaking, and Research route verifiers, shots.mjs (bounded visual evidence), and test.py
(every past mistake planted back). 100% requires every gate.
Usage: score.py [--fast]   (--fast skips shots and the browser half of test.py; it can never reach 100%)
"""
import hashlib, json, os, shutil, subprocess, sys, time, urllib.request

RUBRIC = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(RUBRIC))
OUT = os.path.join(RUBRIC, 'out')
CANDIDATE = os.path.join(OUT, 'candidate')
sys.path.insert(0, RUBRIC)
import guard
import rubric_gate
import state_machine
import design_gate
import review_gate
import run_lock
import authority_gate
import product_gate

AUDIT_TO_RUBRIC = {'1 unstyled': 'F26', '2 off-screen': 'D20', '2 off-gutter': 'F26', '3 run-together': 'F26', '4 collision': 'F26',
                   '5 clipped': 'F26', '6 stale assets': 'F27', '7 banned': 'B10', '7 meta copy': 'C12', '8 floor': 'B7', '9 errors': 'F26',
                   '10 small text': 'D20', '10 tap target': 'D20', '11 link': 'E22', '12 ride end': 'E23', '12 card': 'E23',
                   '14 wall': 'D40', '14 list': 'D18', '15 stylesheet': 'F26', '17 sparse surface': 'D17', '19 touching': 'D19', '24 zoom': 'E24',
                   '35 theme': 'T35', '35 theme icon': 'T35', '35 contrast': 'T35', '4 repeat-name': 'C14', '36 line link': 'E36'}
SITE_CHECKS = ['A1', 'A2', 'A3', 'A4', 'A5', 'B6', 'B7', 'B8', 'B9', 'B10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C37', 'D17', 'D18', 'D19',
               'D20', 'D39', 'E22', 'E23', 'E24', 'E25', 'E36', 'F26', 'F27', 'F28', 'G31', 'T35']
EXPECTED_A11Y_ROUTES = ['index', 'services', 'speaking', 'career', 'research', 'projects', 'contact']
EXPECTED_A11Y_VIEWPORTS = [{'width': 375, 'height': 812}, {'width': 1440, 'height': 900}]
EXPECTED_A11Y_THEMES = ['light', 'dark']
EXPECTED_A11Y_FAMILIES = {
    'theme': '[data-theme-toggle]', 'dialog': 'dialog', 'ride': '[data-ride]',
    'career': '[data-career-ride]', 'horizontal': '[data-cars]', 'blind': '[data-blind]', 'disclosure': 'details',
}
EXPECTED_PROJECTS_PAINT_CONTRACT = {
    'method': 'full-page-crop-reference-raster-v1',
    'assetSha256': 'f018ae04d307873816f2dac332b1889abdddfa8e055e7b86f0fcac05cb2f888a',
    'pixelDelta': 12,
    'maxColumnMismatchRatio': 0.03,
    'signalDelta': 20,
    'minSignalRowRatio': 0.2,
    'expected': [
        {'width': 1440, 'theme': 'light', 'left': 989.390625, 'top': 1212.75, 'rasterWidth': 300, 'rasterHeight': 622.1875, 'cropWidth': 301, 'cropHeight': 623, 'minFaithfulColumnRatio': 0.25, 'maxMismatchRatio': 0.055},
        {'width': 1440, 'theme': 'dark', 'left': 989.390625, 'top': 1212.75, 'rasterWidth': 300, 'rasterHeight': 622.1875, 'cropWidth': 301, 'cropHeight': 623, 'minFaithfulColumnRatio': 0.274, 'maxMismatchRatio': 0.052},
        {'width': 768, 'theme': 'light', 'left': 534.421875, 'top': 1088.671875, 'rasterWidth': 202.859375, 'rasterHeight': 420.71875, 'cropWidth': 204, 'cropHeight': 422, 'minFaithfulColumnRatio': 0.03, 'maxMismatchRatio': 0.0755},
        {'width': 768, 'theme': 'dark', 'left': 534.421875, 'top': 1088.671875, 'rasterWidth': 202.859375, 'rasterHeight': 420.71875, 'cropWidth': 204, 'cropHeight': 422, 'minFaithfulColumnRatio': 0.09, 'maxMismatchRatio': 0.068},
        {'width': 375, 'theme': 'light', 'left': 84, 'top': 2249.703125, 'rasterWidth': 250, 'rasterHeight': 518.484375, 'cropWidth': 250, 'cropHeight': 520, 'minFaithfulColumnRatio': 0.84, 'maxMismatchRatio': 0.0225},
        {'width': 375, 'theme': 'dark', 'left': 84, 'top': 2249.703125, 'rasterWidth': 250, 'rasterHeight': 518.484375, 'cropWidth': 250, 'cropHeight': 520, 'minFaithfulColumnRatio': 0.9, 'maxMismatchRatio': 0.019},
    ],
}
EXPECTED_SPEAKING_MUTATION_CASE_IDS = [
    'mask-proof', 'opaque-pseudo', 'reduced-box-shadow-pseudo', 'zoom-collapse', 'blur-proof',
    'transparent-pointer-overlay', 'partial-pointer-overlay', 'js-off-pointer-block',
    'target-js-off-pointer-block', 'js-off-inline-name-repair', 'target-proof-hide',
    'topics-heading-drift', 'hidden-session-title', 'hidden-session-date', 'duplicate-deck-link',
    'route-selector-leak', 'layered-route-selector-leak', 'semicolon-masked-route-leak',
    'global-property-leak', 'visual-drift', 'negative-tabindex', 'aria-disabled-link',
    'hidden-focus-indicator', 'transparent-focus-outline', 'permanent-shadow-no-outline',
    'focus-ancestor-opacity', 'inline-cancelled-link', 'external-label-spoof',
    'self-clipped-proof', 'hidden-group-heading', 'atos-byte-swap', 'stale-provenance',
    'unobserved-artifact-drift', 'frozen-html-drift', 'nonresponding-server',
]
EXPECTED_REVIEWER_ATTESTATION_IDS = [
    'bookkeeping', 'governor-named', 'blame-modes', 'policy-in-reply', 'claude-md', 'boring',
    'ignored-references', 'built-before-asking', 'rules-as-excuses', 'options-no-view',
    'unasked-action', 'answer-first', 'burning-quota',
]

def finish(process, timeout):
    if process is None:
        return None
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        stdout, stderr = process.communicate()
        stderr += '\nprocess timed out'
    return subprocess.CompletedProcess(process.args, process.returncode, stdout, stderr)

def tree_hash(root, omitted=()):
    h = hashlib.sha256()
    skip = set(omitted)
    for directory, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d != '__pycache__')
        for name in sorted(files):
            path = os.path.join(directory, name)
            rel = os.path.relpath(path, root)
            if rel in skip:
                continue
            h.update(rel.encode())
            h.update(open(path, 'rb').read())
    return h.hexdigest()

def file_hash(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()

RESEARCH_CASE_RESULT_KEYS = {
    'id', 'applications', 'expectedKind', 'expectedMessage', 'returnCode',
    'caught', 'failures', 'cleanControlSha256',
}
RESEARCH_FULL_CASES = {'frozen-nonresearch-html-drift', 'shared-style-drift'}
EXPECTED_RESEARCH_CASE_IDS_SHA256 = 'e8efff109594a220d9c015efec93fbabac57cddcbf28201a338b9b66d1d80b8b'
EXPECTED_RESEARCH_CASE_MAPPING_SHA256 = 'aed6f6666f50c68cf88cd95cc15531f81d03a2072239c6d74ec2bdb318423537'
EXPECTED_RESEARCH_DEPENDENCY_PATHS_SHA256 = '3b34c2a83eba49ec134018fbf41a32eb6710aa24879d0baba3080bb5a367b738'
EXPECTED_RESEARCH_SCRIPTLESS_BARRIER_CAP = 4
EXPECTED_RESEARCH_SCRIPTLESS_WHEEL_POINT = {'x': 8, 'y': 8}

def canonical_research_results_sha256(results):
    payload = json.dumps(results, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
    return hashlib.sha256(payload).hexdigest()

def canonical_json_sha256(value):
    payload = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()
    return hashlib.sha256(payload).hexdigest()

def research_oracle_digest_problems(report, case_ids, repo_inputs):
    results = report.get('results') or []
    rows = [[item.get('id'), item.get('expectedKind'), item.get('expectedMessage')]
            for item in results if isinstance(item, dict)]
    problems = []
    if canonical_json_sha256(case_ids) != EXPECTED_RESEARCH_CASE_IDS_SHA256:
        problems.append('Research proof ordered case-list digest changed')
    if canonical_json_sha256(rows) != EXPECTED_RESEARCH_CASE_MAPPING_SHA256:
        problems.append('Research expected kind/message mapping digest changed')
    if canonical_json_sha256(list(repo_inputs)) != EXPECTED_RESEARCH_DEPENDENCY_PATHS_SHA256:
        problems.append('Research ordered dependency closure digest changed')
    if (report.get('caseIdsSha256') != EXPECTED_RESEARCH_CASE_IDS_SHA256
            or report.get('expectedMappingSha256') != EXPECTED_RESEARCH_CASE_MAPPING_SHA256
            or report.get('repoInputPathsSha256') != EXPECTED_RESEARCH_DEPENDENCY_PATHS_SHA256):
        problems.append('Research aggregate oracle digests changed')
    return problems

def research_result_schema_problems(report, case_ids):
    problems = []
    results = report.get('results')
    if report.get('schemaVersion') != 2 or not isinstance(results, list):
        return ['Research mutation result schema version or list changed']
    if [item.get('id') for item in results if isinstance(item, dict)] != case_ids or len(results) != len(case_ids):
        problems.append('Research mutation result order or count changed')
    clean = report.get('cleanControl') or {}
    for index, item in enumerate(results):
        if not isinstance(item, dict) or set(item) != RESEARCH_CASE_RESULT_KEYS:
            problems.append(f'Research mutation result {index} has extra or missing fields')
            continue
        expected_clean = clean.get('fullReportSha256') if item['id'] in RESEARCH_FULL_CASES else clean.get('scopedReportSha256')
        failure_items = item.get('failures')
        if (type(item.get('applications')) is not int or item.get('applications') != 1
                or type(item.get('returnCode')) is not int or item.get('returnCode') != 1
                or item.get('caught') is not True
                or not isinstance(item.get('expectedKind'), str) or not item.get('expectedKind')
                or not isinstance(item.get('expectedMessage'), str) or not item.get('expectedMessage')
                or item.get('cleanControlSha256') != expected_clean
                or not isinstance(failure_items, list) or len(failure_items) != 1):
            problems.append(f'Research mutation result {index} has noncanonical outcomes')
            continue
        failure = failure_items[0]
        if (not isinstance(failure, dict) or set(failure) != {'kind', 'message'}
                or failure.get('kind') != item.get('expectedKind')
                or item.get('expectedMessage') not in str(failure.get('message', ''))):
            problems.append(f'Research mutation result {index} has a noncanonical structured failure')
            continue
        message = failure['message']
        if any(fragment in message for fragment in ('http://127.0.0.1:', 'https://127.0.0.1:', '/var/folders/', '/tmp/')):
            problems.append(f'Research mutation result {index} contains an ephemeral failure value')
    if report.get('resultsSha256') != canonical_research_results_sha256(results):
        problems.append('Research mutation results digest changed')
    return problems

def research_result_schema_self_test(report, case_ids):
    plants = []
    extra = json.loads(json.dumps(report)); extra['results'][0]['reportSha256'] = '0' * 64; plants.append(extra)
    missing = json.loads(json.dumps(report)); del missing['results'][0]['cleanControlSha256']; plants.append(missing)
    boolean = json.loads(json.dumps(report)); boolean['results'][0]['returnCode'] = True; plants.append(boolean)
    reordered = json.loads(json.dumps(report)); reordered['results'][:2] = reversed(reordered['results'][:2]); plants.append(reordered)
    digest = json.loads(json.dumps(report)); digest['resultsSha256'] = '0' * 64; plants.append(digest)
    ephemeral = json.loads(json.dumps(report))
    ephemeral['results'][0]['failures'][0]['message'] += ' http://127.0.0.1:54321/'
    ephemeral['resultsSha256'] = canonical_research_results_sha256(ephemeral['results'])
    plants.append(ephemeral)
    return all(research_result_schema_problems(plant, case_ids) for plant in plants)

def projects_verifier_failures(report, returncode, stderr, provenance):
    """Turn the enforced Projects verifier result into score failures; fail closed on shape or provenance drift."""
    failures = []
    detail = '; '.join(str(item.get('message', item)) for item in report.get('failures', []) if isinstance(item, dict))
    if returncode != 0 or report.get('ok') is not True or report.get('failures'):
        failures.append({'check': 'F26', 'page': 'projects', 'where': 'verify-projects.mjs',
                         'msg': detail or stderr[-500:] or 'Projects verifier failed without structured evidence',
                         'src': 'projects'})
        return failures
    for key in ('baselineId', 'sourceHash', 'artifactHash'):
        if report.get(key) != provenance.get(key):
            failures.append({'check': 'F26', 'page': 'projects', 'where': 'verify-projects.mjs provenance',
                             'msg': f'Projects evidence is stale for {key}', 'src': 'projects'})
    contract_path = os.path.join(RUBRIC, 'projects-proof-contract.json')
    contract = json.load(open(contract_path))
    if (report.get('proofContractSha256') != file_hash(contract_path)
            or report.get('canonicalUnitAtomLedgerSha256') != contract.get('authority', {}).get('canonicalUnitAtomLedgerSha256')
            or report.get('normalizedTextAtomCount') != contract.get('authority', {}).get('normalizedTextAtomCount')
            or report.get('acceptedResumeTransition') != contract.get('acceptedResumeTransition')
            or report.get('sharedRouteTransition') != contract.get('sharedRouteTransition')):
        failures.append({'check': 'F26', 'page': 'projects', 'where': 'verify-projects.mjs proof contract',
                         'msg': 'Projects evidence is not bound to the exact canonical proof contract', 'src': 'projects'})
    results = report.get('projectResults')
    shared = report.get('sharedRouteResult')
    paint_contract_bytes = json.dumps(EXPECTED_PROJECTS_PAINT_CONTRACT, ensure_ascii=False, separators=(',', ':')).encode()
    paint_contract_hash = hashlib.sha256(paint_contract_bytes).hexdigest()
    if (report.get('ondowayPaintContract') != EXPECTED_PROJECTS_PAINT_CONTRACT
            or report.get('ondowayPaintContractSha256') != paint_contract_hash):
        failures.append({'check': 'F26', 'page': 'projects', 'where': 'verify-projects.mjs paint contract',
                         'msg': 'Ondoway rendered-pixel evidence is not bound to the exact asset paint contract', 'src': 'projects'})
    expected_labels = {f'{width}:{theme}' for width in (1440, 768, 375) for theme in ('light', 'dark')}
    labels = [item.get('label') for item in results if isinstance(item, dict)] if isinstance(results, list) else []
    if (not isinstance(results, list) or len(results) != 6 or len(labels) != 6
            or len(set(labels)) != 6 or set(labels) != expected_labels):
        failures.append({'check': 'F26', 'page': 'projects', 'where': 'verify-projects.mjs matrix',
                         'msg': 'Projects verifier did not cover the exact 1440/768/375 light/dark matrix', 'src': 'projects'})
    canonical_hash = contract.get('authority', {}).get('canonicalUnitAtomLedgerSha256')
    transition_contract = contract.get('acceptedResumeTransition') or {}
    expected_transition_evidence = {
        'ledgerSha256': transition_contract.get('ledgerSha256'),
        'authorityCoverageSha256': transition_contract.get('authorityCoverageSha256'),
        'transitionSha256': transition_contract.get('transitionSha256'),
        'factIds': transition_contract.get('factIds'),
        'authorizedTransitionAtomCount': transition_contract.get('authorizedTransitionAtomCount'),
        'unchangedNormalizedTextAtomCount': transition_contract.get('unchangedNormalizedTextAtomCount'),
        'reconstructedPreviousCanonicalUnitAtomLedgerSha256': transition_contract.get('previousCanonicalUnitAtomLedgerSha256'),
    }
    paint_expected = {f'{item["width"]}:{item["theme"]}': item for item in EXPECTED_PROJECTS_PAINT_CONTRACT['expected']}
    if (not isinstance(results, list) or any(
            not isinstance(item, dict)
            or item.get('canonicalUnitAtomLedgerHash') != canonical_hash
            or item.get('acceptedTransition') != expected_transition_evidence
            or item.get('graph') != {'nodeCount': 5, 'edgeCount': 4}
            for item in results)):
        failures.append({'check': 'F26', 'page': 'projects', 'where': 'verify-projects.mjs result evidence',
                         'msg': 'one or more Projects contexts lack the exact proof-ledger or graph evidence', 'src': 'projects'})
    paint_result_failure = not isinstance(results, list)
    if isinstance(results, list):
        for item in results:
            if not isinstance(item, dict) or item.get('label') not in paint_expected:
                paint_result_failure = True
                continue
            expected_paint = paint_expected[item['label']]
            paint = item.get('assetPaint')
            numeric_keys = ('faithfulColumnRatio', 'referenceSignalColumnRatio', 'paintedSignalColumnRatio', 'mismatchRatio', 'meanMaxDelta')
            if (not isinstance(paint, dict)
                    or paint.get('contractSha256') != paint_contract_hash
                    or paint.get('cropWidth') != expected_paint['cropWidth']
                    or paint.get('cropHeight') != expected_paint['cropHeight']
                    or any(not isinstance(paint.get(key), (int, float)) or isinstance(paint.get(key), bool) for key in numeric_keys)
                    or paint.get('faithfulColumnRatio', 0) < expected_paint['minFaithfulColumnRatio']
                    or paint.get('mismatchRatio', 1) > expected_paint['maxMismatchRatio']
                    or paint.get('paintedSignalColumnRatio', 0) < paint.get('referenceSignalColumnRatio', 1) - 0.02):
                paint_result_failure = True
    if paint_result_failure:
        failures.append({'check': 'F26', 'page': 'projects', 'where': 'verify-projects.mjs paint evidence',
                         'msg': 'one or more Projects contexts lack exact rendered Ondoway paint evidence', 'src': 'projects'})
    shared_transition = contract.get('sharedRouteTransition') or {}
    shared_authorities = shared_transition.get('authorities') or []
    current_shared_all = shared_authorities[-1].get('currentSharedAll') if shared_authorities else None
    if (not isinstance(shared, dict) or shared.get('frameCount') != 68
            or shared.get('sharedAggregate') != current_shared_all
            or shared.get('oracleSha256') != shared_transition.get('oracleSha256')
            or shared.get('authorizedTransitions') != shared_authorities):
        failures.append({'check': 'F26', 'page': 'projects', 'where': 'verify-projects.mjs shared-route oracle',
                         'msg': 'Projects verifier did not certify the exact authority-bound 68-frame shared transition', 'src': 'projects'})
    return failures


def research_verifier_failures(report, returncode, stderr, provenance):
    """Fail closed on the exact Research authority, 24 contexts, six frames, deep links, and frozen routes."""
    failures = []

    def add(where, message):
        failures.append({'check': 'F26', 'page': 'research', 'where': where,
                         'msg': message, 'src': 'research'})

    detail = '; '.join(str(item.get('message', item)) for item in report.get('failures', []) if isinstance(item, dict))
    if returncode != 0 or report.get('ok') is not True or report.get('failures'):
        add('verify-research.mjs', detail or stderr[-500:] or 'Research verifier failed without structured evidence')
        return failures
    if report.get('mutationTest') is not False or report.get('captureBaseline') is not False or report.get('researchOnly') is not False:
        add('verify-research.mjs mode', 'mutation, capture-baseline, or scoped evidence cannot satisfy the production Research gate')
    for key in ('baselineId', 'sourceHash', 'artifactHash'):
        if report.get(key) != provenance.get(key):
            add('verify-research.mjs provenance', f'Research evidence is stale for {key}')
    if report.get('liveArtifactHash') != provenance.get('artifactHash'):
        add('verify-research.mjs provenance', 'Research live artifact hash differs from candidate provenance')
    proof_path = os.path.join(RUBRIC, 'research-proof-contract.json')
    proof = json.load(open(proof_path))
    expected_hashes = {
        'proofContractSha256': file_hash(proof_path),
        'authorityContractSha256': proof['authority']['researchEvidenceContract']['sha256'],
        'figureAssetManifestSha256': proof['authority']['figureAssetManifest']['sha256'],
    }
    if any(report.get(key) != value for key, value in expected_hashes.items()):
        add('verify-research.mjs authority', 'Research report is not bound to the exact proof, authority, and figure contracts')
    for record in proof['authority'].values():
        path = os.path.join(ROOT, *record['path'].split('/'))
        if not os.path.isfile(path) or file_hash(path) != record['sha256']:
            add('verify-research.mjs authority', f'Research authority bytes changed: {record["path"]}')
    contexts = report.get('contexts') or []
    labels = [item.get('contextLabel') for item in contexts if isinstance(item, dict)]
    if labels != proof['runtime']['contexts'] or len(set(labels)) != 24:
        add('verify-research.mjs runtime matrix', 'Research verifier did not cover the exact ordered 24-context matrix')
    frame_by_key = {(item['width'], item['theme']): item['sha256'] for item in proof['runtime']['visualFrames']}
    frame_spec_by_key = {(item['width'], item['theme']): item for item in proof['runtime']['visualFrames']}
    authority_path = os.path.join(ROOT, *proof['authority']['researchEvidenceContract']['path'].split('/'))
    authority = json.load(open(authority_path))
    expected_dom_records = []
    expected_links = []
    for record in authority['records']:
        figure = record['figure']
        expected_dom_records.append({
            'claim': record['authorityClaimId'], 'id': record['block'], 'doi': record['doiLink']['bareText'],
            'nodeCount': len(figure.get('labels', [])) if figure['kind'] in ('text-derived-diagram', 'source-markdown-diagram') else 0,
            'edgeCount': len(figure.get('edges', [])),
            'ownedTextSha256': proof['structure']['ownedTextSha256ByRecord'][record['block']],
            'accessibilityTreeSha256': proof['structure']['accessibilityTreeSha256ByRecord'][record['block']],
        })
        expected_links.append({'href': record['doiLink']['href'], 'kind': 'doi'})
        if figure.get('sourcePdfHref'):
            expected_links.append({'href': figure['sourcePdfHref'], 'kind': 'pdf'})
    expected_images = [{
        'src': image['imageHref'], 'width': image['width'], 'height': image['height'],
    } for image in proof['figurePolicy']['nativeAssets']]
    diagram_nodes = ['scale', 'roic', 'stage-gate', 'scorecard']
    scroll_tolerance = proof['runtime']['realInputScroll']['bottomTolerancePx']
    neutral_policy = proof['runtime']['realInputScroll']['neutralReset']
    wheel_policy = proof['runtime']['realInputScroll']['wheelAcknowledgement']

    def numeric(value):
        return isinstance(value, (int, float)) and not isinstance(value, bool)

    def navigation_action(action, href, javascript):
        event = {'trusted': True, 'preCanceled': False}
        if not javascript:
            event['trustSource'] = 'playwright-user-input-document-navigation'
        return action == {
            'url': href, 'method': 'GET', 'isNavigationRequest': True,
            'resourceType': 'document', 'popup': True, 'event': event,
        }

    def reached_bottom(state, kind):
        return (isinstance(state, dict) and set(state) == {'kind', 'target', 'tolerance', 'reachedBottom'}
                and state.get('kind') == kind and numeric(state.get('target'))
                and state['target'] > 0 and state.get('tolerance') == scroll_tolerance
                and state.get('reachedBottom') is True)

    def bounded_focus_clip(clip, viewport_width, viewport_height):
        if not isinstance(clip, dict) or set(clip) != {'x', 'y', 'width', 'height'}:
            return False
        if any(not numeric(clip.get(key)) for key in ('x', 'y', 'width', 'height')):
            return False
        return (clip['x'] >= 0 and clip['y'] >= 0 and clip['width'] > 0 and clip['height'] > 0
                and clip['x'] + clip['width'] <= viewport_width + 1
                and clip['y'] + clip['height'] <= viewport_height + 1)

    def neutral_scroll_evidence(entries, viewport_width, javascript):
        phases = neutral_policy['mobilePhases'] if viewport_width <= 768 else neutral_policy['desktopPhases']
        expected = [{
            'phase': phase,
            'method': neutral_policy['javascriptMethod'] if javascript else neutral_policy['scriptlessMethod'],
            'stable': True,
            'consecutiveFrames': neutral_policy['consecutiveAnimationFrames'],
            'noAdvancingScrollEvent': True if javascript else None,
            'noAdvancingLayoutMovement': None if javascript else True,
            'maxAttempts': neutral_policy['maxAttempts'],
        } for phase in phases]
        return entries == expected

    def wheel_acknowledgement_evidence(evidence, javascript):
        if (type(wheel_policy.get('scriptlessMaxCompositorBarriersPerDispatch')) is not int
                or wheel_policy['scriptlessMaxCompositorBarriersPerDispatch'] != EXPECTED_RESEARCH_SCRIPTLESS_BARRIER_CAP
                or wheel_policy.get('scriptlessWheelPoint') != EXPECTED_RESEARCH_SCRIPTLESS_WHEEL_POINT):
            return False
        return evidence == {
            'method': wheel_policy['javascriptMethod'] if javascript else wheel_policy['scriptlessMethod'],
            'dispatchCap': wheel_policy['dispatchCap'],
            'deltaY': wheel_policy['deltaY'],
            'scriptlessMaxCompositorBarriersPerDispatch': None if javascript else wheel_policy['scriptlessMaxCompositorBarriersPerDispatch'],
            'scriptlessWheelPoint': None if javascript else wheel_policy['scriptlessWheelPoint'],
            'trustedEvents': True if javascript else None,
            'protocolDispatch': None if javascript else True,
            'observedProgress': True,
        }

    def scriptless_invariant_evidence(evidence, viewport_width, javascript):
        if javascript:
            return evidence is None
        checkpoints = (neutral_policy['scriptlessMobileInvariantCheckpoints'] if viewport_width <= 768
                       else neutral_policy['scriptlessDesktopInvariantCheckpoints'])
        return evidence == {
            'method': neutral_policy['scriptlessMethod'],
            'checkpoints': checkpoints,
            'scriptingNone': True,
            'domStable': True,
            'styleStable': True,
            'networkStable': True,
            'authorSentinelStable': True,
        }

    for item in contexts:
        if not isinstance(item, dict):
            add('verify-research.mjs runtime evidence', 'Research runtime context is not structured')
            continue
        label = str(item.get('contextLabel', ''))
        parts = label.split(':')
        width = int(parts[0]) if len(parts) == 4 and parts[0].isdigit() else 0
        javascript = len(parts) == 4 and parts[3] == 'js'
        pixel_authority = f'{parts[0]}:{parts[1]}' if len(parts) == 4 else ''
        expected_frame = frame_by_key.get((width, parts[1])) if len(parts) == 4 else None
        frame_spec = frame_spec_by_key.get((width, parts[1]), {}) if len(parts) == 4 else {}
        viewport_height = frame_spec.get('height', 0)
        records = item.get('records') or []
        images = item.get('images') or []
        dom = item.get('dom') or {}
        hits = item.get('interactionHits') or []
        topology = item.get('focusTopology') or []
        focus = item.get('focusIndicators') or []
        actions = item.get('interactionActions') or []
        scrolling = item.get('inputScroll') or {}
        capture = item.get('captureState') or {}
        geometry = item.get('diagramGeometry') or []
        bad = (
            [record.get('id') for record in records] != [record['id'] for record in expected_dom_records]
            or any(not isinstance(record.get('height'), (int, float)) or record['height'] <= 0
                   or record.get('left', -1) < -1 or record.get('right', width + 2) > width + 1 for record in records)
            or [{key: image.get(key) for key in ('src', 'width', 'height')} for image in images] != expected_images
            or item.get('overflow') != 0 or item.get('axe') != {'critical': 0, 'serious': 0}
            or item.get('screenshotSha256') != expected_frame or item.get('pixelAuthority') != pixel_authority
            or dom.get('records') != expected_dom_records or dom.get('routeStyles') != proof['routeStyle']['expectedLinked']
            or [entry.get('href') for entry in hits] != [entry['href'] for entry in expected_links]
            or any(entry.get('context') != label or len(entry.get('points') or []) != 9
                   or any(point.get('top') not in ('A', 'IMG') for point in entry.get('points') or []) for entry in hits)
            or topology != expected_links
            or [entry.get('href') for entry in focus] != [entry['href'] for entry in expected_links]
            or any(set(entry) != {'href', 'style', 'persistent', 'clip', 'pixelDelta', 'persistentPixelMatch'}
                   or set(entry.get('style') or {}) != {'focusVisible', 'outlineStyle', 'outlineWidth', 'outlineAlpha', 'contrast', 'activeTimings', 'activeAnimations'}
                   or set(entry.get('persistent') or {}) != {'focusVisible', 'outlineStyle', 'outlineWidth', 'outlineColor', 'activeAnimations'}
                   or entry.get('style', {}).get('focusVisible') is not True
                   or entry.get('style', {}).get('outlineStyle') == 'none'
                   or entry.get('style', {}).get('outlineWidth', 0) < proof['runtime']['focusIndicator']['minimumOutlinePx']
                   or entry.get('style', {}).get('outlineAlpha', 0) < proof['runtime']['focusIndicator']['minimumAlpha']
                   or entry.get('style', {}).get('contrast', 0) < proof['runtime']['focusIndicator']['minimumContrast']
                   or entry.get('style', {}).get('activeTimings') != []
                   or entry.get('style', {}).get('activeAnimations') != 0
                   or entry.get('persistent', {}).get('focusVisible') is not True
                   or entry.get('persistent', {}).get('activeAnimations') != 0
                   or entry.get('persistent', {}).get('outlineStyle') != entry.get('style', {}).get('outlineStyle')
                   or entry.get('persistent', {}).get('outlineWidth') != f"{entry.get('style', {}).get('outlineWidth')}px"
                   or entry.get('pixelDelta') is not True or entry.get('persistentPixelMatch') is not True
                   or not bounded_focus_clip(entry.get('clip'), width, viewport_height) for entry in focus)
            or [entry.get('href') for entry in actions] != [entry['href'] for entry in expected_links]
            or any(not navigation_action(entry.get('keyboard'), expected_links[index]['href'], javascript)
                   or (javascript and not navigation_action(entry.get('pointerIntent'), expected_links[index]['href'], True))
                   or (not javascript and entry.get('pointerIntent') is not None) for index, entry in enumerate(actions))
            or set(scrolling) != {'computed', 'touch', 'wheel', 'keyboard', 'neutral', 'wheelAcknowledgement', 'scriptlessInvariant'}
            or [entry.get('tag') for entry in scrolling.get('computed') or []] != ['DIV', 'SECTION', 'MAIN', 'BODY', 'HTML']
            or any(set(entry) != {'tag', 'touchAction', 'touchLocked', 'overflowY', 'overflowLocked'}
                   or entry.get('touchLocked') is not False or entry.get('overflowLocked') is not False
                   for entry in scrolling.get('computed') or [])
            or ((width <= 768 and not reached_bottom(scrolling.get('touch'), 'touch')) or (width > 768 and scrolling.get('touch') is not None))
            or not reached_bottom(scrolling.get('wheel'), 'wheel') or not reached_bottom(scrolling.get('keyboard'), 'keyboard')
            or not neutral_scroll_evidence(scrolling.get('neutral'), width, javascript)
            or not wheel_acknowledgement_evidence(scrolling.get('wheelAcknowledgement'), javascript)
            or not scriptless_invariant_evidence(scrolling.get('scriptlessInvariant'), width, javascript)
            or capture.get('activeTag') not in ('BODY', 'HTML') or capture.get('activeId') != ''
            or capture.get('focusVisibleCount') != 0 or capture.get('scrollX') != 0 or capture.get('scrollY') != 0
            or capture.get('hash') != '' or capture.get('expectedHash') != ''
            or [entry.get('node') for entry in geometry] != diagram_nodes
            or [entry.get('ordinal') for entry in geometry] != [1, 2, 3, 4]
            or any(entry.get('ordinalTransform') != 'none' or entry.get('ordinalTranslate') != 'none'
                   or entry.get('ordinalScale') != 'none' or entry.get('ordinalRotate') != 'none'
                   or entry.get('ordinalZoom') not in ('1', 'normal')
                   or not isinstance(entry.get('gapPx'), (int, float))
                   or entry['gapPx'] < proof['runtime']['minimumAiRoiOrdinalLabelGapPx'] for entry in geometry)
            or item.get('externalRequests') != []
        )
        if bad:
            add('verify-research.mjs runtime evidence', f'Research context lacks governed evidence: {label}')
    visuals = report.get('visualFrames') or []
    expected_visuals = proof['runtime']['visualFrames']
    expected_report_visuals = [{**expected, 'actualSha256': expected['sha256'], 'path': ''} for expected in expected_visuals]
    if visuals != expected_report_visuals:
        add('verify-research.mjs visual matrix', 'Research six-frame pixel authority changed')
    deep = report.get('scriptlessDeepLinks') or []
    expected_pairs = [(context, target) for context in proof['runtime']['contexts'] if context.endswith(':no-js')
                      for target in proof['runtime']['scriptlessDeepLinks']]
    actual_pairs = [(item.get('context'), item.get('id')) for item in deep if isinstance(item, dict)]
    def valid_deep_link(item):
        context = item.get('context', '').split(':')
        target_hash = '#' + str(item.get('id', ''))
        state = item.get('state') or {}
        capture = item.get('captureState') or {}
        expected_frame = frame_by_key.get((int(context[0]), context[1])) if len(context) == 4 and context[0].isdigit() else None
        return (state.get('exists') is True and state.get('hash') == target_hash
                and state.get('display') != 'none' and state.get('visibility') not in ('hidden', 'collapse')
                and isinstance(state.get('opacity'), (int, float)) and state['opacity'] >= 0.15
                and isinstance(state.get('width'), (int, float)) and state['width'] > 0
                and isinstance(state.get('height'), (int, float)) and state['height'] > 0
                and capture.get('activeTag') in ('BODY', 'HTML') and capture.get('activeId') == ''
                and capture.get('focusVisibleCount') == 0 and capture.get('scrollX') == 0 and capture.get('scrollY') == 0
                and capture.get('hash') == target_hash and capture.get('expectedHash') == target_hash
                and item.get('screenshotSha256') == expected_frame)

    if actual_pairs != expected_pairs or len(deep) != 48 or any(not valid_deep_link(item) for item in deep):
        add('verify-research.mjs deep links', 'Research scriptless deep-link evidence is incomplete or stale')
    frozen = report.get('frozen') or {}
    if (frozen.get('html') != proof['frozenNonResearch']['html']
            or frozen.get('sharedSources') != proof['frozenNonResearch']['sharedSources']
            or frozen.get('authorities') != {
                key: proof['frozenNonResearch'][key]['sha256']
                for key in ('sharedRouteOracle', 'projectsProofContract', 'speakingProofContract')
            }):
        add('verify-research.mjs frozen routes', 'Research verifier did not preserve the exact non-Research bytes and authorities')
    return failures


def speaking_verifier_failures(report, returncode, stderr, provenance):
    """Fail closed on the exact production Speaking matrix, authority chain, pixels, and frozen routes."""
    failures = []

    def add(where, message):
        failures.append({'check': 'F26', 'page': 'speaking', 'where': where,
                         'msg': message, 'src': 'speaking'})

    detail = '; '.join(str(item.get('message', item)) for item in report.get('failures', []) if isinstance(item, dict))
    if returncode != 0 or report.get('ok') is not True or report.get('failures'):
        add('verify-speaking.mjs', detail or stderr[-500:] or 'Speaking verifier failed without structured evidence')
        return failures
    if report.get('mutationTest') is not False:
        add('verify-speaking.mjs mode', 'mutation-test evidence cannot satisfy the production Speaking gate')
    for key in ('baselineId', 'sourceHash', 'artifactHash'):
        if report.get(key) != provenance.get(key):
            add('verify-speaking.mjs provenance', f'Speaking evidence is stale for {key}')
    if report.get('liveArtifactHash') != provenance.get('artifactHash'):
        add('verify-speaking.mjs provenance', 'Speaking live artifact hash differs from candidate provenance')

    contract_path = os.path.join(RUBRIC, 'speaking-proof-contract.json')
    contract = json.load(open(contract_path))
    authority_contract = contract['authority']['speakingEvidenceContract']
    authority_manifest = contract['authority']['authorityManifest']
    atom_contract = contract['proofLedger']['factAtomLedger']
    expected_session_count = sum(len(group['items']) for group in contract['sessions'])
    expected_interactions = len(contract['structure']['indexEntries']) + len(contract['links']['eaglesSources']) + 2
    if (report.get('proofContractSha256') != file_hash(contract_path)
            or report.get('authoritySpeakingContractSha256') != authority_contract['sha256']
            or report.get('authorityManifestSha256') != authority_manifest['sha256']
            or report.get('factAtomLedgerSha256') != atom_contract['sha256']
            or report.get('canonicalProofAtomLedgerSha256') != atom_contract['canonicalProofAtomLedgerSha256']
            or report.get('proofCount') != contract['proofLedger']['count']
            or report.get('atomCount') != contract['proofLedger']['atomCount']
            or report.get('sessionCount') != expected_session_count):
        add('verify-speaking.mjs authority', 'Speaking evidence is not bound to the exact proof and authority contracts')
    for record in contract['authority'].values():
        path = os.path.join(ROOT, *record['path'].split('/'))
        if not os.path.isfile(path) or file_hash(path) != record['sha256']:
            add('verify-speaking.mjs authority', f'Speaking authority bytes changed: {record["path"]}')
    hero_record = contract['authority'].get('speakingHeroCollisionTransition') or {}
    hero_path = os.path.join(ROOT, *str(hero_record.get('path', '')).split('/'))
    hero_transition = json.load(open(hero_path)) if os.path.isfile(hero_path) else {}
    hero_source = hero_transition.get('sourceTransition') or {}
    preserved = hero_transition.get('preservedFrames') or []
    changed = hero_transition.get('authorizedFrameChanges') or []
    visual_by_key = {(item['width'], item['theme']): item['sha256'] for item in contract['runtime']['visualFrames']}
    if (hero_transition.get('schemaVersion') != 1
            or hero_transition.get('id') != 'speaking-wide-hero-collision'
            or hero_transition.get('status') != 'accepted-governed-transition'
            or hero_source.get('priorProofContractSha256') != '009430f7c5f95208d89c2db8e5cd2ed318795ad5e3c8f6f03d9bc5667e1d7b20'
            or hero_source.get('priorSpeakingCssSha256') != '50bfcc62aecb982dfc116eb4ebc1a565f5026ce0a929152d9f279e0cd81add17'
            or hero_source.get('priorSpeakingHtmlSha256') != '51673ea0d4c45bec0e1f8a7e40a6b629d59a2e25ceb40b2834c8f8a0b4ee13f1'
            or hero_source.get('candidateSpeakingCssSha256') != contract['styles']['speaking']['sha256']
            or hero_source.get('candidateSpeakingHtmlSha256') != contract['styles']['generatedHtml']['sha256']
            or [(item.get('width'), item.get('theme')) for item in preserved]
                != [(375, 'light'), (375, 'dark'), (768, 'light'), (768, 'dark')]
            or any(visual_by_key.get((item.get('width'), item.get('theme'))) != item.get('sha256') for item in preserved)
            or [(item.get('width'), item.get('theme')) for item in changed]
                != [(1440, 'light'), (1440, 'dark')]
            or any(visual_by_key.get((item.get('width'), item.get('theme'))) != item.get('candidateSha256') for item in changed)):
        add('verify-speaking.mjs hero authority', 'Speaking wide-hero authority transition changed')
    expected_hero_summary = {
        'id': hero_transition.get('id'),
        'manifestSha256': hero_record.get('sha256'),
        'priorProofContractSha256': hero_source.get('priorProofContractSha256'),
        'priorSpeakingCssSha256': hero_source.get('priorSpeakingCssSha256'),
        'candidateSpeakingCssSha256': hero_source.get('candidateSpeakingCssSha256'),
        'priorSpeakingHtmlSha256': hero_source.get('priorSpeakingHtmlSha256'),
        'candidateSpeakingHtmlSha256': hero_source.get('candidateSpeakingHtmlSha256'),
        'preservedFrameCount': len(preserved),
        'changedFrameCount': len(changed),
        'sharedRouteOracleSha256': (hero_transition.get('frozenCollateral') or {}).get('sharedRouteOracleSha256'),
        'sharedAll': (hero_transition.get('frozenCollateral') or {}).get('sharedAll'),
        'projectsProofContractSha256': (hero_transition.get('frozenCollateral') or {}).get('projectsProofContractSha256'),
    }
    if report.get('heroTransition') != expected_hero_summary:
        add('verify-speaking.mjs hero authority', 'Speaking report omitted or changed the exact wide-hero transition binding')
    atom_path = os.path.join(ROOT, *atom_contract['path'].split('/'))
    if not os.path.isfile(atom_path) or file_hash(atom_path) != atom_contract['sha256']:
        add('verify-speaking.mjs proof ledger', 'Speaking fact-atom ledger bytes changed')

    generated_html = contract['styles']['generatedHtml']
    candidate_html = os.path.join(CANDIDATE, 'speaking.html')
    if (report.get('speakingHtmlSha256') != generated_html['sha256']
            or not os.path.isfile(candidate_html) or file_hash(candidate_html) != generated_html['sha256']):
        add('verify-speaking.mjs candidate', 'Speaking candidate HTML differs from the sealed generated page')
    expected_route_css = {
        'sharedSha256': contract['styles']['shared']['sha256'],
        'routeSha256': contract['styles']['speaking']['sha256'],
    }
    route_css = report.get('routeCss') or {}
    if (route_css.get('sharedSha256') != expected_route_css['sharedSha256']
            or route_css.get('routeSha256') != expected_route_css['routeSha256']
            or not isinstance(route_css.get('selectorCount'), int) or route_css.get('selectorCount', 0) <= 0):
        add('verify-speaking.mjs styles', 'Speaking route-only stylesheet evidence changed')

    poster = contract['asset']['poster']
    deck = contract['asset']['deck']
    expected_assets = {
        'posterSha256': poster['sha256'],
        'deckTreeSha256': deck['treeSha256'],
        'deckFileCount': deck['fileCount'],
    }
    if report.get('sourceAssets') != expected_assets:
        add('verify-speaking.mjs source assets', 'Speaking source assets differ from the sealed Atos bytes')
    if report.get('candidateAssets') != {key: expected_assets[key] for key in ('posterSha256', 'deckTreeSha256')}:
        add('verify-speaking.mjs candidate assets', 'Speaking candidate assets differ from the sealed Atos bytes')

    expected_contexts = contract['runtime']['contexts']
    runtime = report.get('runtimeResults')
    identities = ([{key: item.get(key) for key in ('label', 'width', 'theme', 'javascript', 'motion')}
                   for item in runtime] if isinstance(runtime, list) and all(isinstance(item, dict) for item in runtime) else [])
    if identities != expected_contexts or len({item['label'] for item in identities}) != contract['runtime']['contextCount']:
        add('verify-speaking.mjs runtime matrix', 'Speaking verifier did not cover the exact ordered 24-context matrix')
    frame_hashes = {(item['width'], item['theme']): item['sha256'] for item in contract['runtime']['visualFrames']}
    runtime_evidence_bad = not isinstance(runtime, list)
    if isinstance(runtime, list):
        for item in runtime:
            if not isinstance(item, dict):
                runtime_evidence_bad = True
                continue
            js_off = item.get('javascript') == 'off'
            expected_scripts = sorted(contract['runtime']['externalScriptSources']) if js_off else []
            paint = item.get('posterPaint') or {}
            expected_primary = item.get('javascript') == 'on' and item.get('motion') == 'normal'
            paint_bad = (not isinstance(paint.get('samples'), int) or paint.get('samples', 0) <= 1000
                         or paint.get('sourceWidth') != poster['width'] or paint.get('sourceHeight') != poster['height']
                         or not isinstance(paint.get('mismatchRatio'), (int, float)) or paint.get('mismatchRatio', 1) > 0.10
                         or not isinstance(paint.get('faithfulColumnRatio'), (int, float)) or paint.get('faithfulColumnRatio', 0) < 0.80) if expected_primary else item.get('posterPaint') is not None
            if (item.get('proofCount') != contract['proofLedger']['count']
                    or item.get('atomCount') != contract['proofLedger']['atomCount']
                    or item.get('sessionCount') != expected_session_count
                    or item.get('severeAxeViolations') != 0
                    or item.get('interactionCount') != expected_interactions
                    or item.get('jsOffHostActionabilityCount') != (expected_interactions if js_off else None)
                    or item.get('accessibilityMode') != ('scriptless-js-off-dom-clone' if js_off else 'runtime-page')
                    or sorted(item.get('suppressedScripts') or []) != expected_scripts
                    or item.get('primaryVisual') is not expected_primary
                    or item.get('screenshotHash') != frame_hashes.get((item.get('width'), item.get('theme')))
                    or paint_bad):
                runtime_evidence_bad = True
    if runtime_evidence_bad:
        add('verify-speaking.mjs runtime evidence', 'one or more Speaking contexts lack exact pixels, accessibility, actionability, or poster paint evidence')

    visual = report.get('visualResults')
    expected_visual = [item for item in runtime if item.get('primaryVisual') is True] if isinstance(runtime, list) else []
    if visual != expected_visual or len(expected_visual) != 6:
        add('verify-speaking.mjs visual matrix', 'Speaking verifier did not emit the exact six approved visual contexts')

    isolation = hero_transition.get('pixelIsolation') or {}
    expected_wide = isolation.get('contexts') or []
    wide = report.get('wideHeroResults')
    wide_bad = not isinstance(wide, list) or len(wide) != 4
    if isinstance(wide, list) and len(wide) == len(expected_wide):
        changed_by_key = {(item.get('width'), item.get('theme')): item for item in changed}
        for actual, expected in zip(wide, expected_wide):
            key = (expected.get('width'), expected.get('theme'))
            authorized = changed_by_key.get(key)
            hero_box = actual.get('heroBox') if isinstance(actual, dict) else None
            expected_core = {
                'width': expected.get('width'), 'theme': expected.get('theme'),
                'fullPageSha256': expected.get('fullPageSha256'),
                'titleInkPixels': expected.get('titleInkPixels'),
                'titleBox': expected.get('titleBox'), 'targets': expected.get('targets'),
            }
            actual_core = {name: actual.get(name) for name in expected_core} if isinstance(actual, dict) else {}
            contained = isinstance(hero_box, dict) and (authorized is None or (
                authorized['diffBbox']['left'] >= int(hero_box.get('left', -1))
                and authorized['diffBbox']['top'] >= int(hero_box.get('top', -1))
                and authorized['diffBbox']['right'] < int(hero_box.get('right', 0) + 0.999999)
                and authorized['diffBbox']['bottom'] < int(hero_box.get('bottom', 0) + 0.999999)
            ))
            if (actual_core != expected_core
                    or actual.get('authorizedDiffBbox') != (authorized.get('diffBbox') if authorized else None)
                    or actual.get('diffBboxWithinHero') is not True or not contained):
                wide_bad = True
    elif isinstance(wide, list):
        wide_bad = True
    if wide_bad:
        add('verify-speaking.mjs hero isolation', 'Speaking verifier omitted or changed the exact 1440 and 1600 raster-isolation evidence')

    deep_links = report.get('deepLinkResults')
    deep_targets = [item.get('target') for item in deep_links] if isinstance(deep_links, list) and all(isinstance(item, dict) for item in deep_links) else []
    deep_hash = frame_hashes[(375, 'light')]
    if (deep_targets != contract['runtime']['deepLinkTargets']
            or len(set(deep_targets)) != len(contract['runtime']['deepLinkTargets'])
            or any(item.get('hash') != '#' + item.get('target', '') or item.get('inViewport') is not True
                   or item.get('javascript') != 'off' or item.get('screenshotHash') != deep_hash
                   or item.get('interactionCount') != expected_interactions
                   or item.get('jsOffHostActionabilityCount') != expected_interactions
                   or not isinstance(item.get('ownerProofCount'), int) or item.get('ownerProofCount', 0) <= 0
                   for item in (deep_links or []))):
        add('verify-speaking.mjs deep links', 'Speaking JS-off deep-link evidence is incomplete or stale')

    frozen = report.get('frozen')
    expected_html = [{'page': page, 'sha256': record['sha256']}
                     for page, record in contract['frozenNonSpeaking']['html'].items()]
    if not isinstance(frozen, dict) or set(frozen) != {'html', 'research', 'projects', 'shared'}:
        add('verify-speaking.mjs frozen routes', 'Speaking verifier omitted frozen non-Speaking evidence')
        frozen = {}
    if frozen.get('html') != expected_html:
        add('verify-speaking.mjs frozen HTML', 'non-Speaking HTML hashes changed')
    if frozen.get('research') != contract['frozenNonSpeaking']['research']['frames']:
        add('verify-speaking.mjs frozen Research', 'Research six-frame oracle changed')
    projects_contract_path = os.path.join(RUBRIC, 'projects-proof-contract.json')
    projects_contract = json.load(open(projects_contract_path))
    expected_projects = {
        'proofContractSha256': file_hash(projects_contract_path),
        'contexts': [f'{width}:{theme}' for width in (1440, 375, 768) for theme in ('dark', 'light')],
        'ledgerSha256': projects_contract['authority']['canonicalUnitAtomLedgerSha256'],
        'assetSha256': EXPECTED_PROJECTS_PAINT_CONTRACT['assetSha256'],
    }
    expected_projects['contexts'].sort()
    if frozen.get('projects') != expected_projects:
        add('verify-speaking.mjs frozen Projects', 'Projects proof, topology, paint, or six-context evidence changed')
    shared_path = os.path.join(RUBRIC, 'shared-route-oracle.json')
    shared_oracle = json.load(open(shared_path))
    expected_shared = {
        'frameCount': len(shared_oracle['frames']),
        'sharedAggregate': shared_oracle['aggregates']['sharedAll'],
        'oracleAuthority': shared_oracle['authority'],
        'authorizedTransitions': shared_oracle['authority']['authorizedTransitions'],
        'oracleSha256': file_hash(shared_path),
    }
    if frozen.get('shared') != expected_shared:
        add('verify-speaking.mjs frozen shared routes', 'shared 68-frame authority-bound oracle changed')
    return failures

def speaking_mutation_evidence_problems(test_report, provenance, production_report_path):
    """Bind the heavy Speaking plant suite to exact cases, clean controls, and production bytes."""
    problems = []
    summary = test_report.get('speaking_mutations') or {}
    report_path = os.path.join(OUT, 'speaking-mutations.json')
    scoped_path = os.path.join(OUT, 'speaking-mutations.scoped-clean.json')
    full_path = os.path.join(OUT, 'speaking-mutations.full-clean.json')
    runner_path = os.path.join(ROOT, 'site/_build/verify-speaking-mutations.py')
    verifier_path = os.path.join(ROOT, 'site/_build/verify-speaking.mjs')
    contract_path = os.path.join(RUBRIC, 'speaking-proof-contract.json')
    expected_inputs = {
        'runnerSha256': file_hash(runner_path),
        'verifierSha256': file_hash(verifier_path),
        'proofContractSha256': file_hash(contract_path),
        'candidateProvenanceSha256': file_hash(os.path.join(CANDIDATE, '.site-provenance.json')),
        'candidateTreeSha256': tree_hash(CANDIDATE),
    }
    try:
        aggregate = json.load(open(report_path))
        scoped = json.load(open(scoped_path))
        full = json.load(open(full_path))
    except (OSError, json.JSONDecodeError) as error:
        return [f'Speaking mutation evidence is missing or unreadable: {error}']
    expected_count = len(EXPECTED_SPEAKING_MUTATION_CASE_IDS)
    case_ids = [item.get('id') for item in aggregate.get('results', [])]
    if (summary.get('ok') is not True or summary.get('returnCode') != 0
            or summary.get('attempted') != expected_count or summary.get('planted') != expected_count
            or summary.get('caught') != expected_count or summary.get('caseIds') != EXPECTED_SPEAKING_MUTATION_CASE_IDS
            or summary.get('inputHashesStable') is not True):
        problems.append('test.py did not bind the exact ordered Speaking mutation case set')
    if (summary.get('reportPath') != os.path.relpath(report_path, ROOT)
            or summary.get('reportSha256') != file_hash(report_path)
            or any(summary.get(key) != value for key, value in expected_inputs.items())):
        problems.append('test.py Speaking mutation summary is stale for runner, verifier, contract, or candidate')
    if (aggregate.get('ok') is not True or aggregate.get('attempted') != expected_count
            or aggregate.get('planted') != expected_count or aggregate.get('caught') != expected_count
            or aggregate.get('plantErrors') or aggregate.get('inputHashesStable') is not True
            or case_ids != EXPECTED_SPEAKING_MUTATION_CASE_IDS or len(set(case_ids)) != expected_count
            or aggregate.get('inputHashesStart') != expected_inputs or aggregate.get('inputHashesEnd') != expected_inputs
            or any(aggregate.get(key) != value for key, value in expected_inputs.items())
            or aggregate.get('snapshotCandidateTreeSha256') != expected_inputs['candidateTreeSha256']
            or aggregate.get('snapshotCandidateProvenanceSha256') != expected_inputs['candidateProvenanceSha256']):
        problems.append('Speaking mutation aggregate is not an exact stable 35-case snapshot')
    if any(item.get('applications') != 1 or item.get('caught') is not True
           or len(item.get('failures') or []) != 1
           or item['failures'][0].get('kind') != item.get('expectedKind')
           or item.get('expectedMessage') not in item['failures'][0].get('message', '')
           for item in aggregate.get('results', [])):
        problems.append('one or more Speaking mutations lack exactly one causal structured failure')
    clean = aggregate.get('cleanControl') or {}
    if (summary.get('scopedReportPath') != os.path.relpath(scoped_path, ROOT)
            or summary.get('fullReportPath') != os.path.relpath(full_path, ROOT)
            or summary.get('scopedReportSha256') != file_hash(scoped_path)
            or summary.get('fullReportSha256') != file_hash(full_path)
            or clean.get('scopedReportSha256') != file_hash(scoped_path)
            or clean.get('fullReportSha256') != file_hash(full_path)
            or scoped.get('ok') is not True or scoped.get('mutationTest') is not False
            or full.get('ok') is not True or full.get('mutationTest') is not False or not full.get('frozen')):
        problems.append('Speaking mutation clean controls are incomplete, stale, or mutation-mode')
    production_hash = file_hash(production_report_path) if os.path.isfile(production_report_path) else ''
    if (summary.get('productionReportSha256') != production_hash
            or summary.get('fullReportSha256') != production_hash
            or file_hash(full_path) != production_hash):
        problems.append('Speaking full clean control is not byte-identical to production render evidence')
    if speaking_verifier_failures(full, 0, '', provenance):
        problems.append('Speaking mutation full clean control fails the production report schema')
    return problems


def research_mutation_evidence_problems(test_report, provenance):
    """Bind Research plants to the contract-derived case list and complete immutable input closure."""
    problems = []
    summary = test_report.get('research_mutations') or {}
    report_path = os.path.join(OUT, 'research-mutations.json')
    scoped_path = os.path.join(OUT, 'research-mutations.scoped-clean.json')
    full_path = os.path.join(OUT, 'research-mutations.full-clean.json')
    production_path = os.path.join(OUT, 'research-verifier.json')
    runner_path = os.path.join(ROOT, 'site/_build/verify-research-mutations.py')
    verifier_path = os.path.join(ROOT, 'site/_build/verify-research.mjs')
    proof_path = os.path.join(RUBRIC, 'research-proof-contract.json')
    authority_path = os.path.join(RUBRIC, 'authority/research-evidence-contract.json')
    figure_path = os.path.join(RUBRIC, 'sources/drone-megaddon-figure-assets.json')
    try:
        aggregate = json.load(open(report_path))
        scoped = json.load(open(scoped_path))
        full = json.load(open(full_path))
        proof = json.load(open(proof_path))
    except (OSError, json.JSONDecodeError) as error:
        return [f'Research mutation evidence is missing or unreadable: {error}']
    case_ids = proof['mutationSuite']['caseIds']
    expected_count = len(case_ids)
    actual_ids = [item.get('id') for item in aggregate.get('results', [])]
    expected_primary = {
        'runnerSha256': file_hash(runner_path),
        'verifierSha256': file_hash(verifier_path),
        'proofContractSha256': file_hash(proof_path),
        'authorityContractSha256': file_hash(authority_path),
        'figureManifestSha256': file_hash(figure_path),
        'scoreSha256': file_hash(os.path.join(RUBRIC, 'score.py')),
        'testSha256': file_hash(os.path.join(RUBRIC, 'test.py')),
        'productionReportSha256': file_hash(production_path),
        'candidateProvenanceSha256': file_hash(os.path.join(CANDIDATE, '.site-provenance.json')),
        'candidateTreeSha256': tree_hash(CANDIDATE),
        'siteSourceTreeSha256': tree_hash(os.path.join(ROOT, 'site')),
        'caseIdsSha256': EXPECTED_RESEARCH_CASE_IDS_SHA256,
        'expectedMappingSha256': EXPECTED_RESEARCH_CASE_MAPPING_SHA256,
        'repoInputPathsSha256': EXPECTED_RESEARCH_DEPENDENCY_PATHS_SHA256,
    }
    start, end = aggregate.get('inputHashesStart') or {}, aggregate.get('inputHashesEnd') or {}
    repo_inputs = start.get('repoInputHashes') or {}
    problems.extend(research_oracle_digest_problems(aggregate, case_ids, repo_inputs))
    for key in ('caseIdsSha256', 'expectedMappingSha256', 'repoInputPathsSha256'):
        tampered = json.loads(json.dumps(aggregate))
        tampered[key] = '0' * 64
        if not research_oracle_digest_problems(tampered, case_ids, repo_inputs):
            problems.append(f'Research score oracle accepted a tampered {key}')
    if (summary.get('ok') is not True or summary.get('returnCode') != 0
            or summary.get('caseIds') != case_ids or summary.get('attempted') != expected_count
            or summary.get('planted') != expected_count or summary.get('caught') != expected_count
            or summary.get('inputHashesStable') is not True
            or summary.get('resultsSha256') != aggregate.get('resultsSha256')
            or summary.get('caseIdsSha256') != EXPECTED_RESEARCH_CASE_IDS_SHA256
            or summary.get('expectedMappingSha256') != EXPECTED_RESEARCH_CASE_MAPPING_SHA256
            or summary.get('repoInputPathsSha256') != EXPECTED_RESEARCH_DEPENDENCY_PATHS_SHA256
            or summary.get('scoreSha256') != expected_primary['scoreSha256']
            or summary.get('testSha256') != expected_primary['testSha256']
            or summary.get('productionReportSha256') != expected_primary['productionReportSha256']):
        problems.append('test.py did not bind the exact contract-derived Research mutation case set')
    if (aggregate.get('ok') is not True or aggregate.get('expectedCount') != expected_count
            or aggregate.get('attempted') != expected_count or aggregate.get('planted') != expected_count
            or aggregate.get('caught') != expected_count or aggregate.get('plantErrors')
            or actual_ids != case_ids or len(set(actual_ids)) != expected_count
            or aggregate.get('inputHashesStable') is not True
            or aggregate.get('snapshotMatchesGovernedStart') is not True):
        problems.append('Research mutation aggregate counts, ordering, plants, or snapshot invariants changed')
    if (start != end or any(start.get(key) != value for key, value in expected_primary.items())
            or any(aggregate.get(key) != start.get(key) for key in start)
            or start.get('repoInputCount') != len(repo_inputs)
            or summary.get('repoInputCount') != len(repo_inputs) or summary.get('repoInputHashes') != repo_inputs):
        problems.append('Research mutation evidence is stale or its complete verifier input closure changed')
    for relative, expected in repo_inputs.items():
        path = os.path.abspath(os.path.join(ROOT, *relative.split('/')))
        if not path.startswith(os.path.abspath(ROOT) + os.sep) or not os.path.isfile(path) or file_hash(path) != expected:
            problems.append(f'Research mutation dependency changed: {relative}')
            break
    problems.extend(research_result_schema_problems(aggregate, case_ids))
    if not research_result_schema_self_test(aggregate, case_ids):
        problems.append('Research mutation score schema accepted a causal result tamper plant')
    clean = aggregate.get('cleanControl') or {}
    if (summary.get('reportPath') != os.path.relpath(report_path, ROOT)
            or summary.get('reportSha256') != file_hash(report_path)
            or summary.get('scopedReportSha256') != file_hash(scoped_path)
            or summary.get('fullReportSha256') != file_hash(full_path)
            or clean.get('scopedReportSha256') != file_hash(scoped_path)
            or clean.get('fullReportSha256') != file_hash(full_path)
            or scoped.get('ok') is not True or scoped.get('mutationTest') is not False
            or full.get('ok') is not True or full.get('mutationTest') is not False or not full.get('frozen')):
        problems.append('Research mutation clean controls are incomplete, stale, or mutation-mode')
    production_hash = file_hash(production_path) if os.path.isfile(production_path) else ''
    if (summary.get('productionReportSha256') != production_hash
            or summary.get('fullReportSha256') != production_hash
            or file_hash(full_path) != production_hash):
        problems.append('Research full clean control is not byte-identical to production render evidence')
    if research_verifier_failures(full, 0, '', provenance):
        problems.append('Research mutation full clean control fails the production report schema')
    return problems

def quoted_attr_values(path, name):
    """Read exact double-quoted HTML attributes with plain string scans."""
    text = open(path).read()
    key = name + '="'
    values, at = [], 0
    while True:
        start = text.find(key, at)
        if start < 0:
            return values
        start += len(key)
        end = text.find('"', start)
        if end < 0:
            return values
        values.append(text[start:end])
        at = end + 1

def verify_review():
    problems = [f'{check}: {message}' for check, message in rubric_gate.project_failures()]
    problems.extend(f"{item['check']}: {item['msg']}" for item in authority_gate.failures())
    def load(name):
        path = os.path.join(OUT, name)
        try:
            return json.load(open(path)), path
        except (OSError, json.JSONDecodeError) as e:
            problems.append(f'F28: {name} is missing or unreadable: {e}')
            return {}, path
    score, _ = load('score.json')
    manifest, manifest_path = load('visual-manifest.json')
    review, review_path = load('visual-review.json')
    content_review, content_review_path = load('content-review.json')
    gate_review, gate_review_path = load('gate-review.json')
    provenance_path = os.path.join(CANDIDATE, '.site-provenance.json')
    try:
        provenance = json.load(open(provenance_path))
    except (OSError, json.JSONDecodeError) as e:
        provenance = {}
        problems.append(f'P5: artifact provenance is missing or unreadable: {e}')
    if score.get('pct') != 100:
        problems.append(f'G34: automated score is {score.get("pct", 0)}%, not 100%')
    if score.get('governedHash') != rubric_gate.governed_hash():
        problems.append('G34: automated score is stale for the governed repository files')
    for key in ('baselineId', 'sourceHash', 'artifactHash'):
        if manifest.get(key) != provenance.get(key) or score.get(key) != provenance.get(key):
            problems.append(f'P6: score, screenshots and artifact do not share {key}')
        if review.get(key) != manifest.get(key):
            problems.append(f'P6: visual review is not bound to manifest {key}')
    if review.get('manifestSha256') != (file_hash(manifest_path) if os.path.exists(manifest_path) else ''):
        problems.append('F28: visual review is not bound to the exact manifest bytes')
    if review.get('reviewer') != 'visual-release-reviewer' or review.get('overall') != 'pass':
        problems.append('F28: visual release reviewer did not pass the exact artifact')
    problems.extend('F28: ' + problem for problem in review_gate.verify('content-review.json', 'content-preservation-reviewer'))
    problems.extend('F28: ' + problem for problem in design_gate.verify())
    problems.extend('F28: ' + problem for problem in review_gate.verify('gate-review.json', 'gate-integrity-reviewer'))
    frames = manifest.get('frames') or []
    reviewed = {frame.get('file'): frame for frame in review.get('frames') or []}
    state_keys = sorted(set(quoted_attr_values(os.path.join(CANDIDATE, 'career.html'), 'data-go')))
    state_frames = [frame for frame in frames if frame.get('page') == 'career' and frame.get('stateKey') != 'default']
    expected_total = 70 + 4 * len(state_keys)
    if manifest.get('baseFrameCount') != 70 or len(frames) != expected_total or len(reviewed) != len(frames):
        problems.append(f'F28: expected 70 baseline frames plus four frames for each of {len(state_keys)} Career stations ({expected_total} total); found {len(frames)} manifest and {len(reviewed)} reviewed frames')
    for state_key in state_keys:
        variants = {(frame.get('width'), frame.get('theme')) for frame in state_frames if frame.get('stateKey') == state_key}
        if variants != {(375, 'light'), (375, 'dark'), (1440, 'light'), (1440, 'dark')}:
            problems.append(f'F28: Career station {state_key} lacks exact mobile/desktop light/dark coverage')
    unknown_states = sorted({frame.get('stateKey') for frame in state_frames if frame.get('stateKey') not in state_keys})
    if unknown_states:
        problems.append(f'F28: manifest contains Career states not present in the artifact: {unknown_states}')
    observations = []
    for frame in frames:
        verdict = reviewed.get(frame.get('file'))
        if not verdict:
            problems.append(f'F28: unreviewed frame {frame.get("file")}')
            continue
        if verdict.get('sha256') != frame.get('sha256') or verdict.get('verdict') != 'pass':
            problems.append(f'F28: frame is stale or failed: {frame.get("file")}')
        observation = str(verdict.get('observation', '')).strip()
        if len(observation) < 12:
            problems.append(f'F28: frame lacks a specific observation: {frame.get("file")}')
        observations.append(observation)
    if observations and len(set(observations)) < int(len(observations) * 0.7):
        problems.append('F28: visual observations are templated rather than frame-specific')
    if problems:
        state_machine.main(['lock', 'VISUAL_PASS'])
        print('\n'.join(problems))
        return 1
    state_machine.main(['pass', 'CONTENT_PASS', content_review_path])
    state_machine.main(['pass', 'DESIGN_PASS', os.path.join(OUT, 'design-review.json')])
    state_machine.main(['pass', 'GATE_PASS', gate_review_path])
    state_machine.main(['pass', 'VISUAL_PASS', review_path])
    lock = {
        'state': 'RELEASED',
        'baselineId': provenance['baselineId'],
        'sourceHash': provenance['sourceHash'],
        'artifactHash': provenance['artifactHash'],
        'governedHash': score['governedHash'],
        'authorityManifestSha256': file_hash(os.path.join(RUBRIC, 'authority.json')),
        'packageLockSha256': file_hash(os.path.join(ROOT, 'package-lock.json')),
        'visualManifestSha256': file_hash(manifest_path),
        'visualReviewSha256': file_hash(review_path),
        'releasedAt': time.time(),
    }
    dist = os.path.join(ROOT, 'dist')
    staged = os.path.join(ROOT, '.dist-release-' + str(os.getpid()))
    previous = os.path.join(ROOT, '.dist-previous-' + str(os.getpid()))
    if os.path.exists(staged):
        shutil.rmtree(staged)
    shutil.copytree(CANDIDATE, staged)
    if os.path.exists(dist):
        os.replace(dist, previous)
    try:
        os.replace(staged, dist)
    except Exception:
        if os.path.exists(previous):
            os.replace(previous, dist)
        raise
    if os.path.exists(previous):
        shutil.rmtree(previous)
    with open(os.path.join(RUBRIC, 'release-lock.json'), 'w') as stream:
        json.dump(lock, stream, indent=2)
        stream.write('\n')
    state_machine.main(['pass', 'RELEASED', os.path.join(RUBRIC, 'release-lock.json')])
    print(f'RELEASED: {len(frames)} exact Transit frames passed automated and visual review')
    return 0

def deploy_check():
    """Fail closed unless this deterministic build is the exact visually approved Transit artifact."""
    problems = [f'{check}: {message}' for check, message in rubric_gate.project_failures()]
    problems.extend(f"{item['check']}: {item['msg']}" for item in authority_gate.failures())
    provenance_path = os.path.join(ROOT, 'dist', '.site-provenance.json')
    lock_path = os.path.join(RUBRIC, 'release-lock.json')
    try:
        provenance = json.load(open(provenance_path))
    except (OSError, json.JSONDecodeError) as e:
        provenance = {}
        problems.append(f'P5: deployable artifact has no readable provenance: {e}')
    try:
        lock = json.load(open(lock_path))
    except (OSError, json.JSONDecodeError) as e:
        lock = {}
        problems.append(f'G34: no readable release lock exists: {e}')
    marker_path = os.path.join(ROOT, 'site', '.baseline.json')
    marker = json.load(open(marker_path)) if os.path.exists(marker_path) else {}
    if provenance.get('baselineId') != marker.get('id') or provenance.get('sourceRoot') != 'site':
        problems.append('P5: deployable artifact does not identify the accepted design at site/')
    if os.path.isdir(os.path.join(ROOT, 'site')) and provenance.get('sourceHash') != tree_hash(os.path.join(ROOT, 'site')):
        problems.append('P5: site source changed after the deployable artifact was built')
    if os.path.isdir(os.path.join(ROOT, 'dist')) and provenance.get('artifactHash') != tree_hash(os.path.join(ROOT, 'dist'), ('.site-provenance.json',)):
        problems.append('P5: deployable artifact bytes do not match their provenance')
    for key in ('baselineId', 'sourceHash', 'artifactHash'):
        if not lock.get(key) or lock.get(key) != provenance.get(key):
            problems.append(f'G34: release lock is missing or stale for {key}')
    if lock.get('authorityManifestSha256') != file_hash(os.path.join(RUBRIC, 'authority.json')):
        problems.append('G34: release lock is stale for the authority manifest')
    if lock.get('packageLockSha256') != file_hash(os.path.join(ROOT, 'package-lock.json')):
        problems.append('G34: release lock is stale for the dependency lock')
    for key in ('visualManifestSha256', 'visualReviewSha256'):
        value = lock.get(key)
        if not isinstance(value, str) or len(value) != 64 or not all(ch in '0123456789abcdef' for ch in value):
            problems.append(f'G34: release lock has no valid {key}')
    if lock.get('state') != 'RELEASED':
        problems.append('G34: exact artifact has not reached RELEASED')
    current_governed_hash = rubric_gate.governed_hash()
    if lock.get('governedHash') != current_governed_hash:
        problems.append('G34: release lock is stale for the governed repository files')
    problems.extend(f"{item['check']}: {item['msg']}" for item in product_gate.failures(os.path.join(ROOT, 'dist')))
    if problems:
        print('\n'.join(problems))
        return 1
    print('deployable: exact Transit artifact is hash-bound to its visual release')
    return 0

def deploy_build():
    """Rebuild the reviewed artifact from a fresh checkout, then promote it only when every locked hash matches."""
    problems = [f'{check}: {message}' for check, message in rubric_gate.project_failures()]
    problems.extend(f"{item['check']}: {item['msg']}" for item in authority_gate.failures())
    lock_path = os.path.join(RUBRIC, 'release-lock.json')
    try:
        lock = json.load(open(lock_path))
    except (OSError, json.JSONDecodeError) as error:
        lock = {}
        problems.append(f'G34: no readable release lock exists: {error}')
    if problems:
        print('\n'.join(problems))
        return 1
    os.makedirs(OUT, exist_ok=True)
    if os.path.isdir(CANDIDATE):
        shutil.rmtree(CANDIDATE)
    build_env = dict(os.environ)
    build_env['RUBRIC_PIPELINE'] = '1'
    built = subprocess.run(
        [sys.executable, os.path.join(ROOT, 'site/_build/build.py'), '--candidate'],
        capture_output=True,
        text=True,
        timeout=180,
        env=build_env,
    )
    if built.returncode != 0:
        print('F26: fresh-checkout candidate build failed\n' + built.stdout[-500:] + built.stderr[-500:])
        return 1
    provenance_path = os.path.join(CANDIDATE, '.site-provenance.json')
    try:
        provenance = json.load(open(provenance_path))
    except (OSError, json.JSONDecodeError) as error:
        print(f'P5: fresh-checkout candidate has no valid provenance: {error}')
        return 1
    for key in ('baselineId', 'sourceHash', 'artifactHash'):
        if not lock.get(key) or lock.get(key) != provenance.get(key):
            problems.append(f'G34: fresh-checkout candidate differs from the reviewed release for {key}')
    if lock.get('governedHash') != rubric_gate.governed_hash():
        problems.append('G34: fresh-checkout governed files differ from the reviewed release')
    if lock.get('authorityManifestSha256') != file_hash(os.path.join(RUBRIC, 'authority.json')):
        problems.append('G34: fresh-checkout authority differs from the reviewed release')
    if lock.get('packageLockSha256') != file_hash(os.path.join(ROOT, 'package-lock.json')):
        problems.append('G34: fresh-checkout dependency lock differs from the reviewed release')
    problems.extend(f"{item['check']}: {item['msg']}" for item in product_gate.failures(CANDIDATE))
    if problems:
        print('\n'.join(problems))
        return 1
    dist = os.path.join(ROOT, 'dist')
    staged = os.path.join(ROOT, '.dist-deploy-' + str(os.getpid()))
    previous = os.path.join(ROOT, '.dist-deploy-previous-' + str(os.getpid()))
    if os.path.exists(staged):
        shutil.rmtree(staged)
    shutil.copytree(CANDIDATE, staged)
    if os.path.exists(dist):
        os.replace(dist, previous)
    try:
        os.replace(staged, dist)
    except Exception:
        if os.path.exists(previous):
            os.replace(previous, dist)
        raise
    if os.path.exists(previous):
        shutil.rmtree(previous)
    return deploy_check()

def main(argv):
    if '--deploy-build' in argv:
        return deploy_build()
    if '--deploy-check' in argv:
        return deploy_check()
    if '--verify-review' in argv:
        return verify_review()
    fast = '--fast' in argv
    os.makedirs(OUT, exist_ok=True)
    state_machine.main(['dirty'])
    t0 = time.time()
    if os.path.isdir(CANDIDATE):
        shutil.rmtree(CANDIDATE)
    build_env = dict(os.environ); build_env['RUBRIC_PIPELINE'] = '1'
    built = subprocess.run([sys.executable, os.path.join(ROOT, 'site/_build/build.py'), '--candidate'], capture_output=True, text=True, timeout=120, env=build_env)
    fails = list(authority_gate.failures())
    fails += [{'check': check, 'page': '-', 'where': 'project', 'msg': message, 'src': 'project'}
              for check, message in rubric_gate.project_failures()]
    if built.returncode != 0:
        fails.append({'check': 'F26', 'page': '-', 'where': 'build', 'msg': built.stderr[-500:], 'src': 'build'})
    else:
        fails += [dict(f, src='guard') for f in guard.Run(CANDIDATE).run()]
        fails += product_gate.failures(CANDIDATE)
        state_machine.main(['built'])
    nr = subprocess.run([sys.executable, os.path.join(RUBRIC, 'noregex.py')], capture_output=True, text=True, timeout=120)
    if nr.returncode != 0:
        fails.append({'check': 'R0', 'page': '-', 'where': 'noregex.py', 'msg': nr.stdout[-500:] + nr.stderr[-500:], 'src': 'noregex'})
    static_fails = list(fails)
    static_evidence = os.path.join(OUT, 'static-evidence.json')
    json.dump({'sourceHash': state_machine.load().get('sourceHash'), 'artifactHash': state_machine.load().get('artifactHash'),
               'failures': static_fails}, open(static_evidence, 'w'), indent=2)
    if static_fails:
        state_machine.main(['lock', 'STATIC_PASS'])
    else:
        state_machine.main(['pass', 'STATIC_PASS', static_evidence])
    server = None
    server_log_stream = None
    server_log_path = os.path.join(OUT, 'server.log')
    if built.returncode == 0:
        server_log_stream = open(server_log_path, 'w')
        server = subprocess.Popen([sys.executable, '-m', 'http.server', '4401', '--bind', '127.0.0.1', '--directory', CANDIDATE], cwd=ROOT,
                                  stdout=subprocess.DEVNULL, stderr=server_log_stream, text=True)
        candidate_identity = json.load(open(os.path.join(CANDIDATE, '.site-provenance.json'))).get('artifactHash')
        served = {}
        for _ in range(60):
            if server.poll() is not None:
                break
            try:
                served = json.load(urllib.request.urlopen('http://127.0.0.1:4401/.site-provenance.json', timeout=1))
                if served.get('artifactHash') == candidate_identity:
                    break
            except Exception:
                pass
            time.sleep(0.1)
        if server.poll() is not None or served.get('artifactHash') != candidate_identity:
            server_log_stream.flush()
            details = open(server_log_path).read()[-500:] if server.poll() is not None else 'server did not serve the exact candidate provenance'
            fails.append({'check': 'F26', 'page': '-', 'where': 'server', 'msg': details, 'src': 'server'})
            server = None
    aj = os.path.join(OUT, 'audit.json')
    a11yj = os.path.join(OUT, 'a11y.json')
    projectsj = os.path.join(OUT, 'projects-verifier.json')
    speakingj = os.path.join(OUT, 'speaking-verifier.json')
    researchj = os.path.join(OUT, 'research-verifier.json')
    render_evidence = os.path.join(OUT, 'render-evidence.json')
    test_evidence = os.path.join(OUT, 'test.json')
    speaking_mutation_evidence = os.path.join(OUT, 'speaking-mutations.json')
    speaking_mutation_scoped = os.path.join(OUT, 'speaking-mutations.scoped-clean.json')
    speaking_mutation_full = os.path.join(OUT, 'speaking-mutations.full-clean.json')
    research_mutation_evidence = os.path.join(OUT, 'research-mutations.json')
    research_mutation_scoped = os.path.join(OUT, 'research-mutations.scoped-clean.json')
    research_mutation_full = os.path.join(OUT, 'research-mutations.full-clean.json')
    manifest_evidence = os.path.join(OUT, 'visual-manifest.json')
    for stale in (aj, a11yj, projectsj, speakingj, researchj, render_evidence, test_evidence,
                  speaking_mutation_evidence, speaking_mutation_scoped, speaking_mutation_full,
                  research_mutation_evidence, research_mutation_scoped, research_mutation_full,
                  manifest_evidence):
        if os.path.exists(stale):
            os.remove(stale)
    phase_started = {}
    phase_seconds = {}
    a_process = None
    a11y_process = None
    projects_process = None
    speaking_process = None
    speaking_report = {}
    research_process = None
    research_report = {}
    s_process = None
    speaking_mutation_process = None
    research_mutation_process = None
    tr_process = None
    s = None
    speaking_mutation_run = None
    research_mutation_run = None
    tr = None
    d = None
    if server:
        runtime_env = dict(os.environ)
        runtime_env['RUBRIC_BASE_URL'] = 'http://127.0.0.1:4401/'
        runtime_env['ARTIFACT_ROOT'] = CANDIDATE
        phase_started['audit'] = time.time()
        a_process = subprocess.Popen(['node', os.path.join(ROOT, 'site/_build/audit.mjs'), '--json', aj],
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=runtime_env)
    a = finish(a_process, 1800)
    if a_process:
        phase_seconds['audit'] = round(time.time() - phase_started['audit'], 1)
    try:
        audit = json.load(open(aj))
        for r in audit['results']:
            if r['lvl'] == 'FAIL':
                fails.append({'check': AUDIT_TO_RUBRIC.get(r['check'], 'F26'), 'page': r['page'].replace('style.css', '-'), 'where': f"{r['w']}px {r['check']}", 'msg': r['msg'], 'src': 'audit'})
    except (OSError, json.JSONDecodeError):
        fails.append({'check': 'F26', 'page': '-', 'where': 'audit.mjs', 'msg': 'the audit did not finish: ' + ((a.stderr[-300:] if a else 'no server')), 'src': 'audit'})
    if server:
        phase_started['projects'] = time.time()
        projects_env = dict(runtime_env)
        projects_env['PROJECTS_BASE'] = runtime_env['RUBRIC_BASE_URL']
        projects_process = subprocess.Popen(
            ['node', os.path.join(ROOT, 'site/_build/verify-projects.mjs'), '--json', projectsj],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=projects_env,
        )
    projects_run = finish(projects_process, 1800)
    if projects_process:
        phase_seconds['projects'] = round(time.time() - phase_started['projects'], 1)
    try:
        projects_report = json.load(open(projectsj))
        candidate_provenance = json.load(open(os.path.join(CANDIDATE, '.site-provenance.json')))
        fails += projects_verifier_failures(projects_report, projects_run.returncode if projects_run else 1,
                                            projects_run.stderr if projects_run else 'no server', candidate_provenance)
    except (OSError, json.JSONDecodeError) as error:
        details = projects_run.stderr[-300:] if projects_run else 'no server'
        fails.append({'check': 'F26', 'page': 'projects', 'where': 'verify-projects.mjs',
                      'msg': f'the Projects verifier did not produce readable evidence: {error}; {details}', 'src': 'projects'})
    if server:
        phase_started['speaking'] = time.time()
        speaking_env = dict(runtime_env)
        speaking_env['SPEAKING_BASE'] = runtime_env['RUBRIC_BASE_URL']
        speaking_process = subprocess.Popen(
            ['node', os.path.join(ROOT, 'site/_build/verify-speaking.mjs'), '--json', speakingj],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=speaking_env,
        )
    speaking_run = finish(speaking_process, 1800)
    if speaking_process:
        phase_seconds['speaking'] = round(time.time() - phase_started['speaking'], 1)
    try:
        speaking_report = json.load(open(speakingj))
        candidate_provenance = json.load(open(os.path.join(CANDIDATE, '.site-provenance.json')))
        speaking_failures = speaking_verifier_failures(
            speaking_report, speaking_run.returncode if speaking_run else 1,
            speaking_run.stderr if speaking_run else 'no server', candidate_provenance,
        )
        fails += speaking_failures
        if not speaking_failures:
            mutation_mode_probe = dict(speaking_report)
            mutation_mode_probe['mutationTest'] = True
            probe_failures = speaking_verifier_failures(mutation_mode_probe, 0, '', candidate_provenance)
            if (len(probe_failures) != 1 or probe_failures[0].get('where') != 'verify-speaking.mjs mode'
                    or 'cannot satisfy' not in probe_failures[0].get('msg', '')):
                fails.append({'check': 'F26', 'page': 'speaking', 'where': 'verify-speaking.mjs score schema',
                              'msg': 'production score accepted a mutation-mode Speaking report', 'src': 'speaking'})
    except (OSError, json.JSONDecodeError) as error:
        details = speaking_run.stderr[-300:] if speaking_run else 'no server'
        fails.append({'check': 'F26', 'page': 'speaking', 'where': 'verify-speaking.mjs',
                      'msg': f'the Speaking verifier did not produce readable evidence: {error}; {details}', 'src': 'speaking'})
    if server:
        phase_started['research'] = time.time()
        research_env = dict(runtime_env)
        research_env['RESEARCH_BASE'] = runtime_env['RUBRIC_BASE_URL']
        research_process = subprocess.Popen(
            ['node', os.path.join(ROOT, 'site/_build/verify-research.mjs'), '--json', researchj],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=research_env,
        )
    research_run = finish(research_process, 1800)
    if research_process:
        phase_seconds['research'] = round(time.time() - phase_started['research'], 1)
    try:
        research_report = json.load(open(researchj))
        candidate_provenance = json.load(open(os.path.join(CANDIDATE, '.site-provenance.json')))
        research_failures = research_verifier_failures(
            research_report, research_run.returncode if research_run else 1,
            research_run.stderr if research_run else 'no server', candidate_provenance,
        )
        fails += research_failures
        if not research_failures:
            mutation_probe = dict(research_report)
            mutation_probe['mutationTest'] = True
            probe_failures = research_verifier_failures(mutation_probe, 0, '', candidate_provenance)
            if len(probe_failures) != 1 or probe_failures[0].get('where') != 'verify-research.mjs mode':
                fails.append({'check': 'F26', 'page': 'research', 'where': 'verify-research.mjs score schema',
                              'msg': 'production score accepted mutation-mode Research evidence', 'src': 'research'})
        for field in ('interactionHits', 'focusIndicators'):
            tampered = json.loads(json.dumps(research_report))
            tampered['contexts'][0][field] = tampered['contexts'][0][field][:-1]
            tamper_failures = research_verifier_failures(tampered, 0, '', candidate_provenance)
            if len(tamper_failures) != 1 or tamper_failures[0].get('where') != 'verify-research.mjs runtime evidence':
                fails.append({'check': 'F26', 'page': 'research', 'where': 'verify-research.mjs score schema',
                              'msg': f'production score accepted deleted Research {field} evidence', 'src': 'research'})
        focus_outcome_tamper = json.loads(json.dumps(research_report))
        focus_outcome_tamper['contexts'][0]['focusIndicators'][0]['pixelDelta'] = False
        focus_outcome_failures = research_verifier_failures(focus_outcome_tamper, 0, '', candidate_provenance)
        if len(focus_outcome_failures) != 1 or focus_outcome_failures[0].get('where') != 'verify-research.mjs runtime evidence':
            fails.append({'check': 'F26', 'page': 'research', 'where': 'verify-research.mjs score schema',
                          'msg': 'production score accepted a false Research focus-paint outcome', 'src': 'research'})
        scroll_outcome_tamper = json.loads(json.dumps(research_report))
        scroll_outcome_tamper['contexts'][0]['inputScroll']['wheel']['reachedBottom'] = False
        scroll_outcome_failures = research_verifier_failures(scroll_outcome_tamper, 0, '', candidate_provenance)
        if len(scroll_outcome_failures) != 1 or scroll_outcome_failures[0].get('where') != 'verify-research.mjs runtime evidence':
            fails.append({'check': 'F26', 'page': 'research', 'where': 'verify-research.mjs score schema',
                          'msg': 'production score accepted a false Research scroll outcome', 'src': 'research'})
        neutral_scroll_tamper = json.loads(json.dumps(research_report))
        neutral_scroll_tamper['contexts'][0]['inputScroll']['neutral'][0]['stable'] = False
        neutral_scroll_failures = research_verifier_failures(neutral_scroll_tamper, 0, '', candidate_provenance)
        if len(neutral_scroll_failures) != 1 or neutral_scroll_failures[0].get('where') != 'verify-research.mjs runtime evidence':
            fails.append({'check': 'F26', 'page': 'research', 'where': 'verify-research.mjs score schema',
                          'msg': 'production score accepted an unstable Research scroll reset', 'src': 'research'})
        wheel_ack_tamper = json.loads(json.dumps(research_report))
        wheel_ack_tamper['contexts'][0]['inputScroll']['wheelAcknowledgement']['trustedEvents'] = False
        wheel_ack_failures = research_verifier_failures(wheel_ack_tamper, 0, '', candidate_provenance)
        if len(wheel_ack_failures) != 1 or wheel_ack_failures[0].get('where') != 'verify-research.mjs runtime evidence':
            fails.append({'check': 'F26', 'page': 'research', 'where': 'verify-research.mjs score schema',
                          'msg': 'production score accepted unacknowledged Research wheel input', 'src': 'research'})
        scriptless_index = next(index for index, item in enumerate(research_report['contexts'])
                                if str(item.get('contextLabel', '')).endswith(':no-js'))
        scriptless_wheel_tamper = json.loads(json.dumps(research_report))
        scriptless_wheel_tamper['contexts'][scriptless_index]['inputScroll']['wheelAcknowledgement']['protocolDispatch'] = False
        scriptless_wheel_failures = research_verifier_failures(scriptless_wheel_tamper, 0, '', candidate_provenance)
        if len(scriptless_wheel_failures) != 1 or scriptless_wheel_failures[0].get('where') != 'verify-research.mjs runtime evidence':
            fails.append({'check': 'F26', 'page': 'research', 'where': 'verify-research.mjs score schema',
                          'msg': 'production score accepted an unacknowledged scriptless wheel dispatch', 'src': 'research'})
        scriptless_invariant_tamper = json.loads(json.dumps(research_report))
        scriptless_invariant_tamper['contexts'][scriptless_index]['inputScroll']['scriptlessInvariant']['domStable'] = False
        scriptless_invariant_failures = research_verifier_failures(scriptless_invariant_tamper, 0, '', candidate_provenance)
        if len(scriptless_invariant_failures) != 1 or scriptless_invariant_failures[0].get('where') != 'verify-research.mjs runtime evidence':
            fails.append({'check': 'F26', 'page': 'research', 'where': 'verify-research.mjs score schema',
                          'msg': 'production score accepted changed scriptless DOM authority', 'src': 'research'})
        scroll_shadow_tamper = json.loads(json.dumps(research_report))
        scroll_shadow_tamper['contexts'][0]['inputScroll']['rawY'] = 1
        scroll_shadow_failures = research_verifier_failures(scroll_shadow_tamper, 0, '', candidate_provenance)
        if len(scroll_shadow_failures) != 1 or scroll_shadow_failures[0].get('where') != 'verify-research.mjs runtime evidence':
            fails.append({'check': 'F26', 'page': 'research', 'where': 'verify-research.mjs score schema',
                          'msg': 'production score accepted a Research scroll shadow field', 'src': 'research'})
        scroll_boolean_tamper = json.loads(json.dumps(research_report))
        scroll_boolean_tamper['contexts'][0]['inputScroll']['wheel']['target'] = True
        scroll_boolean_failures = research_verifier_failures(scroll_boolean_tamper, 0, '', candidate_provenance)
        if len(scroll_boolean_failures) != 1 or scroll_boolean_failures[0].get('where') != 'verify-research.mjs runtime evidence':
            fails.append({'check': 'F26', 'page': 'research', 'where': 'verify-research.mjs score schema',
                          'msg': 'production score accepted a boolean Research scroll target', 'src': 'research'})
        focus_boolean_tamper = json.loads(json.dumps(research_report))
        focus_boolean_tamper['contexts'][0]['focusIndicators'][0]['clip']['x'] = True
        focus_boolean_failures = research_verifier_failures(focus_boolean_tamper, 0, '', candidate_provenance)
        if len(focus_boolean_failures) != 1 or focus_boolean_failures[0].get('where') != 'verify-research.mjs runtime evidence':
            fails.append({'check': 'F26', 'page': 'research', 'where': 'verify-research.mjs score schema',
                          'msg': 'production score accepted a boolean Research focus clip coordinate', 'src': 'research'})
        deep_link_tamper = json.loads(json.dumps(research_report))
        deep_link_tamper['scriptlessDeepLinks'][0]['state']['opacity'] = 0
        deep_link_failures = research_verifier_failures(deep_link_tamper, 0, '', candidate_provenance)
        if len(deep_link_failures) != 1 or deep_link_failures[0].get('where') != 'verify-research.mjs deep links':
            fails.append({'check': 'F26', 'page': 'research', 'where': 'verify-research.mjs score schema',
                          'msg': 'production score accepted tampered Research deep-link state', 'src': 'research'})
    except (OSError, json.JSONDecodeError) as error:
        details = research_run.stderr[-500:] if research_run else 'no server'
        fails.append({'check': 'F26', 'page': 'research', 'where': 'verify-research.mjs',
                      'msg': f'the Research verifier did not produce readable evidence: {error}; {details}', 'src': 'research'})
    if server:
        phase_started['a11y'] = time.time()
        a11y_process = subprocess.Popen(['node', os.path.join(RUBRIC, 'a11y.mjs'), '--json', a11yj],
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=runtime_env)
    a11y = finish(a11y_process, 1800)
    if a11y_process:
        phase_seconds['a11y'] = round(time.time() - phase_started['a11y'], 1)
    try:
        accessibility = json.load(open(a11yj))
        candidate_provenance = json.load(open(os.path.join(CANDIDATE, '.site-provenance.json')))
        contract_path = os.path.join(RUBRIC, 'a11y-contract.json')
        contract = json.load(open(contract_path))
        families = {family.get('id'): family.get('root') for family in contract.get('families', [])}
        contract_drift = (contract.get('version') != 1
                          or contract.get('routes') != [{'id': route, 'file': route + '.html'} for route in EXPECTED_A11Y_ROUTES]
                          or contract.get('viewports') != EXPECTED_A11Y_VIEWPORTS
                          or contract.get('themes') != EXPECTED_A11Y_THEMES
                          or families != EXPECTED_A11Y_FAMILIES)
        if contract_drift:
            fails.append({'check': 'F26', 'page': '-', 'where': 'a11y contract',
                          'msg': 'the accessibility state contract drifted from the release matrix', 'src': 'a11y'})
        if accessibility.get('contractVersion') != contract.get('version') or accessibility.get('contractSha256') != file_hash(contract_path):
            fails.append({'check': 'F26', 'page': '-', 'where': 'a11y.mjs contract',
                          'msg': 'accessibility evidence is not bound to the exact state contract', 'src': 'a11y'})
        for key in ('baselineId', 'sourceHash', 'artifactHash'):
            if accessibility.get(key) != candidate_provenance.get(key):
                fails.append({'check': 'F26', 'page': '-', 'where': 'a11y.mjs provenance',
                              'msg': f'accessibility evidence is stale for {key}', 'src': 'a11y'})
        expected_contexts = {(route, viewport['width'], theme) for route in EXPECTED_A11Y_ROUTES
                             for viewport in EXPECTED_A11Y_VIEWPORTS for theme in EXPECTED_A11Y_THEMES}
        default_contexts = {(context.get('page'), context.get('width'), context.get('theme'))
                            for context in accessibility.get('contexts', []) if context.get('state') == 'default'}
        if default_contexts != expected_contexts:
            fails.append({'check': 'F26', 'page': '-', 'where': 'a11y.mjs matrix',
                          'msg': f'accessibility evidence covers {len(default_contexts)} of {len(expected_contexts)} required default contexts', 'src': 'a11y'})
        for finding in accessibility.get('failures', []):
            where = f"{finding.get('width')}px {finding.get('theme')} {finding.get('state')} {finding.get('kind')}"
            fails.append({'check': 'F26', 'page': finding.get('page', '-'), 'where': where,
                          'msg': finding.get('message', 'accessibility verification failed'), 'src': 'a11y'})
        if a11y and a11y.returncode != 0 and not accessibility.get('failures'):
            fails.append({'check': 'F26', 'page': '-', 'where': 'a11y.mjs',
                          'msg': 'accessibility verifier exited without structured failures: ' + a11y.stderr[-300:], 'src': 'a11y'})
    except (OSError, json.JSONDecodeError):
        details = a11y.stderr[-300:] if a11y else 'no server'
        fails.append({'check': 'F26', 'page': '-', 'where': 'a11y.mjs', 'msg': 'the accessibility verifier did not finish: ' + details, 'src': 'a11y'})
    render_fails = [f for f in fails if f not in static_fails]
    evidence = {
        'sourceHash': state_machine.load().get('sourceHash'),
        'artifactHash': state_machine.load().get('artifactHash'),
        'auditSha256': file_hash(aj) if os.path.isfile(aj) else '',
        'a11ySha256': file_hash(a11yj) if os.path.isfile(a11yj) else '',
        'projectsVerifierSha256': file_hash(projectsj) if os.path.isfile(projectsj) else '',
        'speakingVerifierReportSha256': file_hash(speakingj) if os.path.isfile(speakingj) else '',
        'speakingVerifierSourceSha256': file_hash(os.path.join(ROOT, 'site/_build/verify-speaking.mjs')),
        'speakingProofContractSha256': file_hash(os.path.join(RUBRIC, 'speaking-proof-contract.json')),
        'speakingAuthorityContractSha256': file_hash(os.path.join(RUBRIC, 'authority/speaking-evidence-contract.json')),
        'speakingAuthorityManifestSha256': speaking_report.get('authorityManifestSha256', ''),
        'speakingFactAtomLedgerSha256': speaking_report.get('factAtomLedgerSha256', ''),
        'speakingCanonicalProofAtomLedgerSha256': speaking_report.get('canonicalProofAtomLedgerSha256', ''),
        'speakingMutationTest': speaking_report.get('mutationTest'),
        'researchVerifierReportSha256': file_hash(researchj) if os.path.isfile(researchj) else '',
        'researchVerifierSourceSha256': file_hash(os.path.join(ROOT, 'site/_build/verify-research.mjs')),
        'researchProofContractSha256': file_hash(os.path.join(RUBRIC, 'research-proof-contract.json')),
        'researchAuthorityContractSha256': file_hash(os.path.join(RUBRIC, 'authority/research-evidence-contract.json')),
        'researchFigureManifestSha256': research_report.get('figureAssetManifestSha256', ''),
        'researchMutationTest': research_report.get('mutationTest'),
        'failures': render_fails,
    }
    with open(render_evidence, 'w') as stream:
        json.dump(evidence, stream, indent=2)
        stream.write('\n')
    if not static_fails:
        if render_fails:
            state_machine.main(['lock', 'RENDER_PASS'])
        else:
            state_machine.main(['pass', 'RENDER_PASS', render_evidence])
    shots_t = 0
    if not fast:
        if server:
            d = os.path.join(OUT, 'shots', 'current')
            if os.path.isdir(d):
                shutil.rmtree(d)
            shot_env = dict(runtime_env)
            shot_env['ARTIFACT_ROOT'] = CANDIDATE
            phase_started['shots'] = time.time()
            s_process = subprocess.Popen(['node', os.path.join(RUBRIC, 'shots.mjs'), d],
                                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=shot_env)
        s = finish(s_process, 1800)
        if s_process:
            phase_seconds['shots'] = round(time.time() - phase_started['shots'], 1)
        if s and s.returncode == 0:
            shots_t = time.time()
        else:
            fails.append({'check': 'F28', 'page': '-', 'where': 'shots.mjs', 'msg': s.stderr[-300:] if s else 'no server', 'src': 'shots'})
        if server:
            phase_started['speaking_mutations'] = time.time()
            speaking_mutation_process = subprocess.Popen(
                [sys.executable, os.path.join(ROOT, 'site/_build/verify-speaking-mutations.py'),
                 '--json', speaking_mutation_evidence],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=runtime_env,
            )
        speaking_mutation_run = finish(speaking_mutation_process, 1800)
        if speaking_mutation_process:
            phase_seconds['speaking_mutations'] = round(time.time() - phase_started['speaking_mutations'], 1)
        if (not speaking_mutation_run or speaking_mutation_run.returncode != 0
                or not os.path.isfile(speaking_mutation_evidence)):
            details = speaking_mutation_run.stderr[-500:] if speaking_mutation_run else 'Speaking mutation process did not start'
            fails.append({'check': 'G34', 'page': 'speaking', 'where': 'verify-speaking-mutations.py',
                          'msg': 'Speaking mutation runner failed before test.py: ' + details, 'src': 'test'})
        if server:
            phase_started['research_mutations'] = time.time()
            research_mutation_process = subprocess.Popen(
                [sys.executable, os.path.join(ROOT, 'site/_build/verify-research-mutations.py'),
                 '--json', research_mutation_evidence],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=runtime_env,
            )
        research_mutation_run = finish(research_mutation_process, 7200)
        if research_mutation_process:
            phase_seconds['research_mutations'] = round(time.time() - phase_started['research_mutations'], 1)
        if (not research_mutation_run or research_mutation_run.returncode != 0
                or not os.path.isfile(research_mutation_evidence)):
            details = research_mutation_run.stderr[-500:] if research_mutation_run else 'Research mutation process did not start'
            fails.append({'check': 'G34', 'page': 'research', 'where': 'verify-research-mutations.py',
                          'msg': 'Research mutation runner failed before test.py: ' + details, 'src': 'test'})
        if server:
            phase_started['mutations'] = time.time()
            test_env = dict(runtime_env)
            test_env['SPEAKING_MUTATION_REPORT_PATH'] = speaking_mutation_evidence
            test_env['RESEARCH_MUTATION_REPORT_PATH'] = research_mutation_evidence
            tr_process = subprocess.Popen([sys.executable, os.path.join(RUBRIC, 'test.py')],
                                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=test_env)
        tr = finish(tr_process, 3600)
        if tr_process:
            phase_seconds['mutations'] = round(time.time() - phase_started['mutations'], 1)
        mutation_ok = False
        research_mutation_problems = []
        try:
            mutation = json.load(open(test_evidence))
            speaking_mutation_problems = speaking_mutation_evidence_problems(
                mutation, json.load(open(os.path.join(CANDIDATE, '.site-provenance.json'))), speakingj,
            )
            research_mutation_problems = research_mutation_evidence_problems(
                mutation, json.load(open(os.path.join(CANDIDATE, '.site-provenance.json'))),
            )
            mutation_ok = (speaking_mutation_run is not None and speaking_mutation_run.returncode == 0
                           and research_mutation_run is not None and research_mutation_run.returncode == 0
                           and tr is not None and tr.returncode == 0 and mutation.get('pass') is True
                           and mutation.get('plant_errors') == 0 and not mutation.get('missed')
                           and mutation.get('ledger_entries') == 179 and mutation.get('executable_entries') == 166
                           and mutation.get('reviewer_attestations') == {
                               'count': 13, 'ids': EXPECTED_REVIEWER_ATTESTATION_IDS, 'status': 'reviewer-only'}
                           and mutation.get('attempted') == mutation.get('planted') == mutation.get('caught') == 166
                           and not speaking_mutation_problems and not research_mutation_problems)
        except (OSError, json.JSONDecodeError):
            mutation = {}
            speaking_mutation_problems = ['Speaking mutation evidence could not be parsed']
            research_mutation_problems = ['Research mutation evidence could not be parsed']
        if not mutation_ok:
            mutation_output = tr.stdout[-600:] if tr else 'mutation process did not start'
            fails.append({'check': 'G34', 'page': '-', 'where': 'test.py',
                          'msg': 'mutation evidence is incomplete, includes a plant error, or a detector missed: '
                                 + '; '.join(speaking_mutation_problems + research_mutation_problems)
                                 + '; ' + mutation_output, 'src': 'test'})
        if not static_fails and not render_fails:
            if not mutation_ok:
                state_machine.main(['lock', 'MUTATION_PASS'])
            else:
                state_machine.main(['pass', 'MUTATION_PASS', test_evidence])
                if not s or s.returncode != 0 or not os.path.exists(manifest_evidence):
                    state_machine.main(['lock', 'SNAPSHOTS_PASS'])
                else:
                    state_machine.main(['pass', 'SNAPSHOTS_PASS', manifest_evidence])
    else:
        fails.append({'check': 'F28', 'page': '-', 'where': '--fast', 'msg': 'fast run: no frames and no browser tests, so it cannot score 100%', 'src': 'score'})
    if server:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
    if server_log_stream:
        server_log_stream.close()
    pages = list(guard.REG['pages'])
    bad = {(f['check'], f['page']) for f in fails}
    sitewide = {f['check'] for f in fails if f['page'] in ('-', '')}
    cells = [(c, p) for c in SITE_CHECKS for p in pages]
    passing = [x for x in cells if x not in bad and x[0] not in sitewide]
    pct = int(100 * len(passing) / len(cells)) if fails else 100
    if fails and pct == 100:
        pct = 99
    by = {}
    for f in fails:
        by.setdefault(f['check'], []).append(f)
    provenance = json.load(open(os.path.join(CANDIDATE, '.site-provenance.json'))) if os.path.exists(os.path.join(CANDIDATE, '.site-provenance.json')) else {}
    json.dump({'pct': pct, 't': time.time(), 'shots_t': shots_t, 'secs': round(time.time() - t0), 'fails': len(fails),
               'baselineId': provenance.get('baselineId'), 'sourceHash': provenance.get('sourceHash'), 'artifactHash': provenance.get('artifactHash'),
               'governedHash': rubric_gate.governed_hash(),
               'phaseSeconds': phase_seconds,
               'by_check': {k: len(v) for k, v in sorted(by.items())}, 'list': fails}, open(os.path.join(OUT, 'score.json'), 'w'), indent=1)
    for f in fails[:80]:
        print(f"FAIL {f['check']} {f['page']} {f['where']}: {f['msg'][:160]}")
    print(f'\nscore {pct}%  ({len(fails)} failures: ' + ', '.join(f'{k} {len(v)}' for k, v in sorted(by.items())) + ')')
    return 0 if pct == 100 else 1

if __name__ == '__main__':
    lock = run_lock.acquire(' '.join(['score.py'] + sys.argv[1:]))
    if lock is None:
        sys.exit(73)
    try:
        sys.exit(main(sys.argv[1:]))
    finally:
        run_lock.release(lock)
