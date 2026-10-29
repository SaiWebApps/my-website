#!/usr/bin/env python3
"""Static rubric checks on the built transit pages. No regular expressions: every check compares the pages with
the fact store (facts/facts.json), the registry, or the page structure itself.

Usage: guard.py [--dir DIR] [--json OUT] [--quiet]     DIR defaults to site. Exit 1 on any FAIL.

How a piece of text passes:
  it is one of the navigation words in approved.json ("chrome"), or
  it is a date, or
  it is (part of) a fact in the fact store that is allowed to be shown, and that fact belongs to the unit whose block
  holds the text, or the text links to that fact's unit, or it sits in navigation pointing at that unit.
Anything else is unsourced (invented) or contamination (another unit's fact). Then every fact marked "must" has to be
shown somewhere on the site: nothing he gave may be cut.
Rendered checks (spacing, overlap, phones, clicks, theme) are in site/_build/audit.mjs.
"""
import glob, hashlib, json, os, sys
from html.parser import HTMLParser
from pypdf import PdfReader

RUBRIC = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(RUBRIC))
DEFAULT_DIR = os.path.join(ROOT, 'site')
sys.path.insert(0, os.path.join(RUBRIC, 'facts'))
import words
sys.path.insert(0, RUBRIC)
import career_evidence

REG = json.load(open(os.path.join(RUBRIC, 'registry.json')))
APPROVED = json.load(open(os.path.join(RUBRIC, 'approved.json')))
CONTENT = json.load(open(os.path.join(ROOT, 'site/content.json')))
AUTHORITY = json.load(open(os.path.join(RUBRIC, 'authority.json')))
PROTECTED = json.load(open(os.path.join(ROOT, AUTHORITY['sources']['protectedClaims']['path'])))
SPEAKING_EVIDENCE = json.load(open(os.path.join(ROOT, AUTHORITY['sources']['speakingEvidenceContract']['path'])))
RESEARCH_EVIDENCE = json.load(open(os.path.join(ROOT, AUTHORITY['sources']['researchEvidenceContract']['path'])))
PROVENANCE_GROUPS = tuple(
    claim for claim in PROTECTED.get('typed_claims', [])
    if claim.get('claim_type') == 'provenance_group'
)
RESUME_EQUIVALENCE = {
    item['factId']: words.norm(item['acceptedText'])
    for item in json.load(open(os.path.join(ROOT, AUTHORITY['sources']['acceptedBaseline']['equivalencePath'])))['equivalences']
}
MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

