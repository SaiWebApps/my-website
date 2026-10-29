#!/usr/bin/env python3
"""Run isolated, one-plant mutations against the independent fact-store verifier."""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

import verify_facts


HERE = os.path.dirname(os.path.abspath(__file__))
RUBRIC = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(RUBRIC))
OUTPUTS = [
    '.claude/rubric/facts/facts.json',
    '.claude/rubric/facts/source-hashes.json',
    '.claude/rubric/facts/authority-coverage.json',
]


def sha256(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def write_json(path, value):
    with open(path, 'w') as stream:
        json.dump(value, stream, indent=2, sort_keys=True, ensure_ascii=False)
        stream.write('\n')


def copy_control(destination):
    for relative in sorted(set(verify_facts.EXPECTED_INPUTS + OUTPUTS)):
        source = os.path.join(ROOT, relative)
        target = os.path.join(destination, relative)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copy2(source, target)
    os.symlink(os.path.join(ROOT, '.git'), os.path.join(destination, '.git'), target_is_directory=True)


def run_verifier(root):
    report_path = os.path.join(root, 'mutation-report.json')
    run = subprocess.run(
        [sys.executable, os.path.join(root, '.claude/rubric/facts/verify_facts.py'), '--root', root, '--json', report_path],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if not os.path.isfile(report_path):
        return {
            'ok': False,
            'failures': [{'kind': 'plant-error', 'where': 'verifier', 'message': run.stderr[-500:] or run.stdout[-500:]}],
            'returnCode': run.returncode,
        }
    report = json.load(open(report_path))
    report['returnCode'] = run.returncode
    return report


def replace_once(path, old, new):
    text = open(path).read()
    count = text.count(old)
    if count != 1:
        raise ValueError(f'plant expected one occurrence in {path}, found {count}')
    with open(path, 'w') as stream:
        stream.write(text.replace(old, new, 1))
    return 1


def update_fact_seal(root, facts, record_count=True):
    facts_path = os.path.join(root, OUTPUTS[0])
    seal_path = os.path.join(root, OUTPUTS[1])
    write_json(facts_path, facts)
    seal = json.load(open(seal_path))
    seal['factsSha256'] = sha256(facts_path)
    if record_count:
        seal['recordCount'] = len(facts)
    write_json(seal_path, seal)


def plant_stale_builder(root):
    path = os.path.join(root, '.claude/rubric/facts/build_facts.py')
    with open(path, 'a') as stream:
        stream.write('\n# isolated stale-builder plant\n')
    return 1


def plant_comutated_facts_and_seal(root):
    facts = json.load(open(os.path.join(root, OUTPUTS[0])))
    fact = next(item for item in facts if item.get('source') == 'approved')
    fact['text'] += ' isolated co-mutation'
    update_fact_seal(root, facts, record_count=False)
    return 1


def plant_correction_and_protected(root):
    old = 'Keep HP, Morgan Lewis, PBS, Sonova, Jacobson Strategic, and the Eagles Care Summit under Praxtera AI Institute; do not present them as separate employers or independent talks.'
    new = 'Keep HP, Morgan Lewis, PBS, Sonova, Jacobson Strategic, and the Eagles Care Summit under an altered parent; do not present them as separate employers or independent talks.'
    count = replace_once(os.path.join(root, '.claude/rubric/authority/corrections.ndjson'), old, new)
    count += replace_once(os.path.join(root, '.claude/rubric/authority/protected-claims.json'), old, new)
    if count != 2:
        raise ValueError('correction/protected co-mutation did not apply exactly once as a logical plant')
    return 1


def plant_author_order(root):
    path = os.path.join(root, 'site/content.json')
    content = json.load(open(path))
    record = next(item for item in content['research'] if item['slug'] == 'who-trains-the-next-senior')
    if record['authors'] != 'Gajendra Babu Thokala, Sairam Krishnan':
        raise ValueError('author-order plant precondition failed')
    record['authors'] = 'Sairam Krishnan, Gajendra Babu Thokala'
    write_json(path, content)
    return 1


def plant_duplicate_claim_id(root):
    path = os.path.join(root, 'site/content.json')
    content = json.load(open(path))
    first = next(item for item in content['research'] if item['slug'] == 'drone-megaddon')
    second = next(item for item in content['research'] if item['slug'] == 'drone-megaddon-2026')
    if first['claim']['id'] == second['claim']['id']:
        raise ValueError('duplicate-claim plant precondition failed')
    second['claim']['id'] = first['claim']['id']
    write_json(path, content)
    return 1


def plant_proposal_to_built(root):
    path = os.path.join(root, '.claude/rubric/authority/protected-claims.json')
    protected = json.load(open(path))
    record = next(item for item in protected['typed_claims'] if item.get('unit') == 'drone-megaddon-2026')
    if record['built_status'] != 'proposal' or 'proposal' not in record['status']:
        raise ValueError('proposal-status plant precondition failed')
    record['built_status'] = 'built-prototype'
    record['status'] = record['status'].replace('proposal', 'built system')
    write_json(path, protected)
    return 1


def plant_remove_causal_qualifier(root):
    path = os.path.join(root, 'site/content.json')
    content = json.load(open(path))
    record = next(item for item in content['research'] if item['slug'] == 'who-trains-the-next-senior')
    old = 'An exploratory, correlational analysis'
    if record['summary'].count(old) != 1:
        raise ValueError('causal-qualifier plant precondition failed')
    record['summary'] = record['summary'].replace(old, 'An exploratory analysis', 1)
    write_json(path, content)
    return 1


def authority_fact(root, fact_id):
    facts = json.load(open(os.path.join(root, OUTPUTS[0])))
    matches = [item for item in facts if item.get('id') == fact_id]
    if len(matches) != 1:
        raise ValueError(f'authority-fact plant expected one {fact_id}, found {len(matches)}')
    return facts, matches[0]


def plant_remove_2014_figure_alt_fact(root):
    fact_id = 'authority:research-drone-megaddon-2014:figure:image-alt'
    facts, _fact = authority_fact(root, fact_id)
    kept = [item for item in facts if item.get('id') != fact_id]
    update_fact_seal(root, kept)
    return 1


def plant_drift_2026_figure_alt_fact(root):
    fact_id = 'authority:research-drone-megaddon-2026:figure:image-alt'
    facts, fact = authority_fact(root, fact_id)
    fact['text'] += ' Altered.'
    update_fact_seal(root, facts)
    return 1


def plant_move_who_group_label_fact(root):
    fact_id = 'authority:research-who-trains:figure:group-label'
    facts, fact = authority_fact(root, fact_id)
    fact['unit'] = 'ai-roi'
    update_fact_seal(root, facts)
    return 1


def plant_shorten_who_qualifier_fact(root):
    fact_id = 'authority:research-who-trains:qualifier:0'
    facts, fact = authority_fact(root, fact_id)
    fact['text'] = 'correlational rather than causal'
    update_fact_seal(root, facts)
    return 1


def plant_snapshot_change(root):
    path = os.path.join(root, '.claude/rubric/sources/papers-full/who-trains.txt')
    with open(path, 'a') as stream:
        stream.write('\nISOLATED SNAPSHOT MUTATION\n')
    return 1


def plant_papers_change(root):
    path = os.path.join(root, '.claude/rubric/sources/papers.txt')
    with open(path, 'a') as stream:
        stream.write('\nISOLATED PAPERS MUTATION\n')
    return 1


def plant_source_manifest_change(root):
    path = os.path.join(root, '.claude/rubric/authority/source-manifest-mirror.json')
    manifest = json.load(open(path))
    record = next(item for item in manifest['sources'] if item['id'] == 'research-drone-2026')
    record['sha256'] = 'f' + record['sha256'][1:]
    write_json(path, manifest)
    return 1


def plant_inactive_working_source(root):
    source = os.path.join(ROOT, 'src/data/content.ts')
    target = os.path.join(root, 'src/data/content.ts')
    os.makedirs(os.path.dirname(target), exist_ok=True)
    shutil.copy2(source, target)
    with open(target, 'a') as stream:
        stream.write('\n// inactive working-source mutation\n')
    return 1


def plant_missing_heading(root):
    facts = json.load(open(os.path.join(root, OUTPUTS[0])))
    fact_id = 'authority:independent-speaking-teaching:heading'
    kept = [item for item in facts if item.get('id') != fact_id]
    if len(facts) - len(kept) != 1:
        raise ValueError('heading plant did not find exactly one governed fact')
    update_fact_seal(root, kept)
    return 1


def plant_omit_accepted_resume(root):
    facts = json.load(open(os.path.join(root, OUTPUTS[0])))
    fact_id = 'resume:atos:9:b0'
    kept = [item for item in facts if item.get('id') != fact_id]
    if len(facts) - len(kept) != 1:
        raise ValueError('accepted-résumé plant did not find exactly one governed fact')
    update_fact_seal(root, kept)
    return 1


def plant_transition_tail_drift(root):
    path = os.path.join(root, '.claude/rubric/authority/resume-equivalence.json')
    equivalence = json.load(open(path))
    item = next(entry for entry in equivalence['equivalences'] if entry['factId'] == 'resume:ondoway:5:b1')
    old = 'frozen human-labeled cases'
    if item['legacyText'].count(old) != 1:
        raise ValueError('transition-tail plant precondition failed')
    item['legacyText'] = item['legacyText'].replace(old, 'altered human-labeled cases', 1)
    write_json(path, equivalence)
    return 1


def plant_remove_career_mentorship_detail(root):
    path = os.path.join(root, 'site/content.json')
    content = json.load(open(path))
    amazon = next(item for item in content['careerLedger'] if item['id'] == 'amazon')
    detail = "Mentored half the team from entry level to promotion, earning selection for Amazon's Mentorship and Leadership Development Program."
    if amazon['bullets'].count(detail) != 1 or amazon['bullets'].index(detail) != 2:
        raise ValueError('Career mentorship-detail plant precondition failed')
    amazon['bullets'].remove(detail)
    write_json(path, content)
    return 1


def plant_career_review_drift(root):
    path = os.path.join(root, '.claude/rubric/authority/career-amazon-transition.json')
    transition = json.load(open(path))
    review = next(item for item in transition['independentReviews'] if item['reviewer'] == 'experience_audit')
    if review.get('verdict') != 'ACCEPT':
        raise ValueError('Career review-drift plant precondition failed')
    review['verdict'] = 'KILL'
    write_json(path, transition)
    return 1


def exact_failure(kind, where, message):
    return {'kind': kind, 'where': where, 'message': message}


def prefixed_failure(kind, where, message):
    return {'kind': kind, 'where': where, 'messageStartsWith': message}


def failures_match(actual, expected):
    """Bind every emitted failure, in order, to one explicit structured causal reason."""
    if len(actual) != len(expected):
        return False
    for found, wanted in zip(actual, expected):
        if found.get('kind') != wanted.get('kind') or found.get('where') != wanted.get('where'):
            return False
        if 'message' in wanted and found.get('message') != wanted['message']:
            return False
        if 'messageStartsWith' in wanted and not found.get('message', '').startswith(wanted['messageStartsWith']):
            return False
    return True


INPUT_DRIFT = 'sealed fact input hash drifted'
BYTE_DRIFT = 'independent rebuild differs byte-for-byte'

EXPECTED_FAILURES = {
    'stale-builder': [
        exact_failure('input-hash', '.claude/rubric/facts/build_facts.py', INPUT_DRIFT),
        exact_failure('rebuild-drift', 'source-hashes.json', BYTE_DRIFT),
    ],
    'co-mutated-facts-and-seal': [
        exact_failure('rebuild-drift', 'facts.json', BYTE_DRIFT),
        exact_failure('rebuild-drift', 'source-hashes.json', BYTE_DRIFT),
    ],
    'correction-and-protected-drift': [
        exact_failure('input-hash', '.claude/rubric/authority/corrections.ndjson', INPUT_DRIFT),
        exact_failure('input-hash', '.claude/rubric/authority/protected-claims.json', INPUT_DRIFT),
        exact_failure('authority-drift', 'protected-claims.json', 'protected claims differ from the authority mirror hash'),
        exact_failure('authority-drift', 'corrections.ndjson', 'active corrections differ from the authority mirror hash'),
        exact_failure('authority-drift', 'authority.json', 'typed authority mirror differs from protected claims'),
        exact_failure('rebuild-drift', 'source-hashes.json', BYTE_DRIFT),
    ],
    'author-order-swap': [
        exact_failure('input-hash', 'site/content.json', INPUT_DRIFT),
        exact_failure('author-order', 'who-trains', 'active Research author order differs from authority'),
        exact_failure('rebuild-drift', 'facts.json', BYTE_DRIFT),
        exact_failure('rebuild-drift', 'source-hashes.json', BYTE_DRIFT),
    ],
    'duplicate-research-claim-id': [
        exact_failure('input-hash', 'site/content.json', INPUT_DRIFT),
        exact_failure('duplicate-claim-id', 'site/content.json', 'active Research claim IDs are empty or duplicated'),
        exact_failure('duplicate-claim-id', 'drone-megaddon-2026', 'active claim identity differs from authority'),
        exact_failure('rebuild-drift', 'facts.json', BYTE_DRIFT),
        exact_failure('rebuild-drift', 'source-hashes.json', BYTE_DRIFT),
    ],
    'proposal-to-built-status': [
        exact_failure('input-hash', '.claude/rubric/authority/protected-claims.json', INPUT_DRIFT),
        exact_failure('authority-drift', 'protected-claims.json', 'protected claims differ from the authority mirror hash'),
        exact_failure('authority-drift', 'authority.json', 'typed authority mirror differs from protected claims'),
        exact_failure('research-status', 'drone-megaddon-2026', 'built/proposed status conflicts with the accepted résumé clause'),
        exact_failure('rebuild-drift', 'facts.json', BYTE_DRIFT),
        exact_failure('rebuild-drift', 'source-hashes.json', BYTE_DRIFT),
    ],
    'critical-causal-qualifier-removal': [
        exact_failure('input-hash', 'site/content.json', INPUT_DRIFT),
        exact_failure('causal-qualifier', 'who-trains', 'active summary omits protected qualifier: correlational analysis'),
        exact_failure('rebuild-drift', 'facts.json', BYTE_DRIFT),
        exact_failure('rebuild-drift', 'source-hashes.json', BYTE_DRIFT),
    ],
    'research-2014-figure-alt-fact-removal': [
        exact_failure('research-authority-fact', 'authority:research-drone-megaddon-2014:figure:image-alt', 'Research reader authority fact is absent or differs from the accepted contract'),
        exact_failure('rebuild-drift', 'facts.json', BYTE_DRIFT),
        exact_failure('rebuild-drift', 'source-hashes.json', BYTE_DRIFT),
    ],
    'research-2026-figure-alt-fact-drift': [
        exact_failure('research-authority-fact', 'authority:research-drone-megaddon-2026:figure:image-alt', 'Research reader authority fact is absent or differs from the accepted contract'),
        exact_failure('rebuild-drift', 'facts.json', BYTE_DRIFT),
        exact_failure('rebuild-drift', 'source-hashes.json', BYTE_DRIFT),
    ],
    'research-who-group-label-fact-misownership': [
        exact_failure('research-authority-fact', 'authority:research-who-trains:figure:group-label', 'Research reader authority fact is absent or differs from the accepted contract'),
        exact_failure('rebuild-drift', 'facts.json', BYTE_DRIFT),
        exact_failure('rebuild-drift', 'source-hashes.json', BYTE_DRIFT),
    ],
    'research-who-qualifier-fact-shortening': [
        exact_failure('research-authority-fact', 'authority:research-who-trains:qualifier:0', 'Research qualifier fact is absent or differs from the accepted contract'),
        exact_failure('rebuild-drift', 'facts.json', BYTE_DRIFT),
        exact_failure('rebuild-drift', 'source-hashes.json', BYTE_DRIFT),
    ],
    'snapshot-change-without-rebuild': [
        exact_failure('input-hash', '.claude/rubric/sources/papers-full/who-trains.txt', INPUT_DRIFT),
        exact_failure('input-hash', 'who-trains', 'Research snapshot bytes differ from authority'),
        exact_failure('rebuild-drift', 'source-hashes.json', BYTE_DRIFT),
    ],
    'papers-change-without-rebuild': [
        exact_failure('input-hash', '.claude/rubric/sources/papers.txt', INPUT_DRIFT),
        exact_failure('rebuild-drift', 'facts.json', BYTE_DRIFT),
        exact_failure('rebuild-drift', 'source-hashes.json', BYTE_DRIFT),
    ],
    'source-manifest-change-without-rebuild': [
        exact_failure('input-hash', '.claude/rubric/authority/source-manifest-mirror.json', INPUT_DRIFT),
        exact_failure('authority-drift', 'source-manifest-mirror.json', 'source-manifest mirror hash differs from authority'),
        exact_failure('input-hash', 'drone-megaddon-2026', 'typed Research source differs from the accepted source-manifest mirror'),
        exact_failure('rebuild-drift', 'source-hashes.json', BYTE_DRIFT),
    ],
    'inactive-working-source': [],
    'missing-correction-heading': [
        exact_failure('correction-fact', 'authority:independent-speaking-teaching:heading', 'correction-derived heading fact is absent or unbound'),
        exact_failure('rebuild-drift', 'facts.json', BYTE_DRIFT),
        exact_failure('rebuild-drift', 'source-hashes.json', BYTE_DRIFT),
    ],
    'accepted-resume-omission': [
        exact_failure('accepted-resume', 'resume:atos:9:b0', 'accepted résumé clause ledger differs from the rebuilt fact'),
        exact_failure('rebuild-drift', 'facts.json', BYTE_DRIFT),
        exact_failure('rebuild-drift', 'source-hashes.json', BYTE_DRIFT),
    ],
    'accepted-transition-tail-drift': [
        exact_failure('input-hash', '.claude/rubric/authority/resume-equivalence.json', INPUT_DRIFT),
        exact_failure('accepted-resume', 'resume-equivalence.json', 'accepted résumé transition ledger differs from authority'),
        exact_failure('accepted-resume', 'resume:ondoway:5:b1', 'Projects transition changed more than its governed leading verb'),
        exact_failure('accepted-resume', 'projectsTransition', 'Projects transition hash differs from its exact five-atom payload'),
        prefixed_failure('rebuild-drift', 'build_facts.py', 'independent rebuild failed:'),
    ],
    'career-mentorship-detail-removal': [
        exact_failure('input-hash', 'site/content.json', INPUT_DRIFT),
        exact_failure('accepted-resume', 'site/content.json', 'active Amazon source does not implement the exact accepted Career transition'),
        exact_failure('authority-drift', 'career-amazon-transition.json', 'Career semantic transition hashes do not reproduce from the active eight-atom source'),
        exact_failure('rebuild-drift', 'facts.json', BYTE_DRIFT),
        exact_failure('rebuild-drift', 'source-hashes.json', BYTE_DRIFT),
    ],
    'career-independent-review-drift': [
        exact_failure('input-hash', '.claude/rubric/authority/career-amazon-transition.json', INPUT_DRIFT),
        exact_failure('authority-drift', 'career-amazon-transition.json', 'Career transition bytes differ from authority'),
        exact_failure('authority-drift', 'career-amazon-transition.json', 'Career transition lacks both independent ACCEPT decisions or the persisted review hash'),
        exact_failure('rebuild-drift', 'source-hashes.json', BYTE_DRIFT),
    ],
}

CASES = [
    ('stale-builder', plant_stale_builder, False),
    ('co-mutated-facts-and-seal', plant_comutated_facts_and_seal, False),
    ('correction-and-protected-drift', plant_correction_and_protected, False),
    ('author-order-swap', plant_author_order, False),
    ('duplicate-research-claim-id', plant_duplicate_claim_id, False),
    ('proposal-to-built-status', plant_proposal_to_built, False),
    ('critical-causal-qualifier-removal', plant_remove_causal_qualifier, False),
    ('research-2014-figure-alt-fact-removal', plant_remove_2014_figure_alt_fact, False),
    ('research-2026-figure-alt-fact-drift', plant_drift_2026_figure_alt_fact, False),
    ('research-who-group-label-fact-misownership', plant_move_who_group_label_fact, False),
    ('research-who-qualifier-fact-shortening', plant_shorten_who_qualifier_fact, False),
    ('snapshot-change-without-rebuild', plant_snapshot_change, False),
    ('papers-change-without-rebuild', plant_papers_change, False),
    ('source-manifest-change-without-rebuild', plant_source_manifest_change, False),
    ('inactive-working-source', plant_inactive_working_source, True),
    ('missing-correction-heading', plant_missing_heading, False),
    ('accepted-resume-omission', plant_omit_accepted_resume, False),
    ('accepted-transition-tail-drift', plant_transition_tail_drift, False),
    ('career-mentorship-detail-removal', plant_remove_career_mentorship_detail, False),
    ('career-independent-review-drift', plant_career_review_drift, False),
]


def main(argv=None):
    parser = argparse.ArgumentParser(description='Run isolated governed-fact mutations after a clean control pass.')
    parser.add_argument('--json', dest='json_path', help='Optional structured result path.')
    parser.add_argument('--only', help='Run exactly one named mutation after the clean control.')
    args = parser.parse_args(argv)
    known_cases = {case_id for case_id, *_rest in CASES}
    if args.only and args.only not in known_cases:
        parser.error(f'unknown mutation case: {args.only}')
    selected_cases = [case for case in CASES if not args.only or case[0] == args.only]
    results = {'ok': False, 'control': None, 'cases': [], 'plantErrors': 0}
    with tempfile.TemporaryDirectory(prefix='facts-mutation-control-') as control_root:
        copy_control(control_root)
        control = run_verifier(control_root)
        results['control'] = {
            'ok': control.get('ok'),
            'failures': control.get('failures', []),
            'returnCode': control.get('returnCode'),
        }
    if (results['control']['ok'] is not True or results['control']['failures']
            or results['control']['returnCode'] != 0):
        results['plantErrors'] = 1
    else:
        for case_id, plant, expect_pass in selected_cases:
            expected_failures = EXPECTED_FAILURES[case_id]
            expected_kinds = {item['kind'] for item in expected_failures}
            case = {
                'id': case_id,
                'expectedKinds': sorted(expected_kinds),
                'expectedFailures': expected_failures,
                'expectPass': expect_pass,
            }
            try:
                with tempfile.TemporaryDirectory(prefix=f'facts-mutation-{case_id}-') as case_root:
                    copy_control(case_root)
                    case['plantApplications'] = plant(case_root)
                    report = run_verifier(case_root)
                actual_kinds = {item.get('kind') for item in report.get('failures', [])}
                case['failures'] = report.get('failures', [])
                case['actualKinds'] = sorted(actual_kinds)
                case['verifierOk'] = report.get('ok')
                case['verifierReturnCode'] = report.get('returnCode')
                case['failureContractOk'] = failures_match(case['failures'], expected_failures)
                expected_return_code = 0 if expect_pass else 1
                case['ok'] = (
                    case['plantApplications'] == 1
                    and report.get('ok') is expect_pass
                    and report.get('returnCode') == expected_return_code
                    and actual_kinds == expected_kinds
                    and case['failureContractOk']
                )
            except Exception as error:
                case.update({'ok': False, 'plantApplications': 0, 'plantError': str(error)})
            if not case['ok']:
                results['plantErrors'] += 1
            results['cases'].append(case)
    results['ok'] = results['control']['ok'] and results['plantErrors'] == 0 and len(results['cases']) == len(selected_cases)
    if args.json_path:
        write_json(args.json_path, results)
    for case in results['cases']:
        print(('PASS' if case['ok'] else 'FAIL') + ' ' + case['id'] + ' ' + ','.join(case.get('actualKinds', [])))
    print(f"mutations: control={'pass' if results['control']['ok'] else 'fail'}; plants={len(results['cases'])}; errors={results['plantErrors']}")
    return 0 if results['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
