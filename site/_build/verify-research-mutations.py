#!/usr/bin/env python3
"""Clean-control-first, exactly-once causal mutations for the governed Research case list."""

from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request


ROOT = Path(__file__).resolve().parents[2]
RUBRIC = ROOT / '.claude' / 'rubric'
CANDIDATE = RUBRIC / 'out' / 'candidate'
VERIFIER = ROOT / 'site' / '_build' / 'verify-research.mjs'
RUNNER = Path(__file__).resolve()
PROOF_CONTRACT = RUBRIC / 'research-proof-contract.json'
AUTHORITY_CONTRACT = RUBRIC / 'authority' / 'research-evidence-contract.json'
FIGURE_MANIFEST = RUBRIC / 'sources' / 'drone-megaddon-figure-assets.json'
BUILDER_TRANSITION = RUBRIC / 'authority' / 'research-builder-dependency-transition.json'
READER_SOURCE_TRANSITION = RUBRIC / 'authority' / 'research-reader-source-transition.json'
CASE_RESULT_KEYS = (
    'id', 'applications', 'expectedKind', 'expectedMessage', 'returnCode',
    'caught', 'failures', 'cleanControlSha256',
)
EXPECTED_CASE_IDS_SHA256 = 'e8efff109594a220d9c015efec93fbabac57cddcbf28201a338b9b66d1d80b8b'
EXPECTED_CASE_MAPPING_SHA256 = 'aed6f6666f50c68cf88cd95cc15531f81d03a2072239c6d74ec2bdb318423537'
EXPECTED_DEPENDENCY_PATHS_SHA256 = '3b34c2a83eba49ec134018fbf41a32eb6710aa24879d0baba3080bb5a367b738'


