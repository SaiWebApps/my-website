#!/usr/bin/env python3
"""Independent Career evidence-contract validator. No regular expressions."""
import argparse
import hashlib
import json
import os
import sys
from html.parser import HTMLParser

RUBRIC = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(RUBRIC))
FACTS_DIR = os.path.join(RUBRIC, 'facts')
sys.path.insert(0, FACTS_DIR)
import words

FINAL_CONTRACT = '.claude/rubric/authority/career-evidence-contract.json'
PROPOSED_CONTRACT = '.claude/rubric/authority/career-evidence-contract.proposed.json'

EXPECTED_DIRECT_IDS = (
    'resume:apple:1:b0',
    'resume:apple:1:b1',
    'resume:apple:1:b2',
    'resume:apple:1:b5',
    'resume:apple:1:b6',
    'resume:apple:1:b7',
    'resume:amazon:2:d1',
    'resume:sig:3:d0',
    'resume:skills',
)
EXPECTED_COMPOSITION_IDS = (
    'apple-music-credits-and-graph',
    'apple-streaming-migration-scope',
    'apple-design-review-outcomes',
    'amazon-asr-compound-intent',
    'amazon-graphql-savings',
    'amazon-onboarding-and-operations',
    'amazon-capacity-and-registration',
    'microsoft-mail-power',
    'microsoft-telemetry-decision',
    'wharton-degree-identity',
    'wharton-honors-and-majors',
    'cmu-degrees-honors',
)
EXPECTED_COMPOSITION_FACT_IDS = (
    'resume:apple:1:b3',
    'resume:apple:1:b4',
    'resume:apple:1:b8',
    'resume:amazon:2:b1',
    'resume:amazon:2:b2',
    'resume:amazon:2:b3',
    'resume:amazon:2:b4',
    'resume:microsoft:4:b0',
    'resume:microsoft:4:b1',
    'resume:edu:1',
    'resume:edu:2',
    'resume:edu:4',
)
EXPECTED_COMPONENT_IDS = (
    'site:careerLedger[0].bullets[0]',
    'site:careerLedger[0].bullets[1]',
    'site:careerLedger[0].bullets[2]',
    'site:careerLedger[7].bullets[0]',
    'site:careerLedger[7].bullets[1]',
    'site:careerLedger[9].bullets[1]',
    'site:careerLedger[9].bullets[3]',
    'site:careerLedger[9].bullets[4]',
    'site:careerLedger[9].bullets[5]',
    'site:careerLedger[9].bullets[6]',
    'site:careerLedger[9].bullets[7]',
    'site:careerLedger[10].bullets[4]',
    'site:careerLedger[10].bullets[5]',
    'site:careerLedger[10].bullets[7]',
    'site:careerLedger[10].bullets[10]',
    'site:careerLedger[11].role',
    'site:careerLedger[11].dates',
    'site:careerLedger[11].org',
    'site:careerLedger[11].bullets[0]',
    'site:careerLedger[11].bullets[1]',
    'site:careerLedger[11].bullets[2]',
    'site:careerLedger[11].bullets[3]',
    'site:careerLedger[11].bullets[4]',
    'site:services[1].proof[1]',
)
DIRECT_EQUIVALENTS = {
    'resume:apple:1:b0': (
        ('site:careerLedger[10].bullets[0]', 'f7ee3654998002acbc78f22b61cffd16f3d374a6727490223223ae6c99a79dc7'),
        ('site:services[6].proof[3]', '26ba2343f4c98c28197463d6871371a5dd93629c7c00ae725c6aece5c510bd20'),
        ('site:services[7].proof[0]', 'f83eb2f19a4c1f86b8d938167e3f45a02c25d11ef29cb5898221666cdcc786f7'),
    ),
    'resume:apple:1:b1': (
        ('site:careerLedger[10].bullets[8]', '486f0f25d067a2faba0056a89c9f4390077d9e9f72c8afc00bc42fc5e6b66b3b'),
    ),
    'resume:apple:1:b2': (
        ('site:careerLedger[10].bullets[6]', 'c0b5de84200225c3ce1eed7d5f9ac41fe9c6aabae0eafae31fab057e79964d2b'),
    ),
    'resume:apple:1:b5': (
        ('site:careerLedger[10].bullets[3]', '10ec8b29c8125397601e0017f0ae93f7eee401dd1947616f5436029dfa8c4d69'),
    ),
    'resume:apple:1:b6': (
        ('site:careerLedger[10].bullets[9]', '8fc580a80ad8f945dd0aff6b78a424e97a8bfe803fdf6d4b7c7a5f8aab047655'),
    ),
    'resume:apple:1:b7': (
        ('site:careerLedger[10].bullets[2]', 'f1f3bb5b0bce3d98eab7be61b7d480a69902bf294a7cddcfa2ae792103eddbae'),
    ),
}
DIRECT_SUPPORTS = {
    'resume:apple:1:b0': (
        'apple-team-geography',
        'site:services[6].proof[0]',
        '7175e1e1a55e893b848472a89b54d0054631048cf604e1b7c5c5e08f302de414',
        'Led an eight-engineer team at Apple across Seattle, London, and partner sites in Europe and Latin America.',
        '7175e1e1a55e893b848472a89b54d0054631048cf604e1b7c5c5e08f302de414',
        'same-owner',
    ),
    'resume:apple:1:b1': (
        'graphrag-verification-detail',
        'site:careerLedger[10].bullets[8]',
        '486f0f25d067a2faba0056a89c9f4390077d9e9f72c8afc00bc42fc5e6b66b3b',
        'The workflow verifies generated entities and relationships against canonical facts and identifies precise discrepancies.',
        'c70fe262a8a4339bbd84fada69acf947a6c7f5f4eacf6c5953390a17c06529b0',
        'same-proof-pane',
    ),
    'resume:apple:1:b2': (
        'entity-resolution-algorithms',
        'site:careerLedger[10].bullets[6]',
        'c0b5de84200225c3ce1eed7d5f9ac41fe9c6aabae0eafae31fab057e79964d2b',
        'The classifiers included logistic regression, random forests, and gradient-boosted trees, with canonical identity integration.',
        '7ed7f7a5e1dec994a6554454c19cd51e4b446e5be36a140472bdafa266b6b03c',
        'same-proof-pane',
    ),
    'resume:apple:1:b5': (
        'crucible-adoption-detail',
        'site:careerLedger[10].bullets[3]',
        '10ec8b29c8125397601e0017f0ae93f7eee401dd1947616f5436029dfa8c4d69',
        'Used in daily operations and adopted by QA, Operations, and upstream/downstream teams.',
        '708c74c462f7df6e5394f0a335848e6fb1ab9869e4d483c0b10100d333bb7c07',
        'same-proof-pane',
    ),
    'resume:apple:1:b6': (
        'ml-workflow-engineering-detail',
        'site:careerLedger[10].bullets[9]',
        '8fc580a80ad8f945dd0aff6b78a424e97a8bfe803fdf6d4b7c7a5f8aab047655',
        'I own the architecture and hands-on engineering, including difficult candidate matching and canonical entity generation.',
        '7be700cc6023479db88cb55ed343c422abe4ccbfb89c6392c56310ab080ed287',
        'same-proof-pane',
    ),
    'resume:apple:1:b7': (
        'migration-stakeholder-alignment',
        'site:careerLedger[10].bullets[2]',
        'f1f3bb5b0bce3d98eab7be61b7d480a69902bf294a7cddcfa2ae792103eddbae',
        'That coaching path also built stakeholder alignment around migration performance.',
        '400e226c89d006839ccea54cfcfc14aab85c5fb2a38a16ff6c279656dbf9b182',
        'same-proof-pane',
    ),
}
COMPOSITION_EQUIVALENTS = {
    'apple-design-review-outcomes': (
        ('site:services[2].proof[0]', 'e4c6bd305d7331f3131f9117f73e2b67a2081f8c55280183b3885d046434e2b2'),
        ('site:services[2].proof[1]', '9f34ff91392f968ee6d022bbb34cb2c7958e90c4a35a0d1b60324b8e344e954f'),
    ),
}
B4_COMPONENTS = (
    'site:careerLedger[10].bullets[4]',
    'site:careerLedger[10].bullets[5]',
    'site:careerLedger[10].bullets[10]',
)
B4_WITNESSES = (
    ('millions-of-tracks', 'site:careerLedger[10].bullets[4]', 'millions of tracks'),
    ('streaming-migration-stack', 'site:careerLedger[10].bullets[5]',
     'Spark batch processing to Flink, Kafka, and Cassandra streaming'),
    ('sixty-hours-to-one-minute', 'site:careerLedger[10].bullets[5]',
     'from approximately 60 hours to one minute'),
    ('partial-and-complete-edits', 'site:careerLedger[10].bullets[5]',
     'partial and complete edits to entities, relationships, and properties'),
    ('stakeholder-backing', 'site:careerLedger[10].bullets[10]',
     'Secured agreement from Operations, PMs, and client teams'),
    ('logic-consolidation', 'site:careerLedger[10].bullets[10]',
     'consolidating duplicated batch, real-time, and curation logic into one flow'),
)
B8_CANONICAL_COMPONENT = 'site:careerLedger[10].bullets[7]'
B8_SUPPORTING_MIRROR = 'site:services[2].proof[0]'
EXPECTED_HEADING = 'The systems I build with'
EXPECTED_ARTIFACT_PATHS = {
    'content': 'site/content.json',
    'builder': 'site/_build/build.py',
    'careerHtml': 'site/career.html',
    'registry': '.claude/rubric/registry.json',
}
VOID = {'br', 'img', 'meta', 'link', 'input', 'hr', 'source', 'wbr', 'area', 'col', 'embed', 'param', 'track'}
SKIP = {'script', 'style', 'svg', 'template', 'head', 'noscript'}
HEADINGS = {'h1', 'h2', 'h3', 'h4', 'h5', 'h6'}


