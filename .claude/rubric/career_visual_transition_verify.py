#!/usr/bin/env python3
"""Read-only verifier for the proposed/accepted Career evidence frame transition. No regular expressions."""
import argparse
import hashlib
import json
import os
import sys

RUBRIC = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(RUBRIC))
PROPOSED = '.claude/rubric/authority/career-evidence-visual-transition.proposed.json'
FINAL = '.claude/rubric/authority/career-evidence-visual-transition.json'
ALLOWED_KEYS = {
    f'career:{width}:{theme}:{state}'
    for state in ('sig', 'amazon', 'apple')
    for theme in ('light', 'dark')
    for width in (375, 1440)
}
REVIEWED_PROPOSAL_SHA256 = 'c7bfdb558762b55a4a999f99c006d56c322a86f73ef9d2cb4b024133023b6e10'
DEPENDENCY_TRANSITION = '.claude/rubric/authority/research-builder-dependency-transition.json'


def digest_bytes(value):
    return hashlib.sha256(value).hexdigest()


def digest_file(path):
    return digest_bytes(open(path, 'rb').read())


def load(path):
    return json.load(open(path))


def key(record):
    return f'{record.get("page")}:{record.get("width")}:{record.get("theme")}:{record.get("stateKey")}'


def ordered(record):
    return (record.get('page'), record.get('stateKey'), record.get('theme'), record.get('width'))


def canonical(records):
    normalized = [{name: record[name] for name in sorted(record)} for record in sorted(records, key=ordered)]
    return json.dumps(normalized, ensure_ascii=False, separators=(',', ':'))


def fail(kind, where, message):
    return {'kind': kind, 'where': where, 'message': message}


def dependency_bridge(root, manifest_path, current_sha256, reviewed_sha256):
    """Accept only the exact dependency-only Career manifest reseal."""
    try:
        transition = load(os.path.join(root, DEPENDENCY_TRANSITION))
        binding = transition.get('careerVisualTransition') or {}
        expected_path = manifest_path if not os.path.isabs(manifest_path) else os.path.relpath(manifest_path, root)
        if (transition.get('status') != 'accepted-dependency-only'
                or binding.get('path') != expected_path
                or binding.get('currentSha256') != current_sha256
                or binding.get('previousSha256') != reviewed_sha256
                or binding.get('reverseSubstitutionExpectedSha256') != reviewed_sha256):
            return False
        text = open(os.path.join(root, expected_path)).read()
        for item in binding.get('reverseSubstitutions') or []:
            current = item.get('current')
            previous = item.get('previous')
            if not current or not isinstance(previous, str) or text.count(current) != 1:
                return False
            text = text.replace(current, previous)
        return digest_bytes(text.encode()) == reviewed_sha256
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        return False


