#!/usr/bin/env python3
"""Clean-control-first causal mutations for the governed Speaking verifier."""

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
CANDIDATE = ROOT / '.claude' / 'rubric' / 'out' / 'candidate'
VERIFIER = ROOT / 'site' / '_build' / 'verify-speaking.mjs'
PROOF_CONTRACT = ROOT / '.claude' / 'rubric' / 'speaking-proof-contract.json'
RUNNER = Path(__file__).resolve()


CASES = [
    {'id': 'mask-proof', 'file': 'speaking.css', 'append': '\n.sp2 #proof-hp-foundations{mask-image:linear-gradient(transparent,transparent)}\n', 'kind': 'proof-visibility'},
    {'id': 'opaque-pseudo', 'file': 'speaking.css', 'append': '\n.sp2 #proof-hp-foundations::after{content:"";position:absolute;inset:0;background:#000;z-index:9}\n', 'kind': 'proof-visibility'},
    {'id': 'reduced-box-shadow-pseudo', 'file': 'speaking.css', 'append': '\n@media (prefers-reduced-motion:reduce){.sp2 #proof-hp-foundations::after{content:"";position:absolute;inset:0;box-shadow:0 0 0 10000px #000;z-index:9}}\n', 'kind': 'proof-visibility'},
    {'id': 'zoom-collapse', 'file': 'speaking.css', 'append': '\n.sp2 #proof-hp-foundations{zoom:.1}\n', 'kind': 'proof-visibility'},
    {'id': 'blur-proof', 'file': 'speaking.css', 'append': '\n.sp2 #proof-hp-foundations{filter:blur(20px)}\n', 'kind': 'proof-visibility'},
    {'id': 'transparent-pointer-overlay', 'file': 'speaking.css', 'append': '\n.sp2::after{content:"";position:fixed;inset:0;z-index:99999;background:transparent;pointer-events:auto}\n', 'kind': 'link-interaction'},
    {'id': 'partial-pointer-overlay', 'file': 'speaking.css', 'append': '\n.sp2::after{content:"";position:fixed;inset:0 0 50% 0;z-index:99999;background:transparent;pointer-events:auto}\n', 'kind': 'link-interaction'},
    {'id': 'js-off-pointer-block', 'file': 'speaking.css', 'append': '\n@media (scripting:none){.sp2 a{pointer-events:none}}\n', 'kind': 'link-interaction'},
    {'id': 'target-js-off-pointer-block', 'file': 'speaking.css', 'append': '\n@media (scripting:none){.sp2:has(#hp:target) a{pointer-events:none}}\n', 'kind': 'link-interaction'},
    {'id': 'js-off-inline-name-repair', 'file': 'speaking.html', 'find': '</body>', 'with': '<button id="js-off-name-mutant" style="position:fixed;left:-9999px;top:0"></button><script>document.getElementById("js-off-name-mutant").setAttribute("aria-label","fixed")</script></body>', 'kind': 'accessibility'},
    {'id': 'target-proof-hide', 'file': 'speaking.css', 'append': '\n.sp2 #hp:target [data-speaking-proof]{display:none!important}\n', 'kind': 'visual-paint'},
    {'id': 'topics-heading-drift', 'file': 'speaking.html', 'find': '<h2 id="sp2-topics-h">Speaking topics</h2>', 'with': '<h2 id="sp2-topics-h">Talk topics</h2>', 'kind': 'heading'},
    {'id': 'hidden-session-title', 'file': 'speaking.css', 'append': '\n.sp2 [data-session-title-fact="sheet:hp:0:title"]{display:none}\n', 'kind': 'proof-visibility'},
    {'id': 'hidden-session-date', 'file': 'speaking.css', 'append': '\n.sp2 [data-session-date-fact="sheet:hp:0:date"]{display:none}\n', 'kind': 'proof-visibility'},
    {'id': 'duplicate-deck-link', 'file': 'speaking.html', 'find': '</main>', 'with': '<a href="/public/talks/knowledge-graphs/index.html">Open the deck</a></main>', 'kind': 'links'},
    {'id': 'route-selector-leak', 'file': 'speaking.css', 'append': '\nbody{outline:0}\n', 'kind': 'route-scope'},
    {'id': 'layered-route-selector-leak', 'file': 'speaking.css', 'append': '\n@layer leak{body{--speaking-leak:1}}\n', 'kind': 'route-scope'},
    {'id': 'semicolon-masked-route-leak', 'file': 'speaking.css', 'append': '\n@layer leak;body{--speaking-leak:1}\n', 'kind': 'route-scope'},
    {'id': 'global-property-leak', 'file': 'speaking.css', 'append': '\n@property --speaking-leak{syntax:"<color>";inherits:false;initial-value:red}\n', 'kind': 'route-scope'},
    {'id': 'visual-drift', 'file': 'speaking.css', 'append': '\n@media (min-width:1500px){.sp2 .sp2-hero{grid-template-columns:minmax(0,.64fr) minmax(0,1.36fr);gap:clamp(44px,7vw,112px)}}\n', 'kind': 'hero-collision'},
    {'id': 'negative-tabindex', 'file': 'speaking.html', 'find': '<a class="sp2-index__group" href="#praxtera">', 'with': '<a class="sp2-index__group" href="#praxtera" tabindex="-1">', 'kind': 'retired-interaction'},
    {'id': 'aria-disabled-link', 'file': 'speaking.html', 'find': '<a class="sp2-index__group" href="#praxtera">', 'with': '<a class="sp2-index__group" href="#praxtera" aria-disabled="true">', 'kind': 'link-interaction'},
    {'id': 'hidden-focus-indicator', 'file': 'speaking.css', 'append': '\n.sp2 a:focus{opacity:0;outline:none!important;box-shadow:none!important}\n', 'kind': 'link-interaction'},
    {'id': 'transparent-focus-outline', 'file': 'speaking.css', 'append': '\n.sp2 a:focus{outline-color:transparent!important;box-shadow:none!important}\n', 'kind': 'link-interaction'},
    {'id': 'permanent-shadow-no-outline', 'file': 'speaking.css', 'append': '\n.sp2 a[href="mailto:sairambkrishnan@gmail.com?subject=Keynote"]:focus{outline:none!important}\n', 'kind': 'link-interaction'},
    {'id': 'focus-ancestor-opacity', 'file': 'speaking.css', 'append': '\n.sp2:has(a:focus){opacity:0}\n', 'kind': 'link-interaction'},
    {'id': 'inline-cancelled-link', 'file': 'speaking.html', 'find': '<a class="sp2-index__group" href="#praxtera">', 'with': '<a class="sp2-index__group" href="#praxtera" onclick="return false">', 'kind': 'link-interaction'},
    {'id': 'external-label-spoof', 'file': 'speaking.html', 'find': '<article class="sp2-member sp2-member--hp" id="hp" data-authority-member="hp" aria-labelledby="sp2-hp-h">', 'with': '<h3 id="hp-external-spoof">HP</h3><article class="sp2-member sp2-member--hp" id="hp" data-authority-member="hp" aria-labelledby="hp-external-spoof">', 'kind': 'authority-group'},
    {'id': 'self-clipped-proof', 'file': 'speaking.css', 'append': '\n.sp2 #proof-hp-foundations{height:1px;overflow:hidden}\n', 'kind': 'proof-visibility'},
    {'id': 'hidden-group-heading', 'file': 'speaking.css', 'append': '\n.sp2 #sp2-praxtera-h{display:none}\n', 'kind': 'proof-visibility'},
    {'id': 'atos-byte-swap', 'file': 'public/assets/atos-demo-poster.webp', 'append_bytes': '00', 'kind': 'asset-bytes'},
    {'id': 'stale-provenance', 'file': '.site-provenance.json', 'json_key': 'sourceHash', 'json_value': '0' * 64, 'kind': 'candidate', 'normal': True},
    {'id': 'unobserved-artifact-drift', 'file': 'robots.txt', 'append': '\n# mutation\n', 'kind': 'candidate', 'normal': True},
    {'id': 'frozen-html-drift', 'file': 'research.html', 'append': '\n<!-- frozen route drift mutation -->\n', 'kind': 'frozen-route', 'full': True},
]

