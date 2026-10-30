#!/usr/bin/env python3
"""Builds facts.json: every fact the site may show, one record each, with its unit, field and source.

Sources, parsed structurally (no pattern matching):
  resume    public/assets/Resume.pdf, by section, employer line and bullet
  site      site/content.json, the data the site is built from
  sheet     .claude/rubric/sources/sheet.json, his Speaking & Teaching sheet
  paper     .claude/rubric/sources/papers.txt, the four published abstracts
  authority sealed direct corrections and research/provenance contracts
  approved  .claude/rubric/approved.json, lines he approved in chat
Each record: id, unit, field, text, source, show ("must": never cut; "may": allowed; "never": must not be shown),
and twins (records saying the same thing in other words, by word overlap), so a fact counts as shown if any twin is.
"""
import argparse, hashlib, json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
RUBRIC = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(RUBRIC))
sys.path.insert(0, HERE)
import export_head
import words

PINNED_HISTORICAL_COMMIT = '8f2a57ac23235c9cfbc7d3c24d6e071cb9c1dfe9'
PINNED_HISTORICAL_TREE = 'ad8e824f71984ede88d408042021e7f0964e7d3b'
RESEARCH_UNITS = {'drone-megaddon', 'drone-megaddon-2026', 'who-trains', 'ai-roi'}
NON_TWIN_PAIRS = {
    frozenset({'resume:cmu-teaching:10:b0', 'site:careerLedger[2].bullets[1]'})
}

ORG_UNIT = {'Apple': 'apple', 'Amazon': 'amazon', 'Susquehanna International Group': 'sig', 'Microsoft': 'microsoft',
            'Ondoway': 'ondoway', 'Praxtera AI Institute': 'praxtera', 'Persuaider': 'persuaider', 'Gestiq': 'gestiq',
            'Atos': 'atos', 'Carnegie Mellon University': 'cmu-teaching'}
ENTRY_NUMBER = {'apple': 1, 'amazon': 2, 'sig': 3, 'microsoft': 4, 'ondoway': 5, 'praxtera': 6,
                'persuaider': 7, 'gestiq': 8, 'atos': 9, 'cmu-teaching': 10}
TEAMS = {'Apple Media Products', 'Alexa Core Engine', 'Windows OS Group'}  # he: "Instead of Apple Media Products, just say Apple"
EMPLOYMENT_SECTIONS = {'PROFESSIONAL EXPERIENCE', 'EXECUTIVE EDUCATION & ADVISORY', 'INDEPENDENT SPEAKING & TEACHING',
                       'VENTURES & INDEPENDENT AI PROJECTS', 'AI VENTURES & LEADERSHIP', 'INDEPENDENT AI PROJECTS'}
RESEARCH_SECTIONS = {'AI INVESTMENT & WORKFORCE RESEARCH', 'HUMAN-SUPERVISED SYSTEMS RESEARCH', 'SELECTED RESEARCH'}
EDUCATION_SECTIONS = {'EDUCATION', 'EDUCATION & HONORS'}
SECTIONS = EMPLOYMENT_SECTIONS | RESEARCH_SECTIONS | EDUCATION_SECTIONS | {'TECHNICAL SKILLS'}
PAPER_UNIT = {'Drone-Megaddon 2014': 'drone-megaddon', 'Drone-Megaddon 2026': 'drone-megaddon-2026', 'Drone-Megaddon:': 'drone-megaddon',
              'Who Trains the Next Senior?': 'who-trains', 'A Multi-Layer Framework': 'ai-roi'}

records = []
MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

def add(rid, unit, field, text, source, show='must', **metadata):
    text = ' '.join(str(text).split())
    if text:
        record = {'id': rid, 'unit': unit, 'field': field, 'text': text, 'source': source, 'show': show}
        record.update(metadata)
        records.append(record)

