#!/usr/bin/env python3
"""Puts every past mistake back into a copy of the site and checks the rubric catches each one. No regular expressions.

Usage: test.py [--static] [--only id,id]   (--static skips the browser plants; it can never pass the stop check)
Writes out/test.json {pass, planted, caught, missed, t}. Exit 1 if any mistake slips through, if a rubric check has no
past mistake behind it (and is not the reviewer's), if a correction in review.json has no ledger entry, or if
noregex.py finds a regular expression (and its own two plants, an `import re` and a regex literal, must be caught).
"""
import hashlib, json, os, shutil, socket, subprocess, sys, tempfile, time, urllib.request

RUBRIC = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(RUBRIC))
TRANSIT = os.path.join(ROOT, 'site')
sys.path.insert(0, RUBRIC)
import guard, rubric_gate, noregex, run_lock

LED = json.load(open(os.path.join(RUBRIC, 'ledger.json')))
REG = guard.REG
CLEAN_RENDER = {}
CLEAN_A11Y = {}
FACTS_MUTATION_REPORT = None
FACTS_MUTATION_RETURN_CODE = None
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
EXPECTED_RESEARCH_CASE_IDS_SHA256 = 'e8efff109594a220d9c015efec93fbabac57cddcbf28201a338b9b66d1d80b8b'
EXPECTED_RESEARCH_CASE_MAPPING_SHA256 = 'aed6f6666f50c68cf88cd95cc15531f81d03a2072239c6d74ec2bdb318423537'
EXPECTED_RESEARCH_DEPENDENCY_PATHS_SHA256 = '3b34c2a83eba49ec134018fbf41a32eb6710aa24879d0baba3080bb5a367b738'
EXPECTED_RESEARCH_SCRIPTLESS_BARRIER_CAP = 4
EXPECTED_RESEARCH_SCRIPTLESS_WHEEL_POINT = {'x': 8, 'y': 8}

class PlantError(RuntimeError):
    """A mutation could not be validated or applied; this is not a detector miss."""

ENTRY_REQUIRED = {'id', 'at', 'said', 'class', 'check', 'plant'}
ENTRY_ALLOWED = ENTRY_REQUIRED | {'also', 'expect_pages', 'oracle', 'reviewer'}
PLANT_FIELDS = {
    'insert': ({'kind', 'page', 'into', 'html'}, set()),
    'strip': ({'kind', 'page', 'find'}, set()),
    'replace': ({'kind', 'page', 'find', 'with'}, set()),
    'file': ({'kind', 'path', 'html'}, set()),
    'remove_tags': ({'kind', 'page', 'tag', 'contains'}, set()),
    'remove_element': ({'kind', 'page', 'id'}, set()),
    'stale': ({'kind', 'page'}, set()),
    'render': ({'kind', 'page', 'width'}, {'css', 'html', 'js', 'after_js', 'theme', 'css_file_append'}),
    'a11y': ({'kind', 'page', 'width', 'theme', 'operation', 'selector'}, {'html', 'attribute'}),
    'message': ({'kind', 'text'}, set()),
    'edit': ({'kind', 'file', 'old', 'new'}, set()),
    'bash': ({'kind', 'command'}, set()),
    'turn': ({'kind'}, {'site_changed', 'opened', 'score_fresh', 'score_pct', 'tests_pass', 'verdict_fresh', 'shots_fresh', 'prompt', 'reviewed'}),
    'guard_state': ({'kind', 'fact_id', 'pages'}, set()),
    'run_lock': ({'kind'}, set()),
    'multi': ({'kind', 'plants'}, set()),
    'project': ({'kind', 'action', 'path'}, {'keys', 'value', 'text'}),
    'asset': ({'kind', 'path', 'append_hex'}, set()),
    'route_verifier': ({'kind', 'page', 'find', 'with', 'verifier_kind'}, {'path'}),
    'facts_mutation': ({'kind', 'case'}, set()),
}

def schema_error(where, message):
    raise PlantError(f'{where}: {message}')

def validate_plant(plant, where):
    if not isinstance(plant, dict):
        schema_error(where, 'plant must be an object')
    kind = plant.get('kind')
    if kind not in PLANT_FIELDS:
        schema_error(where, f'unknown plant kind {kind!r}')
    required, optional = PLANT_FIELDS[kind]
    keys = set(plant)
    missing, unknown = required - keys, keys - required - optional
    if missing:
        schema_error(where, f'missing plant fields {sorted(missing)}')
    if unknown:
        schema_error(where, f'unknown plant fields {sorted(unknown)}')
    if 'page' in plant and plant['page'] not in REG['pages']:
        schema_error(where, f'unknown page {plant["page"]!r}')
    if kind == 'render':
        if not isinstance(plant['width'], int) or isinstance(plant['width'], bool) or plant['width'] <= 0:
            schema_error(where, 'render width must be a positive integer')
        if not (keys & optional):
            schema_error(where, 'render plant needs a mutation payload')
    elif kind == 'a11y':
        if not isinstance(plant['width'], int) or isinstance(plant['width'], bool) or plant['width'] <= 0:
            schema_error(where, 'accessibility width must be a positive integer')
        if plant['theme'] not in ('light', 'dark'):
            schema_error(where, 'accessibility theme must be light or dark')
        exact = {'insert': {'kind', 'page', 'width', 'theme', 'operation', 'selector', 'html'},
                 'remove_attribute': {'kind', 'page', 'width', 'theme', 'operation', 'selector', 'attribute'}}
        if plant['operation'] not in exact or keys != exact[plant['operation']]:
            schema_error(where, f'accessibility operation has invalid fields: {plant["operation"]!r}')
    elif kind == 'strip':
        if not isinstance(plant['find'], list) or not plant['find'] or not all(isinstance(item, str) and item for item in plant['find']):
            schema_error(where, 'strip find must be a nonempty string list')
    elif kind == 'multi':
        if not isinstance(plant['plants'], list) or not plant['plants']:
            schema_error(where, 'multi plants must be a nonempty list')
        for index, child in enumerate(plant['plants']):
            validate_plant(child, f'{where}.plants[{index}]')
    elif kind == 'project':
        action = plant['action']
        action_fields = {'json': {'keys', 'value'}, 'file': {'text'}, 'mkdir': set()}
        if action not in action_fields:
            schema_error(where, f'unknown project action {action!r}')
        expected = {'kind', 'action', 'path'} | action_fields[action]
        if keys != expected:
            schema_error(where, f'project action {action} requires exactly {sorted(expected)}')
        if action == 'json' and (not isinstance(plant['keys'], list) or not plant['keys'] or not all(isinstance(key, str) and key for key in plant['keys'])):
            schema_error(where, 'project JSON keys must be a nonempty string list')
    elif kind == 'asset':
        path = os.path.normpath(plant['path'])
        if os.path.isabs(path) or path.startswith('..' + os.sep) or path == '..':
            schema_error(where, 'asset path must stay inside the isolated candidate')
        value = plant['append_hex']
        if not isinstance(value, str) or not value or any(ch not in '0123456789abcdefABCDEF' for ch in value) or len(value) % 2:
            schema_error(where, 'asset append_hex must contain complete hexadecimal bytes')
    elif kind == 'route_verifier':
        if plant['page'] != 'projects':
            schema_error(where, 'route_verifier currently governs the Projects route only')
        if not isinstance(plant['find'], str) or not plant['find']:
            schema_error(where, 'route_verifier find must be a nonempty exact string')
        if not isinstance(plant['with'], str):
            schema_error(where, 'route_verifier with must be a string')
        if not isinstance(plant['verifier_kind'], str) or not plant['verifier_kind']:
            schema_error(where, 'route_verifier verifier_kind must be a nonempty string')
        if 'path' in plant:
            path = os.path.normpath(plant['path'])
            if os.path.isabs(path) or path.startswith('..' + os.sep) or path == '..':
                schema_error(where, 'route_verifier path must stay inside the isolated candidate')
    elif kind == 'facts_mutation':
        if not isinstance(plant['case'], str) or not plant['case'].strip():
            schema_error(where, 'facts_mutation case must be a nonempty dedicated-runner case ID')