EXPECTED_MESSAGES = {
    'mask-proof': 'is masked by',
    'opaque-pseudo': 'is occluded by a pseudo-element',
    'reduced-box-shadow-pseudo': 'is occluded by a pseudo-element',
    'zoom-collapse': 'collapsed by zoom',
    'blur-proof': 'non-opacity filter',
    'transparent-pointer-overlay': 'blocked from pointer hit-testing',
    'partial-pointer-overlay': 'blocked from pointer hit-testing',
    'js-off-pointer-block': 'not actionable in the real JS-off page',
    'target-js-off-pointer-block': 'deep-link:#hp',
    'js-off-inline-name-repair': 'executable inline script inventory changed',
    'target-proof-hide': 'JS-off deep link #hp pixels changed',
    'topics-heading-drift': 'Speaking topics heading identity',
    'hidden-session-title': 'session sheet:hp:0:title title',
    'hidden-session-date': 'session sheet:hp:0:title date',
    'duplicate-deck-link': 'Atos deck link changed or duplicated',
    'route-selector-leak': 'not route-scoped: body',
    'layered-route-selector-leak': 'unsupported global at-rule: @layer leak',
    'semicolon-masked-route-leak': 'unsupported global at-rule: @layer leak',
    'global-property-leak': 'unsupported global at-rule: @property --speaking-leak',
    'visual-drift': 'hero title ink intersects',
    'negative-tabindex': 'generic interactive evidence control returned',
    'aria-disabled-link': 'not sequentially keyboard reachable',
    'hidden-focus-indicator': 'loses its visible focus indicator',
    'transparent-focus-outline': 'loses its visible focus indicator',
    'permanent-shadow-no-outline': 'loses its visible focus indicator',
    'focus-ancestor-opacity': 'loses its visible focus indicator',
    'inline-cancelled-link': 'not sequentially keyboard reachable',
    'external-label-spoof': 'must own its exact H3 label',
    'self-clipped-proof': 'is clipped by proof-hp-foundations',
    'hidden-group-heading': 'heading Praxtera AI Institute has no rendered box',
    'atos-byte-swap': 'Candidate Atos poster bytes changed',
    'stale-provenance': 'Candidate source provenance is stale',
    'unobserved-artifact-drift': 'Candidate artifact provenance is stale',
    'frozen-html-drift': 'Frozen candidate HTML changed: research.html',
}