class Node:
    __slots__ = ('tag', 'attrs', 'parent', 'children', 'line')

    def __init__(self, tag, attrs, parent, line=0):
        self.tag = tag
        self.attrs = dict(attrs)
        self.parent = parent
        self.children = []
        self.line = line

    def descendants(self):
        for child in self.children:
            if isinstance(child, Node):
                yield child
                yield from child.descendants()

    def lineage(self):
        node = self
        while node is not None:
            yield node
            node = node.parent

    def text(self):
        out = []

        def visit(node):
            for child in node.children:
                if isinstance(child, str):
                    out.append(child)
                elif child.tag not in SKIP:
                    visit(child)

        visit(self)
        return ' '.join(' '.join(out).split())


class Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('root', {}, None)
        self.current = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.current, self.getpos()[0])
        self.current.children.append(node)
        if tag not in VOID:
            self.current = node

    def handle_startendtag(self, tag, attrs):
        self.current.children.append(Node(tag, attrs, self.current, self.getpos()[0]))

    def handle_endtag(self, tag):
        node = self.current
        while node is not self.root and node.tag != tag:
            node = node.parent
        if node is not self.root:
            self.current = node.parent

    def handle_data(self, data):
        self.current.children.append(data)


def parse(text):
    parser = Parser()
    parser.feed(text)
    return parser.root