# ---------------------------------------------------------------- résumé
def resume():
    import pypdf
    pages = [p.extract_text() for p in pypdf.PdfReader(os.path.join(ROOT, 'public/assets/Resume.pdf')).pages]
    lines = [l.strip() for l in '\n'.join(pages).split('\n') if l.strip() and not l.strip().isdigit()]
    add('resume:name', 'me', 'name', lines[0].title(), 'resume')
    first_section = next((index for index, line in enumerate(lines) if line in SECTIONS), len(lines))
    contact = []
    for line in lines[1:first_section]:
        contact.extend(piece.strip() for piece in line.split(' | ') if piece.strip())
    for k, piece in enumerate(contact):
        add(f'resume:contact:{k}', 'contact', 'contact', piece, 'resume', 'may')

    section, unit, entry, bullets = None, None, 0, []
    def flush():
        nonlocal bullets
        for j, b in enumerate(bullets):
            # The Eagles keynote is listed under Praxtera on the résumé; on the site it is its own unit (Speaking leads with it).
            u = 'eagles' if 'Philadelphia Eagles' in b else unit
            add(f'resume:{unit}:{entry}:b{j}', u, 'claim', b, 'resume')
        bullets = []

    def org_line(line):
        if ' | ' not in line:
            return None
        org = line.split(' | ', 1)[0]
        return org if org in ORG_UNIT else None

    def date_line(line):
        tokens = line.replace('-', ' ').replace('–', ' ').split()
        return any(token in words.MONTHS for token in tokens) and any(token[:2] == '20' and token.isdigit() for token in tokens)

    i = first_section
    while i < len(lines):
        l = lines[i]
        if l in SECTIONS:
            flush(); section = l; i += 1; continue
        if section in EMPLOYMENT_SECTIONS:
            if l.startswith('▪'):
                bullets.append(l[1:].strip())
                i += 1
                continue
            if bullets and not org_line(l):
                bullets[-1] += ' ' + l
                i += 1
                continue
            org = org_line(l)
            if not org:
                i += 1
                continue
            flush()
            org, rest = l.split(' | ', 1)
            unit = ORG_UNIT[org]
            entry = ENTRY_NUMBER[unit]
            title_parts, dates_value, details = [rest], '', []
            i += 1
            while i < len(lines):
                value = lines[i]
                if value in SECTIONS or org_line(value) or value.startswith('▪'):
                    break
                if date_line(value):
                    dates_value = value
                elif ' | ' in value:
                    details.extend(piece.strip() for piece in value.split(' | ') if piece.strip())
                elif dates_value:
                    details.append(value)
                else:
                    title_parts.append(value)
                i += 1
            add(f'resume:{unit}:{entry}:org', unit, 'org', org, 'resume')
            add(f'resume:{unit}:{entry}:title', unit, 'title', ' '.join(title_parts), 'resume')
            if dates_value:
                add(f'resume:{unit}:{entry}:dates', unit, 'dates', dates_value, 'resume')
            for k, piece in enumerate(details):
                if piece in TEAMS:
                    add(f'resume:{unit}:{entry}:team', unit, 'team', piece, 'resume', 'never')
                elif piece.endswith((', WA', ', PA', ', CA')):
                    add(f'resume:{unit}:{entry}:where', unit, 'location', piece, 'resume', 'may')
                else:
                    add(f'resume:{unit}:{entry}:d{k}', unit, 'detail', piece, 'resume')
            continue
        elif section == 'TECHNICAL SKILLS':
            skills = l
            while i + 1 < len(lines) and lines[i + 1] not in SECTIONS:
                i += 1; skills += ' ' + lines[i]
            add('resume:skills', 'resume-take', 'skills', skills, 'resume')
        elif section in EDUCATION_SECTIONS:
            wharton_at = next((j for j in range(i, len(lines)) if lines[j].startswith('The Wharton School')), None)
            cmu_at = next((j for j in range(i, len(lines)) if lines[j].startswith('Carnegie Mellon University')), None)
            end = next((j for j in range(i, len(lines)) if j > i and lines[j] in SECTIONS), len(lines))
            if i == wharton_at and cmu_at:
                header_end = min(cmu_at, i + 3)
                add('resume:edu:1', 'wharton', 'education', ' '.join(lines[i:header_end]), 'resume')
                add('resume:edu:2', 'wharton', 'education', ' '.join(lines[header_end:cmu_at]), 'resume')
                i = cmu_at
                continue
            if i == cmu_at:
                # Keep degree identity separate from the accepted dates/honors clause governed by
                # resume-equivalence.json; neither record duplicates the other.
                header_end = min(end, i + 2)
                add('resume:edu:3', 'cmu', 'education', ' '.join(lines[i:header_end]), 'resume')
                add('resume:edu:4', 'cmu', 'education', ' '.join(lines[header_end:end]), 'resume')
                i = end
                continue
        elif section in RESEARCH_SECTIONS:
            u = next((v for k, v in PAPER_UNIT.items() if l.startswith(k)), None)
            if u:
                block = [l]
                i += 1
                while i < len(lines) and lines[i] not in SECTIONS and not any(lines[i].startswith(key) for key in PAPER_UNIT):
                    block.append(lines[i]); i += 1
                add(f'resume:research:{u}', u, 'citation', ' '.join(block), 'resume')
                continue
        i += 1
    flush()