def free_port():
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        return probe.getsockname()[1]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tree_sha256(root, omitted=()):
    digest = hashlib.sha256()
    omitted_paths = set(omitted)

    def walk(directory):
        entries = sorted(directory.iterdir(), key=lambda path: path.name)
        for path in (entry for entry in entries if entry.is_file()):
            relative = path.relative_to(root).as_posix()
            if relative in omitted_paths:
                continue
            digest.update(relative.encode('utf-8'))
            digest.update(path.read_bytes())
        for path in (entry for entry in entries if entry.is_dir() and entry.name != '__pycache__'):
            walk(path)

    walk(root)
    return digest.hexdigest()


def governed_input_hashes():
    return {
        'runnerSha256': sha256(RUNNER),
        'verifierSha256': sha256(VERIFIER),
        'proofContractSha256': sha256(PROOF_CONTRACT),
        'candidateProvenanceSha256': sha256(CANDIDATE / '.site-provenance.json'),
        'candidateTreeSha256': tree_sha256(CANDIDATE),
    }


def wait_for(url, process):
    for _ in range(100):
        try:
            urllib.request.urlopen(url, timeout=1).read(1)
            return
        except Exception:
            if process.poll() is not None:
                raise RuntimeError('candidate server stopped before verification')
            time.sleep(0.05)
    raise RuntimeError('candidate server did not become ready')