def validate(root=ROOT, manifest_path=FINAL, require_final=True):
    root = os.path.abspath(root)
    absolute_manifest = manifest_path if os.path.isabs(manifest_path) else os.path.join(root, manifest_path)
    failures = []
    try:
        manifest = load(absolute_manifest)
        evidence_record = manifest.get('captureEvidence') or {}
        report_path = os.path.join(root, evidence_record.get('path', ''))
        report = load(report_path)
        frame_authority = manifest.get('frameAuthority') or {}
        oracle_path = os.path.join(root, frame_authority.get('oraclePath', ''))
        oracle = load(oracle_path)
    except (OSError, TypeError, json.JSONDecodeError) as error:
        return {'ok': False, 'failures': [fail('visual-contract', 'inputs', str(error))]}
    expected_status = 'accepted-independent-review' if require_final else 'proposed-independent-review-required'
    if (manifest.get('schemaVersion') != 1 or manifest.get('route') != 'career'
            or manifest.get('status') != expected_status):
        failures.append(fail('visual-contract', 'identity', f'visual manifest must be {expected_status}'))
    if digest_file(report_path) != evidence_record.get('sha256'):
        failures.append(fail('visual-contract', 'captureEvidence', 'capture report hash drifted'))
    capture_script = evidence_record.get('captureScript') or {}
    capture_script_path = os.path.join(root, capture_script.get('path', ''))
    if not os.path.isfile(capture_script_path) or digest_file(capture_script_path) != capture_script.get('sha256'):
        failures.append(fail('visual-contract', 'captureScript', 'capture script hash drifted'))
    semantic = (manifest.get('semanticAuthority') or {}).get('careerEvidenceContract') or {}
    semantic_path = os.path.join(root, semantic.get('path', ''))
    if not os.path.isfile(semantic_path) or digest_file(semantic_path) != semantic.get('sha256'):
        failures.append(fail('visual-contract', 'careerEvidenceContract', 'semantic authority hash drifted'))
    for name, binding in (manifest.get('candidate') or {}).items():
        path = os.path.join(root, binding.get('path', ''))
        if not os.path.isfile(path) or digest_file(path) != binding.get('sha256'):
            failures.append(fail('visual-source-drift', name, f'{binding.get("path")} hash drifted'))
    current_oracle_sha = digest_file(oracle_path)
    prior_oracle = current_oracle_sha == frame_authority.get('oracleSha256')
    promoted_transition = next((item for item in (oracle.get('authority') or {}).get('authorizedTransitions', [])
                                if item.get('manifestPath') == manifest_path), None)
    current_manifest_sha = digest_file(absolute_manifest)
    reviewed_manifest_sha = (promoted_transition or {}).get('manifestSha256')
    manifest_authority = current_manifest_sha == reviewed_manifest_sha or dependency_bridge(
        root, manifest_path, current_manifest_sha, reviewed_manifest_sha,
    )
    promoted_oracle = bool(promoted_transition
        and promoted_transition.get('id') == 'career-evidence-accepted-resume'
        and manifest_authority
        and promoted_transition.get('priorOracleSha256') == frame_authority.get('oracleSha256')
        and promoted_transition.get('priorSharedAll') == frame_authority.get('priorSharedAll')
        and promoted_transition.get('currentSharedAll') == frame_authority.get('candidateSharedAll')
        and promoted_transition.get('changedFrameCount') == 12
        and promoted_transition.get('unchangedFrameCount') == 56
        and promoted_transition.get('changes') == frame_authority.get('changedFrames'))
    if not prior_oracle and not promoted_oracle:
        failures.append(fail('visual-contract', 'shared-route-oracle',
                             'shared oracle is neither the sealed prior nor the exact accepted promotion'))

    frames = report.get('frames') or []
    changes = report.get('changes') or []
    frame_keys = [key(frame) for frame in frames]
    change_keys = [key(change) for change in changes]
    if (report.get('ok') is not True or len(frames) != 68 or len(set(frame_keys)) != 68
            or len(changes) != 12 or set(change_keys) != ALLOWED_KEYS):
        failures.append(fail('visual-scope', 'capture', 'capture is not exact 68/12 with only SIG, Amazon, and Apple'))
    if (evidence_record.get('capturedFrames') != 68 or evidence_record.get('changedFrames') != 12
            or evidence_record.get('unchangedFrames') != 56):
        failures.append(fail('visual-contract', 'captureEvidence', 'manifest frame partition is not 68/12/56'))
    if changes != frame_authority.get('changedFrames'):
        failures.append(fail('visual-contract', 'changedFrames', 'manifest pairs differ from captured pairs'))
    candidate_aggregate = digest_bytes(canonical(frames).encode())
    if candidate_aggregate != frame_authority.get('candidateSharedAll'):
        failures.append(fail('visual-reconstruction', 'candidateSharedAll', 'candidate frame aggregate does not reproduce'))
    oracle_by_key = {key(frame): frame for frame in oracle.get('frames') or []}
    changes_by_key = {key(change): change for change in changes}
    reversed_frames = []
    for frame in frames:
        frame_key = key(frame)
        oracle_frame = oracle_by_key.get(frame_key)
        if oracle_frame is None:
            failures.append(fail('visual-scope', frame_key, 'captured frame is absent from the oracle'))
            continue
        change = changes_by_key.get(frame_key)
        if change:
            expected_oracle_sha = change.get('priorSha256') if prior_oracle else change.get('candidateSha256')
            if (frame.get('sha256') != change.get('candidateSha256')
                    or oracle_frame.get('sha256') != expected_oracle_sha):
                failures.append(fail('visual-reconstruction', frame_key, 'changed frame pair does not bind pixels'))
            reversed_frames.append({**frame, 'sha256': change.get('priorSha256')})
        else:
            if frame.get('sha256') != oracle_frame.get('sha256'):
                failures.append(fail('visual-scope', frame_key, 'unlisted frame changed'))
            reversed_frames.append(frame)
    reversed_aggregate = digest_bytes(canonical(reversed_frames).encode())
    if (reversed_aggregate != frame_authority.get('reverseReconstructedSharedAll')
            or reversed_aggregate != frame_authority.get('priorSharedAll')
            or (prior_oracle and reversed_aggregate != (oracle.get('aggregates') or {}).get('sharedAll'))
            or (promoted_oracle and candidate_aggregate != (oracle.get('aggregates') or {}).get('sharedAll'))):
        failures.append(fail('visual-reconstruction', 'reverse', 'reversing the 12 pairs does not reproduce the oracle'))
    frozen_routes = frame_authority.get('frozenNonCareerRouteHtml') or {}
    for page in ('index', 'services', 'contact'):
        path = os.path.join(root, f'site/{page}.html')
        if frozen_routes.get(page) != digest_file(path):
            failures.append(fail('visual-source-drift', page, 'frozen non-Career route HTML drifted'))
    if require_final:
        reviews = manifest.get('independentReviews') or []
        if ([review.get('reviewer') for review in reviews] != ['rubric_forensics', 'experience_audit']
                or any(review.get('verdict') != 'ACCEPT'
                       or review.get('reviewedProposalSha256') != REVIEWED_PROPOSAL_SHA256
                       for review in reviews)):
            failures.append(fail('visual-review', 'independentReviews', 'two independent ACCEPT reviews are required'))
        else:
            if reviews[0].get('evidenceArtifact') is not None:
                failures.append(fail('visual-review', 'rubric_forensics',
                                     'read-only forensic review must not claim a persisted artifact'))
            evidence = reviews[1].get('evidenceArtifact') or {}
            evidence_path = os.path.join(root, evidence.get('path', ''))
            if (evidence.get('path') != '.claude/rubric/out/career-evidence-transition/experience-audit-review.json'
                    or not os.path.isfile(evidence_path)
                    or digest_file(evidence_path) != evidence.get('sha256')):
                failures.append(fail('visual-review', 'experience_audit',
                                     'persisted experience review hash drifted'))
    return {
        'ok': not failures,
        'failures': failures,
        'manifestSha256': digest_file(absolute_manifest),
        'captureSha256': digest_file(report_path),
        'capturedFrames': len(frames),
        'changedFrames': len(changes),
        'unchangedFrames': len(frames) - len(changes),
        'candidateSharedAll': candidate_aggregate,
        'reverseReconstructedSharedAll': reversed_aggregate,
        'oracleMode': 'promoted' if promoted_oracle else 'prior',
    }


def parse_args(argv):
    parser = argparse.ArgumentParser(description='Verify the Career evidence visual-transition authority.')
    parser.add_argument('--root', default=ROOT)
    parser.add_argument('--manifest', default=FINAL)
    parser.add_argument('--allow-proposed', action='store_true')
    parser.add_argument('--json')
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    report = validate(args.root, args.manifest, require_final=not args.allow_proposed)
    if args.json:
        with open(args.json, 'w') as stream:
            json.dump(report, stream, indent=2)
            stream.write('\n')
    for item in report.get('failures', []):
        print(f"FAIL {item['kind']} {item['where']}: {item['message']}")
    if report.get('ok'):
        print(f"Career visual transition: {report['changedFrames']} changed / {report['capturedFrames']} captured; reverse reconstruction verified")
    return 0 if report.get('ok') else 1


if __name__ == '__main__':
    sys.exit(main())