# ---------------------------------------------------------------- parsing
VOID = {'br', 'img', 'meta', 'link', 'input', 'hr', 'source', 'wbr', 'area', 'col', 'embed', 'param', 'track'}
HEADS = {'h1', 'h2', 'h3', 'h4', 'h5', 'h6'}
LINES = {'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'figcaption', 'blockquote', 'dd', 'dt', 'td', 'th', 'summary'}
SKIP_TAGS = {'script', 'style', 'svg', 'template', 'head', 'noscript'}

class Node:
    __slots__ = ('tag', 'a', 'p', 'k', 'line')
    def __init__(s, tag, attrs, parent, line=0):
        s.tag, s.a, s.p, s.k, s.line = tag, dict(attrs), parent, [], line
    def cls(s):
        return (s.a.get('class') or '').split()
    def anc(s):
        n = s
        while n is not None:
            yield n
            n = n.p
    def all(s):
        for k in s.k:
            if not isinstance(k, str):
                yield k
                yield from k.all()
    def text(s):
        out = []
        def w(n):
            for k in n.k:
                if isinstance(k, str):
                    out.append(k)
                elif k.tag not in SKIP_TAGS:
                    w(k)
        w(s)
        return ' '.join(' '.join(out).split())

class Parser(HTMLParser):
    def __init__(s):
        super().__init__(convert_charrefs=True)
        s.root = Node('root', {}, None)
        s.cur = s.root
    def handle_starttag(s, t, a):
        n = Node(t, a, s.cur, s.getpos()[0])
        s.cur.k.append(n)
        if t not in VOID:
            s.cur = n
    def handle_startendtag(s, t, a):
        s.cur.k.append(Node(t, a, s.cur, s.getpos()[0]))
    def handle_endtag(s, t):
        c = s.cur
        while c is not s.root and c.tag != t:
            c = c.p
        if c is not s.root:
            s.cur = c.p
    def handle_data(s, d):
        s.cur.k.append(d)

def parse(html):
    p = Parser()
    p.feed(html)
    return p.root

# ---------------------------------------------------------------- the fact store
class Facts:
    def __init__(s):
        path = os.path.join(RUBRIC, 'facts/facts.json')
        s.ok = os.path.exists(path)
        s.all = json.load(open(path)) if s.ok else []
        s.by_id = {f['id']: f for f in s.all}
        def prepare(f):
            f['n'] = words.norm(f['text'])
            f['variants'] = tuple(dict.fromkeys((f['n'], words.norm(words.no_dash(f['text'])))))
        for f in s.all:
            prepare(f)
        # Direct-user corrections are repository-sealed facts. They are public-safe sources but are not automatically
        # placed by the renderer; the accepted layout chooses where they belong.
        for claim in AUTHORITY['sources']['protectedClaims'].get('claims', []):
            if not claim.get('publicText'):
                continue
            f = {'id': 'authority:' + claim['id'], 'unit': claim.get('unit'), 'field': 'claim',
                 'text': claim['publicText'], 'show': 'may',
                 'source': 'authority', 'twins': []}
            prepare(f)
            s.all.append(f); s.by_id[f['id']] = f
        # A unit's own names are facts of that unit.
        for u, v in REG['units'].items():
            for k, nm in enumerate(v.get('names', [])):
                f = {'id': f'name:{u}:{k}', 'unit': u, 'field': 'name', 'text': nm, 'show': 'may', 'source': 'registry', 'twins': []}
                prepare(f)
                s.all.append(f); s.by_id[f['id']] = f
        s.usable = [f for f in s.all if f['show'] in ('must', 'may') and not f.get('retired')]
        s.banned = [f for f in s.all if f['show'] == 'never' or f.get('retired')]
        s.chrome = {words.norm(x) for x in APPROVED['chrome']}
        s.index = {}
        for f in s.usable:
            for variant in f['variants']:
                for w in set(words.content(variant)):
                    if f not in s.index.setdefault(w, []):
                        s.index[w].append(f)

    def find(s, n):
        """Usable facts whose text contains n (both normalized)."""
        ws = words.content(n)
        if not ws:
            return []
        pool = min((s.index.get(w, []) for w in ws), key=len)
        return [f for f in pool if any(n in variant for variant in f['variants'])]

    def span(s, f, n):
        """Span of rendered text in either the source spelling or its governed no-dash equivalent."""
        for variant in f['variants']:
            index = variant.find(n)
            if index >= 0:
                return index, index + len(n)
        return -1, -1

    def find_banned(s, n):
        # a banned phrase (two words or more) inside a longer line counts; a one-word id or slug inside a sentence does not
        return [f for f in s.banned if any(n in variant or (len(variant.split()) >= 2 and variant in n) for variant in f['variants'])]

def is_date(n):
    toks = n.replace(',', ' ').replace('-', ' - ').replace('–', ' - ').replace('—', ' - ').split()
    if not toks:
        return False
    ok = {'to', '-', 'present', 'today', 'since', 'and'}
    months = {m.lower() for m in words.MONTHS}
    return any(t in months or (t.isdigit() and len(t) == 4) for t in toks) and all(t in months or t.isdigit() or t in ok for t in toks)

def is_career_proof_control(page, text, node, kind):
    """Allow only the exact accessible names owned by Career proof controls."""
    if page != 'career' or kind != 'aria-label':
        return False
    classes = set(node.cls())
    if node.tag == 'button' and 'cr-proof__step' in classes:
        labels = {'-1': 'Previous detail', '1': 'Next detail'}
        return labels.get(node.a.get('data-proof-step')) == text
    if node.tag != 'nav' or 'cr-proof' not in classes:
        return False
    entry = next((ancestor.a.get('data-entry-pane') for ancestor in node.anc()
                  if ancestor.a.get('data-entry-pane')), None)
    labels = {record['id']: f'More from {record["label"]}' for record in CONTENT['careerLedger']}
    return labels.get(entry) == text

# ---------------------------------------------------------------- the run
class Run:
    def __init__(s, d):
        s.dir = d
        s.fails = []
        s.facts = Facts()
        s.cover = {}      # fact id -> set of (start, end) character spans shown
        s.full = {}       # fact id -> {page: count} of times shown whole, outside navigation
        s.evidence_nodes = {}
        s.evidence_markers = {}
        s.evidence_lines = []
        s.evidence_descriptions = []
        s.evidence_links = []
        s.contract_covered = set()
        s.banned_names = list(AUTHORITY['sources']['retirements'].get('supplementalPublicExclusions', []))
        try:
            s.career_evidence_report = career_evidence.validate(ROOT, site_dir=d)
        except Exception as error:
            s.career_evidence_report = {
                'ok': False,
                'failures': [{'kind': 'contract-schema', 'where': 'Career evidence',
                              'message': f'Career evidence validator could not run: {error}'}],
                'coveredFactIds': [],
                'authorizedVisibleLines': [],
            }

    def fail(s, check, page, where, msg):
        key = f'{check}|{page}|{where}|' + ''.join('#' if ch.isdigit() else ch for ch in msg)
        s.fails.append({'check': check, 'page': page, 'where': where, 'msg': msg, 'key': key})

    def blocks(s, page):
        return {REG['units'][u]['block']: u for u in REG['pages'][page]['units']}

    def unit_of(s, node, page):
        b = s.blocks(page)
        for a in node.anc():
            if a.a.get('id') in b:
                return b[a.a['id']]
        return None

    def in_nav(s, node):
        navc = set(REG['nav'])
        for a in node.anc():
            if a.tag in ('nav', 'header', 'footer'):
                return True
            for c in a.cls():
                if c in navc or c.startswith(('map', 'stn', 'strip', 'stop', 'zone', 'cr-strip')):
                    return True
        return False

    def link_unit(s, node):
        """The unit a link around this node points to, or None."""
        for a in node.anc():
            if a.tag == 'a' and a.a.get('href'):
                f, _, frag = a.a['href'].partition('#')
                for u, v in REG['units'].items():
                    home = REG['pages'][v['home']]['file']
                    if (f in (home, '')) and frag == v['block']:
                        return u
                    if f == home and not frag and REG['pages'][v['home']]['lead'] == u:
                        return u
                return None
        return None

    def authority_groups(s, page, body):
        """Enforce typed provenance groups through DOM ancestry, never copy or CSS classes."""
        claims = [claim for claim in PROVENANCE_GROUPS if claim.get('page') == page]
        claim_ids = [claim.get('id') for claim in claims]
        expected_members = [unit for claim in claims for unit in claim.get('member_units', [])]
        all_groups = [node for node in body.all() if 'data-authority-group' in node.a]
        all_members = [node for node in body.all() if 'data-authority-member' in node.a]
        nodes_by_id = {}
        for node in body.all():
            if node.a.get('id'):
                nodes_by_id.setdefault(node.a['id'], []).append(node)

        rendered_group_ids = [node.a.get('data-authority-group') for node in all_groups]
        if rendered_group_ids != claim_ids:
            s.fail('A3', page, '[data-authority-group]',
                   f'authority groups must appear exactly once in protected-claim order: expected {claim_ids}, found {rendered_group_ids}')
        rendered_member_ids = [node.a.get('data-authority-member') for node in all_members]
        if (len(rendered_member_ids) != len(set(rendered_member_ids))
                or set(rendered_member_ids) != set(expected_members)):
            s.fail('A3', page, '[data-authority-member]',
                   f'authority members must be unique with no omissions or extras: expected {expected_members}, found {rendered_member_ids}')

        source_members = []
        for claim in claims:
            claim_id = claim.get('id')
            members = claim.get('member_units') or []
            source_members.extend(members)
            if (claim_id not in REG.get('authority_groups', [])
                    or claim.get('block') != claim.get('group_id')
                    or any(unit not in REG.get('units', {}) for unit in members)):
                s.fail('A3', page, claim_id or 'authority claim', 'typed authority group IDs do not match registry identities')
            heading_unit = claim.get('heading_unit')
            if heading_unit and REG['units'].get(heading_unit, {}).get('block') != claim.get('block'):
                s.fail('A3', page, claim_id, 'authority group root does not match its registered heading unit')
        if len(source_members) != len(set(source_members)):
            s.fail('A3', page, 'protected provenance groups', 'a typed member belongs to more than one authority group')

        state_attributes = {
            'data-ride', 'data-career-ride', 'data-blind', 'data-stop', 'data-go',
            'data-screen', 'data-cars', 'data-car', 'hidden', 'aria-selected',
            'aria-expanded', 'aria-pressed', 'aria-current',
        }
        state_roles = {'tab', 'tabpanel', 'tablist', 'option', 'listbox', 'radio', 'radiogroup'}

        def stateful(node):
            if state_attributes.intersection(node.a):
                return True
            if node.a.get('aria-hidden', '').strip().lower() == 'true' or node.a.get('role', '').strip().lower() in state_roles:
                return True
            declarations = [part.strip().lower().replace(' ', '') for part in node.a.get('style', '').split(';')]
            return 'display:none' in declarations or 'visibility:hidden' in declarations

        for claim in claims:
            claim_id = claim['id']
            roots = [node for node in all_groups if node.a.get('data-authority-group') == claim_id]
            if len(roots) != 1:
                s.fail('A3', page, f'[data-authority-group={claim_id}]',
                       f'protected authority claim needs exactly one group root; found {len(roots)}')
                continue
            root = roots[0]
            if root.a.get('id') != claim.get('block') or len(nodes_by_id.get(claim.get('block'), [])) != 1:
                s.fail('A3', page, f'[data-authority-group={claim_id}]',
                       f'group root must be the unique registered block #{claim.get("block")}')
            nested_groups = [ancestor for ancestor in root.anc() if ancestor is not root and 'data-authority-group' in ancestor.a]
            if nested_groups:
                s.fail('A3', page, f'[data-authority-group={claim_id}]', 'authority groups may not be nested')

            label_ids = root.a.get('aria-labelledby', '').split()
            label_nodes = nodes_by_id.get(label_ids[0], []) if len(label_ids) == 1 else []
            label = label_nodes[0] if len(label_nodes) == 1 else None
            descendants = set(root.all())
            if (label is None or label.tag not in HEADS or label not in descendants
                    or label.text() != claim.get('heading')):
                s.fail('A3', page, f'[data-authority-group={claim_id}]',
                       f'aria-labelledby must name one descendant heading with exact text "{claim.get("heading")}"')

            marked = [node for node in root.all() if 'data-authority-member' in node.a]
            marked_units = [node.a.get('data-authority-member') for node in marked]
            if marked_units != claim.get('member_units'):
                s.fail('A3', page, f'[data-authority-group={claim_id}]',
                       f'authority member ancestry/order must be exactly {claim.get("member_units")}; found {marked_units}')
            for unit in claim.get('member_units', []):
                block_id = REG['units'][unit]['block']
                block_nodes = nodes_by_id.get(block_id, [])
                node = block_nodes[0] if len(block_nodes) == 1 else None
                if node is None or node.a.get('data-authority-member') != unit:
                    s.fail('A3', page, unit,
                           f'authority member {unit} must be the unique registered block #{block_id} with its exact data-authority-member ID')
                    continue
                group_ancestors = [ancestor for ancestor in node.anc() if 'data-authority-group' in ancestor.a]
                member_ancestors = [ancestor for ancestor in node.anc()
                                    if ancestor is not node and 'data-authority-member' in ancestor.a]
                if group_ancestors != [root] or member_ancestors:
                    s.fail('A3', page, unit, f'authority member {unit} moved outside its sole group or is nested in another member')

            if claim.get('non_stop') is True:
                group_nodes = [root, *list(root.all())]
                outer_state = [ancestor for ancestor in root.anc() if ancestor is not root and stateful(ancestor)]
                inner_state = [node for node in group_nodes if stateful(node)]
                if outer_state or inner_state:
                    s.fail('A3', page, f'[data-authority-group={claim_id}]',
                           'non-stop authority groups cannot be rides, tabs, hidden panels, or selectable state')

    def speaking_proofs(s, page, body):
        """Validate exact open proof partitions; classes or partial marker sets cannot create a partition."""
        if page != 'speaking':
            return
        marked = []
        for node in body.all():
            classes = set(node.cls())
            has_class = 'sp2-proof' in classes
            has_marker = 'data-speaking-proof' in node.a
            has_unit = 'data-proof-unit' in node.a
            has_id = 'data-proof-id' in node.a
            if not (has_class or has_marker or has_unit or has_id):
                continue
            if not (has_class and has_marker and has_unit and has_id):
                s.fail('F26', page, f'line {node.line}', 'Speaking proof partition needs exact class, marker, unit, and proof ID')
                continue
            proof_id = node.a.get('data-proof-id')
            unit = node.a.get('data-proof-unit')
            if (not proof_id or node.a.get('id') != 'proof-' + proof_id
                    or unit not in REG['units'] or s.unit_of(node, page) != unit):
                s.fail('A3', page, f'line {node.line}', 'Speaking proof partition ID or owner differs from the registry')
            if (any(ancestor is not node and 'data-speaking-proof' in ancestor.a for ancestor in node.anc())
                    or any('data-speaking-proof' in descendant.a for descendant in node.all())):
                s.fail('F26', page, f'line {node.line}', 'Speaking proof partitions may not be nested')
            marked.append((proof_id, node))
        proof_ids = [proof_id for proof_id, _node in marked]
        if len(proof_ids) != len(set(proof_ids)):
            s.fail('F26', page, '[data-speaking-proof]', 'Speaking proof IDs must be unique')

    def record_speaking_evidence(s, page, body):
        known_markers = {
            item.get('acceptedFactId') for item in SPEAKING_EVIDENCE.get('compositions', [])
        }
        for node in body.all():
            fact_id = node.a.get('data-fact-id')
            if fact_id:
                s.evidence_nodes.setdefault(fact_id, []).append((page, node))
            marker = node.a.get('data-covers-fact')
            if marker:
                s.evidence_markers.setdefault(marker, []).append((page, node))
                if marker not in known_markers:
                    s.fail('A3', page, f'line {node.line}', f'unknown Speaking composition marker {marker}')
            if node.a.get('alt'):
                s.evidence_descriptions.append((page, node))
            if node.tag == 'a' and node.a.get('href'):
                s.evidence_links.append((page, node))
        for text, node in s.lines(body):
            s.evidence_lines.append((page, words.norm(text), node))

    def evidence_owner(s, page, node, owner):
        groups = [ancestor.a.get('data-authority-group') for ancestor in node.anc()
                  if ancestor.a.get('data-authority-group')]
        blocks = [ancestor.a.get('id') for ancestor in node.anc()
                  if ancestor.a.get('id') == owner.get('block')]
        expected_group = owner.get('authorityGroup')
        group_ok = groups == [expected_group] if expected_group else not groups
        return (page == owner.get('page')
                and s.unit_of(node, page) == owner.get('unit')
                and len(blocks) == 1
                and group_ok)

    def owned_description(s, page, node, kind, text):
        for description in SPEAKING_EVIDENCE.get('ownedDescriptions', []):
            owner = description.get('owner') or {}
            proofs = [ancestor for ancestor in node.anc()
                      if ancestor.a.get('data-proof-id') == description.get('proofId')
                      and 'data-speaking-proof' in ancestor.a]
            if (kind == description.get('attribute')
                    and node.tag == description.get('tag')
                    and text == description.get('text')
                    and node.a.get('src') == description.get('asset')
                    and len(proofs) == 1
                    and s.evidence_owner(page, node, owner)):
                return True
        return False

    def career_support_line(s, page, node, kind, text):
        """Authorize only independently validated Career support copy in its exact DOM relationship."""
        if page != 'career' or kind != 'text' or not s.career_evidence_report.get('ok'):
            return False
        for spec in s.career_evidence_report.get('authorizedVisibleLines', []):
            if text != spec.get('text') or s.unit_of(node, page) != (spec.get('owner') or {}).get('unit'):
                continue
            if spec.get('relation') == 'same-proof-pane':
                pane = next((ancestor for ancestor in node.anc() if 'data-proof-pane' in ancestor.a), None)
                if pane is None:
                    return False
                markers = [candidate for candidate in (pane, *tuple(pane.all()))
                           if candidate.a.get('data-career-accepted-fact') == spec.get('acceptedFactId')]
                if len(markers) != 1:
                    return False
            return True
        return False

    def finish_speaking_evidence(s):
        """Consume the sealed composition contract and return exact accepted/mirror coverage."""
        for composition in SPEAKING_EVIDENCE.get('compositions', []):
            accepted_id = composition['acceptedFactId']
            owner = composition['owner']
            markers = s.evidence_markers.get(accepted_id, [])
            valid = True
            if len(markers) != composition['renderPolicy']['markerOccurrences']:
                s.fail('B0', owner['page'], owner['unit'],
                       f'Speaking composition {composition["id"]} needs exactly one coverage marker; found {len(markers)}')
                valid = False
            marker_node = markers[0][1] if len(markers) == 1 else None
            if marker_node is not None and not s.evidence_owner(markers[0][0], marker_node, owner):
                s.fail('A3', markers[0][0], f'line {marker_node.line}',
                       f'Speaking composition {composition["id"]} moved outside its exact owner')
                valid = False
            for component in composition.get('requiredComponents', []):
                fact_id = component['factId']
                nodes = s.evidence_nodes.get(fact_id, [])
                if len(nodes) != composition['renderPolicy']['componentOccurrences']:
                    s.fail('B0', owner['page'], owner['unit'],
                           f'Speaking composition component {fact_id} must appear exactly once; found {len(nodes)}')
                    valid = False
                    continue
                component_page, component_node = nodes[0]
                fact = s.facts.by_id.get(fact_id)
                if fact is None or component_node.text() != fact.get('text'):
                    s.fail('B0', component_page, owner['unit'], f'Speaking composition component {fact_id} changed text')
                    valid = False
                if (not s.evidence_owner(component_page, component_node, owner)
                        or marker_node is None or marker_node not in component_node.anc()):
                    s.fail('A3', component_page, f'line {component_node.line}',
                           f'Speaking composition component {fact_id} moved outside its marker or owner')
                    valid = False
            accepted = s.facts.by_id.get(accepted_id) or {}
            full = [item for item in s.evidence_lines if item[1] == words.norm(accepted.get('text', ''))]
            if len(full) != composition['renderPolicy']['fullAcceptedTextOccurrences']:
                s.fail('C13', owner['page'], owner['unit'],
                       f'full accepted composition text must appear zero times; found {len(full)}')
                valid = False
            if valid:
                s.contract_covered.add(accepted_id)
                s.contract_covered.update(composition.get('coveredEquivalentFactIds', []))

        for mirror in SPEAKING_EVIDENCE.get('canonicalMirrors', []):
            canonical_id = mirror['canonicalFactId']
            owner = mirror['owner']
            canonical_nodes = s.evidence_nodes.get(canonical_id, [])
            mirror_nodes = [item for fact_id in mirror.get('mirrorFactIds', [])
                            for item in s.evidence_nodes.get(fact_id, [])]
            valid = True
            if len(canonical_nodes) != 1:
                s.fail('B0', owner['page'], owner['unit'],
                       f'canonical Speaking title {canonical_id} must appear exactly once; found {len(canonical_nodes)}')
                valid = False
            if mirror_nodes:
                s.fail('C13', owner['page'], owner['unit'],
                       f'Speaking title mirror {mirror["id"]} rendered {len(mirror_nodes)} summary copies')
                valid = False
            if len(canonical_nodes) == 1:
                canonical_page, canonical_node = canonical_nodes[0]
                fact = s.facts.by_id.get(canonical_id) or {}
                exact_lines = [item for item in s.evidence_lines if item[1] == words.norm(fact.get('text', ''))]
                if canonical_node.text() != fact.get('text') or len(exact_lines) != 1:
                    s.fail('C13', canonical_page, owner['unit'],
                           f'canonical Speaking title {canonical_id} must be the sole exact title occurrence')
                    valid = False
                if not s.evidence_owner(canonical_page, canonical_node, owner):
                    s.fail('A3', canonical_page, f'line {canonical_node.line}',
                           f'canonical Speaking title {canonical_id} moved outside its exact owner')
                    valid = False
            if valid:
                s.contract_covered.update(mirror.get('mirrorFactIds', []))

        for description in SPEAKING_EVIDENCE.get('ownedDescriptions', []):
            matches = [(page, node) for page, node in s.evidence_descriptions
                       if node.tag == description.get('tag')
                       and node.a.get(description.get('attribute')) == description.get('text')]
            owner = description['owner']
            if len(matches) != 1:
                s.fail('C14', owner['page'], owner['unit'],
                       f'owned description {description["id"]} must appear exactly once; found {len(matches)}')
                continue
            page, node = matches[0]
            proofs = [ancestor for ancestor in node.anc()
                      if ancestor.a.get('data-proof-id') == description.get('proofId')
                      and 'data-speaking-proof' in ancestor.a]
            heading_nodes = s.evidence_nodes.get(description.get('headingFactId'), [])
            if (node.a.get('src') != description.get('asset') or len(proofs) != 1
                    or not s.evidence_owner(page, node, owner)):
                s.fail('A3', page, f'line {node.line}', f'owned description {description["id"]} moved outside its exact Atos proof')
            if (len(heading_nodes) != 1 or heading_nodes[0][0] != owner['page']
                    or heading_nodes[0][1].tag not in HEADS
                    or not s.evidence_owner(heading_nodes[0][0], heading_nodes[0][1], owner)):
                s.fail('A3', owner['page'], owner['unit'], f'owned description {description["id"]} lost its exact Atos heading owner')

        for heading in SPEAKING_EVIDENCE.get('sectionHeadings', []):
            owner = heading['owner']
            matches = [(page, node) for page, normalized, node in s.evidence_lines
                       if normalized == words.norm(heading.get('text', ''))]
            if len(matches) != 1:
                s.fail('B0', owner['page'], owner['unit'],
                       f'Speaking section heading {heading["id"]} must appear exactly once; found {len(matches)}')
                continue
            page, node = matches[0]
            if node.tag not in HEADS or not s.evidence_owner(page, node, owner):
                s.fail('A3', page, f'line {node.line}', f'Speaking section heading {heading["id"]} moved outside its exact owner')

        for consolidation in SPEAKING_EVIDENCE.get('consolidations', []):
            owner = consolidation['owner']
            policy = consolidation['renderPolicy']
            canonical_id = consolidation['canonicalFactId']
            canonical_nodes = s.evidence_nodes.get(canonical_id, [])
            valid = True
            if len(canonical_nodes) != policy['canonicalOccurrences']:
                s.fail('B0', owner['page'], owner['unit'],
                       f'Speaking consolidation canonical fact {canonical_id} must appear exactly once; found {len(canonical_nodes)}')
                valid = False
            canonical_node = canonical_nodes[0][1] if len(canonical_nodes) == 1 else None
            if canonical_node is not None:
                canonical_page = canonical_nodes[0][0]
                fact = s.facts.by_id.get(canonical_id) or {}
                if canonical_node.text() != fact.get('text'):
                    s.fail('B0', canonical_page, owner['unit'], f'Speaking consolidation canonical fact {canonical_id} changed text')
                    valid = False
                if not s.evidence_owner(canonical_page, canonical_node, owner):
                    s.fail('A3', canonical_page, f'line {canonical_node.line}',
                           f'Speaking consolidation canonical fact {canonical_id} moved outside its exact owner')
                    valid = False
                for clause in consolidation.get('requiredClauses', []):
                    if canonical_node.text().count(clause) != 1:
                        s.fail('B0', canonical_page, owner['unit'],
                               f'Speaking consolidation {consolidation["id"]} lost or duplicated clause {clause}')
                        valid = False
            allowed_excerpt_nodes = []
            for excerpt in consolidation.get('requiredExcerpts', []):
                nodes = [(page, node) for page, node in s.evidence_nodes.get(excerpt['factId'], [])
                         if 'data-fact-excerpt' in node.a and node.text() == excerpt['text']]
                if len(nodes) != excerpt['occurrences']:
                    s.fail('B0', owner['page'], owner['unit'],
                           f'Speaking consolidation excerpt {excerpt["factId"]} must appear exactly once; found {len(nodes)}')
                    valid = False
                for excerpt_page, excerpt_node in nodes:
                    allowed_excerpt_nodes.append(excerpt_node)
                    if not s.evidence_owner(excerpt_page, excerpt_node, owner):
                        s.fail('A3', excerpt_page, f'line {excerpt_node.line}',
                               f'Speaking consolidation excerpt {excerpt["factId"]} moved outside its exact owner')
                        valid = False
            for fact_id in consolidation.get('coveredFactIds', []):
                unexpected = [node for _page, node in s.evidence_nodes.get(fact_id, [])
                              if node not in allowed_excerpt_nodes]
                if len(unexpected) != policy['coveredFactOccurrences']:
                    s.fail('C13', owner['page'], owner['unit'],
                           f'Speaking consolidation covered fact {fact_id} has {len(unexpected)} ungoverned render markers')
                    valid = False
            for fact_id in consolidation.get('supportingFactIds', []):
                nodes = s.evidence_nodes.get(fact_id, [])
                if len(nodes) != policy['supportingFactOccurrences']:
                    s.fail('B0', owner['page'], owner['unit'],
                           f'Speaking consolidation supporting fact {fact_id} must appear exactly once; found {len(nodes)}')
                    valid = False
                    continue
                supporting_page, supporting_node = nodes[0]
                fact = s.facts.by_id.get(fact_id) or {}
                if (supporting_node.text() != fact.get('text')
                        or not s.evidence_owner(supporting_page, supporting_node, owner)):
                    s.fail('A3', supporting_page, f'line {supporting_node.line}',
                           f'Speaking consolidation supporting fact {fact_id} changed or moved')
                    valid = False
            for href in consolidation.get('sourceLinks', []):
                route_links = [(page, node) for page, node in s.evidence_links
                               if page == owner['page'] and node.a.get('href') == href]
                links = [(page, node) for page, node in route_links if s.evidence_owner(page, node, owner)]
                if len(links) != policy['sourceLinkOccurrences']:
                    s.fail('B0', owner['page'], owner['unit'],
                           f'Speaking consolidation source link must appear exactly once: {href}')
                    valid = False
                if len(route_links) != len(links):
                    moved = next(node for page, node in route_links if not s.evidence_owner(page, node, owner))
                    s.fail('A3', owner['page'], f'line {moved.line}',
                           f'Speaking consolidation source link moved outside {owner["unit"]}')
                    valid = False
            if valid:
                s.contract_covered.update(consolidation.get('coveredFactIds', []))

    def finish_research_evidence(s):
        """Let each exact governed status satisfy its weaker legacy venue fact without duplicating copy."""
        for record in RESEARCH_EVIDENCE.get('records', []):
            status = record.get('status') or {}
            fact_id = status.get('factId')
            nodes = s.evidence_nodes.get(fact_id, [])
            if len(nodes) != 1:
                s.fail('B0', 'research', record.get('unit') or '-',
                       f'Research status {fact_id} must appear exactly once; found {len(nodes)}')
                continue
            page, node = nodes[0]
            owners = [ancestor for ancestor in node.anc()
                      if ancestor.tag == 'article' and 'data-research-record' in ancestor.a]
            owner = owners[0] if len(owners) == 1 else None
            if (page != 'research' or node.text() != status.get('text') or owner is None
                    or owner.a.get('data-research-authority-claim') != record.get('authorityClaimId')
                    or owner.a.get('data-research-unit') != record.get('unit')
                    or owner.a.get('id') != record.get('block')):
                s.fail('A3', page, f'line {node.line}',
                       f'Research status {fact_id} changed or moved outside its exact record owner')
                continue
            display_fact_id = status.get('displayVenueFactId')
            if display_fact_id not in s.facts.by_id:
                s.fail('B0', 'research', record.get('unit') or '-',
                       f'Research legacy venue fact is absent from the fact store: {display_fact_id}')
                continue
            s.contract_covered.add(display_fact_id)

    def fact_attributed(s, page, fact, node, here, text):
        """A fact only counts where its own registry identity gives this exact node authority."""
        unit = fact.get('unit')
        if unit is None or unit == here:
            return True
        if here and any(here in pair and unit in pair for pair in REG.get('pairs', [])):
            return True
        if here and unit in REG['units'][here].get('mentions', []):
            names = {words.norm(name) for name in REG['units'].get(unit, {}).get('names', [])}
            if words.norm(text) in names:
                return True
        short = words.count_words(text) <= 6
        linked_unit = s.link_unit(node)
        if linked_unit == unit and (short or page == REG['map']['page']):
            return True
        if short and s.in_nav(node) and unit and REG['units'].get(unit, {}).get('home') == page:
            return True
        if (short and any(ancestor.tag in ('header', 'footer') for ancestor in node.anc())
                and unit in {'me', 'contact', 'resume-take'}):
            return True
        if short and here is None and not s.in_nav(node) and unit and REG['units'].get(unit, {}).get('home') == page:
            return True
        return False

    def pieces(s, root):
        """Every visible run of text, with its node; attribute text (aria-label, alt) too."""
        out = []
        def w(n):
            for k in n.k:
                if isinstance(k, str):
                    t = ' '.join(k.split())
                    if t:
                        out.append((t, n, 'text'))
                elif k.tag not in SKIP_TAGS:
                    for at in ('aria-label', 'alt'):
                        if k.a.get(at):
                            out.append((k.a[at], k, at))
                    w(k)
        w(root)
        return out

    def lines(s, root):
        """The text of each line-level element (a paragraph, heading, list item...)."""
        out = []
        def w(n):
            for k in n.k:
                if isinstance(k, str) or k.tag in SKIP_TAGS:
                    continue
                if k.tag in LINES and not any(d.tag in LINES or d.tag in ('div', 'ol', 'ul', 'figure', 'section', 'article') for d in k.all()):
                    t = k.text()
                    if t:
                        out.append((t, k))
                else:
                    w(k)
        w(root)
        return out

    def page(s, page, html):
        P = REG['pages'][page]
        tree = parse(html)
        body = next((n for n in tree.all() if n.tag == 'body'), tree)
        main = next((n for n in tree.all() if n.tag == 'main'), body)
        units = REG['units']
        blocks = s.blocks(page)
        ids = {n.a.get('id'): n for n in body.all() if n.a.get('id')}
        s.ids[P['file']] = set(ids)

        s.record_speaking_evidence(page, body)
        s.authority_groups(page, body)
        s.speaking_proofs(page, body)

        # A3: content identity and ownership are structural, never inferred from phrases.
        content_units = {}
        rendered_specs = []
        for collection, spec in REG.get('content_contract', {}).get('collections', {}).items():
            records = spec.get('locked_records', [])
            members = [r[spec['id_field']] for r in records] if records else spec.get('members', [])
            for member in members:
                content_units[f'{collection}/{member}'] = spec['page']
            if spec.get('render_each') and spec['page'] == page:
                rendered_specs.append((collection, spec, records))
        seen_content = {}
        for n in body.all():
            key = n.a.get('data-content-unit')
            if not key:
                continue
            seen_content.setdefault(key, []).append(n)
            if key not in content_units:
                s.fail('A3', page, f'line {n.line}', f'unknown content unit {key}')
            elif content_units[key] != page:
                s.fail('A3', page, f'line {n.line}', f'{key} belongs on {content_units[key]}, not {page}')
        for collection, spec, records in rendered_specs:
            parent = ids.get(spec['parent'])
            if parent is None:
                continue
            for n in parent.all():
                if 'blind__stop' in n.cls() and not n.a.get('data-content-unit'):
                    s.fail('A3', page, f'line {n.line}', 'content inside the topic collection has no registered identity')
            for record in records:
                key = f'{collection}/{record[spec["id_field"]]}'
                nodes = seen_content.get(key, [])
                if len(nodes) != 1:
                    s.fail('A3', page, f'#{spec["parent"]}', f'{key} must appear exactly once; found {len(nodes)}')
                    continue
                if parent not in nodes[0].anc():
                    s.fail('A3', page, f'line {nodes[0].line}',
                           f'{key} moved outside its registered parent #{spec["parent"]}')
                expected = words.norm(' '.join(str(v) for k, v in record.items() if k != spec['id_field']))
                if words.norm(nodes[0].text()) != expected:
                    s.fail('A3', page, f'line {nodes[0].line}', f'{key} differs from its accepted content')
        # A3/B0: testimonials are indivisible records. Every source field has one visible state in its owner station.
        if page == 'career':
            records = []
            for collection in ('managerReviews', 'colleagueRecommendations', 'featuredRecommendations'):
                records.extend(CONTENT[collection])
            known = {record['id'] for record in records}
            shown = {}
            for n in body.all():
                record_id = n.a.get('data-testimonial')
                if not record_id:
                    continue
                field = n.a.get('data-testimonial-field', '')
                shown.setdefault((record_id, field), []).append(n)
                if record_id not in known:
                    s.fail('A3', page, f'line {n.line}', f'unknown testimonial record {record_id}')
            for record in records:
                fields = [(f'quote-{index}', quote) for index, quote in enumerate(record['quotes'])]
                for field in ('person', 'role', 'context'):
                    if record.get(field):
                        fields.append((field, record[field]))
                for field, expected in fields:
                    nodes = shown.get((record['id'], field), [])
                    if len(nodes) != 1:
                        s.fail('B0', page, f'#{record["unit"]}', f'testimonial {record["id"]} field {field} must appear exactly once; found {len(nodes)}')
                        continue
                    node = nodes[0]
                    owner = next((a.a.get('id') for a in node.anc() if a.tag == 'article' and a.a.get('id')), '')
                    if owner != record['unit']:
                        s.fail('A3', page, f'line {node.line}', f'testimonial {record["id"]} belongs in {record["unit"]}, not {owner or "outside a station"}')
                    if node.text() != expected:
                        s.fail('B0', page, f'line {node.line}', f'testimonial {record["id"]} field {field} changed')
                    if field == 'context' and record.get('year'):
                        if node.a.get('data-testimonial-year') != record['year'] or record['year'] not in node.text():
                            s.fail('B0', page, f'line {node.line}', f'testimonial {record["id"]} year is missing from its visible context')
        # A1 every section or article with copy of its own is a registered unit; B7 every unit's block is there.
        for n in main.all():
            if n.tag in ('section', 'article') and n.a.get('id') not in blocks and not s.in_nav(n):
                own = sum(words.count_words(t) for t, k in s.lines(n) if not s.unit_of(k, page) and not s.in_nav(k))
                if own > 12 and not any(a.a.get('id') in blocks for a in n.anc() if a is not n):
                    s.fail('A1', page, f'<{n.tag} id={n.a.get("id")!r}> line {n.line}', 'a section with copy that is no unit in registry.json: decide which unit it is and where it lives first')
        for u in P['units']:
            if units[u]['block'] not in ids:
                s.fail('B7', page, u, f'the block #{units[u]["block"]} for {u} is missing')

        # C14 sourced; A3 in its own unit; B10 allowed to be shown.
        for t, n, kind in s.pieces(body):
            nt = words.norm(t)
            if is_career_proof_control(page, t, n, kind):
                continue
            if s.owned_description(page, n, kind, t):
                continue
            if s.career_support_line(page, n, kind, t):
                continue
            if is_date(nt):
                here = s.unit_of(n, page)
                for f in s.facts.all:
                    if not any(nt in variant for variant in f['variants']):
                        continue
                    if s.fact_attributed(page, f, n, here, t):
                        start, end = s.facts.span(f, nt)
                        s.cover.setdefault(f['id'], set()).add((start, end))
                continue
            if not words.content(nt):
                continue
            here = s.unit_of(n, page)
            cands = s.facts.find(nt)
            if nt in s.facts.chrome or is_date(nt):
                # Navigation words and dates need no source of their own, but a date or label that is one of his
                # facts still counts as shown.
                for f in cands:
                    if s.fact_attributed(page, f, n, here, t):
                        start, end = s.facts.span(f, nt)
                        s.cover.setdefault(f['id'], set()).add((start, end))
                continue
            where = f'#{units[here]["block"]}' if here else (f'<{n.tag}>' + (f' {kind}' if kind != 'text' else ''))
            if not cands:
                bad = s.facts.find_banned(nt)
                if bad:
                    why = 'retired by him' if bad[0].get('retired') else f'a {bad[0]["field"]} field, which is never shown'
                    s.fail('B10', page, where, f'"{t[:80]}" is {why} ({bad[0]["id"]})')
                else:
                    s.fail('C14', page, where, f'not from any of his sources or approved lines: "{t[:100]}"')
                continue
            cu = {f['unit'] for f in cands}
            nav = s.in_nav(n)
            attributed = [f for f in cands if s.fact_attributed(page, f, n, here, t)]
            ok = bool(attributed)
            if not ok:
                owner = sorted(u for u in cu if u)
                s.fail('A3', page, where, f'"{t[:80]}" belongs to {", ".join(owner)} ({units[owner[0]]["home"] if owner else "?"}), not here')
            # A short fact of this unit shown inside a longer line ("Amazon" inside the sign "Amazon Alexa") is shown too.
            for w in set(words.content(nt)):
                for f in s.facts.index.get(w, []):
                    variant = next((value for value in f['variants'] if len(value) < len(nt) and value in nt), None)
                    if variant is not None and s.fact_attributed(page, f, n, here, t):
                        s.cover.setdefault(f['id'], set()).add((0, len(variant)))
            for f in cands:
                start, end = s.facts.span(f, nt)
                if start >= 0 and s.fact_attributed(page, f, n, here, t):
                    s.cover.setdefault(f['id'], set()).add((start, end))
                    # a repeat is the same fact of the same unit shown whole again (a talk named after a paper is the talk's own fact)
                    if (len(nt) >= 0.9 * len(f['n']) and not nav and kind == 'text' and words.count_words(t) >= 5
                            and f.get('field') not in ('name', 'label', 'org', 'role', 'title', 'dates', 'person', 'context')
                            and s.fact_attributed(page, f, n, here, t)):
                        d = s.full.setdefault(f['id'], {})
                        d[page] = d.get(page, 0) + 1

        # B7 floor, B9 images, B7 the sheet's sessions and dates.
        sheet = json.load(open(os.path.join(RUBRIC, 'sources/sheet.json')))
        for u in P['units']:
            U = units[u]
            blk = ids.get(U['block'])
            if blk is None:
                continue
            bt = words.norm(blk.text())
            srcs = ' '.join(x.a.get('src', '') for x in blk.all() if x.tag == 'img')
            for f in U.get('floor', []):
                if f.startswith('img:'):
                    if f[4:] not in srcs:
                        s.fail('B9', page, f'#{U["block"]}', f'the image {f[4:]} is missing')
                elif words.norm(f) not in bt:
                    s.fail('B7', page, f'#{U["block"]}', f'missing "{f}"')
            row = next((r for r in sheet['rows'] if r['unit'] == u), None)
            toks = words.tokens(bt)
            flat = lambda x: ' '.join(words.tokens(x))
            for ss in (row or {}).get('sessions', []):
                if not any(flat(x) in flat(bt) for x in [ss['title']] + ss.get('aliases', [])):
                    s.fail('B7', page, f'#{U["block"]}', f'the session "{ss["title"]}" from his sheet is missing')
                y, m, d = ss['date'].split('-')
                mon, day = MON[int(m) - 1].lower(), str(int(d))
                if not any(toks[i] == mon and day in toks[i + 1:i + 3] for i in range(len(toks) - 1)):
                    s.fail('B7', page, f'#{U["block"]}', f'the date {MON[int(m) - 1]} {day}, {y} from his sheet is missing')

        # D17 at most three lines a screen, 60 words; D40 no line over 25 words; D18 no lists, dumps, stat grids, inventory twice.
        diagram = lambda k: any(c.startswith(('route', 'xl', 'stair', 'seq', 'ml__', 'conv__')) for a in k.anc() for c in a.cls())
        for u in P['units']:
            blk = ids.get(units[u]['block'])
            if blk is None:
                continue
            def project_proof(n):
                return (page == 'projects' and 'pj-proof' in n.cls() and 'data-project-proof' in n.a
                        and n.a.get('data-proof-unit') == u and n.p is not None and 'pj-evidence' in n.p.cls()
                        and n.p.p is blk)
            def speaking_proof(n):
                return (page == 'speaking' and 'sp2-proof' in n.cls() and 'data-speaking-proof' in n.a
                        and n.a.get('data-proof-unit') == u and bool(n.a.get('data-proof-id'))
                        and n.a.get('id') == 'proof-' + n.a.get('data-proof-id')
                        and not any(ancestor is not n and 'data-speaking-proof' in ancestor.a for ancestor in n.anc()))
            if page == 'projects':
                marked = [n for n in blk.all() if 'data-project-proof' in n.a or 'pj-proof' in n.cls()]
                for n in [item for item in marked if not project_proof(item)]:
                    s.fail('F26', page, f'#{units[u]["block"]} line {n.line}',
                           'a Projects proof marker is not a direct owned .pj-evidence > .pj-proof')
            def research_proof(n):
                record = next((item for item in RESEARCH_EVIDENCE.get('records', [])
                               if item.get('unit') == u), None)
                return (page == 'research' and record is not None and n is blk and n.tag == 'article'
                        and 'data-research-record' in n.a
                        and n.a.get('data-research-authority-claim') == record.get('authorityClaimId')
                        and n.a.get('data-research-unit') == record.get('unit')
                        and n.a.get('data-research-stable-id') == record.get('stableId')
                        and n.a.get('data-research-claim-id') == record.get('claimId')
                        and n.p is not None and 'data-research-collection' in n.p.a
                        and not any('data-research-record' in descendant.a for descendant in n.all()))
            partition = lambda n: 'data-screen' in n.a or project_proof(n) or speaking_proof(n) or research_proof(n)
            screens = [n for n in blk.all() if partition(n)] or [blk]
            for sc in screens:
                items = [(t, k) for t, k in s.lines(sc) if s.unit_of(k, page) == u and k.tag not in HEADS and not s.in_nav(k)
                         and words.count_words(t) >= 4 and not (diagram(k) and words.count_words(t) <= 16)
                         and not any(x is not sc and partition(x) for x in k.anc() if x in screens)]
                wh = f'#{units[u]["block"]}' + ('' if sc is blk else f' screen {screens.index(sc) + 1}')
                if len(items) > 3 and not research_proof(sc):
                    s.fail('D17', page, wh, f'{len(items)} lines of copy on one screen (max 3): give the rest its own screen, never cut it')
                for t, _ in items:
                    if words.count_words(t) > 40:
                        s.fail('D40', page, wh, f'a {words.count_words(t)}-word wall (max 40): render it as stops, slides or a figure, keeping every word: "{t[:60]}"')
                total = sum(words.count_words(t) for t, _ in items)
                if total > 90 and not research_proof(sc):
                    s.fail('D17', page, wh, f'{total} words on one screen (max 90): split it across screens')
        loose = [(t, k) for t, k in s.lines(main) if not s.unit_of(k, page) and not s.in_nav(k) and k.tag not in HEADS and words.count_words(t) >= 4]
        if sum(words.count_words(t) for t, _ in loose) > 30:
            s.fail('D17', page, 'page text outside units', f'{sum(words.count_words(t) for t, _ in loose)} words outside any unit (max 30)')
        for n in main.all():
            if n.tag == 'details':
                s.fail('D18', page, f'<details> line {n.line}', f'a toggle hiding a dump: "{n.text()[:60]}"')
            if n.tag in ('ul', 'ol') and not s.in_nav(n):
                lis = [k for k in n.k if not isinstance(k, str) and k.tag == 'li']
                isd = any(c.startswith(('route', 'xl', 'stair', 'seq')) for c in n.cls())
                wordy = [k for k in lis if words.count_words(k.text()) >= (17 if isd else 5) and 'data-screen' not in k.a]  # a diagram's stops may run to 16 words
                if len(wordy) >= 3:
                    s.fail('D18', page, f'<{n.tag}> line {n.line}', f'a list of {len(lis)} sentences')
            kids = [k for k in n.k if not isinstance(k, str)]
            def statlike(k):
                t = k.text().split()
                return bool(t) and (t[0][:1].isdigit() or t[0][:1] == '$') and len(t) <= 14
            if len(kids) >= 3 and sum(1 for k in kids if statlike(k)) >= 3 and not s.in_nav(n) and not any('data-screen' in k.a for k in kids):
                s.fail('D18', page, f'<{n.tag} class={n.a.get("class")}> line {n.line}', 'a stat grid: three or more number tiles side by side')
        own = [u for u in P['units'] if units[u]['names']]
        def holds(n):
            t = words.norm(n.text())
            return sum(1 for u in own if any(words.norm(x) in t for x in units[u]['names']))
        minimal = [n for n in main.all() if holds(n) >= 3 and not any(holds(k) >= 3 for k in n.all()) and not s.unit_of(n, page) and not s.in_nav(n)]
        if len(minimal) > 1:
            s.fail('D18', page, ', '.join(f'<{n.tag} class={n.a.get("class")}>' for n in minimal[:4]), f'the same inventory of this page\'s units appears {len(minimal)} times (once, as navigation)')
        for n in body.all():
            if set(n.cls()) & {'tag', 'eyebrow', 'kicker', 'overline'} or any(c.startswith('tag--') for c in n.cls()):
                if n.text():
                    s.fail('C12', page, f'.{".".join(n.cls())}', f'a small label stacked above a heading: "{n.text()[:60]}"')

        # E22 links; E23 back and forward; E25 header and Résumé; T35 theme switch; the home map.
        for n in body.all():
            if n.tag == 'a' and n.a.get('href'):
                h = n.a['href']
                if h.startswith(('http:', 'https:', 'mailto:', 'tel:')):
                    continue
                if h.startswith('/'):
                    if not os.path.exists(os.path.join(ROOT, h.split('#')[0].lstrip('/'))):
                        s.fail('E22', page, f'a line {n.line}', f'a link to a missing file: {h}')
                    continue
                f, _, frag = h.partition('#')
                s.links.append((page, f or P['file'], frag, n.line))
        hd = next((n for n in body.all() if n.tag == 'header'), None)
        if P['header'] == 'inner':
            if hd is None:
                s.fail('E25', page, 'header', 'no header with his name, Résumé and Home')
            else:
                txt = [(a.text(), a.a.get('href', '')) for a in hd.all() if a.tag == 'a']
                if not any('Sairam Krishnan' in t and h == 'index.html' for t, h in txt):
                    s.fail('E25', page, 'header', 'his name does not lead home')
                if not any(t == 'Résumé' and h.endswith('.pdf') for t, h in txt):
                    s.fail('E25', page, 'header', 'Résumé is not beside his name')
                if not any(t == 'Home' and h == 'index.html' for t, h in txt):
                    s.fail('E25', page, 'header', 'no Home')
                extra = [t for t, h in txt if t not in ('Résumé', 'Home') and 'Sairam Krishnan' not in t]
                if extra:
                    s.fail('E25', page, 'header', f'the header carries more than name, Résumé, Home and the theme switch: {extra}')
        if not any(n.tag == 'button' and 'data-theme-toggle' in n.a for n in body.all()):
            s.fail('T35', page, 'page', 'no light/dark switch (he called it invariant, Sep 16)')
        for n in body.all():
            if n.tag == 'a' and any(c.startswith('stn') for c in n.cls()) and words.norm(n.text()) in ('résumé', 'resume'):
                s.fail('E25', page, 'map', 'Résumé is a station on a map; it belongs beside his name')
        for st in P.get('never_stops', []):
            if any(n.a.get('data-stop') == st for n in body.all()):
                s.fail('A2', page, f'[data-stop={st}]', f'{st} is an affiliation, a branch, never a stop')
        seq = [u for u in P.get('flow_units', P['units']) if ids.get(units[u]['block']) is not None and ids[units[u]['block']].tag == 'article']
        if len(seq) > 1 and any('data-stop' in n.a or 'cr-strip' in n.cls() for n in body.all()):
            for i, u in enumerate(seq):
                links = [a for a in ids[units[u]['block']].all() if a.tag == 'a']
                if i > 0 and not any(a.a.get('data-dir') == 'prev' or 'cr-prev' in a.cls() for a in links):
                    s.fail('E23', page, f'#{units[u]["block"]}', 'no way back to the previous stop')
                if i < len(seq) - 1 and not any(a.a.get('data-dir') == 'next' or 'cr-next' in a.cls() for a in links):
                    s.fail('E23', page, f'#{units[u]["block"]}', 'no way on to the next stop')
        for u in P.get('branch_ends', []):
            block = ids.get(units[u]['block'])
            if block is None or block.tag != 'article':
                continue
            links = [a for a in block.all() if a.tag == 'a']
            if not any(a.a.get('data-dir') == 'prev' or 'cr-prev' in a.cls() for a in links):
                s.fail('E23', page, f'#{units[u]["block"]}', 'branch endpoint has no way back')
            if any(a.a.get('data-dir') == 'next' or 'cr-next' in a.cls() for a in links):
                s.fail('E23', page, f'#{units[u]["block"]}', 'branch endpoint incorrectly continues forward')
        maps = [n for n in body.all() if 'map' in n.cls()]
        for mp in maps:
            limit = REG['map'].get('max_words', {}).get(page)
            if limit and words.count_words(mp.text()) > limit:
                s.fail('D39', page, f'map {mp.a.get("class")}', f'{words.count_words(mp.text())} words on the map (max {limit}): it is getting busy again')
        if page == REG['map']['page']:
            if not maps:
                s.fail('E25', page, 'map', 'the home map is missing')
            alltext = words.norm(' '.join(m.text() for m in maps))
            for lab in REG['map'].get('labels', []):
                if words.norm(lab) not in alltext:
                    s.fail('B7', page, 'map', f'the map lost the station "{lab}"')
            for mp in maps:
                labels = [(a.text(), a.a.get('href', '')) for a in mp.all() if a.tag == 'a']
                for name, href in REG['map']['lines'].items():
                    if not any(t.strip() == name and h.startswith(href) for t, h in labels):
                        s.fail('B7', page, f'map {mp.a.get("class")}', f'the {name} line has no label leading to {href}')
                    if not any(n.a.get('data-href', '').startswith(href) for n in mp.all() if n.tag in ('path', 'g', 'polyline')):
                        s.fail('E36', page, f'map {mp.a.get("class")}', f'the {name} line itself is not a link: double-clicking it must open {href}')
                for name in REG['map']['one_station']:
                    c = sum(1 for t, _ in labels if t.strip() == name)
                    if c != 1:
                        s.fail('A1', page, f'map {mp.a.get("class")}', f'{name} must be one station; found {c}')
                for n in mp.all():
                    if 'stn--big' in n.cls() and any('stn__sub' in k.cls() for k in n.all()):
                        s.fail('C37', page, f'map {mp.a.get("class")}', f'the line name "{n.text()[:30]}" has a subtitle; line names have none')
        for b in s.banned_names:
            if b in html:
                s.fail('B10', page, '-', 'an engagement he left off is named in the page')
        if P['sales'] != 'any':
            sales = [n for n in main.all() if n.tag == 'a' and n.a.get('href', '').startswith(('services.html', 'contact.html')) and not s.in_nav(n)]
            allowed = [n for n in sales if n.text() in P['sales']]
            for n in sales:
                if n not in allowed[:1]:
                    s.fail('A4', page, f'a[href={n.a["href"]}]', f'a sales link outside Services: "{n.text()[:60]}"')

    def finish(s):
        for page, f, frag, line in s.links:
            if f not in s.ids:
                s.fail('E22', page, f'a line {line}', f'a link to a page that does not exist: {f}')
            elif frag and frag not in s.ids[f]:
                s.fail('E22', page, f'a line {line}', f'a link to #{frag} on {f}, which has no such id')
        resume_text = ''
        resume_path = os.path.join(s.dir, 'public', 'assets', 'Resume.pdf')
        if os.path.isfile(resume_path):
            resume_text = words.norm(' '.join((page.extract_text() or '') for page in PdfReader(resume_path).pages))
        s.finish_speaking_evidence()
        s.finish_research_evidence()
        career_report = s.career_evidence_report
        career_checks = {
            'wrong-owner': 'A3',
            'heading': 'A3',
            'b8-canonical-owner': 'A3',
            'contract-schema': 'P5',
            'artifact-drift': 'P5',
        }
        for item in career_report.get('failures', []):
            s.fail(
                career_checks.get(item.get('kind'), 'B0'),
                'career',
                item.get('where') or 'Career evidence',
                item.get('message') or 'Career evidence validation failed',
            )
        if career_report.get('ok'):
            s.contract_covered.update(career_report.get('coveredFactIds', []))
        # B0 nothing he gave is cut: a fact counts as shown on its owned page, in a verified linked artifact, or by a twin.
        def shown(fid):
            f = s.facts.by_id[fid]
            spans = s.cover.get(fid)
            if not spans:
                return False
            mark = [False] * len(f['n'])
            for a, b in spans:
                for i in range(a, min(b, len(mark))):
                    mark[i] = True
            letters = [i for i, ch in enumerate(f['n']) if ch.isalnum()]
            return bool(letters) and sum(1 for i in letters if mark[i]) >= 0.9 * len(letters)
        for f in s.facts.all:
            if f['show'] != 'must' or f.get('retired'):
                continue
            if f['id'] in s.contract_covered:
                continue
            equivalent = RESUME_EQUIVALENCE.get(f['id'])
            if f.get('source') == 'resume' and f['n'] and (f['n'] in resume_text or (equivalent and equivalent in resume_text)):
                continue
            if not (shown(f['id']) or any(t in s.facts.by_id and shown(t) for t in f.get('twins', []))):
                home = REG['units'].get(f['unit'], {}).get('home', '-')
                s.fail('B0', home, f['unit'] or '-', f'cut: "{f["text"][:110]}" ({f["id"]})')
        for fid, pages in s.full.items():
            for pg, c in pages.items():
                if c > 1:
                    s.fail('C13', pg, '-', f'says the same thing {c} times: "{s.facts.by_id[fid]["text"][:80]}"')
            if len(pages) > 1:
                for pg in pages:
                    s.fail('A5', pg, '-', f'the same fact is on {", ".join(sorted(pages))}: "{s.facts.by_id[fid]["text"][:80]}"')

    def run(s):
        s.links, s.ids = [], {}
        if not s.facts.ok:
            s.fail('F26', '-', 'facts', 'facts/facts.json is missing: run facts/build_facts.py')
        for page, P in REG['pages'].items():
            path = os.path.join(s.dir, P['file'])
            if not os.path.exists(path):
                s.fail('F26', page, '-', f'{P["file"]} is missing')
                continue
            s.page(page, open(path).read())
        s.finish()
        try:
            ver = hashlib.sha1(open(os.path.join(s.dir, 'style.css'), 'rb').read() + open(os.path.join(s.dir, 'main.js'), 'rb').read()).hexdigest()[:8]
            for page, P in REG['pages'].items():
                h = open(os.path.join(s.dir, P['file'])).read()
                found = set()
                for key in ('style.css?v=', 'main.js?v='):
                    i = h.find(key)
                    while i >= 0:
                        found.add(h[i + len(key):i + len(key) + 8]); i = h.find(key, i + 1)
                if found != {ver}:
                    s.fail('F27', page, '-', f'?v={",".join(sorted(found))} but the stylesheet and script hash to {ver}')
        except OSError:
            pass
        facts_path = os.path.join(RUBRIC, 'facts/facts.json')
        hashes_path = os.path.join(RUBRIC, 'facts/source-hashes.json')
        try:
            sealed = json.load(open(hashes_path))
            for relative, expected in (sealed.get('inputs') or {}).items():
                source = os.path.abspath(os.path.join(ROOT, relative))
                if os.path.commonpath((ROOT, source)) != ROOT or not os.path.isfile(source):
                    s.fail('F26', '-', relative, 'a sealed fact input is missing or leaves the repository')
                    continue
                actual = hashlib.sha256(open(source, 'rb').read()).hexdigest()
                if actual != expected:
                    s.fail('F26', '-', relative, 'fact input hash drifted: run facts/build_facts.py')
            if hashlib.sha256(open(facts_path, 'rb').read()).hexdigest() != sealed.get('factsSha256'):
                s.fail('F26', '-', 'facts.json', 'fact store hash differs from its sealed input ledger')
        except (OSError, json.JSONDecodeError) as error:
            s.fail('F26', '-', 'source-hashes.json', f'fact input hashes are missing or unreadable: {error}')
        for f in set(glob.glob(os.path.join(s.dir, '**/*'), recursive=True)):
            b = os.path.basename(f).lower()
            if b.endswith('.html') and b.startswith(('proposal', 'review-sheet', 'sketch')):
                s.fail('G31', '-', os.path.relpath(f, ROOT), 'a proposal file in the repo; show proposals as images in chat')
        return s.fails

def main(argv):
    d, out, quiet = DEFAULT_DIR, None, False
    i = 0
    while i < len(argv):
        if argv[i] == '--dir':
            d = argv[i + 1]; i += 1
        elif argv[i] == '--json':
            out = argv[i + 1]; i += 1
        elif argv[i] == '--quiet':
            quiet = True
        i += 1
    fails = Run(d).run()
    uniq = list({f['key']: f for f in fails}.values())
    if not quiet:
        for f in uniq:
            print(f"FAIL {f['check']} {f['page']} {f['where']}: {f['msg']}")
        print(f'\n{len(uniq)} fail')
    if out:
        json.dump(uniq, open(out, 'w'), indent=1)
    return 1 if uniq else 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