def run_candidate(candidate, report_path, mutation=True, full=False):
    port = free_port()
    process = subprocess.Popen(
        [sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', str(candidate)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, text=True,
    )
    try:
        base = f'http://127.0.0.1:{port}/'
        wait_for(base + 'speaking.html', process)
        command = ['node', str(VERIFIER), '--json', str(report_path)]
        if mutation:
            command.append('--mutation-test')
        if not full:
            command.append('--speaking-only')
        run = subprocess.run(
            command, cwd=ROOT,
            env={**os.environ, 'SPEAKING_BASE': base, 'ARTIFACT_ROOT': str(candidate)},
            capture_output=True, text=True, timeout=900 if full else 360,
        )
        report = json.loads(report_path.read_text())
        return run, report
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


def apply_case(candidate, case):
    path = candidate / case['file']
    if 'append_bytes' in case:
        before = path.read_bytes()
        path.write_bytes(before + bytes.fromhex(case['append_bytes']))
        return 1
    if 'json_key' in case:
        data = json.loads(path.read_text())
        if data.get(case['json_key']) == case['json_value']:
            raise RuntimeError(f'{case["id"]}: JSON plant already present')
        data[case['json_key']] = case['json_value']
        path.write_text(json.dumps(data, indent=2) + '\n')
        return 1
    text = path.read_text()
    if 'append' in case:
        if case['append'] in text:
            raise RuntimeError(f'{case["id"]}: append plant already present')
        path.write_text(text + case['append'])
        return 1
    applications = text.count(case['find'])
    if applications != 1:
        raise RuntimeError(f'{case["id"]}: plant matched {applications} times instead of exactly once')
    path.write_text(text.replace(case['find'], case['with'], 1))
    return applications


def nonresponding_case(work, artifact_root):
    port = free_port()
    script = (
        'import socket,threading\n'
        f's=socket.socket();s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind(("127.0.0.1",{port}));s.listen()\n'
        'gate=threading.Event()\n'
        'while True:\n c,a=s.accept();gate.wait(30)\n'
    )
    process = subprocess.Popen([sys.executable, '-c', script], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    report_path = work / 'nonresponding-server.json'
    try:
        time.sleep(0.1)
        started = time.monotonic()
        run = subprocess.run(
            ['node', str(VERIFIER), '--json', str(report_path), '--speaking-only'], cwd=ROOT,
            env={**os.environ, 'SPEAKING_BASE': f'http://127.0.0.1:{port}/', 'ARTIFACT_ROOT': str(artifact_root)},
            capture_output=True, text=True, timeout=30,
        )
        elapsed = time.monotonic() - started
        report = json.loads(report_path.read_text())
        failures = report.get('failures', [])
        expected_message = 'did not respond within 10000ms'
        hit = (len(failures) == 1 and failures[0].get('kind') == 'network-timeout'
               and expected_message in failures[0].get('message', ''))
        return {
            'id': 'nonresponding-server', 'applications': 1, 'expectedKind': 'network-timeout',
            'expectedMessage': expected_message,
            'caught': run.returncode != 0 and report.get('ok') is False and hit and elapsed < 20,
            'elapsedSeconds': round(elapsed, 3), 'reportSha256': sha256(report_path), 'failures': failures,
        }
    finally:
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()


def write_report(path, payload):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=True) + '\n')
    temporary.replace(path)