def digest_text(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def digest_file(path):
    with open(path, 'rb') as stream:
        return hashlib.sha256(stream.read()).hexdigest()


def load_json(path):
    with open(path) as stream:
        return json.load(stream)


def failure(kind, where, message):
    return {'kind': kind, 'where': where, 'message': message}


def transformed(text, transform):
    if transform in (None, '', 'exact-source'):
        return text
    if transform == 'words.no_dash':
        return words.no_dash(text)
    if transform == 'career-date-ascii-hyphen':
        if text.count(' – ') != 1:
            raise ValueError('career date transform needs exactly one spaced en dash')
        return text.replace(' – ', ' - ')
    raise ValueError(f'unknown display transform {transform}')


def is_hidden(node):
    for ancestor in node.lineage():
        if 'hidden' in ancestor.attrs:
            return True
        if ancestor.attrs.get('aria-hidden', '').strip().casefold() == 'true':
            return True
        declarations = [part.strip().casefold().replace(' ', '')
                        for part in ancestor.attrs.get('style', '').split(';')]
        if 'display:none' in declarations or 'visibility:hidden' in declarations:
            return True
    return False


def nodes_with(root, attribute, value=None):
    nodes = []
    for node in root.descendants():
        if attribute not in node.attrs:
            continue
        if value is None or node.attrs.get(attribute) == value:
            nodes.append(node)
    return nodes


def nodes_by_id(root, value):
    return [node for node in root.descendants() if node.attrs.get('id') == value]


def nearest_attribute(node, attribute):
    return next((ancestor for ancestor in node.lineage() if attribute in ancestor.attrs), None)


def owner_failure(node, owner, registry, root):
    unit = owner.get('unit')
    block = owner.get('block')
    registered = registry.get('units', {}).get(unit) or {}
    if owner.get('page') != 'career' or registered.get('home') != 'career' or registered.get('block') != block:
        return 'contract owner differs from the Career registry'
    blocks = nodes_by_id(root, block)
    if len(blocks) != 1:
        return f'owner block #{block} must exist exactly once; found {len(blocks)}'
    lineage = list(node.lineage())
    if blocks[0] not in lineage:
        return f'marker is outside registered owner block #{block}'
    nearest_owner = next((ancestor.attrs.get('data-career-owner') for ancestor in lineage
                          if ancestor.attrs.get('data-career-owner')), None)
    if nearest_owner != unit:
        return f'nearest real Career owner is {nearest_owner!r}, expected {unit!r}'
    return None


def authorized_support_specs(contract):
    specs = []
    for item in contract.get('directVisibleRepairs') or []:
        for support in item.get('supportingVisibleLines') or []:
            specs.append({
                'acceptedFactId': item.get('acceptedFactId'),
                'owner': item.get('owner'),
                'id': support.get('id'),
                'text': support.get('text'),
                'sourceFactId': support.get('sourceFactId'),
                'relation': support.get('relation'),
            })
    return specs


def validate_contract_schema(contract, facts_by_id, registry):
    failures = []
    direct = contract.get('directVisibleRepairs') or []
    compositions = contract.get('compositions') or []
    direct_ids = tuple(item.get('acceptedFactId') for item in direct)
    composition_ids = tuple(item.get('id') for item in compositions)
    composition_fact_ids = tuple(item.get('acceptedFactId') for item in compositions)
    component_ids = tuple(sorted({component.get('factId') for composition in compositions
                                  for component in composition.get('components', [])}))
    if set(direct_ids) != set(EXPECTED_DIRECT_IDS) or len(direct_ids) != len(EXPECTED_DIRECT_IDS):
        failures.append(failure('contract-schema', 'directVisibleRepairs',
                                f'exact nine accepted IDs differ: {list(direct_ids)}'))
    if composition_ids != EXPECTED_COMPOSITION_IDS:
        failures.append(failure('contract-schema', 'compositions',
                                f'exact composition order differs: {list(composition_ids)}'))
    if composition_fact_ids != EXPECTED_COMPOSITION_FACT_IDS:
        failures.append(failure('contract-schema', 'compositions',
                                f'exact accepted composition IDs differ: {list(composition_fact_ids)}'))
    if component_ids != tuple(sorted(EXPECTED_COMPONENT_IDS)):
        failures.append(failure('contract-schema', 'components',
                                f'exact 24 real component IDs differ: {list(component_ids)}'))
    counts = contract.get('expectedCounts') or {}
    if counts != {'directVisibleRepairs': 9, 'compositions': 12, 'uniqueComponentFactIds': 24}:
        failures.append(failure('contract-schema', 'expectedCounts', 'Career evidence counts are not exactly 9/12/24'))
    marker_policy = contract.get('markerPolicy') or {}
    expected_policy = {
        'directAcceptedFactAttribute': 'data-career-accepted-fact',
        'componentFactAttribute': 'data-fact-id',
        'directAcceptedFactOccurrences': 1,
        'componentOccurrences': 1,
        'unmarkedTextDoesNotCount': True,
        'allMarkersMustBeDescendantsOfExactOwnerBlock': True,
        'syntheticFactIdsForbidden': True,
    }
    if marker_policy != expected_policy:
        failures.append(failure('contract-schema', 'markerPolicy', 'Career marker policy changed'))
    heading = contract.get('sectionHeading') or {}
    heading_owner = heading.get('owner') or {}
    if (heading.get('text') != EXPECTED_HEADING or heading.get('ariaLabelledby') != 'resume-take-h'
            or heading.get('occurrences') != 1
            or heading_owner != {'page': 'career', 'unit': 'resume-take', 'block': 'resume-take'}):
        failures.append(failure('contract-schema', 'sectionHeading', 'Résumé skills heading contract changed'))
    if ((registry.get('units') or {}).get('resume-take') or {}).get('block') != 'resume-take':
        failures.append(failure('contract-schema', 'registry:resume-take', 'resume-take block is not registered'))
    if 'resume-take' not in ((registry.get('pages') or {}).get('career') or {}).get('units', []):
        failures.append(failure('contract-schema', 'registry:career', 'resume-take is absent from the Career page units'))
    for fact_id in (*EXPECTED_DIRECT_IDS, *EXPECTED_COMPOSITION_FACT_IDS, *EXPECTED_COMPONENT_IDS,
                    B8_SUPPORTING_MIRROR,
                    *(fact_id for records in DIRECT_EQUIVALENTS.values() for fact_id, _digest in records),
                    *(record[1] for record in DIRECT_SUPPORTS.values()),
                    *(fact_id for records in COMPOSITION_EQUIVALENTS.values() for fact_id, _digest in records)):
        if fact_id not in facts_by_id:
            failures.append(failure('fact-source', fact_id, 'required real fact ID is absent from facts.json'))

    direct_by_id = {item.get('acceptedFactId'): item for item in direct}
    for accepted_id in EXPECTED_DIRECT_IDS:
        item = direct_by_id.get(accepted_id) or {}
        actual_equivalents = tuple((record.get('factId'), record.get('textSha256'))
                                   for record in item.get('equivalentSourceFacts') or [])
        expected_equivalents = DIRECT_EQUIVALENTS.get(accepted_id, ())
        if actual_equivalents != expected_equivalents:
            failures.append(failure('contract-schema', accepted_id,
                                    'direct repair equivalent-source mapping changed'))
        actual_supports = tuple((record.get('id'), record.get('sourceFactId'),
                                 record.get('sourceTextSha256'), record.get('text'),
                                 record.get('textSha256'), record.get('relation'))
                                for record in item.get('supportingVisibleLines') or [])
        expected_support = (DIRECT_SUPPORTS[accepted_id],) if accepted_id in DIRECT_SUPPORTS else ()
        if actual_supports != expected_support:
            failures.append(failure('contract-schema', accepted_id,
                                    'direct repair supporting-line mapping changed'))

    composition_by_id = {item.get('id'): item for item in compositions}
    for composition_id in EXPECTED_COMPOSITION_IDS:
        item = composition_by_id.get(composition_id) or {}
        actual_equivalents = tuple((record.get('factId'), record.get('textSha256'))
                                   for record in item.get('equivalentSourceFacts') or [])
        if actual_equivalents != COMPOSITION_EQUIVALENTS.get(composition_id, ()):
            failures.append(failure('contract-schema', composition_id,
                                    'composition equivalent-source mapping changed'))
    return failures


def validate_artifacts(root_dir, contract):
    failures = []
    bindings = contract.get('artifactBindings') or {}
    if set(bindings) != set(EXPECTED_ARTIFACT_PATHS):
        failures.append(failure('contract-schema', 'artifactBindings', 'Career artifact binding keys changed'))
        return failures
    for name, expected_path in EXPECTED_ARTIFACT_PATHS.items():
        binding = bindings.get(name) or {}
        where = f'artifactBindings.{name}'
        if binding.get('path') != expected_path:
            failures.append(failure('contract-schema', where, f'artifact path must be {expected_path}'))
            continue
        path = os.path.join(root_dir, expected_path)
        if not os.path.isfile(path):
            failures.append(failure('artifact-drift', where, f'missing artifact {expected_path}'))
            continue
        actual = digest_file(path)
        if actual != binding.get('sha256'):
            failures.append(failure('artifact-drift', where,
                                    f'{expected_path} hash drifted: expected {binding.get("sha256")}, found {actual}'))
    return failures


def validate_dom(career_html, other_html, contract, facts_by_id, registry):
    failures = []
    root = parse(career_html)
    other_roots = [(name, parse(text)) for name, text in other_html.items()]
    direct_attr = 'data-career-accepted-fact'
    component_attr = 'data-fact-id'

    all_direct = [('career', node) for node in nodes_with(root, direct_attr)]
    for name, other_root in other_roots:
        all_direct.extend((name, node) for node in nodes_with(other_root, direct_attr))
    expected_direct = set(EXPECTED_DIRECT_IDS)
    stray_direct = [(page, node.attrs.get(direct_attr)) for page, node in all_direct
                    if node.attrs.get(direct_attr) not in expected_direct]
    if stray_direct:
        failures.append(failure('marker-count', direct_attr, f'unknown Career accepted markers: {stray_direct}'))

    for item in contract.get('directVisibleRepairs') or []:
        fact_id = item.get('acceptedFactId')
        matches = [(page, node) for page, node in all_direct if node.attrs.get(direct_attr) == fact_id]
        if len(matches) != 1:
            failures.append(failure('marker-count', fact_id,
                                    f'direct accepted marker must occur exactly once site-wide; found {len(matches)}'))
            continue
        page, node = matches[0]
        if page != 'career':
            failures.append(failure('wrong-owner', fact_id, f'direct accepted marker moved to {page}'))
            continue
        source = facts_by_id.get(fact_id) or {}
        if source.get('source') != 'resume' or source.get('show') != 'must':
            failures.append(failure('accepted-source', fact_id, 'accepted Career fact is not a must-show résumé fact'))
        source_text = source.get('text', '')
        if digest_text(source_text) != item.get('acceptedTextSha256'):
            failures.append(failure('accepted-source', fact_id, 'accepted source text hash differs from contract'))
        try:
            expected_text = transformed(source_text, item.get('displayTransform'))
        except ValueError as error:
            failures.append(failure('contract-schema', fact_id, str(error)))
            expected_text = source_text
        if item.get('displayTransform'):
            if digest_text(expected_text) != item.get('visibleTextSha256'):
                failures.append(failure('contract-schema', fact_id, 'derived visible-text hash differs from contract'))
        elif 'visibleTextSha256' in item:
            failures.append(failure('contract-schema', fact_id, 'visible hash exists without a governed display transform'))
        if node.text() != expected_text:
            failures.append(failure('text-drift', fact_id, 'direct accepted marker text differs from independently derived source text'))
        owner_error = owner_failure(node, item.get('owner') or {}, registry, root)
        if owner_error:
            failures.append(failure('wrong-owner', fact_id, owner_error))
        if is_hidden(node):
            failures.append(failure('hidden', fact_id, 'direct accepted fact is hidden'))
        for equivalent in item.get('equivalentSourceFacts') or []:
            equivalent_id = equivalent.get('factId')
            equivalent_fact = facts_by_id.get(equivalent_id) or {}
            if (equivalent_fact.get('source') != 'site'
                    or digest_text(equivalent_fact.get('text', '')) != equivalent.get('textSha256')):
                failures.append(failure('fact-source', equivalent_id or fact_id,
                                        'direct equivalent source fact differs from its governed text'))
        for support in item.get('supportingVisibleLines') or []:
            support_id = support.get('id') or fact_id
            source_id = support.get('sourceFactId')
            source = facts_by_id.get(source_id) or {}
            if (source.get('source') != 'site'
                    or digest_text(source.get('text', '')) != support.get('sourceTextSha256')):
                failures.append(failure('fact-source', support_id,
                                        'supporting line source fact differs from its governed text'))
            if digest_text(support.get('text', '')) != support.get('textSha256'):
                failures.append(failure('contract-schema', support_id,
                                        'supporting visible-line hash differs from contract text'))
            support_nodes = [candidate for candidate in root.descendants()
                             if candidate.tag == 'div'
                             and 'route' in candidate.attrs.get('class', '').split()
                             and candidate.text() == support.get('text')]
            if len(support_nodes) != 1:
                failures.append(failure('support-line', support_id,
                                        f'supporting line must occur exactly once; found {len(support_nodes)}'))
                continue
            support_node = support_nodes[0]
            direct_pane = nearest_attribute(node, 'data-proof-pane')
            support_pane = nearest_attribute(support_node, 'data-proof-pane')
            if (support.get('relation') == 'same-proof-pane'
                    and (direct_pane is None or support_pane is not direct_pane)):
                failures.append(failure('support-line', support_id,
                                        'supporting line moved outside its direct accepted fact proof pane'))
            owner_error = owner_failure(support_node, item.get('owner') or {}, registry, root)
            if owner_error:
                failures.append(failure('wrong-owner', support_id, owner_error))
            if is_hidden(support_node):
                failures.append(failure('hidden', support_id, 'supporting visible line is hidden'))

    component_records = {}
    for composition in contract.get('compositions') or []:
        accepted_id = composition.get('acceptedFactId')
        accepted = facts_by_id.get(accepted_id) or {}
        if accepted.get('source') != 'resume' or accepted.get('show') != 'must':
            failures.append(failure('accepted-source', accepted_id or 'composition',
                                    'composition target is not a must-show résumé fact'))
        if digest_text(accepted.get('text', '')) != composition.get('acceptedTextSha256'):
            failures.append(failure('accepted-source', accepted_id or 'composition',
                                    'composition accepted source hash differs from contract'))
        owner = composition.get('owner') or {}
        for equivalent in composition.get('equivalentSourceFacts') or []:
            equivalent_id = equivalent.get('factId')
            equivalent_fact = facts_by_id.get(equivalent_id) or {}
            if (equivalent_fact.get('source') != 'site'
                    or digest_text(equivalent_fact.get('text', '')) != equivalent.get('textSha256')):
                failures.append(failure('fact-source', equivalent_id or accepted_id,
                                        'composition equivalent source fact differs from its governed text'))
        for component in composition.get('components') or []:
            fact_id = component.get('factId')
            signature = {
                'textSha256': component.get('textSha256'),
                'displayTransform': component.get('displayTransform'),
                'visibleTextSha256': component.get('visibleTextSha256'),
                'owner': owner,
            }
            prior = component_records.get(fact_id)
            if prior is not None and prior != signature:
                failures.append(failure('contract-schema', fact_id, 'reused component has inconsistent text, transform, or owner'))
            component_records[fact_id] = signature

    component_nodes = {fact_id: nodes_with(root, component_attr, fact_id) for fact_id in component_records}
    for fact_id, record in component_records.items():
        nodes = component_nodes[fact_id]
        external_nodes = [(page, node) for page, other_root in other_roots
                          for node in nodes_with(other_root, component_attr, fact_id)]
        if external_nodes:
            failures.append(failure('marker-count', fact_id,
                                    f'canonical component marker also appears outside Career on {[page for page, _node in external_nodes]}'))
        if len(nodes) != 1:
            failures.append(failure('marker-count', fact_id,
                                    f'component marker must occur exactly once on Career; found {len(nodes)}'))
            continue
        node = nodes[0]
        source = facts_by_id.get(fact_id) or {}
        source_text = source.get('text', '')
        if digest_text(source_text) != record.get('textSha256'):
            failures.append(failure('fact-source', fact_id, 'component fact-store text hash differs from contract'))
        try:
            expected_text = transformed(source_text, record.get('displayTransform'))
        except ValueError as error:
            failures.append(failure('contract-schema', fact_id, str(error)))
            expected_text = source_text
        if record.get('displayTransform'):
            if digest_text(expected_text) != record.get('visibleTextSha256'):
                failures.append(failure('contract-schema', fact_id, 'derived component visible-text hash differs from contract'))
        elif record.get('visibleTextSha256') is not None:
            failures.append(failure('contract-schema', fact_id, 'component visible hash exists without a governed display transform'))
        if node.text() != expected_text:
            failures.append(failure('text-drift', fact_id, 'component marker text differs from its exact fact-store text'))
        owner_error = owner_failure(node, record.get('owner') or {}, registry, root)
        if owner_error:
            failures.append(failure('wrong-owner', fact_id, owner_error))
        if is_hidden(node):
            failures.append(failure('hidden', fact_id, 'component fact is hidden'))

    b4 = next((item for item in contract.get('compositions', [])
               if item.get('id') == 'apple-streaming-migration-scope'), {})
    decision = b4.get('coverageDecision') or {}
    contract_components = tuple(decision.get('requiredComponentFactIds') or [])
    witnesses = tuple((item.get('id'), item.get('componentFactId'), item.get('exactText'))
                      for item in decision.get('requiredClauseWitnesses') or [])
    if (decision.get('type') != 'reviewed-exact-atom-entailment'
            or contract_components != B4_COMPONENTS or witnesses != B4_WITNESSES):
        failures.append(failure('contract-schema', 'resume:apple:1:b4', 'reviewed three-atom entailment contract changed'))
    for witness_id, fact_id, exact_text in B4_WITNESSES:
        source_text = (facts_by_id.get(fact_id) or {}).get('text', '')
        nodes = component_nodes.get(fact_id, [])
        visible_text = nodes[0].text() if len(nodes) == 1 else ''
        if exact_text not in source_text or exact_text not in visible_text:
            failures.append(failure('b4-entailment', witness_id,
                                    f'Apple b4 witness is absent from {fact_id}'))

    b8 = next((item for item in contract.get('compositions', [])
               if item.get('id') == 'apple-design-review-outcomes'), {})
    policy = b8.get('canonicalOwnerPolicy') or {}
    mirror = facts_by_id.get(B8_SUPPORTING_MIRROR) or {}
    if (policy.get('canonicalComponentFactId') != B8_CANONICAL_COMPONENT
            or policy.get('supportingMirrorFactId') != B8_SUPPORTING_MIRROR
            or policy.get('supportingMirrorTextSha256') != digest_text(mirror.get('text', ''))
            or policy.get('supportingMirrorMaySatisfyAcceptedCoverage') is not False
            or policy.get('supportingMirrorMayCarryAcceptedMarker') is not False
            or policy.get('supportingMirrorOccurrencesInsideCanonicalOwner') != 0
            or policy.get('acceptedOwnerOccurrences') != 1
            or policy.get('duplicateOwnerDriftForbidden') is not True):
        failures.append(failure('contract-schema', 'resume:apple:1:b8', 'Career-canonical/Services-non-covering policy changed'))
    mirror_component_markers = nodes_with(root, component_attr, B8_SUPPORTING_MIRROR)
    mirror_accepted_markers = []
    for page, node in all_direct:
        if node.attrs.get(direct_attr) == 'resume:apple:1:b8':
            mirror_accepted_markers.append((page, node))
    if mirror_component_markers or mirror_accepted_markers:
        failures.append(failure('b8-canonical-owner', 'resume:apple:1:b8',
                                'Services mirror or duplicate accepted marker attempted to satisfy Career coverage'))
    canonical_nodes = component_nodes.get(B8_CANONICAL_COMPONENT, [])
    if len(canonical_nodes) != 1 or owner_failure(canonical_nodes[0], b8.get('owner') or {}, registry, root):
        failures.append(failure('b8-canonical-owner', 'resume:apple:1:b8',
                                'Apple b8 is not covered by its sole Career-canonical component'))

    heading_contract = contract.get('sectionHeading') or {}
    block_nodes = nodes_by_id(root, 'resume-take')
    heading_nodes = nodes_by_id(root, 'resume-take-h')
    if len(block_nodes) != 1 or len(heading_nodes) != 1:
        failures.append(failure('heading', 'resume-take', 'Résumé skills block and heading must each occur exactly once'))
    else:
        block = block_nodes[0]
        heading = heading_nodes[0]
        if (block.attrs.get('aria-labelledby') != 'resume-take-h' or heading.tag not in HEADINGS
                or heading not in list(block.descendants()) or heading.text() != EXPECTED_HEADING
                or EXPECTED_HEADING not in (registry.get('units', {}).get('resume-take', {}).get('names') or [])):
            failures.append(failure('heading', 'resume-take', 'Résumé skills heading lost exact text, ancestry, label, or registry authority'))
        if is_hidden(block) or is_hidden(heading):
            failures.append(failure('hidden', 'resume-take', 'Résumé skills heading or block is hidden'))

    return failures


def validate(root_dir=ROOT, site_dir=None, contract_path=FINAL_CONTRACT, require_final=True,
             career_html=None, other_html=None, verify_artifacts=True):
    root_dir = os.path.abspath(root_dir)
    site_dir = os.path.abspath(site_dir or os.path.join(root_dir, 'site'))
    absolute_contract = contract_path if os.path.isabs(contract_path) else os.path.join(root_dir, contract_path)
    failures = []
    try:
        contract = load_json(absolute_contract)
        facts = load_json(os.path.join(root_dir, '.claude/rubric/facts/facts.json'))
        registry = load_json(os.path.join(root_dir, '.claude/rubric/registry.json'))
        authority = load_json(os.path.join(root_dir, '.claude/rubric/authority.json'))
    except (OSError, json.JSONDecodeError) as error:
        return {'ok': False, 'failures': [failure('contract-schema', 'Career evidence inputs', str(error))],
                'coveredFactIds': [], 'counts': {}}
    facts_by_id = {item.get('id'): item for item in facts}
    if len(facts_by_id) != len(facts):
        failures.append(failure('fact-source', 'facts.json', 'duplicate fact IDs prevent Career validation'))
    if require_final and contract.get('status') != 'accepted-live-dom':
        failures.append(failure('contract-schema', 'status', 'Career evidence contract is not accepted-live-dom'))
    if contract.get('schemaVersion') != 1 or contract.get('route') != 'career':
        failures.append(failure('contract-schema', 'identity', 'Career evidence contract identity changed'))
    baseline_hash = ((authority.get('sources') or {}).get('acceptedBaseline') or {}).get('sha256')
    resume_path = os.path.join(root_dir, 'public/assets/Resume.pdf')
    actual_resume_hash = digest_file(resume_path) if os.path.isfile(resume_path) else None
    if contract.get('acceptedResumeSha256') != baseline_hash or actual_resume_hash != baseline_hash:
        failures.append(failure('accepted-source', 'acceptedResumeSha256',
                                'Career contract, authority, and accepted résumé bytes do not share one hash'))
    failures.extend(validate_contract_schema(contract, facts_by_id, registry))
    if verify_artifacts:
        failures.extend(validate_artifacts(root_dir, contract))
    if career_html is None:
        with open(os.path.join(site_dir, 'career.html')) as stream:
            career_html = stream.read()
    if other_html is None:
        other_html = {}
        for page, page_record in (registry.get('pages') or {}).items():
            if page == 'career':
                continue
            path = os.path.join(site_dir, page_record.get('file', ''))
            if os.path.isfile(path):
                with open(path) as stream:
                    other_html[page] = stream.read()
    failures.extend(validate_dom(career_html, other_html, contract, facts_by_id, registry))
    covered = list(EXPECTED_DIRECT_IDS + EXPECTED_COMPOSITION_FACT_IDS)
    for records in DIRECT_EQUIVALENTS.values():
        covered.extend(fact_id for fact_id, _digest in records)
    for records in COMPOSITION_EQUIVALENTS.values():
        covered.extend(fact_id for fact_id, _digest in records)
    covered.extend(record[1] for record in DIRECT_SUPPORTS.values())
    covered = list(dict.fromkeys(covered))
    return {
        'ok': not failures,
        'failures': failures,
        'coveredFactIds': covered,
        'authorizedVisibleLines': authorized_support_specs(contract) if not failures else [],
        'counts': {
            'directVisibleRepairs': len(EXPECTED_DIRECT_IDS),
            'compositions': len(EXPECTED_COMPOSITION_IDS),
            'uniqueComponentFactIds': len(EXPECTED_COMPONENT_IDS),
        },
        'inputs': {
            'contract': digest_file(absolute_contract),
            'careerHtml': digest_text(career_html),
            'acceptedResume': actual_resume_hash,
        },
    }


def parse_args(argv):
    parser = argparse.ArgumentParser(description='Validate sealed Career evidence coverage.')
    parser.add_argument('--root', default=ROOT)
    parser.add_argument('--site-dir')
    parser.add_argument('--contract', default=FINAL_CONTRACT)
    parser.add_argument('--allow-proposed', action='store_true')
    parser.add_argument('--json')
    parser.add_argument('--quiet', action='store_true')
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    report = validate(root_dir=args.root, site_dir=args.site_dir, contract_path=args.contract,
                      require_final=not args.allow_proposed)
    if args.json:
        with open(args.json, 'w') as stream:
            json.dump(report, stream, indent=2)
            stream.write('\n')
    if not args.quiet:
        if report['ok']:
            counts = report['counts']
            print(f"career evidence: {counts['directVisibleRepairs']} direct, "
                  f"{counts['compositions']} compositions, {counts['uniqueComponentFactIds']} components verified")
        else:
            for item in report['failures']:
                print(f"FAIL {item['kind']} {item['where']}: {item['message']}")
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