def validate_ledger(data=None):
    data = LED if data is None else data
    if (not isinstance(data, dict) or set(data) != {'about', 'kinds', 'entries'}
            or not isinstance(data['about'], str) or not isinstance(data['kinds'], dict) or not isinstance(data['entries'], list)):
        schema_error('ledger', 'top level must contain about, kinds, and entries with canonical types')
    if not set(data['kinds']).issubset(PLANT_FIELDS) or not all(isinstance(value, str) for value in data['kinds'].values()):
        schema_error('ledger.kinds', 'kind documentation contains an unknown kind or non-string description')
    rows = [line.split('|') for line in open(os.path.join(RUBRIC, 'rubric.md')).read().split('\n') if line.startswith('| **')]
    known_checks = {row[1].strip().strip('*') for row in rows} | {'reviewer'}
    seen = set()
    for index, entry in enumerate(data['entries']):
        where = f'entries[{index}]'
        if not isinstance(entry, dict):
            schema_error(where, 'entry must be an object')
        keys = set(entry)
        missing, unknown = ENTRY_REQUIRED - keys, keys - ENTRY_ALLOWED
        if missing:
            schema_error(where, f'missing entry fields {sorted(missing)}')
        if unknown:
            schema_error(where, f'unknown entry fields {sorted(unknown)}')
        mutation_id = entry['id']
        if not isinstance(mutation_id, str) or not mutation_id.strip() or mutation_id in seen:
            schema_error(where, f'id must be unique and nonempty: {mutation_id!r}')
        seen.add(mutation_id)
        if entry['check'] not in known_checks:
            schema_error(where, f'unknown rubric check {entry["check"]!r}')
        plant = entry['plant']
        if plant is None:
            if entry['check'] != 'reviewer':
                schema_error(where, 'only reviewer entries may omit a plant')
        else:
            validate_plant(plant, f'{where}.plant')
        if plant and plant['kind'] in ('render', 'a11y'):
            oracle = entry.get('oracle')
            oracle_key = 'audit' if plant['kind'] == 'render' else 'a11y'
            if not isinstance(oracle, dict) or set(oracle) != {oracle_key} or not isinstance(oracle[oracle_key], str) or not oracle[oracle_key]:
                schema_error(where, f'{plant["kind"]} entry requires exactly oracle.{oracle_key} as a nonempty string')
        elif 'oracle' in entry:
            schema_error(where, 'only rendered-verifier entries may declare oracle')
    reviewer_ids = [entry['id'] for entry in data['entries'] if entry.get('plant') is None]
    if reviewer_ids != EXPECTED_REVIEWER_ATTESTATION_IDS:
        schema_error('ledger reviewer attestations', f'exact reviewer-only IDs changed: {reviewer_ids!r}')
    return len(seen)

def schema_self_tests():
    render_index = next(index for index, entry in enumerate(LED['entries']) if (entry.get('plant') or {}).get('kind') == 'render')
    mutations = []
    nested = json.loads(json.dumps(LED))
    nested_entry = nested['entries'][render_index]
    nested_entry['plant']['audit'] = nested_entry['oracle']['audit']
    del nested_entry['oracle']
    mutations.append(('nested render audit', nested))
    unknown = json.loads(json.dumps(LED))
    unknown['entries'][render_index]['plant']['mystery'] = True
    mutations.append(('unknown plant field', unknown))
    width = json.loads(json.dumps(LED))
    width['entries'][render_index]['plant']['width'] = 0
    mutations.append(('nonpositive render width', width))
    for label, data in mutations:
        try:
            validate_ledger(data)
        except PlantError:
            continue
        schema_error('schema self-test', f'accepted {label}')


def authority_group_self_tests():
    """A clean typed-claim fixture passes; structural spoofs fail without using CSS classes."""
    fixture = '''<body><main id="main">
<section id="praxtera" data-authority-group="praxtera-client-provenance" aria-labelledby="praxtera-authority-heading"><h2 id="praxtera-authority-heading">Praxtera AI Institute</h2>
<article id="eagles" data-authority-member="eagles">Philadelphia Eagles / Eagles Care Summit</article>
<article id="jacobson-strategic" data-authority-member="jacobson-strategic">Jacobson Strategic</article>
<article id="hp" data-authority-member="hp">HP</article>
<article id="morgan-lewis" data-authority-member="morgan-lewis">Morgan Lewis</article>
<article id="pbs" data-authority-member="pbs">PBS</article>
<article id="sonova" data-authority-member="sonova">Sonova</article></section>
<section id="independent-speaking-teaching" data-authority-group="independent-speaking-teaching" aria-labelledby="independent-authority-heading"><h2 id="independent-authority-heading">Independent Speaking &amp; Teaching</h2>
<article id="cmu" data-authority-member="cmu-teaching">Carnegie Mellon University</article>
<article id="atos" data-authority-member="atos">Atos</article></section>
</main></body>'''

    def failures(markup):
        tree = guard.parse(markup)
        body = next((node for node in tree.all() if node.tag == 'body'), tree)
        run = guard.Run(TRANSIT)
        run.fails = []
        run.authority_groups('speaking', body)
        return [item for item in run.fails if item.get('check') == 'A3']

    control = failures(fixture)
    evidence = {
        'control': {
            'scenario': 'conforming typed-claim ancestry',
            'plantApplications': 0,
            'expectedFailures': [],
            'failures': control,
            'ok': not control,
        },
        'cases': [],
    }
    if control:
        schema_error('authority-group self-test', f'conforming control is red: {control!r}')

    class_fake = fixture
    class_fake = class_fake.replace(
        ' data-authority-group="praxtera-client-provenance"',
        ' class="praxtera-client-provenance"', 1)
    class_fake = class_fake.replace(
        ' data-authority-member="hp"',
        ' class="authority-member hp"', 1)
    hp = '<article id="hp" data-authority-member="hp">HP</article>\n'
    moved = fixture.replace(hp, '', 1).replace('</main>', hp + '</main>', 1)
    ordered = ('<article id="hp" data-authority-member="hp">HP</article>\n'
               '<article id="morgan-lewis" data-authority-member="morgan-lewis">Morgan Lewis</article>')
    reversed_order = ('<article id="morgan-lewis" data-authority-member="morgan-lewis">Morgan Lewis</article>\n'
                      '<article id="hp" data-authority-member="hp">HP</article>')
    mutations = [
        ('class ancestry spoof', class_fake, 'authority groups must appear exactly once'),
        ('member moved while label remains', moved, 'moved outside its sole group'),
        ('member order swapped', fixture.replace(ordered, reversed_order, 1), 'authority member ancestry/order must be exactly'),
        ('heading text drift', fixture.replace('Independent Speaking &amp; Teaching', 'Independent Teaching', 1), 'aria-labelledby must name one descendant heading'),
        ('hidden non-stop member', fixture.replace('id="hp" data-authority-member="hp"', 'id="hp" data-authority-member="hp" hidden', 1), 'non-stop authority groups cannot be rides, tabs, hidden panels, or selectable state'),
    ]
    for label, markup, expected_message in mutations:
        caught = failures(markup)
        causal = [item for item in caught
                  if item.get('check') == 'A3' and expected_message in item.get('msg', '')]
        case = {
            'scenario': label,
            'plantApplications': 1,
            'expectedFailure': {'check': 'A3', 'messageContains': expected_message},
            'failures': caught,
            'ok': bool(causal) and all(item.get('check') == 'A3' for item in caught),
        }
        evidence['cases'].append(case)
        if not case['ok']:
            schema_error('authority-group self-test', f'accepted or misattributed {label}: {caught!r}')
    evidence['ok'] = evidence['control']['ok'] and all(case['ok'] for case in evidence['cases'])
    return evidence

# ------------------------------------------------------------------ planting, by exact text and by element
def tag_end(html, i):
    """Index just past the '>' that closes the tag starting at or before i."""
    return html.index('>', i) + 1

def open_tag_start(html, i):
    return html.rindex('<', 0, i)