def persist_file(source, destination):
    temporary = destination.with_suffix(destination.suffix + '.tmp')
    shutil.copyfile(source, temporary)
    temporary.replace(destination)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--json', required=True)
    args = parser.parse_args()
    output = Path(args.json).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='speaking-mutations-'))
    results = []
    plant_errors = []
    input_hashes_start = governed_input_hashes()
    snapshot_candidate_tree_sha256 = ''
    snapshot_candidate_provenance_sha256 = ''
    phase = 'snapshot'
    try:
        clean_candidate = work / 'clean-candidate'
        shutil.copytree(CANDIDATE, clean_candidate)
        snapshot_candidate_tree_sha256 = tree_sha256(clean_candidate)
        snapshot_candidate_provenance_sha256 = sha256(clean_candidate / '.site-provenance.json')
        if (snapshot_candidate_tree_sha256 != input_hashes_start['candidateTreeSha256']
                or snapshot_candidate_provenance_sha256 != input_hashes_start['candidateProvenanceSha256']):
            raise RuntimeError('Candidate snapshot differs from the governed input hashes')
        clean_report_path = work / 'clean.json'
        phase = 'scoped-clean-control'
        clean_run, clean_report = run_candidate(clean_candidate, clean_report_path, mutation=False, full=False)
        scoped_clean_ok = clean_run.returncode == 0 and clean_report.get('ok') is True and clean_report.get('mutationTest') is False
        if not scoped_clean_ok:
            raise RuntimeError(f'scoped clean control is red: {clean_report!r}')
        full_clean_report_path = work / 'full-clean.json'
        phase = 'full-clean-control'
        full_clean_run, full_clean_report = run_candidate(
            clean_candidate, full_clean_report_path, mutation=False, full=True,
        )
        full_clean_ok = (full_clean_run.returncode == 0 and full_clean_report.get('ok') is True
                         and full_clean_report.get('mutationTest') is False and bool(full_clean_report.get('frozen')))
        if not full_clean_ok:
            raise RuntimeError(f'full clean control is red: {full_clean_report!r}')
        scoped_evidence_path = output.with_name(output.stem + '.scoped-clean.json')
        full_evidence_path = output.with_name(output.stem + '.full-clean.json')
        persist_file(clean_report_path, scoped_evidence_path)
        persist_file(full_clean_report_path, full_evidence_path)
        clean_ok = scoped_clean_ok and full_clean_ok
        for case in CASES:
            phase = f'mutation:{case["id"]}'
            case_root = work / case['id']
            candidate = case_root / 'candidate'
            shutil.copytree(clean_candidate, candidate)
            report_path = case_root / 'report.json'
            report_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                mutated_path = candidate / case['file']
                before_sha256 = sha256(mutated_path)
                applications = apply_case(candidate, case)
                after_sha256 = sha256(mutated_path)
                run, report = run_candidate(
                    candidate, report_path, mutation=not case.get('normal', False), full=case.get('full', False),
                )
                failures = report.get('failures', [])
                expected_message = EXPECTED_MESSAGES[case['id']]
                exact_failure = (len(failures) == 1 and failures[0].get('kind') == case['kind']
                                 and expected_message in failures[0].get('message', ''))
                results.append({
                    'id': case['id'], 'applications': applications, 'expectedKind': case['kind'],
                    'expectedMessage': expected_message,
                    'caught': applications == 1 and run.returncode != 0 and report.get('ok') is False and exact_failure,
                    'mutatedPath': case['file'], 'beforeSha256': before_sha256, 'afterSha256': after_sha256,
                    'reportSha256': sha256(report_path), 'failures': failures,
                })
            except Exception as error:
                plant_errors.append({'id': case['id'], 'message': str(error)})
        phase = 'mutation:nonresponding-server'
        results.append(nonresponding_case(work, clean_candidate))
        phase = 'input-invariant-check'
        input_hashes_end = governed_input_hashes()
        inputs_stable = input_hashes_start == input_hashes_end
        if not inputs_stable:
            plant_errors.append({
                'id': 'governed-input-race',
                'message': 'Governed verifier, runner, contract, or candidate bytes changed during the run',
            })
        passed = clean_ok and inputs_stable and not plant_errors and all(item['caught'] for item in results)
        payload = {
            **input_hashes_start,
            'inputHashesStart': input_hashes_start,
            'inputHashesEnd': input_hashes_end,
            'inputHashesStable': inputs_stable,
            'snapshotCandidateTreeSha256': snapshot_candidate_tree_sha256,
            'snapshotCandidateProvenanceSha256': snapshot_candidate_provenance_sha256,
            'ok': passed, 'cleanControl': {
                'ok': clean_ok, 'scopedOk': scoped_clean_ok, 'fullOk': full_clean_ok,
                'sourceHash': clean_report.get('sourceHash'),
                'artifactHash': clean_report.get('artifactHash'),
                'liveArtifactHash': clean_report.get('liveArtifactHash'),
                'proofContractSha256': clean_report.get('proofContractSha256'),
                'scopedReportSha256': sha256(clean_report_path),
                'fullReportSha256': sha256(full_clean_report_path),
                'scopedReportPath': str(scoped_evidence_path.relative_to(ROOT)),
                'fullReportPath': str(full_evidence_path.relative_to(ROOT)),
                'fullFrozen': full_clean_report.get('frozen'),
            },
            'attempted': len(results), 'planted': sum(item['applications'] == 1 for item in results),
            'caught': sum(item['caught'] for item in results), 'plantErrors': plant_errors, 'results': results,
        }
        write_report(output, payload)
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0 if passed else 1
    except BaseException as error:
        message = str(error) or error.__class__.__name__
        payload = {
            'ok': False,
            'phase': phase,
            'exceptionType': error.__class__.__name__,
            'inputHashesStart': input_hashes_start,
            'inputHashesEnd': governed_input_hashes(),
            'snapshotCandidateTreeSha256': snapshot_candidate_tree_sha256,
            'snapshotCandidateProvenanceSha256': snapshot_candidate_provenance_sha256,
            'cleanControl': {'ok': False},
            'plantErrors': [*plant_errors, {'id': 'harness', 'message': message}],
            'results': results,
        }
        write_report(output, payload)
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 1
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    raise SystemExit(main())