EXPECTED = {
    'authority-contract-drift': ('authority', 'Research authority contract bytes changed'),
    'proof-contract-drift': ('contract', 'Research proof contract bytes changed'),
    'reader-source-reverse-tail-drift': ('transition', 'Research reader-source transition did not reverse'),
    'speaking-reverse-tail-drift': ('transition', 'Speaking dependency-only transition did not reverse'),
    'figure-manifest-crop-drift': ('figure-provenance', 'Research figure manifest bytes changed'),
    'native-2014-png-drift': ('figure-provenance', 'candidate native crop bytes changed'),
    'native-2026-png-drift': ('figure-provenance', 'candidate native crop bytes changed'),
    'native-2014-pdf-drift': ('figure-provenance', 'candidate source PDF bytes changed'),
    'article-order-swap': ('research-dom', 'Research article order changed'),
    'article-missing': ('research-dom', 'Research record count'),
    'article-duplicate': ('research-dom', 'Research record count'),
    'article-nested': ('research-dom', 'Research records are not four direct siblings'),
    'unknown-authority-claim': ('research-dom', 'researchAuthorityClaim changed'),
    'unit-drift': ('research-dom', 'researchUnit changed'),
    'stable-id-drift': ('research-dom', 'researchStableId changed'),
    'claim-id-drift': ('research-dom', 'researchClaimId changed'),
    'built-status-drift': ('research-dom', 'researchBuiltStatus changed'),
    'external-aria-label': ('research-dom', 'must own its exact H2 label'),
    'title-manuscript-drift': ('research-dom', 'manuscript title changed'),
    'ai-legacy-title-substitution': ('research-dom', 'manuscript title changed'),
    'subtitle-omission': ('research-dom', 'subtitle changed'),
    'author-order-swap': ('research-dom', 'accepted author order changed'),
    'status-omission': ('research-dom', 'status expected exactly one node'),
    'resume-2014-zigbee-removal': ('research-dom', 'accepted résumé atom missing: built-prototype'),
    'resume-2026-gates-removal': ('research-dom', 'accepted résumé atom missing: operator-gates'),
    'resume-who-apprenticeship-removal': ('research-dom', 'accepted résumé atom missing: apprenticeship'),
    'resume-ai-sponsor-removal': ('research-dom', 'accepted résumé atom missing: faculty-sponsor'),
    'limit-2026-proposal-removal': ('research-dom', 'protected limitation/evidence missing: proposed extension'),
    'limit-2026-results-removal': ('research-dom', 'causal limitations changed'),
    'limit-who-correlational-removal': ('research-dom', 'causal limitations changed'),
    'limit-who-single-org-removal': ('research-dom', 'causal limitations changed'),
    'limit-ai-illustrative-removal': ('research-dom', 'causal limitations changed'),
    'doi-href-drift': ('research-dom', 'DOI identity/href/bare text changed'),
    'doi-visible-prefix-drift': ('research-dom', 'DOI identity/href/bare text changed'),
    'doi-duplicate': ('research-dom', 'DOI expected exactly one node'),
    'doi-cross-owner': ('research-dom', 'DOI expected exactly one node'),
    'carousel-markers': ('research-dom', 'forbidden static/carousel state present'),
    'details-wrapper': ('research-dom', 'forbidden static/carousel state present: details'),
    'hidden-record': ('research-dom', 'forbidden static/carousel state present: [hidden]'),
    'aria-hidden-evidence': ('research-dom', 'forbidden static/carousel state present: [aria-hidden=true]'),
    'prev-next-control': ('research-dom', 'forbidden Research control present: Next'),
    'figure-owner-drift': ('research-dom', 'figure ownership/provenance changed'),
    'figure-kind-drift': ('research-dom', 'figure ownership/provenance changed'),
    'native-image-src-swap': ('research-dom', 'native image href changed'),
    'native-pdf-href-drift': ('research-dom', 'source PDF href changed'),
    'who-directed-edge-added': ('research-dom', 'global Research marker count changed for [data-diagram-edge]'),
    'who-group-label-drift': ('research-dom', 'diagram group topology changed'),
    'who-group-member-escape': ('research-dom', 'diagram group topology changed'),
    'ai-edge-reversal': ('research-dom', 'directed diagram topology changed'),
    'ai-list-order-swap': ('research-dom', 'diagram nodes changed'),
    'scriptless-target-hide': ('scriptless-deep-link', 'scriptless deep link #who-trains-the-next-senior is not static-open'),
    'visual-matrix-drift': ('visual-matrix', 'Research visual frame changed'),
    'frozen-nonresearch-html-drift': ('frozen-route', 'Frozen candidate HTML changed: services.html'),
    'shared-style-drift': ('frozen-route', 'Frozen shared candidate source changed: style.css'),
    'route-style-ownership-drift': ('research-dom', 'Research route stylesheet ownership changed'),
    'reduced-motion-clip-record': ('research-runtime', 'is clipped, masked, or filtered'),
    'scriptless-native-image-hide': ('research-runtime', '[data-research-native-figure] is not static-open and visible'),
    'target-only-summary-hide': ('scriptless-deep-link', 'scriptless deep link #ai-roi'),
    'stray-record-outside-collection': ('research-dom', 'global Research marker count changed for [data-research-record]'),
    'duplicate-collection': ('research-dom', 'Research collection expected exactly once'),
    'stray-title-outside-collection': ('research-dom', 'global Research marker count changed for [data-research-title]'),
    'stray-authors-outside-collection': ('research-dom', 'global Research marker count changed for [data-research-authors]'),
    'stray-status-outside-collection': ('research-dom', 'global Research marker count changed for [data-research-status]'),
    'stray-summary-outside-collection': ('research-dom', 'global Research marker count changed for [data-research-summary]'),
    'stray-evidence-outside-collection': ('research-dom', 'global Research marker count changed for [data-research-evidence]'),
    'stray-qualifier-outside-collection': ('research-dom', 'global Research marker count changed for [data-research-qualifier]'),
    'stray-doi-outside-collection': ('research-dom', 'global Research marker count changed for [data-research-doi]'),
    'stray-figure-outside-collection': ('research-dom', 'global Research marker count changed for [data-research-figure]'),
    'aria-expanded-state': ('research-dom', 'forbidden static/carousel state present: [aria-expanded]'),
    'aria-selected-state': ('research-dom', 'forbidden static/carousel state present: [aria-selected]'),
    'inert-interactive': ('research-dom', 'forbidden static/carousel state present: [inert]'),
    'dialog-state': ('research-dom', 'forbidden static/carousel state present: dialog'),
    'tab-role-state': ('research-dom', 'forbidden static/carousel state present: [role=tab]'),
    'link-next-control': ('research-dom', 'forbidden Research control present: nExT'),
    'unexpected-interactive-link': ('research-dom', 'Research interaction set changed'),
    'native-filter-blur': ('research-runtime', 'is clipped, masked, or filtered'),
    'native-mask': ('research-runtime', 'is clipped, masked, or filtered'),
    'native-transform-offscreen': ('research-runtime', 'is transformed or off-screen'),
    'transparent-summary-text': ('research-runtime', 'has transparent text'),
    'transparent-pointer-overlay': ('interaction', 'not the topmost actionable hit'),
    'doi-pointer-cancel': ('interaction', 'trusted pointer produced no document navigation intent'),
    'pdf-keyboard-cancel': ('interaction', 'trusted keyboard produced no document navigation intent'),
    'link-activation-runtime-error': ('runtime-error', 'emitted runtime errors during interaction activation'),
    'title-accessible-name-override': ('research-dom', 'title accessible name is overridden'),
    'link-accessible-name-override': ('research-dom', 'DOI accessible name is overridden'),
    'pdf-link-accessible-name-override': ('research-dom', 'PDF accessible name is overridden'),
    'figure-accessible-name-override': ('research-dom', 'figure accessible name is overridden'),
    'native-image-accessible-name-override': ('research-dom', 'native image accessible name is overridden'),
    'unowned-screenreader-prose': ('research-dom', 'has unowned substantive text'),
    'unowned-native-semantic-widget': ('research-dom', 'accessibility tree changed'),
    'reduced-motion-pointer-cancel': ('interaction', 'trusted pointer produced no document navigation intent'),
    'partial-pointer-overlay': ('interaction', 'not the topmost actionable hit'),
    'pointer-cancel-decoy-fetch': ('interaction', 'trusted pointer produced no document navigation intent'),
    'bare-contenteditable': ('research-dom', 'Research governed content is editable'),
    'stray-tabstop': ('interaction', 'Research sequential focus set changed'),
    'aria-busy-content-suppression': ('research-dom', 'unowned ARIA state: aria-busy'),
    'local-language-override': ('research-dom', 'Research document language or direction changed'),
    'inline-event-handler': ('research-dom', 'unowned inline event handler: onclick'),
    'focus-indicator-removal': ('interaction', 'focus indicator is missing, transparent, too thin, or low contrast'),
    'focus-indicator-transparent': ('interaction', 'focus indicator is missing, transparent, too thin, or low contrast'),
    'reduced-motion-focus-indicator-removal': ('interaction', 'focus indicator is missing, transparent, too thin, or low contrast'),
    'scriptless-focus-indicator-removal': ('interaction', 'focus indicator is missing, transparent, too thin, or low contrast'),
    'touch-scroll-lock': ('research-runtime', 'input scrolling is locked by touch-action or overflow'),
    'reset-hijack': ('research-runtime', 'Research scroll reset did not reach stable neutral top'),
    'intermittent-wheel-cancel': ('research-runtime', 'real wheel input was delivered without observed scroll progress'),
    'scriptless-wheel-protocol-stall': ('research-runtime', 'scriptless wheel input was dispatched without observed layout progress'),
    'wheel-scroll-lock': ('research-runtime', 'repeated real wheel input did not reach'),
    'keyboard-scroll-lock': ('research-runtime', 'repeated real keyboard input did not reach'),
    'transient-focus-indicator': ('interaction', 'focus indicator is transient or animated'),
    'ai-mobile-counter-label-collision': ('diagram-geometry', 'AI ROI step number overlaps its label'),
    'ai-mobile-counter-transform-collision': ('diagram-geometry', 'AI ROI ordinal geometry is transformed or zoomed'),
}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_results_sha256(results):
    payload = json.dumps(results, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
    return hashlib.sha256(payload).hexdigest()


def canonical_json_sha256(value):
    payload = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()
    return hashlib.sha256(payload).hexdigest()


def expected_mapping_rows(case_ids):
    return [[case_id, EXPECTED[case_id][0], EXPECTED[case_id][1]] for case_id in case_ids]


def tree_sha256(root):
    digest = hashlib.sha256()
    for directory, dirs, files in os.walk(root):
        dirs[:] = sorted(name for name in dirs if name != '__pycache__')
        for name in sorted(files):
            path = Path(directory) / name
            relative = path.relative_to(root).as_posix()
            digest.update(relative.encode('utf-8'))
            digest.update(path.read_bytes())
    return digest.hexdigest()


def verifier_dependency_paths():
    proof = json.loads(PROOF_CONTRACT.read_text())
    paths = {
        RUNNER.relative_to(ROOT).as_posix(),
        VERIFIER.relative_to(ROOT).as_posix(),
        PROOF_CONTRACT.relative_to(ROOT).as_posix(),
        AUTHORITY_CONTRACT.relative_to(ROOT).as_posix(),
        FIGURE_MANIFEST.relative_to(ROOT).as_posix(),
        'package.json',
        'package-lock.json',
        'site/content.json',
        '.claude/rubric/score.py',
        '.claude/rubric/test.py',
        '.claude/rubric/ledger.json',
        '.claude/rubric/rubric.md',
        '.claude/rubric/review.json',
        '.claude/rubric/registry.json',
        '.claude/rubric/guard.py',
        '.claude/rubric/rubric_gate.py',
        '.claude/rubric/noregex.py',
        '.claude/rubric/run_lock.py',
        '.claude/rubric/state_machine.py',
        '.claude/rubric/career_visual_transition_verify.py',
    }
    for record in (proof.get('authority') or {}).values():
        if record.get('path'):
            paths.add(record['path'])
    route_style = proof.get('routeStyle') or {}
    paths.update(path for path in (route_style.get('sourcePath'), route_style.get('generatedHtmlPath')) if path)
    for asset in (proof.get('figurePolicy') or {}).get('nativeAssets') or []:
        paths.update(path for path in (asset.get('pdfPath'), asset.get('imagePath')) if path)
    frozen = proof.get('frozenNonResearch') or {}
    for key in ('sharedRouteOracle', 'projectsProofContract', 'speakingProofContract'):
        if (frozen.get(key) or {}).get('path'):
            paths.add(frozen[key]['path'])
    source_transition_path = (proof.get('authority') or {}).get('sourceReviewTransition', {}).get('path')
    if source_transition_path:
        transition = json.loads((ROOT / source_transition_path).read_text())
        paths.add(transition['contractPath'])
        paths.add(transition['provenanceManifest']['path'])
    dependency_path = (proof.get('authority') or {}).get('builderDependencyTransition', {}).get('path')
    if dependency_path:
        dependency = json.loads((ROOT / dependency_path).read_text())
        paths.update(record['path'] for record in (
            dependency['builder'], dependency['careerContract'], dependency['careerVisualTransition'], dependency['authorityManifest'],
        ))
        paths.update(dependency.get('byteStableNonResearchSources') or {})
        paths.update(record['path'] for record in (dependency.get('downstream') or {}).values())
    reader_transition_path = (proof.get('authority') or {}).get('readerSourceTransition', {}).get('path')
    if reader_transition_path:
        reader_transition = json.loads((ROOT / reader_transition_path).read_text())
        paths.add(reader_transition['predecessor']['path'])
        paths.update(record['path'] for record in (reader_transition.get('factStore') or {}).values()
                     if isinstance(record, dict) and record.get('path'))
        if (reader_transition.get('regressionLedger') or {}).get('path'):
            paths.add(reader_transition['regressionLedger']['path'])
        paths.add(reader_transition['speakingProof']['path'])
        paths.update(reader_transition.get('byteStableReaderAuthority') or {})
    missing = sorted(path for path in paths if not (ROOT / path).is_file())
    if missing:
        raise RuntimeError(f'Research verifier dependency closure has missing files: {missing}')
    return sorted(paths)


def governed_hashes():
    dependency_paths = verifier_dependency_paths()
    repo_inputs = {path: sha256(ROOT / path) for path in dependency_paths}
    case_ids = json.loads(PROOF_CONTRACT.read_text())['mutationSuite']['caseIds']
    return {
        'runnerSha256': sha256(RUNNER),
        'verifierSha256': sha256(VERIFIER),
        'proofContractSha256': sha256(PROOF_CONTRACT),
        'authorityContractSha256': sha256(AUTHORITY_CONTRACT),
        'figureManifestSha256': sha256(FIGURE_MANIFEST),
        'scoreSha256': sha256(RUBRIC / 'score.py'),
        'testSha256': sha256(RUBRIC / 'test.py'),
        'productionReportSha256': sha256(RUBRIC / 'out' / 'research-verifier.json'),
        'candidateProvenanceSha256': sha256(CANDIDATE / '.site-provenance.json'),
        'candidateTreeSha256': tree_sha256(CANDIDATE),
        'siteSourceTreeSha256': tree_sha256(ROOT / 'site'),
        'repoInputHashes': repo_inputs,
        'repoInputCount': len(repo_inputs),
        'repoInputPathsSha256': canonical_json_sha256(dependency_paths),
        'caseIdsSha256': canonical_json_sha256(case_ids),
        'expectedMappingSha256': canonical_json_sha256(expected_mapping_rows(case_ids)),
    }


def free_port():
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        return probe.getsockname()[1]


def wait_for(url, process):
    for _ in range(120):
        try:
            urllib.request.urlopen(url, timeout=1).read(1)
            return
        except Exception:
            if process.poll() is not None:
                raise RuntimeError('candidate server stopped before Research verification')
            time.sleep(0.05)
    raise RuntimeError('candidate server did not become ready')


def run_candidate(candidate, report_path, mutation=False, research_only=True, overrides=None):
    port = free_port()
    process = subprocess.Popen(
        [sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', str(candidate)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, text=True,
    )
    try:
        base = f'http://127.0.0.1:{port}/'
        wait_for(base + 'research.html', process)
        command = ['node', str(VERIFIER), '--json', str(report_path)]
        if mutation:
            command.append('--mutation-test')
        if research_only:
            command.append('--research-only')
        env = {**os.environ, 'RESEARCH_BASE': base, 'ARTIFACT_ROOT': str(candidate)}
        for key, value in (overrides or {}).items():
            env[key] = str(value)
        run = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True, timeout=900)
        report = json.loads(report_path.read_text())
        return run, report
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


def replace_once(path, before, after):
    text = path.read_text()
    applications = text.count(before)
    if applications != 1:
        raise RuntimeError(f'{path.name}: plant matched {applications} times instead of exactly once: {before[:80]!r}')
    path.write_text(text.replace(before, after, 1))


def append_once(path, addition):
    text = path.read_text()
    if addition in text:
        raise RuntimeError(f'{path.name}: append plant is already present')
    path.write_text(text + addition)


def opening_tag(text, marker):
    marker_at = text.find(marker)
    if marker_at < 0:
        raise RuntimeError(f'opening-tag marker is absent: {marker}')
    start = text.rfind('<', 0, marker_at)
    end = text.find('>', marker_at)
    if start < 0 or end < 0:
        raise RuntimeError(f'opening tag is malformed around {marker}')
    return start, end + 1


def element_bounds(text, marker, tag):
    marker_at = text.find(marker)
    if marker_at < 0:
        raise RuntimeError(f'element marker is absent: {marker}')
    start = text.rfind('<' + tag, 0, marker_at + 1)
    if start < 0:
        raise RuntimeError(f'<{tag}> is absent before {marker}')
    open_end = text.find('>', start)
    if open_end < 0:
        raise RuntimeError(f'<{tag}> is unclosed around {marker}')
    depth = 1
    cursor = open_end + 1
    opening = '<' + tag
    closing = '</' + tag + '>'
    while depth:
        next_open = text.find(opening, cursor)
        next_close = text.find(closing, cursor)
        if next_close < 0:
            raise RuntimeError(f'</{tag}> is absent after {marker}')
        if next_open >= 0 and next_open < next_close:
            depth += 1
            cursor = text.find('>', next_open) + 1
        else:
            depth -= 1
            cursor = next_close + len(closing)
    return start, cursor


def record_bounds(text, claim):
    return element_bounds(text, f'data-research-authority-claim="{claim}"', 'article')


def mutate_record_open(path, claim, before, after):
    text = path.read_text()
    start, end = opening_tag(text, f'data-research-authority-claim="{claim}"')
    tag = text[start:end]
    if tag.count(before) != 1:
        raise RuntimeError(f'{claim}: opening-tag plant matched {tag.count(before)} times')
    path.write_text(text[:start] + tag.replace(before, after, 1) + text[end:])


def mutate_record_segment(path, claim, selector_marker, before, after):
    text = path.read_text()
    start, end = record_bounds(text, claim)
    segment = text[start:end]
    marker_at = segment.find(selector_marker)
    if marker_at < 0:
        raise RuntimeError(f'{claim}: segment marker absent: {selector_marker}')
    if segment.count(before) != 1:
        raise RuntimeError(f'{claim}: segment plant matched {segment.count(before)} times: {before!r}')
    path.write_text(text[:start] + segment.replace(before, after, 1) + text[end:])


def remove_element_in_record(path, claim, marker, tag):
    text = path.read_text()
    record_start, record_end = record_bounds(text, claim)
    segment = text[record_start:record_end]
    start, end = element_bounds(segment, marker, tag)
    path.write_text(text[:record_start] + segment[:start] + segment[end:] + text[record_end:])


def swap_articles(path, first_claim, second_claim):
    text = path.read_text()
    a_start, a_end = record_bounds(text, first_claim)
    b_start, b_end = record_bounds(text, second_claim)
    if not (a_end <= b_start):
        raise RuntimeError('article swap order is not deterministic')
    first = text[a_start:a_end]
    middle = text[a_end:b_start]
    second = text[b_start:b_end]
    path.write_text(text[:a_start] + second + middle + first + text[b_end:])


def move_article_inside(path, outer_claim, inner_claim):
    text = path.read_text()
    outer_start, outer_end = record_bounds(text, outer_claim)
    inner_start, inner_end = record_bounds(text, inner_claim)
    inner = text[inner_start:inner_end]
    without = text[:inner_start] + text[inner_end:]
    outer_start, outer_end = record_bounds(without, outer_claim)
    close = without.rfind('</article>', outer_start, outer_end)
    if close < 0:
        raise RuntimeError('outer article close is absent')
    path.write_text(without[:close] + inner + without[close:])


def insert_before_collection_close(path, fragment):
    text = path.read_text()
    marker = 'data-research-collection'
    start, end = element_bounds(text, marker, 'div')
    close = text.rfind('</div>', start, end)
    if close < 0:
        raise RuntimeError('Research collection close is absent')
    path.write_text(text[:close] + fragment + text[close:])


def insert_inside_collection(path, fragment):
    text = path.read_text()
    start, end = element_bounds(text, 'data-research-collection', 'div')
    close = text.rfind('</div>', start, end)
    if close < 0:
        raise RuntimeError('Research collection div close is absent')
    path.write_text(text[:close] + fragment + text[close:])


def swap_edge(path, claim, old_from, old_to):
    text = path.read_text()
    start, end = record_bounds(text, claim)
    segment = text[start:end]
    marker = f'data-edge-from="{old_from}"'
    edge_start, edge_end = opening_tag(segment, marker)
    tag = segment[edge_start:edge_end]
    from_text = f'data-edge-from="{old_from}"'
    to_text = f'data-edge-to="{old_to}"'
    if tag.count(from_text) != 1 or tag.count(to_text) != 1:
        raise RuntimeError(f'{claim}: directed edge is absent')
    tag = tag.replace(from_text, 'data-edge-from="__swap__"', 1)
    tag = tag.replace(to_text, f'data-edge-to="{old_from}"', 1)
    tag = tag.replace('data-edge-from="__swap__"', f'data-edge-from="{old_to}"', 1)
    path.write_text(text[:start] + segment[:edge_start] + tag + segment[edge_end:] + text[end:])


def swap_elements_in_record(path, claim, first_marker, second_marker, tag):
    text = path.read_text()
    start, end = record_bounds(text, claim)
    segment = text[start:end]
    first_start, first_end = element_bounds(segment, first_marker, tag)
    second_start, second_end = element_bounds(segment, second_marker, tag)
    if first_end > second_start:
        raise RuntimeError(f'{claim}: element swap order is not deterministic')
    first = segment[first_start:first_end]
    middle = segment[first_end:second_start]
    second = segment[second_start:second_end]
    mutated = segment[:first_start] + second + middle + first + segment[second_end:]
    path.write_text(text[:start] + mutated + text[end:])


def move_group_member_before_group(path, claim, member_id):
    text = path.read_text()
    start, end = record_bounds(text, claim)
    segment = text[start:end]
    group_start, group_end = element_bounds(segment, 'data-diagram-group="management-moves"', 'div')
    group = segment[group_start:group_end]
    member_start, member_end = element_bounds(group, f'data-diagram-node="{member_id}"', 'div')
    member = group[member_start:member_end]
    reduced = group[:member_start] + group[member_end:]
    mutated = segment[:group_start] + member + reduced + segment[group_end:]
    path.write_text(text[:start] + mutated + text[end:])


def insert_before_main_close(path, fragment):
    replace_once(path, '</main>', fragment + '</main>')


def change_json(path, keys, value):
    data = json.loads(path.read_text())
    node = data
    for key in keys[:-1]:
        node = node[key]
    if node[keys[-1]] == value:
        raise RuntimeError(f'{path.name}: JSON mutation is already present')
    node[keys[-1]] = value
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')


def plant(case_id, candidate, work):
    html = candidate / 'research.html'
    css = candidate / 'research.css'
    overrides = {}
    if case_id == 'authority-contract-drift':
        path = work / 'research-authority-mutant.json'
        shutil.copy2(AUTHORITY_CONTRACT, path)
        change_json(path, ['status'], 'mutated-authority')
        overrides['RESEARCH_AUTHORITY_CONTRACT'] = path
    elif case_id == 'proof-contract-drift':
        path = work / 'research-proof-mutant.json'
        shutil.copy2(PROOF_CONTRACT, path)
        change_json(path, ['status'], 'mutated-proof')
        overrides['RESEARCH_PROOF_CONTRACT'] = path
    elif case_id == 'reader-source-reverse-tail-drift':
        path = work / 'research-reader-source-transition-mutant.json'
        shutil.copy2(READER_SOURCE_TRANSITION, path)
        change_json(path, ['speakingProof', 'reverseSubstitutions', 1, 'previous'],
                    '3e615abd2c8c996af7f50dba4ef054926269798e09f59c8790ef48b102128460')
        overrides['RESEARCH_READER_SOURCE_TRANSITION'] = path
    elif case_id == 'speaking-reverse-tail-drift':
        path = work / 'research-builder-transition-mutant.json'
        shutil.copy2(BUILDER_TRANSITION, path)
        change_json(path, ['downstream', 'speakingProofContract', 'reverseSubstitutions', 9, 'previous'],
                    'dc953a53a041081ae4d491076172400eccf8178c4dda6909c56d15f2975daba0')
        overrides['RESEARCH_BUILDER_TRANSITION'] = path
    elif case_id == 'figure-manifest-crop-drift':
        path = work / 'research-figure-manifest-mutant.json'
        shutil.copy2(FIGURE_MANIFEST, path)
        change_json(path, ['assets', 0, 'figure', 'cropBoxPdfPoints', 'left'], 321)
        overrides['RESEARCH_FIGURE_MANIFEST'] = path
    elif case_id == 'native-2014-png-drift':
        (candidate / 'public/assets/research/drone-megaddon-2014-architecture.png').write_bytes(
            (candidate / 'public/assets/research/drone-megaddon-2014-architecture.png').read_bytes() + b'0')
    elif case_id == 'native-2026-png-drift':
        (candidate / 'public/assets/research/drone-megaddon-2026-language-vision-architecture.png').write_bytes(
            (candidate / 'public/assets/research/drone-megaddon-2026-language-vision-architecture.png').read_bytes() + b'0')
    elif case_id == 'native-2014-pdf-drift':
        (candidate / 'public/assets/research/drone-megaddon-2014.pdf').write_bytes(
            (candidate / 'public/assets/research/drone-megaddon-2014.pdf').read_bytes() + b'0')
    elif case_id == 'article-order-swap':
        swap_articles(html, 'research-drone-megaddon-2014', 'research-drone-megaddon-2026')
    elif case_id == 'article-missing':
        text = html.read_text(); start, end = record_bounds(text, 'research-drone-megaddon-2026'); html.write_text(text[:start] + text[end:])
    elif case_id == 'article-duplicate':
        text = html.read_text(); start, end = record_bounds(text, 'research-who-trains'); insert_inside_collection(html, text[start:end])
    elif case_id == 'article-nested':
        move_article_inside(html, 'research-drone-megaddon-2014', 'research-drone-megaddon-2026')
    elif case_id == 'unknown-authority-claim':
        mutate_record_open(html, 'research-who-trains', 'data-research-authority-claim="research-who-trains"', 'data-research-authority-claim="research-unknown"')
    elif case_id == 'unit-drift':
        mutate_record_open(html, 'research-who-trains', 'data-research-unit="who-trains"', 'data-research-unit="ai-roi"')
    elif case_id == 'stable-id-drift':
        mutate_record_open(html, 'research-who-trains', 'data-research-stable-id="doi:10.2139/ssrn.7083078"', 'data-research-stable-id="doi:10.2139/ssrn.0000000"')
    elif case_id == 'claim-id-drift':
        mutate_record_open(html, 'research-who-trains', 'data-research-claim-id="claim:62d5f06923d18b3ddea11c26"', 'data-research-claim-id="claim:000000000000000000000000"')
    elif case_id == 'built-status-drift':
        mutate_record_open(html, 'research-drone-megaddon-2026', 'data-research-built-status="proposal"', 'data-research-built-status="built-prototype"')
    elif case_id == 'external-aria-label':
        mutate_record_open(html, 'research-who-trains', 'aria-labelledby="rs-who-trains-the-next-senior-title"', 'aria-labelledby="main"')
    elif case_id == 'title-manuscript-drift':
        mutate_record_segment(html, 'research-drone-megaddon-2014', 'data-research-title', '>Drone-Megaddon<', '>Drone Swarm Project<')
    elif case_id == 'ai-legacy-title-substitution':
        mutate_record_segment(html, 'research-ai-roi', 'data-research-title', 'A Multi-Layer Framework for Evaluating the Return on Investment of AI Projects', 'A Multi-Layer Framework for Evaluating the ROI of AI Projects')
    elif case_id == 'subtitle-omission':
        remove_element_in_record(html, 'research-who-trains', 'data-research-subtitle', 'p')
    elif case_id == 'author-order-swap':
        mutate_record_segment(html, 'research-who-trains', 'data-research-authors', 'Gajendra Babu Thokala, Sairam Krishnan', 'Sairam Krishnan, Gajendra Babu Thokala')
    elif case_id == 'status-omission':
        remove_element_in_record(html, 'research-who-trains', 'data-research-status', 'p')
    elif case_id == 'resume-2014-zigbee-removal':
        mutate_record_segment(html, 'research-drone-megaddon-2014', 'data-research-evidence', 'Android, Zigbee radio, and embedded-control prototype', 'Android and embedded-control prototype')
    elif case_id == 'resume-2026-gates-removal':
        mutate_record_segment(html, 'research-drone-megaddon-2026', 'data-research-evidence', 'operator inspection gates', 'operator review')
    elif case_id == 'resume-who-apprenticeship-removal':
        mutate_record_segment(html, 'research-who-trains', 'data-research-evidence', 'deliberate apprenticeship', 'mentoring')
    elif case_id == 'resume-ai-sponsor-removal':
        mutate_record_segment(html, 'research-ai-roi', 'data-research-evidence',
                              'Wharton independent study; faculty sponsor Professor Gad Allon.',
                              'Wharton independent study; faculty sponsor removed.')
    elif case_id == 'limit-2026-proposal-removal':
        mutate_record_segment(html, 'research-drone-megaddon-2026', 'data-research-summary', 'proposed extension', 'extension')
    elif case_id == 'limit-2026-results-removal':
        mutate_record_segment(html, 'research-drone-megaddon-2026', 'data-research-qualifier', 'no quantitative results from a deployed 2026 system', 'architecture discussion')
    elif case_id == 'limit-who-correlational-removal':
        mutate_record_segment(html, 'research-who-trains', 'data-research-qualifier', 'correlational rather than causal', 'analysis')
    elif case_id == 'limit-who-single-org-removal':
        mutate_record_segment(html, 'research-who-trains', 'data-research-qualifier', 'single organization', 'organizations')
    elif case_id == 'limit-ai-illustrative-removal':
        mutate_record_segment(html, 'research-ai-roi', 'data-research-qualifier', 'illustrative validation, not empirical validation', 'validation')
    elif case_id == 'doi-href-drift':
        mutate_record_segment(html, 'research-who-trains', 'data-research-doi', 'href="https://doi.org/10.2139/ssrn.7083078"', 'href="https://doi.org/10.2139/ssrn.0000000"')
    elif case_id == 'doi-visible-prefix-drift':
        mutate_record_segment(html, 'research-who-trains', 'data-research-doi', '>10.2139/ssrn.7083078<', '>doi:10.2139/ssrn.7083078<')
    elif case_id == 'doi-duplicate':
        text = html.read_text(); start, end = record_bounds(text, 'research-who-trains'); segment = text[start:end]; a, b = element_bounds(segment, 'data-research-doi', 'a'); html.write_text(text[:start] + segment[:b] + segment[a:b] + segment[b:] + text[end:])
    elif case_id == 'doi-cross-owner':
        text = html.read_text(); start, end = record_bounds(text, 'research-drone-megaddon-2014'); segment = text[start:end]; a, b = element_bounds(segment, 'data-research-doi', 'a'); link = segment[a:b]; without = text[:start] + segment[:a] + segment[b:] + text[end:]; target_start, target_end = record_bounds(without, 'research-who-trains'); target = without[target_start:target_end]; target_close = target.rfind('</article>'); html.write_text(without[:target_start] + target[:target_close] + link + target[target_close:] + without[target_end:])
    elif case_id == 'carousel-markers':
        insert_before_collection_close(html, '<div data-cars data-screen="1">mutation</div>')
    elif case_id == 'details-wrapper':
        insert_before_collection_close(html, '<details open><summary>Mutation</summary><p>Mutation</p></details>')
    elif case_id == 'hidden-record':
        mutate_record_open(html, 'research-who-trains', 'data-research-record', 'data-research-record hidden')
    elif case_id == 'aria-hidden-evidence':
        mutate_record_segment(html, 'research-who-trains', 'data-research-evidence',
                              '<div class="rs-evidence" data-research-evidence>',
                              '<div class="rs-evidence" data-research-evidence aria-hidden="true">')
    elif case_id == 'prev-next-control':
        insert_before_collection_close(html, '<button type="button">Next</button>')
    elif case_id == 'figure-owner-drift':
        mutate_record_segment(html, 'research-who-trains', 'data-research-figure', 'data-research-owner="who-trains"', 'data-research-owner="ai-roi"')
    elif case_id == 'figure-kind-drift':
        mutate_record_segment(html, 'research-who-trains', 'data-research-figure', 'data-figure-kind="text-derived-diagram"', 'data-figure-kind="native-pdf-crop"')
    elif case_id == 'native-image-src-swap':
        mutate_record_segment(html, 'research-drone-megaddon-2014', 'data-research-native-figure', '/public/assets/research/drone-megaddon-2014-architecture.png', '/public/assets/research/drone-megaddon-2026-language-vision-architecture.png')
    elif case_id == 'native-pdf-href-drift':
        mutate_record_segment(html, 'research-drone-megaddon-2014', 'data-research-source-pdf', '/public/assets/research/drone-megaddon-2014.pdf', '/public/assets/research/drone-megaddon-2026.pdf')
    elif case_id == 'who-directed-edge-added':
        mutate_record_segment(html, 'research-who-trains', 'data-research-figure',
                              '<figcaption data-fact-id="approved:2">',
                              '<i data-diagram-edge data-edge-from="verification-judgment-scarce" data-edge-to="smaller-reviewable-units" aria-hidden="true"></i><figcaption data-fact-id="approved:2">')
    elif case_id == 'who-group-label-drift':
        mutate_record_segment(html, 'research-who-trains', 'data-diagram-group-label',
                              '>Four management moves<', '>Four engineering moves<')
    elif case_id == 'who-group-member-escape':
        move_group_member_before_group(html, 'research-who-trains', 'smaller-reviewable-units')
    elif case_id == 'ai-edge-reversal':
        swap_edge(html, 'research-ai-roi', 'scale', 'roic')
    elif case_id == 'ai-list-order-swap':
        swap_elements_in_record(html, 'research-ai-roi', 'data-diagram-node="scale"', 'data-diagram-node="roic"', 'li')
    elif case_id == 'scriptless-target-hide':
        append_once(css, '\n@media (scripting:none){#who-trains-the-next-senior:target{display:none!important}}\n')
    elif case_id == 'visual-matrix-drift':
        append_once(css, '\nbody[data-page="research"] .research-record{padding-top:1px!important}\n')
    elif case_id == 'frozen-nonresearch-html-drift':
        append_once(candidate / 'services.html', '\n<!-- Research frozen-route mutation -->\n')
    elif case_id == 'shared-style-drift':
        append_once(candidate / 'style.css', '\n.research-shared-mutation-probe{--mutation:1}\n')
    elif case_id == 'route-style-ownership-drift':
        replace_once(html, '</head>', '<link rel="stylesheet" href="speaking.css?v=mutation"></head>')
    elif case_id == 'reduced-motion-clip-record':
        append_once(css, '\n@media (prefers-reduced-motion:reduce){#who-trains-the-next-senior{clip-path:inset(50%)!important}}\n')
    elif case_id == 'scriptless-native-image-hide':
        append_once(css, '\n@media (scripting:none){img[data-research-native-figure]{display:none!important}}\n')
    elif case_id == 'target-only-summary-hide':
        append_once(css, '\n@media (scripting:none){#ai-roi:target [data-research-summary]{display:none!important}}\n')
    elif case_id == 'stray-record-outside-collection':
        insert_before_main_close(html, '<article data-research-record></article>')
    elif case_id == 'duplicate-collection':
        insert_before_main_close(html, '<div class="research-collection" data-research-collection></div>')
    elif case_id == 'stray-title-outside-collection':
        insert_before_main_close(html, '<h2 data-research-title>Mutation</h2>')
    elif case_id == 'stray-authors-outside-collection':
        insert_before_main_close(html, '<p data-research-authors>Mutation</p>')
    elif case_id == 'stray-status-outside-collection':
        insert_before_main_close(html, '<p data-research-status>Mutation</p>')
    elif case_id == 'stray-summary-outside-collection':
        insert_before_main_close(html, '<p data-research-summary>Mutation</p>')
    elif case_id == 'stray-evidence-outside-collection':
        insert_before_main_close(html, '<p data-research-evidence>Mutation</p>')
    elif case_id == 'stray-qualifier-outside-collection':
        insert_before_main_close(html, '<p data-research-qualifier>Mutation</p>')
    elif case_id == 'stray-doi-outside-collection':
        insert_before_main_close(html, '<a data-research-doi href="https://doi.org/10.0000/mutation">10.0000/mutation</a>')
    elif case_id == 'stray-figure-outside-collection':
        insert_before_main_close(html, '<figure data-research-figure></figure>')
    elif case_id == 'aria-expanded-state':
        mutate_record_open(html, 'research-who-trains', 'data-research-record', 'data-research-record aria-expanded="false"')
    elif case_id == 'aria-selected-state':
        mutate_record_open(html, 'research-who-trains', 'data-research-record', 'data-research-record aria-selected="false"')
    elif case_id == 'inert-interactive':
        mutate_record_segment(html, 'research-who-trains', 'data-research-doi', 'data-research-doi', 'data-research-doi inert')
    elif case_id == 'dialog-state':
        insert_before_collection_close(html, '<dialog open>Mutation</dialog>')
    elif case_id == 'tab-role-state':
        mutate_record_open(html, 'research-who-trains', 'data-research-record', 'data-research-record role="tab"')
    elif case_id == 'link-next-control':
        insert_before_collection_close(html, '<a href="#ai-roi">nExT</a>')
    elif case_id == 'unexpected-interactive-link':
        insert_before_collection_close(html, '<a href="#ai-roi">Continue</a>')
    elif case_id == 'native-filter-blur':
        append_once(css, '\nimg[data-research-native-figure]{filter:blur(8px)!important}\n')
    elif case_id == 'native-mask':
        append_once(css, '\nimg[data-research-native-figure]{mask-image:linear-gradient(transparent,transparent)!important;-webkit-mask-image:linear-gradient(transparent,transparent)!important}\n')
    elif case_id == 'native-transform-offscreen':
        append_once(css, '\nimg[data-research-native-figure]{transform:translateX(-200vw)!important}\n')
    elif case_id == 'transparent-summary-text':
        append_once(css, '\n[data-research-summary]{color:rgba(0,0,0,0)!important}\n')
    elif case_id == 'transparent-pointer-overlay':
        insert_before_collection_close(html, '<span style="position:fixed;inset:0;z-index:2147483647;opacity:0;background:transparent"></span>')
    elif case_id == 'doi-pointer-cancel':
        replace_once(html, '</body>', '<script>document.querySelector(\'#who-trains-the-next-senior [data-research-doi]\').addEventListener(\'click\',event=>{if(event.detail>0)event.preventDefault()})</script></body>')
    elif case_id == 'pdf-keyboard-cancel':
        replace_once(html, '</body>', '<script>document.querySelector(\'#drone-megaddon [data-research-source-pdf]\').addEventListener(\'keydown\',event=>{if(event.key===\'Enter\')event.preventDefault()})</script></body>')
    elif case_id == 'link-activation-runtime-error':
        replace_once(html, '</body>', '<script>document.querySelector(\'#who-trains-the-next-senior [data-research-doi]\').addEventListener(\'click\',()=>{throw new Error(\'research activation mutation\')})</script></body>')
    elif case_id == 'title-accessible-name-override':
        mutate_record_segment(html, 'research-who-trains', 'data-research-title',
                              'data-research-title', 'data-research-title aria-label="Wrong research title"')
    elif case_id == 'link-accessible-name-override':
        mutate_record_segment(html, 'research-who-trains', 'data-research-doi',
                              'data-research-doi', 'data-research-doi aria-label="Wrong DOI"')
    elif case_id == 'pdf-link-accessible-name-override':
        mutate_record_segment(html, 'research-drone-megaddon-2014', 'data-research-source-pdf',
                              'data-research-source-pdf', 'data-research-source-pdf aria-label="Wrong architecture source"')
    elif case_id == 'figure-accessible-name-override':
        mutate_record_segment(html, 'research-who-trains', 'data-research-figure',
                              'data-research-figure data-figure-kind="text-derived-diagram"',
                              'data-research-figure aria-label="Wrong content" data-figure-kind="text-derived-diagram"')
    elif case_id == 'native-image-accessible-name-override':
        mutate_record_segment(html, 'research-drone-megaddon-2014', 'data-research-native-figure',
                              'data-research-native-figure', 'data-research-native-figure aria-label="Wrong architecture"')
    elif case_id == 'unowned-screenreader-prose':
        mutate_record_segment(html, 'research-who-trains', '</article>',
                              '</article>', '<p class="vh">Unsupported claim: causal productivity doubled.</p></article>')
    elif case_id == 'unowned-native-semantic-widget':
        mutate_record_segment(html, 'research-who-trains', '</article>',
                              '</article>', '<meter class="vh" min="0" max="2" value="1"></meter></article>')
    elif case_id == 'reduced-motion-pointer-cancel':
        replace_once(html, '</body>', '<script>document.querySelector(\'#who-trains-the-next-senior [data-research-doi]\').addEventListener(\'click\',event=>{if(matchMedia(\'(prefers-reduced-motion: reduce)\').matches&&event.detail>0)event.preventDefault()})</script></body>')
    elif case_id == 'partial-pointer-overlay':
        insert_before_collection_close(html, '<span style="position:fixed;left:0;top:0;bottom:0;width:10vw;z-index:2147483647;opacity:0;background:transparent"></span>')
    elif case_id == 'pointer-cancel-decoy-fetch':
        replace_once(html, '</body>', '<script>document.querySelector(\'#who-trains-the-next-senior [data-research-doi]\').addEventListener(\'click\',event=>{if(event.detail>0){event.preventDefault();fetch(event.currentTarget.href).catch(()=>{})}})</script></body>')
    elif case_id == 'bare-contenteditable':
        mutate_record_open(html, 'research-who-trains', 'data-research-record', 'data-research-record contenteditable')
    elif case_id == 'stray-tabstop':
        insert_before_collection_close(html, '<span class="vh" tabindex="0"></span>')
    elif case_id == 'aria-busy-content-suppression':
        mutate_record_open(html, 'research-who-trains', 'data-research-record', 'data-research-record aria-busy="true"')
    elif case_id == 'local-language-override':
        replace_once(html, '<html lang="en">', '<html lang="ja">')
    elif case_id == 'inline-event-handler':
        mutate_record_open(html, 'research-who-trains', 'data-research-record', 'data-research-record onclick="return true"')
    elif case_id == 'focus-indicator-removal':
        append_once(css, '\nbody[data-page="research"] a:focus-visible{outline:none!important;box-shadow:none!important}\n')
    elif case_id == 'focus-indicator-transparent':
        append_once(css, '\nbody[data-page="research"] a:focus-visible{outline-color:transparent!important}\n')
    elif case_id == 'reduced-motion-focus-indicator-removal':
        append_once(css, '\n@media (prefers-reduced-motion:reduce){body[data-page="research"] a:focus-visible{outline:none!important;box-shadow:none!important}}\n')
    elif case_id == 'scriptless-focus-indicator-removal':
        append_once(css, '\n@media (scripting:none){body[data-page="research"] a:focus-visible{outline:none!important;box-shadow:none!important}}\n')
    elif case_id == 'touch-scroll-lock':
        append_once(css, '\n[data-research-collection]{touch-action:none!important}\n')
    elif case_id == 'reset-hijack':
        replace_once(html, '</body>', '<script>(()=>{const state=window.__researchResetHijack={armed:false,queued:false,rebounds:0,exhausted:false};addEventListener(\'scroll\',()=>{const target=Math.max(0,document.documentElement.scrollHeight-innerHeight);if(!state.armed&&!state.exhausted&&target>500&&scrollY>=target-100){state.armed=true;return}if(!state.armed||state.exhausted||scrollY!==0||state.queued)return;state.queued=true;requestAnimationFrame(()=>{if(state.armed&&!state.exhausted&&scrollY===0){scrollTo(0,96);state.rebounds++;if(state.rebounds>60){state.armed=false;state.exhausted=true}}state.queued=false})},{passive:true})})()</script></body>')
    elif case_id == 'intermittent-wheel-cancel':
        replace_once(html, '</body>', '<script>(()=>{let count=0;addEventListener(\'wheel\',event=>{count++;if(count%2===1)event.preventDefault()},{passive:false})})()</script></body>')
    elif case_id == 'scriptless-wheel-protocol-stall':
        replace_once(html, '</body>', '<noscript><div class="research-scriptless-wheel-stall" style="position:fixed;left:0;top:0;width:16px;height:16px;overflow:auto;overscroll-behavior:contain;opacity:0;z-index:2147483647"><div style="height:2048px"></div></div></noscript></body>')
    elif case_id == 'wheel-scroll-lock':
        replace_once(html, '</body>', '<script>addEventListener(\'wheel\',event=>event.preventDefault(),{passive:false})</script></body>')
    elif case_id == 'keyboard-scroll-lock':
        replace_once(html, '</body>', '<script>addEventListener(\'keydown\',event=>{if(event.key===\'PageDown\'||event.key===\' \')event.preventDefault()})</script></body>')
    elif case_id == 'transient-focus-indicator':
        append_once(css, '\n@keyframes research-focus-fade{to{outline-color:transparent}}body[data-page="research"] a:focus-visible{animation:research-focus-fade 0s 1s forwards!important}\n')
    elif case_id == 'ai-mobile-counter-label-collision':
        append_once(css, '\n@media (max-width:599.98px){body[data-page="research"] .rs-layers li,body[data-page="research"] .rs-layers li:nth-child(n){min-height:76px!important}}\n')
    elif case_id == 'ai-mobile-counter-transform-collision':
        append_once(css, '\n@media (max-width:599.98px){body[data-page="research"] .rs-layers li:nth-child(2)::before{transform:translateY(24px)!important}}\n')
    else:
        raise RuntimeError(f'unknown Research mutation: {case_id}')
    return overrides


def main(argv=None):
    parser = argparse.ArgumentParser(description='Run the exact governed Research causal mutation suite.')
    parser.add_argument('--json', required=True, help='Structured report path.')
    parser.add_argument('--only', help='Run exactly one case after clean controls.')
    args = parser.parse_args(argv)
    contract = json.loads(PROOF_CONTRACT.read_text())
    case_ids = contract['mutationSuite']['caseIds']
    expected_count = len(EXPECTED)
    if len(case_ids) != expected_count or len(case_ids) != len(set(case_ids)) or set(case_ids) != set(EXPECTED):
        raise SystemExit('Research mutation contract differs from the exact unique governed case set')
    if canonical_json_sha256(case_ids) != EXPECTED_CASE_IDS_SHA256:
        raise SystemExit('Research mutation ordered case-list digest changed')
    if canonical_json_sha256(expected_mapping_rows(case_ids)) != EXPECTED_CASE_MAPPING_SHA256:
        raise SystemExit('Research mutation expected kind/message mapping digest changed')
    if canonical_json_sha256(verifier_dependency_paths()) != EXPECTED_DEPENDENCY_PATHS_SHA256:
        raise SystemExit('Research mutation ordered dependency closure changed')
    if args.only and args.only not in case_ids:
        parser.error(f'unknown Research mutation case: {args.only}')
    selected = [args.only] if args.only else case_ids
    start_hashes = governed_hashes()
    output = Path(args.json).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    published_scoped_path = RUBRIC / 'out' / 'research-mutations.scoped-clean.json'
    published_full_path = RUBRIC / 'out' / 'research-mutations.full-clean.json'
    work = Path(tempfile.mkdtemp(prefix='research-mutations-'))
    scoped_path = work / 'scoped-clean.json'
    full_path = work / 'full-clean.json'
    results = []
    plant_errors = []
    try:
        snapshot = work / 'candidate'
        shutil.copytree(CANDIDATE, snapshot)
        snapshot_tree = tree_sha256(snapshot)
        snapshot_provenance = sha256(snapshot / '.site-provenance.json')
        snapshot_matches_start = (snapshot_tree == start_hashes['candidateTreeSha256']
                                  and snapshot_provenance == start_hashes['candidateProvenanceSha256'])
        if not snapshot_matches_start:
            raise RuntimeError('Research mutation snapshot differs from the governed start candidate')
        scoped_run, scoped = run_candidate(snapshot, scoped_path, mutation=False, research_only=True)
        full_run, full = run_candidate(snapshot, full_path, mutation=False, research_only=False)
        clean = {
            'ok': scoped_run.returncode == 0 and full_run.returncode == 0 and scoped.get('ok') is True and full.get('ok') is True,
            'scopedOk': scoped.get('ok') is True,
            'fullOk': full.get('ok') is True,
            'scopedReportPath': published_scoped_path.relative_to(ROOT).as_posix(),
            'scopedReportSha256': sha256(scoped_path),
            'fullReportPath': published_full_path.relative_to(ROOT).as_posix(),
            'fullReportSha256': sha256(full_path),
        }
        if not clean['ok']:
            raise RuntimeError(f'Research clean control is red: scoped={scoped.get("failures")}, full={full.get("failures")}')
        for case_id in selected:
            case_root = work / case_id
            candidate = case_root / 'candidate'
            shutil.copytree(snapshot, candidate)
            report_path = case_root / 'report.json'
            case_root.mkdir(parents=True, exist_ok=True)
            try:
                overrides = plant(case_id, candidate, case_root)
                full_case = case_id in {'frozen-nonresearch-html-drift', 'shared-style-drift'}
                run, report = run_candidate(candidate, report_path, mutation=True, research_only=not full_case, overrides=overrides)
                failures = report.get('failures') or []
                expected_kind, expected_message = EXPECTED[case_id]
                caught = (run.returncode == 1 and report.get('ok') is False and len(failures) == 1
                          and failures[0].get('kind') == expected_kind
                          and expected_message in failures[0].get('message', ''))
                results.append({
                    'id': case_id,
                    'applications': 1,
                    'expectedKind': expected_kind,
                    'expectedMessage': expected_message,
                    'returnCode': run.returncode,
                    'caught': caught,
                    'failures': failures,
                    'cleanControlSha256': clean['fullReportSha256'] if full_case else clean['scopedReportSha256'],
                })
            except Exception as error:
                plant_errors.append({'id': case_id, 'message': str(error)})
                expected_kind, expected_message = EXPECTED[case_id]
                results.append({
                    'id': case_id,
                    'applications': 0,
                    'expectedKind': expected_kind,
                    'expectedMessage': expected_message,
                    'returnCode': -1,
                    'caught': False,
                    'failures': [],
                    'cleanControlSha256': clean['scopedReportSha256'],
                })
        end_hashes = governed_hashes()
        input_hashes_stable = start_hashes == end_hashes
        attempted = len(selected)
        planted = sum(item.get('applications') == 1 for item in results)
        caught = sum(item.get('caught') is True for item in results)
        if any(tuple(item) != CASE_RESULT_KEYS for item in results):
            raise RuntimeError('Research mutation result key order changed before canonicalization')
        report = {
            'schemaVersion': 2,
            'ok': clean['ok'] and snapshot_matches_start and input_hashes_stable
                  and not plant_errors and attempted == planted == caught,
            'expectedCount': expected_count,
            'attempted': attempted,
            'planted': planted,
            'caught': caught,
            'plantErrors': plant_errors,
            'inputHashesStart': start_hashes,
            'inputHashesEnd': end_hashes,
            'inputHashesStable': input_hashes_stable,
            'snapshotMatchesGovernedStart': snapshot_matches_start,
            'snapshotCandidateTreeSha256': snapshot_tree,
            'snapshotCandidateProvenanceSha256': snapshot_provenance,
            'cleanControl': clean,
            'results': results,
            'resultsSha256': canonical_results_sha256(results),
        }
        report.update(start_hashes)
        shutil.copy2(scoped_path, published_scoped_path)
        shutil.copy2(full_path, published_full_path)
        output.write_text(json.dumps(report, indent=2) + '\n')
        print(f'Research mutations: {caught}/{attempted} caught; plant errors {len(plant_errors)}')
        return 0 if report['ok'] else 1
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