def element_span(html, start):
    """(start, end) of the element whose opening tag starts at `start`, nesting counted."""
    name = html[start + 1:].split()[0].split('>')[0].strip('/')
    depth, i = 0, start
    while i < len(html):
        o = html.find('<' + name, i)
        c = html.find('</' + name, i)
        if c < 0:
            return start, len(html)
        if 0 <= o < c and html[o + len(name) + 1] in ' >/\n\t':
            depth += 1; i = o + 1
        else:
            depth -= 1; i = c + 1
            if depth == 0:
                return start, tag_end(html, c)
    return start, len(html)

def insert(html, into, frag):
    if into == 'main':
        k = html.index('<main id="main">') + len('<main id="main">')
    elif into == 'header':
        k = tag_end(html, html.index('<header'))
    elif into == 'map':
        k = tag_end(html, html.index('<div class="map '))
    elif into.startswith('class:'):
        want = into[6:]
        k = -1
        i = html.find('class="')
        while i >= 0:
            j = html.index('"', i + 7)
            if want in html[i + 7:j].split():
                k = tag_end(html, i); break
            i = html.find('class="', j)
        if k < 0:
            raise ValueError(f'no element with class {want}')
    else:
        i = html.find(f'id="{into}"')
        if i < 0:
            raise ValueError(f'no element with id {into}')
        k = tag_end(html, i)
    return html[:k] + frag + html[k:]

def apply(tdir, plant):
    k = plant['kind']
    if k == 'multi':
        for p in plant['plants']:
            apply(tdir, p)
        return
    if k == 'file':
        open(os.path.join(tdir, plant['path']), 'w').write(plant['html'])
        return
    path = os.path.join(tdir, REG['pages'][plant['page']]['file'])
    html = open(path).read()
    before = html
    if k == 'insert':
        html = insert(html, plant['into'], plant['html'].replace('{UNLISTED}', ' '.join(guard.Run(tdir).banned_names) or 'UNLISTED'))
    elif k == 'strip':
        for f in plant['find']:
            html = html.replace(f, '')
    elif k == 'replace':
        html = html.replace(plant['find'], plant['with'], 1)
    elif k == 'remove_tags':
        out, i = [], 0
        while True:
            j = html.find('<' + plant['tag'], i)
            if j < 0:
                out.append(html[i:]); break
            e = tag_end(html, j)
            if plant['contains'] in html[j:e]:
                s, t = (j, e) if plant['tag'] in guard.VOID else element_span(html, j)
                out.append(html[i:s]); i = t
            else:
                out.append(html[i:e]); i = e
        html = ''.join(out)
    elif k == 'remove_element':
        marker = f'id="{plant["id"]}"'
        applications = html.count(marker)
        if applications != 1:
            raise PlantError(f'remove_element expected one {marker}, found {applications}')
        i = html.find(marker)
        s, t = element_span(html, open_tag_start(html, i))
        html = html[:s] + html[t:]
    elif k == 'stale':
        key = 'style.css?v='
        i = html.find(key)
        html = html[:i + len(key)] + '00000000' + html[i + len(key) + 8:]
    if html == before:
        raise PlantError(f'the plant changed nothing on {plant["page"]}')
    open(path, 'w').write(html)

def copy_site():
    tmp = tempfile.mkdtemp(prefix='rubric-test-')
    t = os.path.join(tmp, 'site')
    shutil.copytree(TRANSIT, t, ignore=shutil.ignore_patterns('shots', '.*', '_build'))
    return tmp, t

def static_case(e, base_keys):
    tmp, t = copy_site()
    try:
        try:
            apply(t, e['plant'])
        except PlantError:
            raise
        except Exception as ex:
            raise PlantError(f'static plant could not be applied: {ex}') from ex
        new = [f for f in guard.Run(t).run() if f['key'] not in base_keys and f['check'] == e['check']]
        p = e['plant']
        pages = e.get('expect_pages') or [p.get('page') or p.get('plants', [{}])[0].get('page')]
        if p['kind'] == 'file':
            return bool(new), new
        got = {f['page'] for f in new}
        return all(pg in got for pg in pages if pg), new
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

def render_case(e):
    p = e['plant']
    env = dict(os.environ, AUDIT_PLANT=json.dumps(p))
    planted_json = tempfile.NamedTemporaryFile(prefix='rubric-planted-', suffix='.json', delete=False)
    clean_json = tempfile.NamedTemporaryFile(prefix='rubric-clean-', suffix='.json', delete=False)
    planted_json.close(); clean_json.close()
    cmd = ['node', os.path.join(TRANSIT, '_build/audit.mjs'), '--widths', str(p['width']), p['page']]
    cache_key = (p['page'], p.get('width', 1440))
    try:
        planted_run = subprocess.run(cmd[:2] + ['--json', planted_json.name] + cmd[2:], capture_output=True, text=True, env=env, timeout=300)
        try:
            planted = json.load(open(planted_json.name))
        except (OSError, json.JSONDecodeError) as ex:
            raise RuntimeError(f'render audit produced no planted evidence: {ex}; {planted_run.stderr[-240:]}') from ex
        application = planted.get('plant')
        if isinstance(application, dict) and application.get('errors'):
            raise PlantError(f'render plant application was not confirmed: {application!r}')
        if not isinstance(application, dict) or application.get('requested') is not True or application.get('applied') is not True or application.get('applications', 0) < 1:
            raise RuntimeError(f'render verifier did not reach the requested plant: {application!r}')
        if cache_key not in CLEAN_RENDER:
            clean_run = subprocess.run(cmd[:2] + ['--json', clean_json.name] + cmd[2:], capture_output=True, text=True, timeout=300)
            try:
                CLEAN_RENDER[cache_key] = json.load(open(clean_json.name))
            except (OSError, json.JSONDecodeError) as ex:
                raise RuntimeError(f'render audit produced no clean evidence: {ex}; {clean_run.stderr[-240:]}') from ex
        clean = CLEAN_RENDER[cache_key]
        base = {(item.get('page'), item.get('w'), item.get('check'), item.get('msg')) for item in clean.get('results', []) if item.get('lvl') == 'FAIL'}
        oracle = e['oracle']['audit']
        hits = [item for item in planted.get('results', [])
                if item.get('lvl') == 'FAIL' and item.get('check') == oracle
                and (item.get('page'), item.get('w'), item.get('check'), item.get('msg')) not in base]
        return bool(hits), hits[:3]
    finally:
        for path in (planted_json.name, clean_json.name):
            try:
                os.remove(path)
            except OSError:
                pass

def a11y_case(e):
    p = e['plant']
    env = dict(os.environ, A11Y_PLANT=json.dumps(p))
    planted_json = tempfile.NamedTemporaryFile(prefix='rubric-a11y-planted-', suffix='.json', delete=False)
    clean_json = tempfile.NamedTemporaryFile(prefix='rubric-a11y-clean-', suffix='.json', delete=False)
    planted_json.close(); clean_json.close()
    script = os.path.join(RUBRIC, 'a11y.mjs')
    cmd = ['node', script, '--routes', p['page'], '--widths', str(p['width']), '--themes', p['theme']]
    cache_key = (p['page'], p['width'], p['theme'])
    try:
        planted_run = subprocess.run(cmd[:2] + ['--json', planted_json.name] + cmd[2:], capture_output=True, text=True, env=env, timeout=300)
        try:
            planted = json.load(open(planted_json.name))
        except (OSError, json.JSONDecodeError) as ex:
            raise RuntimeError(f'accessibility verifier produced no planted evidence: {ex}; {planted_run.stderr[-240:]}') from ex
        application = planted.get('plant')
        if isinstance(application, dict) and application.get('errors'):
            raise PlantError(f'accessibility plant application was not confirmed exactly once: {application!r}')
        if not isinstance(application, dict) or application.get('requested') is not True or application.get('applied') is not True or application.get('applications') != 1:
            raise RuntimeError(f'accessibility verifier did not reach the requested plant: {application!r}')
        if cache_key not in CLEAN_A11Y:
            clean_run = subprocess.run(cmd[:2] + ['--json', clean_json.name] + cmd[2:], capture_output=True, text=True, timeout=300)
            try:
                CLEAN_A11Y[cache_key] = json.load(open(clean_json.name))
            except (OSError, json.JSONDecodeError) as ex:
                raise RuntimeError(f'accessibility verifier produced no clean evidence: {ex}; {clean_run.stderr[-240:]}') from ex
        clean = CLEAN_A11Y[cache_key]
        base = {(item.get('kind'), item.get('page'), item.get('width'), item.get('theme'), item.get('state'), item.get('message'))
                for item in clean.get('failures', [])}
        oracle = e['oracle']['a11y']
        hits = [item for item in planted.get('failures', []) if item.get('kind') == oracle
                and (item.get('kind'), item.get('page'), item.get('width'), item.get('theme'), item.get('state'), item.get('message')) not in base]
        evidence = {
            'application': application,
            'oracle': oracle,
            'hits': hits[:3],
            'cleanFailures': clean.get('failures', []),
            'plantedReturnCode': planted_run.returncode,
            'provenance': {key: planted.get(key) for key in ('baselineId', 'sourceHash', 'artifactHash')},
        }
        return bool(hits), evidence
    finally:
        for path in (planted_json.name, clean_json.name):
            try:
                os.remove(path)
            except OSError:
                pass

