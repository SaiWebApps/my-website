#!/usr/bin/env python3
"""Causal mutation proof for the sealed Career evidence contract. No regular expressions."""
import argparse
import copy
import hashlib
import html
import json
import os
import sys

RUBRIC = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(RUBRIC))
sys.path.insert(0, RUBRIC)
import career_evidence


def sha(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def replace_once(text, old, new):
    count = text.count(old)
    if count != 1:
        raise ValueError(f'plant needle must occur exactly once, found {count}: {old[:90]}')
    return text.replace(old, new, 1)


def insert_inside_owner(text, owner_id, fragment):
    needle = f'id="{owner_id}"'
    position = text.find(needle)
    if position < 0 or text.find(needle, position + 1) >= 0:
        raise ValueError(f'owner #{owner_id} must occur exactly once')
    opening_end = text.find('>', position)
    if opening_end < 0:
        raise ValueError(f'owner #{owner_id} has no opening-tag terminator')
    return text[:opening_end + 1] + fragment + text[opening_end + 1:]


def load_inputs():
    contract = json.load(open(os.path.join(ROOT, career_evidence.FINAL_CONTRACT)))
    facts = json.load(open(os.path.join(RUBRIC, 'facts/facts.json')))
    registry = json.load(open(os.path.join(RUBRIC, 'registry.json')))
    career = open(os.path.join(ROOT, 'site/career.html')).read()
    others = {}
    for page, record in registry['pages'].items():
        if page == 'career':
            continue
        path = os.path.join(ROOT, 'site', record['file'])
        if os.path.isfile(path):
            others[page] = open(path).read()
    return contract, facts, registry, career, others


def direct_text(facts_by_id, fact_id):
    return html.escape(facts_by_id[fact_id]['text'], quote=False)


def plant_direct_omission(state, facts):
    needle = ' data-career-accepted-fact="resume:apple:1:b1"'
    state['career'] = replace_once(state['career'], needle, '')


def plant_direct_duplicate(state, facts):
    fact_id = 'resume:apple:1:b1'
    fragment = f'<span data-career-accepted-fact="{fact_id}">{direct_text(facts, fact_id)}</span>'
    state['career'] = insert_inside_owner(state['career'], 'apple', fragment)


def plant_direct_move(state, facts):
    fact_id = 'resume:apple:1:b1'
    needle = f' data-career-accepted-fact="{fact_id}"'
    state['career'] = replace_once(state['career'], needle, '')
    fragment = f'<span data-career-accepted-fact="{fact_id}">{direct_text(facts, fact_id)}</span>'
    state['career'] = insert_inside_owner(state['career'], 'amazon', fragment)


def plant_direct_wrong_owner(state, facts):
    needle = 'data-career-accepted-fact="resume:apple:1:b1"'
    replacement = needle + ' data-career-owner="amazon"'
    state['career'] = replace_once(state['career'], needle, replacement)


def plant_direct_hidden(state, facts):
    needle = 'data-career-accepted-fact="resume:apple:1:b1"'
    state['career'] = replace_once(state['career'], needle, needle + ' hidden')


def plant_direct_text_drift(state, facts):
    state['career'] = replace_once(state['career'], 'compensation recommendations', 'compensation guidance')


def plant_component_omission(state, facts):
    needle = ' data-fact-id="site:careerLedger[10].bullets[5]"'
    state['career'] = replace_once(state['career'], needle, '')


def plant_component_duplicate(state, facts):
    fact_id = 'site:careerLedger[10].bullets[5]'
    fragment = f'<span data-fact-id="{fact_id}">{direct_text(facts, fact_id)}</span>'
    state['career'] = insert_inside_owner(state['career'], 'apple', fragment)


def plant_component_move(state, facts):
    fact_id = 'site:careerLedger[10].bullets[5]'
    needle = f' data-fact-id="{fact_id}"'
    state['career'] = replace_once(state['career'], needle, '')
    fragment = f'<span data-fact-id="{fact_id}">{direct_text(facts, fact_id)}</span>'
    state['career'] = insert_inside_owner(state['career'], 'amazon', fragment)


def plant_component_wrong_owner(state, facts):
    needle = 'data-fact-id="site:careerLedger[10].bullets[5]"'
    state['career'] = replace_once(state['career'], needle, needle + ' data-career-owner="amazon"')


def plant_component_hidden(state, facts):
    needle = 'data-fact-id="site:careerLedger[10].bullets[5]"'
    state['career'] = replace_once(state['career'], needle, needle + ' hidden')


def plant_component_text_drift(state, facts):
    state['career'] = replace_once(
        state['career'],
        'partial and complete edits to entities, relationships, and properties',
        'partial edits to entities and properties',
    )


def plant_b4_atom_removal(state, facts):
    state['career'] = replace_once(
        state['career'],
        'Secured agreement from Operations, PMs, and client teams',
        'Sequenced Sticky Credits',
    )


def plant_b8_services_takeover(state, facts):
    fact_id = career_evidence.B8_SUPPORTING_MIRROR
    fragment = (f'<p data-career-accepted-fact="resume:apple:1:b8" data-fact-id="{fact_id}">'
                f'{direct_text(facts, fact_id)}</p>')
    state['others']['services'] = replace_once(
        state['others']['services'], '</main>', fragment + '</main>')


def plant_b8_duplicate_canonical_owner(state, facts):
    fact_id = career_evidence.B8_CANONICAL_COMPONENT
    fragment = f'<p data-fact-id="{fact_id}">{direct_text(facts, fact_id)}</p>'
    state['others']['services'] = replace_once(
        state['others']['services'], '</main>', fragment + '</main>')


def plant_b8_noncovering_mirror_allowed(state, facts):
    fact_id = career_evidence.B8_SUPPORTING_MIRROR
    fragment = f'<p data-fact-id="{fact_id}">{direct_text(facts, fact_id)}</p>'
    state['others']['services'] = replace_once(
        state['others']['services'], '</main>', fragment + '</main>')


def plant_b7_transform_drift(state, facts):
    state['career'] = replace_once(state['career'], '1M-100M-message workloads', '1M–100M-message workloads')


def plant_heading_drift(state, facts):
    state['career'] = replace_once(state['career'], 'The systems I build with', 'The tools I use')


SUPPORT_TEXT = ('The workflow verifies generated entities and relationships against canonical facts '
                'and identifies precise discrepancies.')


def plant_support_omission(state, facts):
    state['career'] = replace_once(state['career'], SUPPORT_TEXT, '')


def plant_support_duplicate(state, facts):
    fragment = f'<div class="route cr-fact-route"><span>{SUPPORT_TEXT}</span></div>'
    state['career'] = insert_inside_owner(state['career'], 'apple', fragment)


def plant_support_move(state, facts):
    state['career'] = replace_once(state['career'], SUPPORT_TEXT, '')
    fragment = f'<div class="route cr-fact-route"><span>{SUPPORT_TEXT}</span></div>'
    state['career'] = insert_inside_owner(state['career'], 'amazon', fragment)


def plant_support_wrong_owner(state, facts):
    needle = '<div class="route cr-fact-route"><span>' + SUPPORT_TEXT
    replacement = '<div class="route cr-fact-route" data-career-owner="amazon"><span>' + SUPPORT_TEXT
    state['career'] = replace_once(state['career'], needle, replacement)


def plant_support_hidden(state, facts):
    needle = '<div class="route cr-fact-route"><span>' + SUPPORT_TEXT
    replacement = '<div class="route cr-fact-route" hidden><span>' + SUPPORT_TEXT
    state['career'] = replace_once(state['career'], needle, replacement)


def plant_support_text_drift(state, facts):
    state['career'] = replace_once(state['career'], 'identifies precise discrepancies', 'identifies broad discrepancies')


def plant_support_contract_self_attestation(state, facts):
    old = 'identifies precise discrepancies'
    new = 'identifies broad discrepancies'
    state['career'] = replace_once(state['career'], old, new)
    item = next(record for record in state['contract']['directVisibleRepairs']
                if record['acceptedFactId'] == 'resume:apple:1:b1')
    support = item['supportingVisibleLines'][0]
    support['text'] = support['text'].replace(old, new)
    support['textSha256'] = sha(support['text'])


def plant_direct_contract_self_attestation(state, facts):
    old = 'compensation recommendations'
    new = 'compensation guidance'
    state['career'] = replace_once(state['career'], old, new)
    item = next(record for record in state['contract']['directVisibleRepairs']
                if record['acceptedFactId'] == 'resume:apple:1:b0')
    item['acceptedTextSha256'] = sha(facts['resume:apple:1:b0']['text'].replace(old, new))


def plant_component_contract_self_attestation(state, facts):
    fact_id = 'site:careerLedger[10].bullets[5]'
    old = 'approximately 60 hours'
    new = 'approximately 61 hours'
    state['career'] = replace_once(state['career'], old, new)
    for composition in state['contract']['compositions']:
        for component in composition.get('components', []):
            if component['factId'] == fact_id:
                component['textSha256'] = sha(facts[fact_id]['text'].replace(old, new))


CASES = (
    ('direct-omission', plant_direct_omission),
    ('direct-duplicate', plant_direct_duplicate),
    ('direct-move', plant_direct_move),
    ('direct-wrong-owner', plant_direct_wrong_owner),
    ('direct-hidden', plant_direct_hidden),
    ('direct-text-drift', plant_direct_text_drift),
    ('component-omission', plant_component_omission),
    ('component-duplicate', plant_component_duplicate),
    ('component-move', plant_component_move),
    ('component-wrong-owner', plant_component_wrong_owner),
    ('component-hidden', plant_component_hidden),
    ('component-text-drift', plant_component_text_drift),
    ('apple-b4-one-atom-removal', plant_b4_atom_removal),
    ('apple-b8-services-takeover', plant_b8_services_takeover),
    ('apple-b8-duplicate-canonical-owner', plant_b8_duplicate_canonical_owner),
    ('apple-b7-display-transform-drift', plant_b7_transform_drift),
    ('resume-take-heading-drift', plant_heading_drift),
    ('support-omission', plant_support_omission),
    ('support-duplicate', plant_support_duplicate),
    ('support-move', plant_support_move),
    ('support-wrong-owner', plant_support_wrong_owner),
    ('support-hidden', plant_support_hidden),
    ('support-text-drift', plant_support_text_drift),
    ('support-contract-self-attestation', plant_support_contract_self_attestation),
    ('direct-contract-self-attestation', plant_direct_contract_self_attestation),
    ('component-contract-self-attestation', plant_component_contract_self_attestation),
)
EXPECTED_FAILURES = {
    'direct-omission': (('marker-count', 'resume:apple:1:b1'),),
    'direct-duplicate': (('marker-count', 'resume:apple:1:b1'),),
    'direct-move': (
        ('wrong-owner', 'resume:apple:1:b1'),
        ('support-line', 'graphrag-verification-detail'),
    ),
    'direct-wrong-owner': (('wrong-owner', 'resume:apple:1:b1'),),
    'direct-hidden': (('hidden', 'resume:apple:1:b1'),),
    'direct-text-drift': (('text-drift', 'resume:apple:1:b0'),),
    'component-omission': (
        ('marker-count', 'site:careerLedger[10].bullets[5]'),
        ('b4-entailment', 'streaming-migration-stack'),
        ('b4-entailment', 'sixty-hours-to-one-minute'),
        ('b4-entailment', 'partial-and-complete-edits'),
    ),
    'component-duplicate': (
        ('marker-count', 'site:careerLedger[10].bullets[5]'),
        ('b4-entailment', 'streaming-migration-stack'),
        ('b4-entailment', 'sixty-hours-to-one-minute'),
        ('b4-entailment', 'partial-and-complete-edits'),
    ),
    'component-move': (('wrong-owner', 'site:careerLedger[10].bullets[5]'),),
    'component-wrong-owner': (('wrong-owner', 'site:careerLedger[10].bullets[5]'),),
    'component-hidden': (('hidden', 'site:careerLedger[10].bullets[5]'),),
    'component-text-drift': (
        ('text-drift', 'site:careerLedger[10].bullets[5]'),
        ('b4-entailment', 'partial-and-complete-edits'),
    ),
    'apple-b4-one-atom-removal': (
        ('text-drift', 'site:careerLedger[10].bullets[10]'),
        ('b4-entailment', 'stakeholder-backing'),
    ),
    'apple-b8-services-takeover': (
        ('marker-count', 'data-career-accepted-fact'),
        ('b8-canonical-owner', 'resume:apple:1:b8'),
    ),
    'apple-b8-duplicate-canonical-owner': (
        ('marker-count', 'site:careerLedger[10].bullets[7]'),
    ),
    'apple-b7-display-transform-drift': (('text-drift', 'resume:apple:1:b7'),),
    'resume-take-heading-drift': (('heading', 'resume-take'),),
    'support-omission': (('support-line', 'graphrag-verification-detail'),),
    'support-duplicate': (('support-line', 'graphrag-verification-detail'),),
    'support-move': (
        ('support-line', 'graphrag-verification-detail'),
        ('wrong-owner', 'graphrag-verification-detail'),
    ),
    'support-wrong-owner': (('wrong-owner', 'graphrag-verification-detail'),),
    'support-hidden': (('hidden', 'graphrag-verification-detail'),),
    'support-text-drift': (('support-line', 'graphrag-verification-detail'),),
    'support-contract-self-attestation': (('contract-schema', 'resume:apple:1:b1'),),
    'direct-contract-self-attestation': (
        ('accepted-source', 'resume:apple:1:b0'),
        ('text-drift', 'resume:apple:1:b0'),
    ),
    'component-contract-self-attestation': (
        ('fact-source', 'site:careerLedger[10].bullets[5]'),
        ('text-drift', 'site:careerLedger[10].bullets[5]'),
        ('b4-entailment', 'sixty-hours-to-one-minute'),
    ),
}


def validate_state(state, facts_list, registry):
    facts_by_id = {item['id']: item for item in facts_list}
    failures = career_evidence.validate_contract_schema(state['contract'], facts_by_id, registry)
    failures.extend(career_evidence.validate_dom(
        state['career'], state['others'], state['contract'], facts_by_id, registry))
    return failures


def failure_signature(item):
    return (item.get('kind'), item.get('where'))


def run():
    contract, facts_list, registry, career, others = load_inputs()
    facts = {item['id']: item for item in facts_list}
    control = career_evidence.validate(ROOT)
    results = []
    plant_errors = []
    if not control.get('ok'):
        return {
            'ok': False,
            'cleanControl': control,
            'cases': [],
            'summary': {'attempted': 0, 'planted': 0, 'caught': 0, 'misses': 0, 'plantErrors': 0},
        }
    allowed_state = {
        'contract': copy.deepcopy(contract),
        'career': career,
        'others': copy.deepcopy(others),
    }
    plant_b8_noncovering_mirror_allowed(allowed_state, facts)
    allowed_failures = validate_state(allowed_state, facts_list, registry)
    policy_controls = [{
        'scenario': 'services-mirror-marker-is-noncovering',
        'applications': 1,
        'expectedOutcome': 'pass',
        'passed': not allowed_failures,
        'failures': allowed_failures,
    }]
    for scenario, planter in CASES:
        state = {
            'contract': copy.deepcopy(contract),
            'career': career,
            'others': copy.deepcopy(others),
        }
        try:
            planter(state, facts)
            applications = 1
        except Exception as error:
            plant_errors.append({'scenario': scenario, 'error': str(error)})
            results.append({'scenario': scenario, 'applications': 0, 'caught': False,
                            'plantError': str(error), 'failures': []})
            continue
        failures = validate_state(state, facts_list, registry)
        actual_signatures = tuple(failure_signature(item) for item in failures)
        expected_signatures = EXPECTED_FAILURES[scenario]
        failure_contract_ok = actual_signatures == expected_signatures
        results.append({
            'scenario': scenario,
            'applications': applications,
            'caught': failure_contract_ok,
            'plantError': None,
            'sourceSha256': sha(career),
            'plantedCareerSha256': sha(state['career']),
            'contractSha256': sha(json.dumps(state['contract'], sort_keys=True, separators=(',', ':'))),
            'expectedFailureSignatures': [list(item) for item in expected_signatures],
            'actualFailureSignatures': [list(item) for item in actual_signatures],
            'failureContractOk': failure_contract_ok,
            'failures': failures,
        })
    caught = sum(1 for item in results if item['caught'])
    misses = sum(1 for item in results if not item['caught'] and not item['plantError'])
    report = {
        'ok': (not plant_errors and misses == 0 and caught == len(CASES)
               and all(item['passed'] for item in policy_controls)),
        'cleanControl': {
            'ok': control.get('ok'),
            'failures': control.get('failures'),
            'inputs': control.get('inputs'),
        },
        'cases': results,
        'policyControls': policy_controls,
        'summary': {
            'attempted': len(CASES),
            'planted': len(CASES) - len(plant_errors),
            'caught': caught,
            'misses': misses,
            'plantErrors': len(plant_errors),
            'policyControls': len(policy_controls),
            'policyControlFailures': sum(1 for item in policy_controls if not item['passed']),
        },
    }
    return report


def parse_args(argv):
    parser = argparse.ArgumentParser(description='Run isolated Career evidence mutations.')
    parser.add_argument('--json')
    parser.add_argument('--quiet', action='store_true')
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    report = run()
    if args.json:
        with open(args.json, 'w') as stream:
            json.dump(report, stream, indent=2)
            stream.write('\n')
    if not args.quiet:
        summary = report['summary']
        print(f"career evidence mutations: {summary['caught']}/{summary['attempted']} caught, "
              f"{summary['misses']} misses, {summary['plantErrors']} plant errors")
        for item in report.get('cases', []):
            if not item.get('caught'):
                print(f"FAIL {item['scenario']}: {item.get('plantError') or 'unexpected failure contract'}")
    return 0 if report.get('ok') else 1


if __name__ == '__main__':
    sys.exit(main())