# ---------------------------------------------------------------- structured data (HEAD and the site's data)
# Which unit a record belongs to, from where it sits in the data.
ID_UNIT = {'aws': 'cmu', 'leanfm': 'cmu', 'cmu-research': 'cmu', 'cmu-capstone': 'cmu', 'cmu-projects': 'cmu', 'cmu-teaching': 'cmu-teaching',
           'who-trains-the-next-senior': 'who-trains', 'stay': 'offers', 'eng': 'offers', 'exec': 'offers'}
TOP_UNIT = {'speakingTopics': 'talks', 'topicLimbs': 'talks', 'topicMenu': 'talks', 'topicNeeds': 'talks', 'topicAudiences': 'talks', 'topicPrompt': 'talks', 'eaglesSummitSources': 'eagles', 'managerReviews': 'apple', 'groups': 'offers'}
FIELD_SHOW = {'aud': 'never', 'location': 'never', 'length': 'never', 'startDate': 'never', 'href': 'never', 'img': 'never', 'width': 'never', 'height': 'never',
              'slug': 'never', 'id': 'never', 'kind': 'never', 'group': 'never', 'visual': 'never', 'time': 'never', 'meta': 'may', 'alt': 'may',
              # Build plumbing, not facts: file paths, price labels ("from"), billing units, link relations.
              'sourcePath': 'never', 'priceLabel': 'never', 'unit': 'never', 'parent': 'never', 'verb': 'never', 'value': 'may'}
CONTEXT_UNIT = [('Apple', 'apple'), ('Amazon', 'amazon'), ('Susquehanna', 'sig'), ('Microsoft', 'microsoft'), ('Wharton', 'wharton'), ('Carnegie Mellon', 'cmu')]

def unit_for(path, top, obj_stack):
    for o in reversed(obj_stack):
        owner = o.get('unit')
        if owner in REG_UNITS:
            return owner
        key = o.get('id') or o.get('slug')
        if key:
            if top == 'talks' and key == 'cmu':
                return 'cmu-teaching'
            if key in ID_UNIT:
                return ID_UNIT[key]
            if key in REG_UNITS:
                return key
        ctx = o.get('context')
        if isinstance(ctx, str):
            for name, u in CONTEXT_UNIT:
                if name in ctx:
                    return u
    return TOP_UNIT.get(top)

def walk(prefix, source, top, x, stack):
    if isinstance(x, dict):
        for k, v in x.items():
            walk(f'{prefix}.{k}', source, top, v, stack + [x])
    elif isinstance(x, list):
        for i, v in enumerate(x):
            walk(f'{prefix}[{i}]', source, top, v, stack)
    elif isinstance(x, str) and len(x.split()) >= 1:
        field = prefix.split('.')[-1].split('[')[0]
        unit = unit_for(prefix, top, stack)
        if unit:
            show = FIELD_SHOW.get(field, 'must' if source == 'site' else 'may')
            if '.figures' in prefix and show == 'must':
                show = 'may'  # an offer's proof figures repeat career numbers that live on Career
            if '.links[' in prefix:
                show = 'never' if field != 'label' else 'may'  # links are navigation, not facts to place
            add(f'{source}:{prefix}', unit, field, x, source, show)