def project_case(e):
    """Plant a project-structure error in a clean synthetic repository."""
    tmp = tempfile.mkdtemp(prefix='rubric-project-')
    try:
        os.makedirs(os.path.join(tmp, '.claude', 'rubric'))
        os.makedirs(os.path.join(tmp, 'site'))
        shutil.copy2(os.path.join(RUBRIC, 'registry.json'), os.path.join(tmp, '.claude', 'rubric', 'registry.json'))
        shutil.copy2(os.path.join(ROOT, 'site', '.baseline.json'), os.path.join(tmp, 'site', '.baseline.json'))
        full = 'python3 .claude/rubric/score.py'
        scripts = {name: full for name in rubric_gate.ROUTED_SCRIPTS}
        json.dump({'scripts': scripts}, open(os.path.join(tmp, 'package.json'), 'w'))
        open(os.path.join(tmp, 'AGENTS.md'), 'w').write(rubric_gate.FULL_RUBRIC_MARKER + '\nRun `' + full + '` after every change.\n')
        hooks = {}
        for event, mode in (('UserPromptSubmit', 'prompt'), ('PreToolUse', 'pre'), ('Stop', 'stop')):
            hooks[event] = [{'hooks': [{'type': 'command', 'command': f'python3 "$CLAUDE_PROJECT_DIR"/.claude/rubric/rubric_gate.py {mode}'}]}]
        json.dump({'hooks': hooks}, open(os.path.join(tmp, '.claude', 'settings.json'), 'w'))
        plant = e['plant']
        target = os.path.join(tmp, plant['path'])
        action = plant['action']
        try:
            if action == 'mkdir':
                os.makedirs(target)
            elif action == 'file':
                os.makedirs(os.path.dirname(target), exist_ok=True)
                open(target, 'w').write(plant.get('text', 'planted'))
            elif action == 'json':
                data = json.load(open(target))
                cur = data
                keys = plant['keys']
                for key in keys[:-1]:
                    cur = cur[key]
                cur[keys[-1]] = plant['value']
                json.dump(data, open(target, 'w'))
        except Exception as ex:
            raise PlantError(f'project plant could not be applied: {ex}') from ex
        found = rubric_gate.project_failures(tmp)
        hits = [(check, message) for check, message in found if check == e['check']]
        return bool(hits), hits
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

def asset_case(e):
    """Alter one candidate-bound asset and require the enforced Projects verifier to reject its bytes specifically."""
    tmp = tempfile.mkdtemp(prefix='rubric-asset-')
    server = None
    try:
        candidate = os.path.join(tmp, 'candidate')
        plant = e['plant']
        target = os.path.join(candidate, os.path.normpath(plant['path']))
        source = os.path.join(ROOT, os.path.normpath(plant['path']))
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copy2(source, target)
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 0))
            port = probe.getsockname()[1]
        server = subprocess.Popen(
            [sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', candidate],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, text=True,
        )
        url = f'http://127.0.0.1:{port}/'
        for _ in range(50):
            try:
                urllib.request.urlopen(url + plant['path'], timeout=1).read(1)
                break
            except Exception:
                if server.poll() is not None:
                    raise PlantError('isolated asset server stopped before verification')
                time.sleep(0.05)
        verifier = os.path.join(ROOT, 'site', '_build', 'verify-projects.mjs')
        env = dict(os.environ, PROJECTS_BASE=url)
        clean_json = os.path.join(tmp, 'clean.json')
        clean = subprocess.run(['node', verifier, '--json', clean_json, '--asset-only'], capture_output=True, text=True, env=env, timeout=60)
        clean_report = json.load(open(clean_json))
        if clean.returncode != 0 or clean_report.get('ok') is not True:
            raise PlantError(f'clean candidate asset did not pass: {clean_report!r}')
        with open(target, 'ab') as stream:
            stream.write(bytes.fromhex(plant['append_hex']))
        planted_json = os.path.join(tmp, 'planted.json')
        planted = subprocess.run(['node', verifier, '--json', planted_json, '--asset-only'], capture_output=True, text=True, env=env, timeout=60)
        planted_report = json.load(open(planted_json))
        hits = [failure for failure in planted_report.get('failures', []) if failure.get('kind') == 'asset-bytes']
        return planted.returncode != 0 and planted_report.get('ok') is False and bool(hits), hits
    finally:
        if server:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
        shutil.rmtree(tmp, ignore_errors=True)

def route_verifier_case(e):
    """Mutate one exact Projects seam and require the enforced verifier to name the intended failure."""
    tmp = tempfile.mkdtemp(prefix='rubric-route-verifier-')
    server = None
    try:
        source_candidate = os.path.join(RUBRIC, 'out', 'candidate')
        if not os.path.isfile(os.path.join(source_candidate, 'projects.html')):
            raise PlantError('score candidate is unavailable for the route verifier mutation')
        candidate = os.path.join(tmp, 'candidate')
        shutil.copytree(source_candidate, candidate)
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 0))
            port = probe.getsockname()[1]
        server = subprocess.Popen(
            [sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', candidate],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, text=True,
        )
        url = f'http://127.0.0.1:{port}/'
        for _ in range(50):
            try:
                urllib.request.urlopen(url + 'projects.html', timeout=1).read(1)
                break
            except Exception:
                if server.poll() is not None:
                    raise PlantError('isolated route verifier server stopped before verification')
                time.sleep(0.05)
        verifier = os.path.join(ROOT, 'site', '_build', 'verify-projects.mjs')
        env = dict(os.environ, PROJECTS_BASE=url)
        clean_json = os.path.join(tmp, 'clean.json')
        clean_command = ['node', verifier, '--json', clean_json, '--projects-only']
        clean = subprocess.run(clean_command, capture_output=True, text=True, env=env, timeout=180)
        clean_report = json.load(open(clean_json))
        if clean.returncode != 0 or clean_report.get('ok') is not True:
            raise PlantError(f'clean Projects candidate did not pass its enforced verifier: {clean_report!r}')

        plant = e['plant']
        relative_path = plant.get('path') or REG['pages'][plant['page']]['file']
        path = os.path.join(candidate, os.path.normpath(relative_path))
        if not os.path.isfile(path):
            raise PlantError(f'route verifier target is unavailable: {relative_path}')
        text = open(path).read()
        applications = text.count(plant['find'])
        if applications != 1:
            raise PlantError(f'route verifier plant matched {applications} times instead of exactly once')
        open(path, 'w').write(text.replace(plant['find'], plant['with'], 1))
        planted_json = os.path.join(tmp, 'planted.json')
        planted_command = ['node', verifier, '--json', planted_json, '--projects-only']
        planted = subprocess.run(planted_command, capture_output=True, text=True, env=env, timeout=180)
        planted_report = json.load(open(planted_json))
        hits = [failure for failure in planted_report.get('failures', [])
                if failure.get('kind') == plant['verifier_kind']]
        return planted.returncode != 0 and planted_report.get('ok') is False and bool(hits), hits
    finally:
        if server:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
        shutil.rmtree(tmp, ignore_errors=True)

def regex_plants():
    """noregex.py must catch an `import re` and a regex literal."""
    tmp = tempfile.mkdtemp(prefix='noregex-test-')
    try:
        a, b = os.path.join(tmp, 'a.py'), os.path.join(tmp, 'b.mjs')
        open(a, 'w').write('import re\nprint(re.sub("x", "y", "z"))\n')
        open(b, 'w').write('const s = "a b".split(' + chr(47) + '\\s+' + chr(47) + ');\n')
        return bool(noregex.py_hits(a)), bool(noregex.js_hits([b]).get(b))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def file_sha256(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def candidate_tree_sha256(root):
    digest = hashlib.sha256()
    for directory, dirs, files in os.walk(root):
        dirs[:] = sorted(name for name in dirs if name != '__pycache__')
        for name in sorted(files):
            path = os.path.join(directory, name)
            relative = os.path.relpath(path, root)
            digest.update(relative.encode('utf-8'))
            digest.update(open(path, 'rb').read())
    return digest.hexdigest()


RESEARCH_CASE_RESULT_KEYS = {
    'id', 'applications', 'expectedKind', 'expectedMessage', 'returnCode',
    'caught', 'failures', 'cleanControlSha256',
}
RESEARCH_FULL_CASES = {'frozen-nonresearch-html-drift', 'shared-style-drift'}


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
    boolean = json.loads(json.dumps(report)); boolean['results'][0]['applications'] = True; plants.append(boolean)
    wrong_return = json.loads(json.dumps(report)); wrong_return['results'][0]['returnCode'] = 0; plants.append(wrong_return)
    reordered = json.loads(json.dumps(report)); reordered['results'][:2] = reversed(reordered['results'][:2]); plants.append(reordered)
    digest = json.loads(json.dumps(report)); digest['resultsSha256'] = '0' * 64; plants.append(digest)
    ephemeral = json.loads(json.dumps(report))
    ephemeral['results'][0]['failures'][0]['message'] += ' http://127.0.0.1:54321/'
    ephemeral['resultsSha256'] = canonical_research_results_sha256(ephemeral['results'])
    plants.append(ephemeral)
    if any(not research_result_schema_problems(plant, case_ids) for plant in plants):
        raise PlantError('Research mutation canonical result schema accepted a causal tamper plant')


def speaking_mutation_report():
    """Run and bind the clean-control-first Speaking runtime mutation suite once."""
    runner = os.path.join(ROOT, 'site', '_build', 'verify-speaking-mutations.py')
    verifier = os.path.join(ROOT, 'site', '_build', 'verify-speaking.mjs')
    proof_contract = os.path.join(RUBRIC, 'speaking-proof-contract.json')
    candidate = os.path.join(RUBRIC, 'out', 'candidate')
    report_path = os.path.join(RUBRIC, 'out', 'speaking-mutations.json')
    scoped_path = os.path.join(RUBRIC, 'out', 'speaking-mutations.scoped-clean.json')
    full_path = os.path.join(RUBRIC, 'out', 'speaking-mutations.full-clean.json')
    production_report = os.path.join(RUBRIC, 'out', 'speaking-verifier.json')
    precomputed = os.environ.get('SPEAKING_MUTATION_REPORT_PATH')
    if precomputed and os.path.abspath(precomputed) != os.path.abspath(report_path):
        raise PlantError('score supplied an unexpected Speaking mutation report path')
    run = None
    if not precomputed:
        for stale in (report_path, scoped_path, full_path):
            try:
                os.remove(stale)
            except FileNotFoundError:
                pass
        run = subprocess.run(
            [sys.executable, runner, '--json', report_path], cwd=ROOT,
            capture_output=True, text=True, timeout=1800,
        )
    try:
        report = json.load(open(report_path))
    except (OSError, json.JSONDecodeError) as error:
        details = run.stderr[-300:] if run else 'precomputed report unavailable'
        raise PlantError(f'Speaking mutation runner produced no structured report: {error}; {details}') from error
    return_code = run.returncode if run else 0
    if return_code != 0 or report.get('ok') is not True:
        raise PlantError(f'Speaking mutation runner failed: exit={return_code}, report={report!r}')
    case_ids = [item.get('id') for item in report.get('results', [])]
    if case_ids != EXPECTED_SPEAKING_MUTATION_CASE_IDS or len(set(case_ids)) != len(case_ids):
        raise PlantError(f'Speaking mutation case order drifted: {case_ids!r}')
    expected_count = len(EXPECTED_SPEAKING_MUTATION_CASE_IDS)
    if (report.get('attempted') != expected_count or report.get('planted') != expected_count
            or report.get('caught') != expected_count or report.get('plantErrors')
            or report.get('inputHashesStable') is not True):
        raise PlantError('Speaking mutation aggregate counts, plants, or governed input invariants failed')
    if any(item.get('applications') != 1 or item.get('caught') is not True
           or len(item.get('failures') or []) != 1
           or item['failures'][0].get('kind') != item.get('expectedKind')
           or item.get('expectedMessage') not in item['failures'][0].get('message', '')
           for item in report['results']):
        raise PlantError('Speaking mutation result is not causally bound to its exact failure contract')
    expected_inputs = {
        'runnerSha256': file_sha256(runner),
        'verifierSha256': file_sha256(verifier),
        'proofContractSha256': file_sha256(proof_contract),
        'candidateProvenanceSha256': file_sha256(os.path.join(candidate, '.site-provenance.json')),
        'candidateTreeSha256': candidate_tree_sha256(candidate),
    }
    if (report.get('inputHashesStart') != expected_inputs or report.get('inputHashesEnd') != expected_inputs
            or any(report.get(key) != value for key, value in expected_inputs.items())
            or report.get('snapshotCandidateTreeSha256') != expected_inputs['candidateTreeSha256']
            or report.get('snapshotCandidateProvenanceSha256') != expected_inputs['candidateProvenanceSha256']):
        raise PlantError('Speaking mutation reports are not derived from one immutable governed candidate snapshot')
    try:
        scoped = json.load(open(scoped_path))
        full = json.load(open(full_path))
    except (OSError, json.JSONDecodeError) as error:
        raise PlantError(f'Speaking mutation clean-control reports are missing: {error}') from error
    clean = report.get('cleanControl') or {}
    expected_scoped_rel = os.path.relpath(scoped_path, ROOT)
    expected_full_rel = os.path.relpath(full_path, ROOT)
    if (clean.get('ok') is not True or clean.get('scopedOk') is not True or clean.get('fullOk') is not True
            or clean.get('scopedReportPath') != expected_scoped_rel
            or clean.get('fullReportPath') != expected_full_rel
            or clean.get('scopedReportSha256') != file_sha256(scoped_path)
            or clean.get('fullReportSha256') != file_sha256(full_path)
            or scoped.get('ok') is not True or scoped.get('mutationTest') is not False
            or full.get('ok') is not True or full.get('mutationTest') is not False or not full.get('frozen')
            or not os.path.isfile(production_report) or file_sha256(production_report) != file_sha256(full_path)):
        raise PlantError('Speaking clean controls are missing, stale, mutation-mode, or differ from the production report')
    return {
        'ok': True,
        'returnCode': return_code,
        'reportPath': os.path.relpath(report_path, ROOT),
        'reportSha256': file_sha256(report_path),
        'runnerSha256': expected_inputs['runnerSha256'],
        'verifierSha256': expected_inputs['verifierSha256'],
        'proofContractSha256': expected_inputs['proofContractSha256'],
        'candidateTreeSha256': expected_inputs['candidateTreeSha256'],
        'candidateProvenanceSha256': expected_inputs['candidateProvenanceSha256'],
        'attempted': report['attempted'],
        'planted': report['planted'],
        'caught': report['caught'],
        'caseIds': case_ids,
        'inputHashesStable': report['inputHashesStable'],
        'scopedReportPath': expected_scoped_rel,
        'scopedReportSha256': clean['scopedReportSha256'],
        'fullReportPath': expected_full_rel,
        'fullReportSha256': clean['fullReportSha256'],
        'productionReportSha256': file_sha256(production_report),
    }


def research_mutation_report():
    """Run and bind the contract-derived Research mutation suite and its complete input closure."""
    runner = os.path.join(ROOT, 'site', '_build', 'verify-research-mutations.py')
    verifier = os.path.join(ROOT, 'site', '_build', 'verify-research.mjs')
    proof_path = os.path.join(RUBRIC, 'research-proof-contract.json')
    authority_path = os.path.join(RUBRIC, 'authority', 'research-evidence-contract.json')
    figure_path = os.path.join(RUBRIC, 'sources', 'drone-megaddon-figure-assets.json')
    candidate = os.path.join(RUBRIC, 'out', 'candidate')
    report_path = os.path.join(RUBRIC, 'out', 'research-mutations.json')
    scoped_path = os.path.join(RUBRIC, 'out', 'research-mutations.scoped-clean.json')
    full_path = os.path.join(RUBRIC, 'out', 'research-mutations.full-clean.json')
    production_report = os.path.join(RUBRIC, 'out', 'research-verifier.json')
    proof = json.load(open(proof_path))
    expected_case_ids = proof['mutationSuite']['caseIds']
    if canonical_json_sha256(expected_case_ids) != EXPECTED_RESEARCH_CASE_IDS_SHA256:
        raise PlantError('Research proof ordered case-list digest changed')
    wheel_policy = proof['runtime']['realInputScroll']['wheelAcknowledgement']
    if (type(wheel_policy.get('scriptlessMaxCompositorBarriersPerDispatch')) is not int
            or wheel_policy['scriptlessMaxCompositorBarriersPerDispatch'] != EXPECTED_RESEARCH_SCRIPTLESS_BARRIER_CAP
            or wheel_policy.get('scriptlessWheelPoint') != EXPECTED_RESEARCH_SCRIPTLESS_WHEEL_POINT):
        raise PlantError('Research scriptless wheel protocol constants changed')
    precomputed = os.environ.get('RESEARCH_MUTATION_REPORT_PATH')
    if precomputed and os.path.abspath(precomputed) != os.path.abspath(report_path):
        raise PlantError('score supplied an unexpected Research mutation report path')
    run = None
    if not precomputed:
        for stale in (report_path, scoped_path, full_path):
            try:
                os.remove(stale)
            except FileNotFoundError:
                pass
        run = subprocess.run(
            [sys.executable, runner, '--json', report_path], cwd=ROOT,
            capture_output=True, text=True, timeout=7200,
        )
    try:
        report = json.load(open(report_path))
    except (OSError, json.JSONDecodeError) as error:
        details = run.stderr[-500:] if run else 'precomputed report unavailable'
        raise PlantError(f'Research mutation runner produced no structured report: {error}; {details}') from error
    return_code = run.returncode if run else 0
    case_ids = [item.get('id') for item in report.get('results', [])]
    expected_count = len(expected_case_ids)
    if (return_code != 0 or report.get('ok') is not True or case_ids != expected_case_ids
            or len(set(case_ids)) != expected_count or report.get('expectedCount') != expected_count
            or report.get('attempted') != expected_count or report.get('planted') != expected_count
            or report.get('caught') != expected_count or report.get('plantErrors')
            or report.get('inputHashesStable') is not True
            or report.get('snapshotMatchesGovernedStart') is not True):
        raise PlantError('Research mutation aggregate, ordered case set, plants, or input invariants failed')
    result_problems = research_result_schema_problems(report, expected_case_ids)
    if result_problems:
        raise PlantError('; '.join(result_problems))
    research_result_schema_self_test(report, expected_case_ids)
    expected_primary = {
        'runnerSha256': file_sha256(runner),
        'verifierSha256': file_sha256(verifier),
        'proofContractSha256': file_sha256(proof_path),
        'authorityContractSha256': file_sha256(authority_path),
        'figureManifestSha256': file_sha256(figure_path),
        'scoreSha256': file_sha256(os.path.join(RUBRIC, 'score.py')),
        'testSha256': file_sha256(os.path.join(RUBRIC, 'test.py')),
        'productionReportSha256': file_sha256(production_report),
        'candidateProvenanceSha256': file_sha256(os.path.join(candidate, '.site-provenance.json')),
        'candidateTreeSha256': candidate_tree_sha256(candidate),
        'siteSourceTreeSha256': candidate_tree_sha256(os.path.join(ROOT, 'site')),
        'caseIdsSha256': EXPECTED_RESEARCH_CASE_IDS_SHA256,
        'expectedMappingSha256': EXPECTED_RESEARCH_CASE_MAPPING_SHA256,
        'repoInputPathsSha256': EXPECTED_RESEARCH_DEPENDENCY_PATHS_SHA256,
    }
    start, end = report.get('inputHashesStart') or {}, report.get('inputHashesEnd') or {}
    repo_inputs = start.get('repoInputHashes') or {}
    oracle_problems = research_oracle_digest_problems(report, expected_case_ids, repo_inputs)
    if oracle_problems:
        raise PlantError('; '.join(oracle_problems))
    for key in ('caseIdsSha256', 'expectedMappingSha256', 'repoInputPathsSha256'):
        tampered = json.loads(json.dumps(report))
        tampered[key] = '0' * 64
        if not research_oracle_digest_problems(tampered, expected_case_ids, repo_inputs):
            raise PlantError(f'Research mutation oracle accepted a tampered {key}')
    if (start != end or any(start.get(key) != value for key, value in expected_primary.items())
            or any(report.get(key) != start.get(key) for key in start)
            or start.get('repoInputCount') != len(repo_inputs)
            or report.get('snapshotCandidateTreeSha256') != expected_primary['candidateTreeSha256']
            or report.get('snapshotCandidateProvenanceSha256') != expected_primary['candidateProvenanceSha256']):
        raise PlantError('Research mutation evidence is not bound to one immutable governed input snapshot')
    for relative, expected in repo_inputs.items():
        path = os.path.abspath(os.path.join(ROOT, *relative.split('/')))
        if not path.startswith(os.path.abspath(ROOT) + os.sep) or not os.path.isfile(path) or file_sha256(path) != expected:
            raise PlantError(f'Research mutation dependency closure changed: {relative}')
    try:
        scoped = json.load(open(scoped_path))
        full = json.load(open(full_path))
    except (OSError, json.JSONDecodeError) as error:
        raise PlantError(f'Research mutation clean-control reports are missing: {error}') from error
    clean = report.get('cleanControl') or {}
    if (clean.get('ok') is not True or clean.get('scopedOk') is not True or clean.get('fullOk') is not True
            or clean.get('scopedReportPath') != os.path.relpath(scoped_path, ROOT)
            or clean.get('fullReportPath') != os.path.relpath(full_path, ROOT)
            or clean.get('scopedReportSha256') != file_sha256(scoped_path)
            or clean.get('fullReportSha256') != file_sha256(full_path)
            or scoped.get('ok') is not True or scoped.get('mutationTest') is not False
            or full.get('ok') is not True or full.get('mutationTest') is not False
            or not full.get('frozen') or not os.path.isfile(production_report)):
        raise PlantError('Research clean controls are missing, stale, mutation-mode, or lack production evidence')
    production_sha256 = file_sha256(production_report)
    if clean.get('fullReportSha256') != production_sha256 or file_sha256(full_path) != production_sha256:
        raise PlantError('Research full clean control is not byte-identical to production render evidence')
    return {
        'ok': True, 'returnCode': return_code,
        'reportPath': os.path.relpath(report_path, ROOT), 'reportSha256': file_sha256(report_path),
        'runnerSha256': expected_primary['runnerSha256'], 'verifierSha256': expected_primary['verifierSha256'],
        'proofContractSha256': expected_primary['proofContractSha256'],
        'scoreSha256': expected_primary['scoreSha256'],
        'testSha256': expected_primary['testSha256'],
        'candidateTreeSha256': expected_primary['candidateTreeSha256'],
        'candidateProvenanceSha256': expected_primary['candidateProvenanceSha256'],
        'repoInputCount': len(repo_inputs), 'repoInputHashes': repo_inputs,
        'caseIdsSha256': EXPECTED_RESEARCH_CASE_IDS_SHA256,
        'expectedMappingSha256': EXPECTED_RESEARCH_CASE_MAPPING_SHA256,
        'repoInputPathsSha256': EXPECTED_RESEARCH_DEPENDENCY_PATHS_SHA256,
        'attempted': report['attempted'], 'planted': report['planted'], 'caught': report['caught'],
        'caseIds': case_ids, 'resultsSha256': report['resultsSha256'],
        'inputHashesStable': report['inputHashesStable'],
        'scopedReportPath': os.path.relpath(scoped_path, ROOT),
        'scopedReportSha256': clean['scopedReportSha256'],
        'fullReportPath': os.path.relpath(full_path, ROOT),
        'fullReportSha256': clean['fullReportSha256'],
        'productionReportSha256': production_sha256,
    }


def facts_mutation_report():
    """Run the dedicated authority/facts suite once and require exact ledger/report parity."""
    global FACTS_MUTATION_REPORT, FACTS_MUTATION_RETURN_CODE
    if FACTS_MUTATION_REPORT is not None:
        return FACTS_MUTATION_REPORT
    report_file = tempfile.NamedTemporaryFile(prefix='rubric-facts-mutations-', suffix='.json', delete=False)
    report_file.close()
    try:
        command = [sys.executable, os.path.join(RUBRIC, 'facts', 'mutation_test.py'), '--json', report_file.name]
        run = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=300)
        FACTS_MUTATION_RETURN_CODE = run.returncode
        try:
            report = json.load(open(report_file.name))
        except (OSError, json.JSONDecodeError) as error:
            raise PlantError(f'dedicated facts mutation runner produced no structured report: {error}; {run.stderr[-300:]}') from error
    finally:
        try:
            os.remove(report_file.name)
        except OSError:
            pass
    if FACTS_MUTATION_RETURN_CODE != 0:
        raise PlantError(
            f'dedicated facts mutation runner exit/report disagreement: '
            f'exit={FACTS_MUTATION_RETURN_CODE}, report.ok={report.get("ok")!r}')
    if report.get('ok') is not True:
        raise PlantError('dedicated facts mutation runner returned zero with report.ok != true')
    control = report.get('control') or {}
    if (control.get('ok') is not True or control.get('failures')
            or control.get('returnCode') != 0):
        raise PlantError(f'dedicated facts mutation control is already red: {control!r}')
    ledger_cases = [entry['plant']['case'] for entry in LED['entries']
                    if (entry.get('plant') or {}).get('kind') == 'facts_mutation']
    report_cases = report.get('cases') or []
    report_ids = [case.get('id') for case in report_cases]
    if (len(ledger_cases) != len(set(ledger_cases))
            or len(report_ids) != len(set(report_ids))
            or ledger_cases != report_ids):
        raise PlantError(f'facts mutation ledger/report case mismatch: ledger={ledger_cases!r}, report={report_ids!r}')
    FACTS_MUTATION_REPORT = report
    return report


def facts_mutation_case(entry):
    """Return one causally structured dedicated-runner result as one top-level ledger result."""
    report = facts_mutation_report()
    case_id = entry['plant']['case']
    case = next((item for item in report['cases'] if item.get('id') == case_id), None)
    if case is None:
        raise PlantError(f'dedicated facts mutation report omitted {case_id}')
    if case.get('plantApplications') != 1:
        raise PlantError(f'{case_id} applied {case.get("plantApplications")} times instead of exactly once')
    expected = set(case.get('expectedKinds') or [])
    expected_failures = case.get('expectedFailures') or []
    failures = case.get('failures') or []
    actual = {failure.get('kind') for failure in failures}
    if actual != set(case.get('actualKinds') or []):
        raise PlantError(f'{case_id} actualKinds is not derived from its structured failure objects')
    for failure in failures:
        if (not isinstance(failure, dict) or not failure.get('kind')
                or not failure.get('where') or not failure.get('message')):
            raise PlantError(f'{case_id} emitted an unstructured causal failure: {failure!r}')

    def matches(found, wanted):
        if len(found) != len(wanted):
            return False
        for actual_failure, expected_failure in zip(found, wanted):
            if (actual_failure.get('kind') != expected_failure.get('kind')
                    or actual_failure.get('where') != expected_failure.get('where')):
                return False
            if ('message' in expected_failure
                    and actual_failure.get('message') != expected_failure['message']):
                return False
            if ('messageStartsWith' in expected_failure
                    and not actual_failure.get('message', '').startswith(expected_failure['messageStartsWith'])):
                return False
        return True

    failure_contract_ok = matches(failures, expected_failures)
    expected_return_code = 0 if case.get('expectPass') is True else 1
    expect_pass = case.get('expectPass') is True
    if expect_pass:
        causal = (case.get('verifierOk') is True
                  and case.get('verifierReturnCode') == expected_return_code
                  and not expected and not failures and not expected_failures
                  and failure_contract_ok)
    else:
        causal = (case.get('verifierOk') is False
                  and case.get('verifierReturnCode') == expected_return_code
                  and bool(failures)
                  and actual == expected
                  and failure_contract_ok
                  and case.get('failureContractOk') is True)
    suite_ok = (FACTS_MUTATION_RETURN_CODE == 0
                and report.get('ok') is True
                and report.get('plantErrors') == 0)
    ok = case.get('ok') is True and causal and suite_ok
    evidence = {
        'case': case_id,
        'cleanControl': True,
        'expectPass': expect_pass,
        'plantApplications': case.get('plantApplications'),
        'verifierOk': case.get('verifierOk'),
        'verifierReturnCode': case.get('verifierReturnCode'),
        'expectedKinds': sorted(expected),
        'actualKinds': sorted(actual),
        'expectedFailures': expected_failures,
        'failures': failures,
        'failureContractOk': failure_contract_ok,
        'dedicatedCaseOk': case.get('ok') is True,
        'dedicatedSuiteOk': suite_ok,
        'dedicatedSuitePlantErrors': report.get('plantErrors'),
    }
    return ok, evidence

def main(argv):
    try:
        validated = validate_ledger()
        schema_self_tests()
        authority_group_fixtures = authority_group_self_tests()
    except PlantError as ex:
        print(f'SCHEMA ERROR {ex}')
        return 1
    if '--validate' in argv:
        print(f'validated {validated} mutation entries and {1 + len(authority_group_fixtures["cases"])} authority-group fixtures')
        return 0
    only = set(argv[argv.index('--only') + 1].split(',')) if '--only' in argv else None
    static_only = '--static' in argv
    os.makedirs(os.path.join(RUBRIC, 'out'), exist_ok=True)
    tmp, t = copy_site()
    base_keys = {f['key'] for f in guard.Run(t).run()}
    shutil.rmtree(tmp, ignore_errors=True)
    attempted = planted = caught = plant_errors = 0
    missed, results = [], []
    for e in LED['entries']:
        if only and e['id'] not in only:
            continue
        p = e.get('plant')
        if p is None:
            if e['check'] != 'reviewer':
                missed.append((e['id'], 'no plant and not a reviewer check'))
            continue
        k = p['kind']
        if k in ('render', 'a11y') and static_only:
            continue
        attempted += 1
        try:
            if k in ('insert', 'strip', 'replace', 'multi', 'file', 'remove_tags', 'remove_element', 'stale'):
                ok, info = static_case(e, base_keys)
            elif k == 'render':
                ok, info = render_case(e)
            elif k == 'a11y':
                ok, info = a11y_case(e)
            elif k == 'message':
                got = rubric_gate.check_message(p['text'])
                ok, info = any(c == e['check'] for c, _ in got), got
            elif k == 'turn':
                got = rubric_gate.check_turn(dict(p))
                ok, info = any(c == e['check'] for c, _ in got), got
            elif k == 'project':
                ok, info = project_case(e)
            elif k == 'asset':
                ok, info = asset_case(e)
            elif k == 'route_verifier':
                ok, info = route_verifier_case(e)
            elif k == 'facts_mutation':
                ok, info = facts_mutation_case(e)
            elif k == 'guard_state':
                tmp, t = copy_site()
                try:
                    run = guard.Run(t)
                    fid = p['fact_id']
                    run.links, run.ids, run.cover = [], {}, {}
                    run.full = {fid: {page: 1 for page in p['pages']}}
                    run.finish()
                    info = [f for f in run.fails if f['check'] == e['check']]
                    ok = bool(info)
                finally:
                    shutil.rmtree(tmp, ignore_errors=True)
            elif k in ('edit', 'bash'):
                d = (rubric_gate.pre_decision('Edit', {'file_path': os.path.join(ROOT, p['file']), 'old_string': p['old'], 'new_string': p['new']})
                     if k == 'edit' else rubric_gate.pre_decision('Bash', {'command': p['command']}))
                ok, info = bool(d and d[0] == e['check']), d
            elif k == 'run_lock':
                lock_path = os.path.join(tempfile.mkdtemp(prefix='rubric-lock-test-'), 'score.lock')
                first = second = None
                try:
                    first = run_lock.acquire('first test run', lock_path)
                    second = run_lock.acquire('second test run', lock_path)
                    ok, info = first is not None and second is None, 'second complete rubric run was rejected'
                finally:
                    run_lock.release(second)
                    run_lock.release(first)
                    shutil.rmtree(os.path.dirname(lock_path), ignore_errors=True)
            else:
                ok, info = False, f'unknown plant kind {k}'
            if e['id'] == 'dm2014-forgotten':
                expected = [
                    'Research status authority:research-drone-megaddon-2014:status must appear exactly once; found 0',
                    '(resume:research:drone-megaddon)',
                    '(site:research[0].subtitle)',
                    '(site:research[0].venue)',
                    '(site:research[0].summary)',
                ]
                ok = (ok and isinstance(info, list) and len(info) == len(expected)
                      and all(item.get('check') == 'B0' and item.get('page') == 'research'
                              and item.get('where') == 'drone-megaddon'
                              and fragment in item.get('msg', '')
                              for item, fragment in zip(info, expected)))
            if e['id'] == 'a11y-horizontal-name':
                application = info.get('application') if isinstance(info, dict) else None
                hits = info.get('hits') if isinstance(info, dict) else None
                ok = (ok and application == {'requested': True, 'applied': True, 'applications': 1, 'errors': []}
                      and hits == [{
                          'kind': 'accessible-name', 'page': 'research', 'width': 375,
                          'theme': 'light', 'state': 'default',
                          'message': 'scroll region 1 lacks a named keyboard-focusable region',
                      }])
        except PlantError as ex:
            plant_errors += 1
            info = f'plant application error: {ex}'
            results.append({'id': e['id'], 'check': e['check'], 'status': 'plant_error', 'caught': False, 'info': str(info)[:300]})
            print(f'ERROR  {e["id"]:28} {e["check"]:8} {str(info)[:160]}')
            continue
        except Exception as ex:
            plant_errors += 1
            info = f'verifier runner error: {ex}'
            results.append({'id': e['id'], 'check': e['check'], 'status': 'runner_error', 'caught': False, 'info': str(info)[:300]})
            print(f'ERROR  {e["id"]:28} {e["check"]:8} {str(info)[:160]}')
            continue
        planted += 1
        caught += ok
        result = {'id': e['id'], 'check': e['check'], 'status': 'caught' if ok else 'missed',
                  'caught': ok, 'info': str(info)[:300]}
        if k == 'facts_mutation' and isinstance(info, dict):
            result['factsMutation'] = info
        if k == 'a11y' and isinstance(info, dict):
            result['a11yMutation'] = info
        results.append(result)
        print(('caught ' if ok else 'MISSED ') + f"{e['id']:28} {e['check']:8} {'' if ok else str(info)[:160]}")
        if not ok:
            missed.append((e['id'], str(info)[:200]))
    if not only:
        # Every rubric check has a past mistake behind it, or is the reviewer's.
        rows = [l.split('|') for l in open(os.path.join(RUBRIC, 'rubric.md')).read().split('\n') if l.startswith('| **')]
        tested = {e['check'] for e in LED['entries']} | {a for e in LED['entries'] for a in e.get('also', [])}
        for r in rows:
            cid = r[1].strip().strip('*')
            if cid not in tested and 'reviewer' not in r[4]:
                missed.append((cid, 'a rubric check with no past mistake testing it')); print(f'UNTESTED {cid}')
        # Every correction he made is in the ledger (by his exact words) or mapped to a check in review.json.
        rv = json.load(open(os.path.join(RUBRIC, 'review.json')))['entries']
        led_said = [' '.join(e.get('said', '').split()) for e in LED['entries']]
        for i, e in enumerate(rv):
            if e.get('kind') not in ('correction', 'rule', 'unflagged', 'preference'):
                continue
            s = ' '.join(e.get('said', '').split())
            if not e.get('check') and not any(s and (s in l or l in s) for l in led_said if l):
                missed.append((f'review#{i}', f'a correction with no check: "{s[:80]}"'))
        # No regular expressions anywhere, and the scanner itself still works.
        a, b = regex_plants()
        if not (a and b):
            missed.append(('noregex', 'noregex.py missed a planted regex'))
        nr = subprocess.run([sys.executable, os.path.join(RUBRIC, 'noregex.py')], capture_output=True, text=True)
        if nr.returncode != 0:
            missed.append(('R0', nr.stdout.strip().split('\n')[-1]))
    speaking_summary = None
    research_summary = None
    if not only and not static_only:
        try:
            speaking_summary = speaking_mutation_report()
            print(f"Speaking runtime mutations: {speaking_summary['caught']}/{speaking_summary['attempted']} caught")
        except (PlantError, subprocess.TimeoutExpired) as error:
            missed.append(('speaking-mutation-suite', str(error)[:500]))
            speaking_summary = {'ok': False, 'message': str(error)[:500]}
            print(f'ERROR  speaking-mutation-suite     G34      {str(error)[:160]}')
        try:
            research_summary = research_mutation_report()
            print(f"Research runtime mutations: {research_summary['caught']}/{research_summary['attempted']} caught")
        except (PlantError, subprocess.TimeoutExpired) as error:
            missed.append(('research-mutation-suite', str(error)[:500]))
            research_summary = {'ok': False, 'message': str(error)[:500]}
            print(f'ERROR  research-mutation-suite     G34      {str(error)[:160]}')
    ok = not missed and not plant_errors
    facts_summary = None
    if FACTS_MUTATION_REPORT is not None:
        facts_summary = {
            'runnerOk': FACTS_MUTATION_REPORT.get('ok'),
            'returnCode': FACTS_MUTATION_RETURN_CODE,
            'cleanControl': FACTS_MUTATION_REPORT.get('control'),
            'plantErrors': FACTS_MUTATION_REPORT.get('plantErrors'),
            'caseIds': [case.get('id') for case in FACTS_MUTATION_REPORT.get('cases', [])],
        }
    reviewer_ids = [entry['id'] for entry in LED['entries'] if entry.get('plant') is None]
    report = {'pass': ok and (not static_only or bool(only)), 'static_only': static_only,
              'ledger_entries': len(LED['entries']), 'executable_entries': len(LED['entries']) - len(reviewer_ids),
              'reviewer_attestations': {'count': len(reviewer_ids), 'ids': reviewer_ids, 'status': 'reviewer-only'},
              'attempted': attempted,
              'planted': planted, 'caught': caught, 'missed': missed, 'plant_errors': plant_errors,
              't': time.time(), 'results': results, 'facts_mutations': facts_summary,
              'authority_group_fixtures': authority_group_fixtures,
              'speaking_mutations': speaking_summary,
              'research_mutations': research_summary}
    report_name = 'test-targeted.json' if only else 'test.json'
    json.dump(report, open(os.path.join(RUBRIC, 'out', report_name), 'w'), indent=1)
    print(f'\nattempted {attempted}, planted {planted}, caught {caught}, missed {len(missed)}, plant errors {plant_errors}')
    return 0 if ok else 1

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