def data():
    d = json.load(open(os.path.join(ROOT, 'site/content.json')))
    for top, v in d.items():
        walk(top, 'site', top, v, [])

    # Historical src/data is useful regression evidence, but it is neither live input nor authority.
    # Load one immutable Git object, tag every resulting fact, and forbid it from representing Research.
    manifest = historical_head_manifest()
    with tempfile.TemporaryDirectory(prefix='facts-pinned-head-') as scratch:
        source_dir = os.path.join(scratch, 'src-data')
        exported = export_head.export(source_dir, PINNED_HISTORICAL_COMMIT)
        if sorted(exported) != sorted(os.path.basename(path) for path in manifest['files']):
            raise RuntimeError('pinned historical export differs from its sealed file manifest')
        head_json = os.path.join(scratch, 'head.json')
        subprocess.run(
            [
                'node',
                '--import', os.path.join(HERE, 'register.mjs'),
                os.path.join(HERE, 'load_head.mjs'),
                source_dir,
                head_json,
            ],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        historical = json.load(open(head_json))
    start = len(records)
    for filename in sorted(historical):
        exported_values = historical[filename]
        if not isinstance(exported_values, dict):
            continue
        for top in sorted(exported_values):
            walk(f'pinned.{filename}.{top}', 'head', top, exported_values[top], [])
    for record in records[start:]:
        record['historicalCommit'] = PINNED_HISTORICAL_COMMIT
        record['authorityRank'] = 'historical-review'
        if record['unit'] in RESEARCH_UNITS:
            record['show'] = 'never'
            record['quarantineReason'] = 'Research is governed only by accepted baseline and typed authority.'
        elif record['show'] == 'must':
            record['show'] = 'may'
    return manifest


def git_output(*arguments, binary=False):
    result = subprocess.run(
        ['git', '-C', ROOT, *arguments],
        check=True,
        capture_output=True,
        text=not binary,
    )
    return result.stdout if binary else result.stdout.strip()


def historical_head_manifest():
    commit = git_output('rev-parse', f'{PINNED_HISTORICAL_COMMIT}^{{commit}}')
    tree = git_output('rev-parse', f'{PINNED_HISTORICAL_COMMIT}^{{tree}}')
    if commit != PINNED_HISTORICAL_COMMIT or tree != PINNED_HISTORICAL_TREE:
        raise RuntimeError('pinned historical commit or tree no longer resolves to the sealed identity')
    source_tree = git_output('rev-parse', f'{PINNED_HISTORICAL_COMMIT}:src/data')
    files = {}
    listing = git_output('ls-tree', '-r', PINNED_HISTORICAL_COMMIT, '--', 'src/data')
    for line in listing.splitlines():
        metadata, path = line.split('\t', 1)
        _mode, object_type, object_id = metadata.split()
        if object_type != 'blob':
            raise RuntimeError(f'pinned historical input is not a blob: {path}')
        payload = git_output('show', f'{PINNED_HISTORICAL_COMMIT}:{path}', binary=True)
        files[path] = {
            'gitBlob': object_id,
            'sha256': hashlib.sha256(payload).hexdigest(),
        }
    if not files:
        raise RuntimeError('pinned historical src/data tree is empty')
    return {
        'mode': 'pinned-quarantined',
        'commit': commit,
        'tree': tree,
        'srcDataTree': source_tree,
        'authorityRank': 'historical-review',
        'factPolicy': 'may-except-research-never',
        'files': files,
    }

def authority():
    """Add exact correction-derived headings and research authority fields without making the legacy tree authoritative."""
    protected = json.load(open(os.path.join(RUBRIC, 'authority/protected-claims.json')))
    research_contract = json.load(open(os.path.join(RUBRIC, 'authority/research-evidence-contract.json')))
    research_by_claim = {
        record['authorityClaimId']: record
        for record in research_contract.get('records', [])
    }
    for claim in protected.get('typed_claims', []):
        claim_type = claim.get('claim_type')
        if claim_type == 'provenance_group':
            add(
                f'authority:{claim["id"]}:heading',
                claim.get('heading_unit') or 'talks',
                'authority_heading',
                claim['heading'],
                'authority',
                'must',
                authorityClaim=claim['id'],
                sourceCorrection=claim['source_correction'],
                acceptedResumeEvidence=True,
            )
        elif claim_type == 'research_record':
            unit = claim['unit']
            reader = research_by_claim.get(claim['id'])
            if not reader or reader.get('unit') != unit:
                raise ValueError(f'Research reader authority is absent or misowned: {claim["id"]}')
            add(f'authority:{claim["id"]}:title', unit, 'authority_title', claim['title'], 'authority', 'may',
                authorityClaim=claim['id'])
            add(f'authority:{claim["id"]}:authors', unit, 'authority_authors', ', '.join(claim['display_author_order']),
                'authority', 'may', authorityClaim=claim['id'])
            add(f'authority:{claim["id"]}:status', unit, 'authority_status', claim['status'], 'authority', 'may',
                authorityClaim=claim['id'])
            reader_qualifiers = {item.get('factId'): item for item in reader.get('qualifiers', [])}
            for index, protected_phrase in enumerate(claim.get('causal_qualifiers', [])):
                fact_id = f'authority:{claim["id"]}:qualifier:{index}'
                qualifier = reader_qualifiers.get(fact_id)
                if (not qualifier
                        or ' '.join(protected_phrase.split()).casefold()
                        not in ' '.join(str(qualifier.get('text', '')).split()).casefold()
                        or hashlib.sha256(str(qualifier.get('text', '')).encode()).hexdigest() != qualifier.get('textSha256')):
                    raise ValueError(f'Research reader qualifier does not preserve protected authority: {fact_id}')
                add(fact_id, unit, 'authority_qualifier', qualifier['text'], 'authority', 'may',
                    authorityClaim=claim['id'], authorityPath='qualifiers')
            figure = reader.get('figure') or {}
            image_alt = figure.get('imageAlt')
            if image_alt:
                fact_id = f'authority:{claim["id"]}:figure:image-alt'
                if hashlib.sha256(str(image_alt.get('text', '')).encode()).hexdigest() != image_alt.get('textSha256'):
                    raise ValueError(f'Research reader image-alt hash is stale: {fact_id}')
                add(fact_id, unit, 'authority_figure_alt', image_alt['text'], 'authority', 'may',
                    authorityClaim=claim['id'], authorityPath='figure.imageAlt')
            grouping = figure.get('grouping') or {}
            if grouping.get('labelText'):
                fact_id = f'authority:{claim["id"]}:figure:group-label'
                if hashlib.sha256(grouping['labelText'].encode()).hexdigest() != grouping.get('labelTextSha256'):
                    raise ValueError(f'Research reader group-label hash is stale: {fact_id}')
                add(fact_id, unit, 'authority_figure_group_label', grouping['labelText'], 'authority', 'may',
                    authorityClaim=claim['id'], authorityPath='figure.grouping.labelText')

def sheet():
    s = json.load(open(os.path.join(RUBRIC, 'sources/sheet.json')))
    for r in s['rows']:
        for k, ss in enumerate(r['sessions']):
            add(f'sheet:{r["unit"]}:{k}:title', r['unit'], 'session', ss['title'], 'sheet')
            y, m, d = ss['date'].split('-')
            add(f'sheet:{r["unit"]}:{k}:date', r['unit'], 'date', f'{MON[int(m) - 1]} {int(d)}, {y}', 'sheet')
            for a, al in enumerate(ss.get('aliases', [])):
                add(f'sheet:{r["unit"]}:{k}:alias{a}', r['unit'], 'session', al, 'sheet', 'may')

def papers():
    lines = open(os.path.join(RUBRIC, 'sources/papers.txt')).read().split('\n')
    for k in range(0, len(lines) - 1, 2):
        title, abstract = lines[k], lines[k + 1]
        u = next((v for key, v in PAPER_UNIT.items() if title.startswith(key.rstrip(':'))), None)
        if title.startswith('Drone-Megaddon:'):
            u = 'drone-megaddon'
        add(f'paper:{u}:title', u, 'title', title, 'paper', 'may')
        for j, sent in enumerate(words.sentences(abstract)):
            add(f'paper:{u}:abstract:{j}', u, 'abstract', sent, 'paper', 'may')

def approved():
    a = json.load(open(os.path.join(RUBRIC, 'approved.json')))
    for k, x in enumerate(a['lines']):
        add(f'approved:{k}', x.get('unit'), 'approved', x['text'], 'approved', 'may')

def twins():
    """Records that say the same thing (same unit, 80% of the shorter one's words in the longer) are twins."""
    for r in records:
        r['words'] = set(words.content(r['text']))
    # A fact copied under another unit (a career result listed as proof for an offer) belongs to the unit it is about:
    # the résumé bullet that says the same thing decides.
    home = {u: v['home'] for u, v in REG['units'].items()}
    pool = [r for r in records if (r['source'] == 'resume' and r['field'] == 'claim') or r['field'] == 'bullets']
    for r in records:
        if r in pool or len(r['words']) < 4 or home.get(r['unit']) != 'services':
            continue
        nums = {w for w in r['words'] if w[:1].isdigit() or w[:1] == '$'}
        def score(R):
            shared = r['words'] & R['words']
            return (len(nums & R['words']), len(shared))
        best = max(pool, key=score, default=None)
        if best and home.get(best['unit']) != 'services':
            shared = r['words'] & best['words']
            if len(shared) >= 0.5 * len(r['words']) and (not nums or nums & best['words']):
                r['moved_from'], r['unit'] = r['unit'], best['unit']
    by_unit = {}
    for r in records:
        by_unit.setdefault(r['unit'], []).append(r)
    for rs in by_unit.values():
        for a in rs:
            a['twins'] = []
        for i, a in enumerate(rs):
            for b in rs[i + 1:]:
                if frozenset({a['id'], b['id']}) in NON_TWIN_PAIRS:
                    continue
                if not a['words'] or not b['words']:
                    continue
                small, big = (a, b) if len(a['words']) <= len(b['words']) else (b, a)
                shared = small['words'] & big['words']
                nums_a = {w for w in a['words'] if w[:1].isdigit() or w[:1] == '$'}
                nums_b = {w for w in b['words'] if w[:1].isdigit() or w[:1] == '$'}
                same_numbers = nums_a == nums_b or not (nums_a or nums_b) or (nums_a and nums_a <= nums_b) or (nums_b and nums_b <= nums_a)
                # Twins only when nearly the same words: a looser match would let a shorter version stand in for a
                # longer one and quietly cut the difference.
                similar_size = len(small['words']) >= 0.6 * len(big['words'])  # a title inside a sentence is not the same fact
                if len(small['words']) >= 3 and len(shared) >= 0.8 * len(small['words']) and same_numbers and similar_size:
                    a['twins'].append(b['id']); b['twins'].append(a['id'])
    # A session title in his sheet and the title he uses elsewhere for the same talk are one fact.
    by_id = {r['id']: r for r in records}
    for r in records:
        if r['field'] == 'session' and r['id'].count(':alias') == 1:
            main_id = r['id'].split(':alias')[0] + ':title'
            if main_id in by_id:
                r['twins'].append(main_id); by_id[main_id]['twins'].append(r['id'])
    for r in records:
        del r['words']

def retire():
    """Facts he retired, in his words: they are never shown."""
    ret = json.load(open(os.path.join(RUBRIC, 'retired.json')))
    for r in list(records):
        for retired in ret['facts']:
            target = words.norm(retired['text'])
            if not target or target not in words.norm(r['text']):
                continue
            prior_show = r['show']
            r['show'] = 'never'
            r['retired'] = True
            if retired.get('scope') != 'phrase':
                break
            if words.norm(r['text']) == target:
                break
            variants = retired.get('removeVariants') or []
            matches = [variant for variant in variants if variant in r['text']]
            if retired.get('preserveRemainder') is not True or len(matches) != 1:
                raise ValueError(f'phrase retirement must preserve exactly one deterministic remainder: {r["id"]}')
            redacted = r['text'].replace(matches[0], '', 1)
            metadata = {
                key: value for key, value in r.items()
                if key not in {'id', 'unit', 'field', 'text', 'source', 'show', 'twins', 'retired'}
            }
            add(
                f'{r["id"]}:retirement-redaction',
                r['unit'],
                r['field'],
                redacted,
                r['source'],
                prior_show,
                retirementRedaction=retired['text'],
                sourceFact=r['id'],
                **metadata,
            )
            break

REG = json.load(open(os.path.join(RUBRIC, 'registry.json')))
REG_UNITS = set(REG['units'])

INPUTS = [
    'public/assets/Resume.pdf',
    'public/assets/Sairam_Krishnan_Resume.pdf',
    'public/assets/atos-demo-poster.webp',
    '.claude/rubric/sources/sheet.json',
    '.claude/rubric/sources/papers.txt',
    '.claude/rubric/sources/papers-full/SOURCES.md',
    '.claude/rubric/sources/papers-full/ai-roi.txt',
    '.claude/rubric/sources/papers-full/who-trains.txt',
    '.claude/rubric/sources/papers-full/drone-megaddon-2014.txt',
    '.claude/rubric/sources/papers-full/drone-megaddon-2026.txt',
    '.claude/rubric/sources/drone-megaddon-figure-assets.json',
    '.claude/rubric/approved.json',
    '.claude/rubric/retired.json',
    '.claude/rubric/authority.json',
    '.claude/rubric/authority/career-amazon-transition.json',
    '.claude/rubric/authority/career-evidence-contract.json',
    '.claude/rubric/authority/career-evidence-visual-transition.json',
    '.claude/rubric/authority/speaking-evidence-contract.json',
    '.claude/rubric/authority/research-evidence-contract.json',
    '.claude/rubric/authority/protected-claims.json',
    '.claude/rubric/authority/corrections.ndjson',
    '.claude/rubric/authority/profile.json',
    '.claude/rubric/authority/source-manifest-mirror.json',
    '.claude/rubric/authority/resume-equivalence.json',
    'site/content.json',
    '.claude/rubric/registry.json',
    '.claude/rubric/facts/build_facts.py',
    '.claude/rubric/facts/README.md',
    '.claude/rubric/facts/verify_facts.py',
    '.claude/rubric/facts/mutation_test.py',
    '.claude/rubric/facts/words.py',
    '.claude/rubric/facts/export_head.py',
    '.claude/rubric/facts/register.mjs',
    '.claude/rubric/facts/load_head.mjs',
    '.claude/rubric/career_evidence.py',
    '.claude/rubric/career_evidence_mutation_test.py',
    '.claude/rubric/career_visual_transition_capture.mjs',
    '.claude/rubric/career_visual_transition_verify.py',
    'public/assets/research/drone-megaddon-2014.pdf',
    'public/assets/research/drone-megaddon-2014-architecture.png',
    'public/assets/research/drone-megaddon-2026.pdf',
    'public/assets/research/drone-megaddon-2026-language-vision-architecture.png',
    '.claude/rubric/out/career-evidence-transition/capture.json',
    '.claude/rubric/out/career-evidence-transition/experience-audit-review.json',
    '.claude/rubric/guard.py',
    '.claude/rubric/authority_gate.py',
]

ACCEPTED_RESUME_IDS = [
    'resume:atos:9:org',
    'resume:atos:9:title',
    'resume:atos:9:dates',
    'resume:atos:9:b0',
    'resume:cmu-teaching:10:org',
    'resume:cmu-teaching:10:title',
    'resume:cmu-teaching:10:dates',
    'resume:cmu-teaching:10:d0',
    'resume:cmu-teaching:10:b0',
    'resume:research:drone-megaddon',
    'resume:research:drone-megaddon-2026',
    'resume:research:who-trains',
    'resume:research:ai-roi',
]
PROJECT_TRANSITION_IDS = [
    'resume:ondoway:5:b1',
    'resume:persuaider:7:b0',
    'resume:persuaider:7:b2',
    'resume:gestiq:8:b0',
    'resume:gestiq:8:b1',
]

def digest(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()

def write_json(path, value):
    with open(path, 'w') as stream:
        json.dump(value, stream, indent=2, sort_keys=True, ensure_ascii=False)
        stream.write('\n')

def build(out_dir):
    records.clear()
    os.makedirs(out_dir, exist_ok=True)
    resume(); historical_head_input = data(); sheet(); papers(); authority(); approved()
    retire(); twins()
    facts_path = os.path.join(out_dir, 'facts.json')
    write_json(facts_path, records)
    by_id = {record['id']: record for record in records}
    protected = json.load(open(os.path.join(RUBRIC, 'authority/protected-claims.json')))
    typed = protected.get('typed_claims', [])
    equivalence = json.load(open(os.path.join(RUBRIC, 'authority/resume-equivalence.json')))
    transitions = equivalence.get('projectsTransition') or {}
    source_reconciliations = equivalence.get('sourceReconciliations') or {}
    reconciliation_entries = source_reconciliations.get('entries') or []
    reconciliation_sha256 = hashlib.sha256(json.dumps(
        reconciliation_entries, ensure_ascii=False, sort_keys=True, separators=(',', ':')
    ).encode()).hexdigest()
    if source_reconciliations.get('sha256') != reconciliation_sha256:
        raise ValueError('accepted-source reconciliation ledger has a stale hash')
    equivalence_by_id = {item['factId']: item for item in equivalence.get('equivalences', [])}
    transition_payload = [
        {
            key: equivalence_by_id[fact_id][key]
            for key in ('factId', 'legacyText', 'acceptedText', 'transition')
        }
        for fact_id in PROJECT_TRANSITION_IDS
    ]
    transition_sha256 = hashlib.sha256(json.dumps(
        transition_payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')
    ).encode()).hexdigest()
    if transitions.get('factIds') != PROJECT_TRANSITION_IDS or transitions.get('transitionSha256') != transition_sha256:
        raise ValueError('Projects accepted-resume transition ledger is incomplete or has a stale hash')
    for fact_id in PROJECT_TRANSITION_IDS:
        if by_id[fact_id]['text'] != equivalence_by_id[fact_id]['acceptedText']:
            raise ValueError(f'canonical fact differs from accepted résumé transition: {fact_id}')
    for reconciliation in reconciliation_entries:
        accepted_fact = by_id.get(reconciliation.get('acceptedFactId'))
        if not accepted_fact or accepted_fact['text'] != reconciliation.get('acceptedText'):
            raise ValueError(f'accepted-source reconciliation is not canonical: {reconciliation.get("id")}')
        detail_id = reconciliation.get('preservedDetailFactId')
        if detail_id and hashlib.sha256(by_id[detail_id]['text'].encode()).hexdigest() != reconciliation.get('preservedDetailTextSha256'):
            raise ValueError(f'preserved reconciliation detail drifted: {reconciliation.get("id")}')
    coverage = {
        'schemaVersion': 1,
        'conformanceScope': {
            'authoritySourceValidity': 'verified-by-verify_facts.py',
            'domGroupAncestry': 'deferred-to-speaking-renderer-gate',
        },
        'acceptedResumeClauses': [
            {
                'factId': fact_id,
                'textSha256': hashlib.sha256(by_id[fact_id]['text'].encode()).hexdigest(),
                'unit': by_id[fact_id]['unit'],
                'field': by_id[fact_id]['field'],
                'source': by_id[fact_id]['source'],
                'show': by_id[fact_id]['show'],
                'text': by_id[fact_id]['text'],
            }
            for fact_id in ACCEPTED_RESUME_IDS
        ],
        'acceptedResumeTransitions': {
            'factIds': PROJECT_TRANSITION_IDS,
            'transitionSha256': transition_sha256,
            'canonicalProjectsLedgerSha256': transitions['canonicalProjectsLedgerSha256'],
            'preservedDimensions': transitions['preservedDimensions'],
            'coverage': [
                {
                    'factId': fact_id,
                    'legacyTextSha256': hashlib.sha256(equivalence_by_id[fact_id]['legacyText'].encode()).hexdigest(),
                    'acceptedTextSha256': hashlib.sha256(equivalence_by_id[fact_id]['acceptedText'].encode()).hexdigest(),
                    'canonicalFactTextSha256': hashlib.sha256(by_id[fact_id]['text'].encode()).hexdigest(),
                    'unchangedTailSha256': equivalence_by_id[fact_id]['transition']['unchangedTailSha256'],
                }
                for fact_id in PROJECT_TRANSITION_IDS
            ],
        },
        'acceptedSourceReconciliations': {
            'sha256': reconciliation_sha256,
            'entries': [
                {
                    'id': item['id'],
                    'acceptedFactId': item['acceptedFactId'],
                    'acceptedTextSha256': hashlib.sha256(item['acceptedText'].encode()).hexdigest(),
                    'legacyTextSha256': [hashlib.sha256(text.encode()).hexdigest() for text in item['legacyTexts']],
                    'legacySourceIds': item['legacySourceIds'],
                    'preservedDimensions': item['preservedDimensions'],
                    **({
                        'preservedDetailFactId': item['preservedDetailFactId'],
                        'preservedDetailTextSha256': item['preservedDetailTextSha256'],
                    } if item.get('preservedDetailFactId') else {}),
                }
                for item in reconciliation_entries
            ],
        },
        'retirementRedactions': [
            {
                'factId': record['id'],
                'sourceFact': record['sourceFact'],
                'retiredPhrase': record['retirementRedaction'],
                'text': record['text'],
                'textSha256': hashlib.sha256(record['text'].encode()).hexdigest(),
                'show': record['show'],
                'unit': record['unit'],
            }
            for record in records if record.get('retirementRedaction')
        ],
        'correctionDerivedHeadings': [
            {
                'factId': f'authority:{claim["id"]}:heading',
                'authorityClaim': claim['id'],
                'sourceCorrection': claim['source_correction'],
                'text': claim['heading'],
            }
            for claim in typed if claim.get('claim_type') == 'provenance_group'
        ],
        'researchAuthorityRecords': [
            {
                'authorityClaim': claim['id'],
                'unit': claim['unit'],
                'stableId': claim['stable_id'],
                'acceptedResumeFactId': claim['accepted_resume_fact_id'],
                'claimId': claim['claim_id'],
            }
            for claim in typed if claim.get('claim_type') == 'research_record'
        ],
    }
    coverage_path = os.path.join(out_dir, 'authority-coverage.json')
    write_json(coverage_path, coverage)
    source_hashes = {
        'schemaVersion': 3,
        'generator': 'deterministic-governed-sources-with-pinned-history',
        'historicalHeadInput': historical_head_input,
        'inputs': {path: digest(os.path.join(ROOT, path)) for path in INPUTS},
        'factsSha256': digest(facts_path),
        'coverageSha256': digest(coverage_path),
        'recordCount': len(records),
    }
    write_json(os.path.join(out_dir, 'source-hashes.json'), source_hashes)
    count = {}
    for r in records:
        count[(r['source'], r['show'])] = count.get((r['source'], r['show']), 0) + 1
    print(len(records), 'facts;', ', '.join(f'{s}/{w} {n}' for (s, w), n in sorted(count.items())))
    print('no unit:', sum(1 for r in records if not r['unit']))
    return source_hashes

def main(argv=None):
    parser = argparse.ArgumentParser(description='Build the sealed fact store from current governed sources.')
    parser.add_argument('--out-dir', required=True, help='Directory that receives facts.json and its evidence ledgers.')
    args = parser.parse_args(argv)
    build(os.path.abspath(args.out_dir))

if __name__ == '__main__':
    main()
