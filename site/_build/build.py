#!/usr/bin/env python3
"""Compose the transit pages: shared chrome + per-page main templates + content.json data."""
import json, html, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, '.claude/rubric/facts'))
import words
# Paths are relative to this file, so the rubric can rebuild a scratch copy to test an edit before it lands.
OUT = os.path.dirname(HERE) + os.sep
import hashlib
VER = hashlib.sha1(open(OUT + 'style.css', 'rb').read() + open(OUT + 'main.js', 'rb').read()).hexdigest()[:8]
SPEAKING_VER = hashlib.sha1(open(OUT + 'speaking.css', 'rb').read()).hexdigest()[:8]
RESEARCH_VER = hashlib.sha1(open(OUT + 'research.css', 'rb').read()).hexdigest()[:8]
D = json.load(open(os.path.join(os.path.dirname(HERE), 'content.json')))
CONTROL = json.load(open(os.path.join(ROOT, '.claude/rubric/registry.json')))
AUTHORITY = json.load(open(os.path.join(ROOT, '.claude/rubric/authority.json')))
PUBLIC_SITE = AUTHORITY['publicSite']
SITE_ORIGIN = PUBLIC_SITE['origin'].rstrip('/')
ROUTE_BY_ID = {route['id']: route for route in PUBLIC_SITE['routes']}

def validate_content_contract():
    """Fail before rendering if content identity, ownership, order, or locked copy drifts."""
    for collection, spec in CONTROL['content_contract']['collections'].items():
        actual = D.get(collection)
        if not isinstance(actual, list):
            raise ValueError(f'content contract: {collection} is not a list')
        id_field = spec['id_field']
        actual_ids = [x.get(id_field) for x in actual]
        if len(actual_ids) != len(set(actual_ids)) or any(x is None for x in actual_ids):
            raise ValueError(f'content contract: {collection} has missing or duplicate identities')
        if 'locked_records' in spec:
            if actual != spec['locked_records']:
                raise ValueError(f'content contract: {collection} differs from its accepted records')
        elif actual_ids != spec['members']:
            raise ValueError(f'content contract: {collection} membership or order changed')

validate_content_contract()

def tree_hash(root, skip=()):
    h = hashlib.sha256()
    ignored = set(skip)
    for directory, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in ignored and d != '__pycache__')
        for name in sorted(files):
            path = os.path.join(directory, name)
            rel = os.path.relpath(path, root)
            h.update(rel.encode())
            with open(path, 'rb') as stream:
                h.update(stream.read())
    return h.hexdigest()

def build_candidate():
    """Assemble a hash-bound candidate. Only score.py may promote it to dist after every gate passes."""
    subprocess.run(['node', os.path.join(HERE, 'maps.mjs'), 'all'], check=True)
    dist = os.path.join(ROOT, '.claude', 'rubric', 'out', 'candidate')
    if os.path.isdir(dist):
        shutil.rmtree(dist)
    os.makedirs(dist)
    route_files = [route['file'] for route in PUBLIC_SITE['routes'] if route['file'].endswith('.html')]
    route_files += PUBLIC_SITE['machineFiles']
    for name in route_files + ['style.css', 'speaking.css', 'research.css', 'main.js']:
        shutil.copy2(os.path.join(OUT, name), os.path.join(dist, name))
    shutil.copytree(os.path.join(ROOT, 'public'), os.path.join(dist, 'public'))
    gsap_out = os.path.join(dist, 'node_modules', 'gsap', 'dist')
    os.makedirs(gsap_out)
    for name in ['gsap.min.js', 'ScrollTrigger.min.js', 'DrawSVGPlugin.min.js', 'MotionPathPlugin.min.js', 'MorphSVGPlugin.min.js']:
        shutil.copy2(os.path.join(ROOT, 'node_modules', 'gsap', 'dist', name), os.path.join(gsap_out, name))
    font_source = os.path.join(ROOT, 'node_modules', '@fontsource-variable', 'hanken-grotesk', 'files')
    font_out = os.path.join(dist, 'node_modules', '@fontsource-variable', 'hanken-grotesk', 'files')
    os.makedirs(font_out)
    for name in ['hanken-grotesk-latin-ext-wght-normal.woff2', 'hanken-grotesk-latin-wght-normal.woff2']:
        shutil.copy2(os.path.join(font_source, name), os.path.join(font_out, name))
    source_hash = tree_hash(OUT)
    artifact_hash = tree_hash(dist)
    baseline = json.load(open(os.path.join(OUT, '.baseline.json')))
    provenance = {
        'baselineId': baseline['id'],
        'sourceRoot': baseline['root'],
        'sourceHash': source_hash,
        'artifactHash': artifact_hash,
        'routes': route_files,
    }
    with open(os.path.join(dist, '.site-provenance.json'), 'w') as stream:
        json.dump(provenance, stream, indent=2)
        stream.write('\n')
    print('built candidate', artifact_hash)

def t(s):
    """Visible text: no en/em dashes, escaped. A dash between two numbers (2–3) becomes a hyphen; no regex."""
    return html.escape(words.no_dash(s), quote=False)

def dates(s):
    return t(s)

RESUME = '/public/assets/Resume.pdf'
AV = '<img src="/public/assets/portrait-2026-mobile.webp" alt="" width="36" height="36">'

PAGES = [('career', 'Career'), ('services', 'Services'), ('speaking', 'Speaking'),
         ('research', 'Research'), ('projects', 'Projects'), ('contact', 'Contact')]

def header(page, label=''):
    cur = lambda k: ' aria-current="page"' if k == page else ''
    toggle = '<button class="theme{cls}" type="button" data-theme-toggle aria-label="Switch to the dark theme"></button>'
    if page == 'home':  # no header: he is the map's hub, and his face opens the card with Résumé; the map is the navigation
        return '<a class="skip" href="#main">Skip to content</a>\n' + toggle.replace('{cls}', ' theme--float') + '\n'
    # "Sairam Krishnan / Speaking": his name leads home, and the page name opens a switcher to every other page (Oct 29, 2026).
    links = ''.join(f'<li><a href="{k}.html"{cur(k)}>{name}</a></li>' for k, name in PAGES)
    return f'''<a class="skip" href="#main">Skip to content</a>
<header class="hd">
  <div class="hd__sign"><a class="hd__me" href="index.html">{AV}<span>Sairam Krishnan</span></a><span class="hd__sep" aria-hidden="true">/</span>
    <details class="hd__pages" data-pages><summary>{label}</summary><nav><ul>{links}</ul></nav></details></div>
  <div class="hd__end">{toggle.replace('{cls}', '')}</div>
</header>
'''

def footer(page):
    return ''  # No footer on any page; he asked for it gone (Oct 29, 2026).

SCRIPTS = f'''<script src="/node_modules/gsap/dist/gsap.min.js"></script>
<script src="/node_modules/gsap/dist/ScrollTrigger.min.js"></script>
<script src="/node_modules/gsap/dist/DrawSVGPlugin.min.js"></script>
<script src="/node_modules/gsap/dist/MotionPathPlugin.min.js"></script>
<script src="/node_modules/gsap/dist/MorphSVGPlugin.min.js"></script>
<script src="main.js?v={VER}"></script>
'''

def page(name, page_key, title, desc, main):
    route = ROUTE_BY_ID[page_key]
    canonical = SITE_ORIGIN + route['path']
    image = SITE_ORIGIN + PUBLIC_SITE['image']
    structured = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Person',
                '@id': SITE_ORIGIN + '/#person',
                'name': 'Sairam Krishnan',
                'url': SITE_ORIGIN + '/',
                'image': image,
                'jobTitle': 'AI/ML Engineering Leader',
                'sameAs': ['https://www.linkedin.com/in/sairambkrishnan', 'https://github.com/SaiWebApps'],
            },
            {
                '@type': 'WebSite',
                '@id': SITE_ORIGIN + '/#website',
                'url': SITE_ORIGIN + '/',
                'name': 'Sairam Krishnan',
                'publisher': {'@id': SITE_ORIGIN + '/#person'},
            },
            {
                '@type': 'WebPage',
                '@id': canonical + '#webpage',
                'url': canonical,
                'name': title,
                'description': desc,
                'isPartOf': {'@id': SITE_ORIGIN + '/#website'},
                'about': {'@id': SITE_ORIGIN + '/#person'},
            },
        ],
    }
    structured_json = json.dumps(structured, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    route_styles = {
        'speaking': f'\n<link rel="stylesheet" href="speaking.css?v={SPEAKING_VER}">',
        'research': f'\n<link rel="stylesheet" href="research.css?v={RESEARCH_VER}">',
    }
    route_style = route_styles.get(page_key, '')
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Sairam Krishnan">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{image}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{html.escape(title)}">
<meta name="twitter:description" content="{html.escape(desc)}">
<meta name="twitter:image" content="{image}">
<script type="application/ld+json">{structured_json}</script>
<script>try{{var t=localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t}}catch(e){{document.documentElement.dataset.theme='light'}}</script>
<link rel="stylesheet" href="style.css?v={VER}">{route_style}
</head>
<body data-page="{page_key}">
{header(page_key, title.split(',')[0])}
<main id="main">
{main}
</main>
{footer(page_key)}
{SCRIPTS}</body>
</html>
'''

ARROW_L = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 12 11 4l2.2 2.2L8.9 10.5H21v3H8.9l4.3 4.3L11 20z" fill="currentColor"/></svg>'
ARROW_R = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 12 13 4l-2.2 2.2 4.3 4.3H3v3h12.1l-4.3 4.3L13 20z" fill="currentColor"/></svg>'

def stopnav(ids, names, i):
    out = '<nav class="pf__nav" aria-label="Stops">'
    if i > 0:
        out += f'<a href="#{ids[i-1]}" data-go="{ids[i-1]}" data-dir="prev">{ARROW_L}<span>Previous stop</span> <strong>{names[i-1]}</strong></a>'
    if i < len(ids) - 1:
        out += f'<a href="#{ids[i+1]}" data-go="{ids[i+1]}" data-dir="next"><span>Next stop</span> <strong>{names[i+1]}</strong>{ARROW_R}</a>'
    return out + '</nav>'

def money(n):
    return f'${n:,}'

# Services shows no prices or hours. The only public fee is the keynote floor, on Speaking.
LENGTH = {'retainer': '', 'cto': '', 'call': '', 'fit': '', 'keynote': '', 'masterclass': ''}

def length(s):
    return html.escape(LENGTH.get(s['id'], s['length']), quote=False)

ABSTRACT = {'roi': 'I run every AI initiative on your list through the four-layer framework from the AI ROI paper I coauthored: a SCALE strategic readiness assessment of your firm, a value driver tree that traces each initiative to return on invested capital, a discount rate adjusted for AI-specific risks such as vendor and platform dependency and organizational friction, and stage gates that release each tranche of funding only on evidence. You get a decision scorecard that tells your executives which initiatives to fund.'}

KEYNOTE_FLOOR = 'from $5,000 plus travel'

def href_fix(h):
    if h.startswith('/talks/'):
        return '/public' + h
    if h.startswith('/research'):
        return 'research.html' + h[len('/research'):]
    if h.startswith('/projects'):
        return 'projects.html' + h[len('/projects'):]
    if h.startswith('/speaking'):
        return 'speaking.html' + h[len('/speaking'):]
    return h

def fill(tpl, **kw):
    for k, v in kw.items():
        tpl = tpl.replace('{{' + k + '}}', v)
    if '{{' in tpl:
        i = tpl.index('{{')
        raise SystemExit('unfilled placeholder in template: ' + tpl[i:tpl.index('}}', i) + 2])
    return tpl

def read(name):
    return open(os.path.join(HERE, 'pages', name)).read()

# ---------------- Services ----------------
OUTCOME = {
    'fit': 'A short free call to decide whether I am the right person for the problem.',
    'call': 'One hour on the problem your team is stuck on; leave with a recommendation.',
    'review': 'A written review of one design doc before you build it, every risk ranked with a proposed fix.',
    'keynote': 'For a conference, summit, or company offsite, shaped around the audience’s AI decisions.',
    'masterclass': 'One session or a connected series, built around your team’s work.',
    'roi': 'A decision scorecard that tells your executives which AI initiatives to fund.',
    'retainer': 'Design reviews before work starts, office hours for hard distributed-systems and AI problems, and mentoring for senior engineers growing into staff roles.',
    'cto': 'Technical strategy, hiring your first engineers, board updates, and AI ROI decisions, with me accountable for outcomes.',
}
GROUP_LINE = {'eng': 'blue', 'exec': 'orange', 'stay': 'red'}

def services():
    S = D['services']
    G = {g['id']: g['title'] for g in D['groups']}
    ids = [s['id'] for s in S]
    names = [t(s['name']) for s in S]
    zones = ''
    col = 1
    for g in D['groups']:
        n = sum(1 for s in S if s['group'] == g['id'])
        zones += f'<div class="zone" style="grid-column:{col} / span {n}"><p class="zone__name">{t(g["title"])}</p></div>'
        col += n
    stops = ''.join(f'<button class="stop" type="button" data-stop="{s["id"]}" style="grid-column:{i+1}"><span class="stop__tick"></span><span class="stop__name">{t(s["name"])}</span><span class="stop__out">{OUTCOME[s["id"]]}</span></button>' for i, s in enumerate(S))
    pfs = ''
    for i, s in enumerate(S):
        proof = ''.join(f'<p>{t(p)}</p>' for p in s['proof'])
        links = s.get('links') or []
        change = ''
        if links:
            ls = [f'<a href="{href_fix(l["href"])}">{t(l["label"])}</a>' for l in links]
            joined = ls[0] if len(ls) == 1 else ', '.join(ls[:-1]) + ' and ' + ls[-1]
            change = f'<p class="pf__change">{joined}</p>'
        ln = length(s)
        tm = f'<p class="ticket__time">{ln}</p>' if ln else ''
        ticket = f'<div class="ticket" data-line="{GROUP_LINE[s["group"]]}"><p class="ticket__fare">{t(G[s["group"]])}</p>{tm}</div>'
        proofbox = f'<div class="pf__proof"><div class="pf__cols">{proof}</div>{change}</div>' if (proof or change) else ''
        pfs += f"""<article class="platform" id="{s["id"]}">
  <div class="pf__in">
    <h2 class="sign">{t(s["name"])}</h2>
    {ticket}
    <p class="pf__abstract">{t(ABSTRACT.get(s["id"], s["abstract"]))}</p>
    {proofbox}
    {stopnav(ids, names, i)}
  </div>
</article>
"""
    SS = {x['id']: x for x in S}
    # One door per buyer. Both lead into the same monthly work.
    ROUTES = [
        ('engineering', 'blue', 'Engineering leaders', 'A second opinion before your team commits to a design.',
         ('45% fewer incidents', 'after I set my Apple team’s design-review and CI/CD standards. Velocity rose 30%.'),
         ['fit', 'call', 'review']),
        ('executives', 'orange', 'Executives', 'I teach your leadership team first, then help you decide which AI work to fund.',
         ('300+', 'community and business leaders heard my keynote “AI for Impact” at the Philadelphia Eagles’ 12th annual Eagles Care Summit.'),
         ['keynote', 'masterclass', 'roi']),
        ('stay', 'red', 'Every month', 'Senior judgment for your engineering leaders every month, or a technical leader of your own.',
         ('Half my team promoted', 'I led eight engineers at Amazon Alexa and mentored half of them from entry level to promotion.'),
         ['retainer', 'cto']),
    ]
    routes = ''
    for rid, line, name, why, (big, bigsub), rstops in ROUTES:
        offers = ' '.join(f'<span class="dr__offer"><strong>{t(SS[sid]["name"])}.</strong> {OUTCOME[sid]}</span>' for sid in rstops)
        first = rid == ROUTES[0][0]
        routes += (f'<section class="door" id="{rid}" data-line="{line}" aria-label="{name}"{"" if first else " data-off"}>'
                   f'<p class="dr__big"><strong>{t(big)}</strong> {t(bigsub)}</p>'
                   f'<div class="dr__body"><h2 class="dr__why">{why}</h2><p class="dr__offers">{offers}</p></div></section>\n')
    routes = f'<div class="doors-panel">{routes}</div>'
    main = fill(read('services.html'), zones=zones, stops=stops, platforms=pfs, routes=routes, nstops=str(len(S)))
    return page('services', 'services', 'Services, Sairam Krishnan', 'Advisory for engineering leaders and executives: a free Fit Call, design reviews, AI ROI reviews, keynotes and masterclasses, an advisory retainer, and Fractional CTO.', main)

BUILDERS = {'services': services}

# ---------------- Speaking ----------------
def speaking():
    T = {x['id']: x for x in D['talks']}
    E = {e['id']: e for e in T['praxtera']['engagements']}
    P = {p['id']: p for p in D['teachingPrograms']}
    eg = T['eagles']
    src = D['eaglesSummitSources']
    links = ', '.join(f'<a href="{s["href"]}">{t(s["label"])}</a>' for s in src[:-1]) + f' and <a href="{src[-1]["href"]}">{t(src[-1]["label"])}</a>'

    stations = [
        ('cmu', 'Carnegie Mellon', 'May to Dec 2013'),
        ('praxtera', 'Praxtera AI Institute', 'Sep 2025 to Present'),
        ('jacobson-strategic', 'Jacobson Strategic', t(E['jacobson-strategic']['date'])),
        ('hp', 'HP', t(E['hp']['date'])),
        ('morgan-lewis', 'Morgan Lewis', t(E['morgan-lewis']['date'])),
        ('pbs', 'PBS', t(E['pbs']['date'])),
        ('sonova', 'Sonova', t(E['sonova']['date'])),
        ('atos', 'Atos', t(T['atos']['date'])),
    ]
    ids = [s[0] for s in stations]
    names = [s[1] for s in stations]
    zones = (f'<div class="zone" style="grid-column:1 / span 1"><p class="zone__name">Carnegie Mellon</p></div>'
             f'<div class="zone" style="grid-column:2 / span 6"><p class="zone__name">Praxtera AI Institute</p></div>'
             f'<div class="zone" style="grid-column:8 / span 1"><p class="zone__name">Independent</p></div>')
    stops = ''.join(f'<button class="stop" type="button" data-stop="{sid}" style="grid-column:{i+1}"><span class="stop__tick"></span><span class="stop__name">{nm}</span><span class="stop__fare">{dt}</span></button>' for i, (sid, nm, dt) in enumerate(stations))

    def parts_html(e):
        out = ''
        plain = [p for p in e.get('parts', []) if 'steps' not in p]
        steps = [p for p in e.get('parts', []) if 'steps' in p]
        if plain:
            cells = ''
            for p in plain:
                when = f'<p class="sess__when">{t(p["date"])}</p>' if p.get('date') else ''
                txt = f'<p>{t(p["text"])}</p>' if p.get('text') else ''
                cells += f'<div class="sess"><h4>{t(p["title"])}</h4>{when}{txt}</div>'
            out += f'<div class="sessions{" sessions--short" if not any(p.get("text") for p in plain) else ""}">{cells}</div>'
        for p in steps:
            st = ''.join(f'<li><span class="seq__tick" aria-hidden="true"></span><p>{t(x)}</p></li>' for x in p['steps'])
            out += f'<div class="seq"><h4>{t(p["title"])}</h4><ol class="seq__line">{st}</ol></div>'
        return out

    # His sheet is the record of every session: titles and dates come straight from it.
    SHEET = {r['unit']: r for r in json.load(open(os.path.join(ROOT, '.claude/rubric/sources/sheet.json')))['rows']}
    MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    day = lambda d: f'{MON[int(d[5:7]) - 1]} {int(d[8:])}, {d[:4]}'
    title = lambda x: x.replace(' - ', ': ')
    def sessions(uid):
        ss = SHEET[uid]['sessions']
        li = ''.join(f'<li><span class="route__tick" aria-hidden="true"></span><p><strong>{t(title(x["title"]))}</strong><span>{day(x["date"])}</span></p></li>' for x in ss)
        return f'<ol class="route route--prog" style="--n:{len(ss)}" data-line="orange">{li}</ol>'
    # One screen per stop: who, what, when, and at most two lines. Praxtera is the branch above the strip, not a stop.
    STOPS = [
        ('cmu', 'Carnegie Mellon', 'May to Dec 2013',
         '<p class="pf__title">Web Applications</p><p class="pf__meta">Course Developer and Teaching Assistant<br>May to Dec 2013</p>'
         '<p class="pf__abstract">I redesigned the Web Applications course with the professor and instructed 105+ students as Agile Product Owner for their final projects.</p>'),
        ('jacobson-strategic', 'Jacobson Strategic', 'Sep 3, 2025',
         sessions('jacobson-strategic')),
        ('hp', 'HP', 'Oct to Nov 2025',
         '<p class="pf__abstract">Enabled HP teams to automate recurring work with Copilot workflows.</p>' + sessions('hp')),
        ('morgan-lewis', 'Morgan Lewis', 'Jan 20-22, 2026',
         '<p class="pf__abstract">Designed and taught an AI adoption and change-management workshop for the firm’s trainers and champions.</p>'
         '<div class="ml__train"><p class="prog__big">Ten resister personas</p><div class="consist" aria-hidden="true">'
         + ''.join(f'<span class="car{" car--on" if k in (0, 9) else ""}"></span>' for k in range(10))
         + '</div><p class="ml__ends"><span>The accuracy skeptic</span><span>The billable-hour traditionalist</span></p></div>' + sessions('morgan-lewis')),
        ('pbs', 'PBS', 'Feb 27, 2026',
         f'<p class="pf__title">{t(title(SHEET["pbs"]["sessions"][0]["title"]))}</p><p class="pf__meta">{day(SHEET["pbs"]["sessions"][0]["date"])}</p>'
         '<p class="pf__abstract">Privacy and governance frameworks as the first step, and how they set what AI can safely be used for.</p>'
         '<ol class="route route--steps" style="--n:5">' + ''.join(f'<li><span class="route__tick" aria-hidden="true"></span><p>{x}</p></li>' for x in
         ['Start with the pain points', 'Break each pain point into steps', 'Run them with a deterministic script', 'Add simple agents to coordinate', 'Keep each agent simple enough to audit']) + '</ol>'),
        ('sonova', 'Sonova', 'Oct 21-22, 2026',
         '<p class="pf__abstract">Taught prompting and workflows at Sonova.</p>' + sessions('sonova')),
        ('atos', 'Atos', 'Sep 3, 2026',
         f'<p class="pf__title">{t(T["atos"]["title"])}</p><p class="pf__meta">Independent, {day(SHEET["atos"]["sessions"][0]["date"])}</p>'
         '<p class="pf__abstract">How a knowledge graph enriches questions before they reach a model and checks the answer afterward, then a live setup of a local model.</p>'
         '<figure class="poster"><a href="/public/talks/knowledge-graphs/index.html" tabindex="-1" aria-hidden="true"><img src="/public/assets/atos-demo-poster.webp" width="1280" height="720" loading="lazy" alt="Demo from the Atos talk: a local model running in the Ollama desktop app on a Mac, ready for a first message"></a><figcaption><a href="/public/talks/knowledge-graphs/index.html">Open the deck</a></figcaption></figure>'),
    ]
    ids2 = [x[0] for x in STOPS]
    names2 = [x[1] for x in STOPS]
    zones2 = (f'<div class="zone" style="grid-column:1 / span 1"><p class="zone__name">Carnegie Mellon</p></div>'
              f'<div class="zone" style="grid-column:2 / span 5"><p class="zone__name">Praxtera AI Institute</p></div>'
              f'<div class="zone" style="grid-column:7 / span 1"><p class="zone__name">Independent</p></div>')
    stops2 = ''.join(f'<button class="stop" type="button" data-stop="{sid}" style="grid-column:{k+1}"><span class="stop__tick"></span><span class="stop__name">{nm}</span><span class="stop__fare">{dt}</span></button>' for k, (sid, nm, dt, _) in enumerate(STOPS))
    pfs2 = ''.join(f'''<article class="platform" id="{sid}">
  <div class="pf__in pf__in--wide">
    <h3 class="sign">{nm}</h3>
    {body}
    {stopnav(ids2, names2, k)}
  </div>
</article>
''' for k, (sid, nm, dt, body) in enumerate(STOPS))
    praxtera_line = 'Head of AI &amp; Executive Education since Sep 2025. I own AI curriculum strategy as Praxtera’s principal AI subject-matter expert and lead speaker.'
    talks = ''.join(f'<li class="blind__stop" data-screen data-content-unit="speakingTopics/{x["id"]}"><p class="blind__title">{t(x["title"])}</p><p class="blind__promise">{t(x["promise"])}</p></li>' for x in D['speakingTopics'])
    S2 = {x['id']: x for x in D['services']}
    fee = f'<div class="ticket ticket--fan" data-line="orange" style="--r:-4deg"><p class="ticket__zone">Keynote</p><p class="ticket__fare">{KEYNOTE_FLOOR}</p></div>'
    src_links = ' · '.join(f'<a href="{x["href"]}">{t(x["label"])}</a>' for x in src)
    if '{{praxtera}}' in read('speaking.html'):
        main = fill(read('speaking.html'), sources=src_links, praxtera=praxtera_line, nstops=str(len(STOPS)), zones=zones2, stops=stops2, platforms=pfs2, topics=talks, tickets=fee)
        return page('speaking', 'speaking', 'Speaking, Sairam Krishnan', 'Keynote for the Philadelphia Eagles, executive AI education for HP, Morgan Lewis, PBS, Sonova and Jacobson Strategic, and the Atos knowledge-graph talk.', main)

    pfs = ''
    for i, (sid, nm, dt) in enumerate(stations):
        if sid == 'cmu':
            c = T['cmu']
            body = (f'<p class="pf__title">{t(c["title"])}</p><p class="pf__meta">Web Applications Course Developer<br>Teaching Assistant<br>{t(c["date"])}</p>'
                    f'<p class="pf__abstract">{t(c["summary"])}</p>')
        elif sid == 'praxtera':
            c = T['praxtera']
            body = (f'<p class="pf__title">{t(c["title"])}</p><p class="pf__meta">Head of AI &amp; Executive Education<br>{t(c["date"])}</p>'
                    f'<p class="pf__abstract">{t(c["summary"])}</p>'
                    f'<p class="pf__change">The keynote at the end of this line, <a href="#eagles">AI for Impact</a>, was a Praxtera engagement too.</p>')
        elif sid == 'atos':
            c = T['atos']
            body = (f'<p class="pf__title">{t(c["title"])}</p><p class="pf__meta">Atos, independent<br>{t(c["date"])}</p>'
                    f'<p class="pf__abstract">{t(c["summary"])}</p>'
                    f'<figure class="poster"><a href="/public/talks/knowledge-graphs/index.html" tabindex="-1" aria-hidden="true"><img src="/public/assets/atos-demo-poster.webp" width="1280" height="720" loading="lazy" alt="Demo from the Atos talk: a local model running in the Ollama desktop app on a Mac, ready for a first message"></a><figcaption><a href="/public/talks/knowledge-graphs/index.html">Open the deck</a></figcaption></figure>')
        else:
            e = E[sid]; pr = P[sid]
            ev = e.get('eventName', '').split(' · ')[0]
            meta = (t(ev) + '<br>' if ev else '') + t(e['date'])
            body = (f'<p class="pf__title">{t(pr["title"])}</p><p class="pf__meta">{meta}</p>'
                    f'<p class="pf__abstract">{t(e["lead"])}</p>' + parts_html(e))
        pfs += f'''<article class="platform" id="{sid}">
  <div class="pf__in pf__in--wide">
    <h3 class="sign">{nm}</h3>
    {body}
    {stopnav(ids, names, i)}
  </div>
</article>
'''
    topics = ''.join(f'<li class="blind__stop" data-content-unit="speakingTopics/{x["id"]}"><p class="blind__title">{t(x["title"])}</p><p class="blind__promise">{t(x["promise"])}</p></li>' for x in D['speakingTopics'])
    S = {s['id']: s for s in D['services']}
    def ticket(sid, rot, fare_txt):
        s = S[sid]
        return f'<a class="ticket ticket--fan" data-line="orange" href="services.html#executives" style="--r:{rot}deg"><p class="ticket__zone">{t(s["name"])}</p><p class="ticket__fare">{fare_txt}</p></a>'
    tickets = ticket('keynote', -4, KEYNOTE_FLOOR) + ticket('masterclass', 4, t(S['masterclass']['length']))
    def prog_line(e, line):
        parts = e['parts']
        li = ''.join(f'<li><span class="route__tick" aria-hidden="true"></span><p><strong>{t(p["title"])}</strong><span>{t(p.get("date", ""))}</span></p></li>' for p in parts)
        return f'<ol class="route route--prog" style="--n:{len(parts)}" data-line="{line}">{li}</ol>'
    hp, so, ml, pb = E['hp'], E['sonova'], E['morgan-lewis'], E['pbs']
    pair = (f'<div class="prog__pair">'
            f'<div class="prog__one"><h3 class="prog__org"><a href="#hp">HP</a></h3><p class="prog__lead">{t(hp["lead"])}</p>{prog_line(hp, "orange")}</div>'
            f'<div class="prog__one"><h3 class="prog__org"><a href="#sonova">Sonova</a></h3><p class="prog__lead">{t(so["lead"])}</p>{prog_line(so, "orange")}</div></div>')
    ten = ''.join(f'<span class="car{" car--on" if i in (0, 9) else ""}"></span>' for i in range(10))
    mlc = (f'<div class="prog__ml"><h3 class="prog__org"><a href="#morgan-lewis">Morgan Lewis</a></h3>'
           f'<p class="prog__big">Ten resister personas, from the accuracy skeptic to the billable-hour traditionalist.</p>'
           f'<div class="ml__train"><div class="consist" aria-hidden="true">{ten}</div><p class="ml__ends"><span>The accuracy skeptic</span><span>The billable-hour traditionalist</span></p></div>'
           f'<p class="prog__lead">{t(ml["lead"])}</p></div>')
    steps = [p for p in pb['parts'] if 'steps' in p][0]
    pbsr = ''.join(f'<li><span class="route__tick" aria-hidden="true"></span><p>{t(x)}</p></li>' for x in steps['steps'])
    pbsc = (f'<div class="prog__pbs"><h3 class="prog__org"><a href="#pbs">PBS</a></h3><p class="prog__big">Privacy and governance first. Then the path to AI ROI.</p>'
            f'<p class="prog__lead">{t(pb["lead"])}</p><p class="paper__status">{t(steps["title"])}</p><ol class="route route--steps" style="--n:5">{pbsr}</ol></div>')
    programs = pair + mlc + pbsc
    main = fill(read('speaking.html'), sources=links, zones=zones, stops=stops, platforms=pfs, topics=topics, tickets=tickets, programs=programs)
    return page('speaking', 'speaking', 'Speaking, Sairam Krishnan', 'Keynote for the Philadelphia Eagles, executive AI education for HP, Morgan Lewis, PBS, Sonova and Jacobson Strategic, and the Atos knowledge-graph talk.', main)

BUILDERS['speaking'] = speaking

# ---------------- Career ----------------
def cars(n, marked, cls=''):
    cs = ''.join(f'<span class="car{" car--on" if i < marked else ""}"></span>' for i in range(n))
    return f'<div class="consist {cls}" aria-hidden="true">{cs}</div>'

def beforeafter():
    return ('<div class="ba" aria-hidden="true"><div class="ba__row"><span class="ba__line" style="--len:1"></span><span class="ba__lab">Windows Phone 8 baseline</span></div>'
            '<div class="ba__row"><span class="ba__line ba__line--now" style="--len:0.25"></span><span class="ba__lab">Windows 10 Mobile Mail</span></div></div>')

CAREER_LEAD = {
    'cmu': ('I earned an M.S. in Electrical &amp; Computer Engineering with a 4.00 GPA.', ''),
    'cmu-research': ('I designed a bacterial simulator to replace live culture experiments.', ''),
    'cmu-teaching': ('I instructed 105+ students as Agile Product Owner for their final projects.', ''),
    'leanfm': ('I developed a Django admin interface for building managers.', ''),
    'cmu-capstone': ('I reconfigured the hit game 2048 to take hand motions as input.', ''),
    'aws': ('I sped up the logging system 15% for 8M+ customers.', ''),
    'cmu-projects': ('I built a prototype for commanding drones through a StarCraft-like real-time strategy interface.', ''),
    'microsoft': ('I cut Windows 10 Mobile Mail power consumption 4x against the Windows Phone 8 baseline.', 'ba'),
    'sig': ('I led real-time FINRA compliance surveillance that flagged violations at the moment of execution.', ''),
    'amazon': ('I led an eight-engineer Alexa team and mentored half of it from entry level to promotion.', 'cars:8:4'),
    'apple': ('I manage eight engineers, five of them senior, and seven vendors.', 'cars:8:5'),
    'wharton': ('Palmer Scholar, top 5% of my class. Benjamin Franklin Award, peer-voted, one of three in a class of 250.', ''),
    'praxtera': ('I keynoted the Philadelphia Eagles’ 12th annual Eagles Care Summit for more than 300 community and business leaders.', ''),
    'ondoway': ('I rejected a cheaper LLM judge after calibration exposed false rejections of valid paraphrases.', ''),
}
LINE_OF = {'apple': 'red', 'amazon': 'red', 'sig': 'red', 'microsoft': 'red', 'praxtera': 'orange', 'cmu-teaching': 'orange', 'ondoway': 'green'}
LINE_NAME = {'red': 'Hire line', 'orange': 'Teaching line', 'green': 'Ventures line', 'yellow': 'Education line'}

def bullet_text(b, eid):
    if eid == 'apple':  # résumé: "ratings and calibration input, and compensation recommendations"
        b = b.replace('participate in calibration, and drive', 'participate in calibration, make compensation recommendations, and drive')
    if eid == 'wharton' and 'five majors' in b:
        return t(b.replace(' · ', '; '))
    return t(b.replace(' · ', ', '))

def join_links(links, lead='Change here for '):
    if not links:
        return ''
    ls = [f'<a href="{href_fix(l["href"])}">{t(l["label"])}</a>' for l in links]
    return '<p class="pf__change">' + lead + (ls[0] if len(ls) == 1 else ', '.join(ls[:-1]) + ' and ' + ls[-1]) + '.</p>'

# The Career page is a ride along the red line: one station per screen, in date order, ending at Apple.
# Wharton Executive MBA is a short parallel track you change to at Apple, because it ran alongside it.
RIDE = ['cmu', 'microsoft', 'sig', 'amazon', 'apple', 'wharton', 'praxtera']
RIDE_X = {'cmu': 7, 'microsoft': 21, 'sig': 36, 'amazon': 50, 'apple': 64, 'wharton': 79, 'praxtera': 93}
CMU_ERA = ['cmu-research', 'cmu-teaching', 'leanfm', 'aws', 'cmu-capstone', 'cmu-projects']
CMU_LATER = {'cmu-capstone': 'It became Gestiq.', 'cmu-projects': 'It became the <a href="research.html#drone-megaddon">Drone-Megaddon 2014</a> paper, extended in <a href="research.html#drone-megaddon-2026">Drone-Megaddon 2026</a>.'}

def quote(text, who):
    return f'<figure class="cr-quote"><blockquote><p>{t(text)}</p></blockquote><figcaption>{who}</figcaption></figure>'

# Each job's book: jacket colour (a site line colour) and trim height in px.
SHELF = {'cmu': ('red', 430), 'microsoft': ('blue', 392), 'sig': ('green', 410), 'amazon': ('orange', 448),
         'apple': ('black', 468), 'wharton': ('purple', 438), 'praxtera': ('yellow', 400)}

def career():
    L = {e['id']: e for e in D['careerLedger']}
    ledger_index = {entry['id']: index for index, entry in enumerate(D['careerLedger'])}
    career_evidence = D['careerEvidence']
    accepted_facts = {fact['id']: fact for fact in career_evidence['acceptedFacts']}
    accepted_replacements = {fact['replaces']: fact for fact in career_evidence['acceptedFacts'] if fact.get('replaces')}
    component_fact_ids = set(career_evidence['componentFactIds'])
    station_entries = {
        'cmu': ['cmu', 'cmu-research', 'leanfm', 'cmu-capstone', 'aws', 'cmu-projects'],
        'microsoft': ['microsoft'],
        'sig': ['sig'],
        'amazon': ['amazon'],
        'apple': ['apple'],
        'wharton': ['wharton'],
        'praxtera': ['praxtera'],
    }
    def fact_route(fact, attributes='', proof=False):
        body = t(fact)
        return f'<div class="route cr-fact-route"{attributes}><span>{body}</span></div>'
    def source_state(text, fact_id=''):
        return {'text': text, 'record': '', 'field': '', 'year': '', 'fact_id': fact_id}
    def supplemental(eid):
        facts = []
        def add_source(collection, record_index, field, field_index):
            text = D[collection][record_index][field][field_index]
            fact_id = f'site:{collection}[{record_index}].{field}[{field_index}]'
            facts.append(source_state(text, fact_id if fact_id in component_fact_ids else ''))
        def add_record(record, fields):
            for field, text in fields:
                if text:
                    facts.append({'text': str(text), 'record': record['id'], 'field': field, 'year': str(record.get('year', ''))})
        if eid == 'praxtera':
            # The résumé's Praxtera lines and the Praxtera lines from Services live here, in his record.
            for fid in ('resume:praxtera:6:b0', 'resume:praxtera:6:b1', 'resume:praxtera:6:b2', 'resume:praxtera:6:b3'):
                facts.append(source_state(_render.BY_ID[fid]['text']))
            add_source('services', 4, 'proof', 1)
            add_source('services', 7, 'proof', 2)
        if eid == 'apple':
            # Career owns the graph atom; the Design Review mirror stays on Services and cannot cover Career.
            add_source('services', 1, 'proof', 1)
            # These two clauses retain the original geographic reach and four-office launch detail without
            # repeating the accepted management fact or the canonical Career design-review atom.
            add_source('services', 6, 'proof', 0)
            add_source('services', 6, 'proof', 1)
        for review in D['managerReviews']:
            if review['unit'] == eid:
                add_record(review, [('context', review['context'])] + [(f'quote-{index}', quote) for index, quote in enumerate(review['quotes'])])
        for collection in ('colleagueRecommendations', 'featuredRecommendations'):
            for recommendation in D[collection]:
                if recommendation['unit'] == eid:
                    add_record(recommendation,
                               [(f'quote-{index}', quote) for index, quote in enumerate(recommendation['quotes'])] +
                               [('person', recommendation['person']), ('role', recommendation['role']), ('context', recommendation['context'])])
        return facts
    def testimonial_attrs(state):
        if not state['record']:
            return ''
        return (f' id="testimonial-{html.escape(state["record"])}-{html.escape(state["field"])}"'
                f' data-testimonial="{html.escape(state["record"])}"'
                f' data-testimonial-field="{html.escape(state["field"])}"'
                f' data-testimonial-year="{html.escape(state["year"])}"')
    def proof_pane(eid, state, kind='fact'):
        marker = ''
        if state.get('accepted_id'):
            marker = f' data-career-accepted-fact="{html.escape(state["accepted_id"])}"'
        elif state.get('fact_id'):
            marker = f' data-fact-id="{html.escape(state["fact_id"])}"'
        supporting = ''.join(fact_route(text) for text in state.get('supporting', []))
        return (f'<div class="cr-proof__pane cr-proof__pane--{kind}" data-proof-pane="{state["index"]}"'
                f' data-screen="{eid}-{state["index"]}"{testimonial_attrs(state)} tabindex="0">'
                f'{fact_route(state["text"], marker, kind == "fact")}{supporting}</div>')
    def proof_atlas(eid, states):
        ordered = []
        records = {}
        for state in states:
            record = state['record']
            if not record:
                ordered.append(('fact', state))
                continue
            if record not in records:
                records[record] = []
                ordered.append(('testimonial', record))
            records[record].append(state)
        out = []
        for kind, value in ordered:
            if kind == 'fact':
                out.append(proof_pane(eid, value))
                continue
            record = value
            quote_states = [state for state in records[record] if state['field'].startswith('quote-')]
            cite_states = [state for state in records[record] if not state['field'].startswith('quote-')]
            cite = ''.join(proof_pane(eid, state, 'cite') for state in cite_states)
            for k, state in enumerate(quote_states):  # one quote per slide; who said it appears once, on the first
                out.append(f'<figure class="cr-testimonial" data-testimonial-card="{html.escape(record)}">'
                           f'<blockquote>{proof_pane(eid, state, "quote")}</blockquote>'
                           + (f'<figcaption>{cite}</figcaption>' if k == 0 else '') + '</figure>')
        return out
    def evidence(eid, lead=False):
        e = L[eid]
        bullets = list(e['bullets'])
        # Praxtera's book carries its whole record except the line that names a venue.
        keep = (0, 2, 3, 4) if eid == 'praxtera' else range(len(bullets))
        role = 'Software Development Engineer' if eid == 'microsoft' else e['role']
        states = []
        for bullet_index in keep:
            text = bullets[bullet_index]
            fact_id = f'site:careerLedger[{ledger_index[eid]}].bullets[{bullet_index}]'
            accepted = accepted_replacements.get(fact_id)
            if accepted:
                if accepted['owner'] != eid:
                    raise ValueError(f'Career accepted fact {accepted["id"]} moved outside {accepted["owner"]}')
                states.append({'text': accepted['text'], 'record': '', 'field': '', 'year': '',
                               'accepted_id': accepted['id'], 'supporting': accepted.get('supporting', [])})
            else:
                states.append(source_state(text, fact_id if fact_id in component_fact_ids else ''))
        states += supplemental(eid)
        for index, state in enumerate(states):
            state['index'] = index
        slides = proof_atlas(eid, states)
        links = ''.join(f'<a href="{href_fix(link["href"])}">{t(link["label"])}</a>' for link in e.get('links', []))
        figures = ''.join(f'<a href="/public{figure["href"]}"><img src="/public{figure["img"]}" width="{figure["width"]}" height="{figure["height"]}" loading="lazy" alt="{html.escape(figure["alt"])}"><span>{t(figure["title"])}</span></a>' for figure in e.get('figures', []))
        if links:
            slides[-1] += f'<p class="cr-entry__links">{links}</p>'
        if figures:
            slides.append(f'<div class="cr-awards">{figures}</div>')
        org = (f'<span>{t(e["org"])}</span>' if eid == 'wharton' or not (names.get(eid, '') and names[eid] in e['org']) else '')
        identity = ('' if lead else
                    f'<h3 class="cr-entry__identity"><strong>{t(e["label"])}</strong><span>{t(role)}</span>'
                    f'<span>{t(e["dates"].replace(" – ", " - ").replace("–", "-"))}</span>{org}</h3>')
        slides[0] = identity + slides[0]
        return [(eid, slide) for slide in slides]
    def skills_entry():
        fact = accepted_facts['resume:skills']
        state = {'text': fact['text'], 'record': '', 'field': '', 'year': '', 'accepted_id': fact['id'], 'index': 0}
        return [('resume-take', f'<h3 class="cr-entry__identity" id="resume-take-h"><strong>{t(career_evidence["skillsHeading"])}</strong></h3>'
                                f'{proof_pane("resume-take", state)}')]
    def composition(station):
        entries = station_entries[station]
        slides = [slide for index, eid in enumerate(entries) for slide in evidence(eid, index == 0)]
        if station == 'apple':
            slides += skills_entry()
        # One bullet, quote or figure per slide; the arrows ride through them.
        # Each job is a book: one fact, quote or figure per page. The script opens the book; without it the pages read in order.
        def kind(body):
            return 'quote' if body.startswith('<figure class="cr-testimonial"') else ('figure' if body.startswith('<div class="cr-awards"') else 'fact')
        pages = ''.join(f'<section class="bk-page" data-kind="{kind(body)}" data-career-owner="{eid}"'
                        + (' id="resume-take" data-entry-pane="resume-take" aria-labelledby="resume-take-h"' if eid == 'resume-take' else '')
                        + f'>{body}</section>' for eid, body in slides)
        return f'<div class="bk-pages">{pages}</div>'
    def composition_pages(station):
        out = [slide for index, eid in enumerate(station_entries[station]) for slide in evidence(eid, index == 0)]
        return out + (skills_entry() if station == 'apple' else [])
    def component_attribute(fact_id):
        return f' data-fact-id="{fact_id}"' if fact_id in component_fact_ids else ''
    def station_identity(eid):
        entry = L[eid]
        entry_index = ledger_index[eid]
        role = 'Software Development Engineer' if eid == 'microsoft' else entry['role']
        role_id = f'site:careerLedger[{entry_index}].role'
        dates_id = f'site:careerLedger[{entry_index}].dates'
        org_id = f'site:careerLedger[{entry_index}].org'
        org = (f'<span{component_attribute(org_id)}>{t(entry["org"])}</span>'
               if eid == 'wharton' or not (names.get(eid, '') and names[eid] in entry['org']) else '')
        station_dates = entry['dates'].replace(' – ', ' - ').replace('–', '-')
        promotion = next((fact for fact in career_evidence['acceptedFacts'] if fact['owner'] == eid and fact['id'].endswith((':d0', ':d1'))), None)
        location = entry.get('meta', '').split(' · ')[0] if promotion and entry.get('meta') else ''
        detail = (f'<span>{t(location)}</span>' if location else '')
        if promotion:
            detail += f'<span data-career-accepted-fact="{html.escape(promotion["id"])}">{t(promotion["text"])}</span>'
        return (f'<p class="cr-station__identity"><strong{component_attribute(role_id)}>{t(role)}</strong>'
                f'<span{component_attribute(dates_id)}>{t(station_dates)}</span>{org}{detail}</p>')
    names = {i: t(L[i]['label']) for i in RIDE}
    # The shelf is the navigation: one book per job, in date order. A spine's thickness is how many pages it holds.
    spines = ''
    for i in RIDE:
        line, height = SHELF[i]
        count = len(composition_pages(i))
        spines += (f'<a class="bk-spine" href="#{i}" data-go="{i}" data-line="{line}" style="--h:{height}px;--n:{min(count, 26)}">'
                   f'<span class="bk-spine__name">{names[i]}</span>'
                   f'<span class="bk-spine__dates">{t(L[i]["dates"].replace(" – ", " - ").replace("–", "-"))}</span></a>')
    strip = f'<div class="bk-shelf__row">{spines}</div><span class="bk-slot" aria-hidden="true"></span>'
    flow = ['cmu', 'microsoft', 'sig', 'amazon', 'apple']
    def ride_nav(eid):
        links = ''
        if eid in ('wharton', 'praxtera'):
            links = '<a class="cr-prev" href="#apple" data-go="apple"><span aria-hidden="true">←</span> Apple</a>'
        else:
            index = flow.index(eid)
            if index > 0:
                previous = flow[index - 1]
                links += f'<a class="cr-prev" href="#{previous}" data-go="{previous}"><span aria-hidden="true">←</span> {names[previous]}</a>'
            if eid == 'apple':
                links += '<a class="cr-next" href="#wharton" data-go="wharton">Wharton <span aria-hidden="true">→</span></a>'
                links += '<a class="cr-next" href="#praxtera" data-go="praxtera">Praxtera <span aria-hidden="true">→</span></a>'
            elif index < len(flow) - 1:
                following = flow[index + 1]
                links += f'<a class="cr-next" href="#{following}" data-go="{following}">{names[following]} <span aria-hidden="true">→</span></a>'
        return f'<nav class="cr-foot" aria-labelledby="{eid}-h">{links}</nav>'
    sts = ''
    for i in RIDE:
        heading = 'Wharton Executive MBA' if i == 'wharton' else names[i]
        sts += (f'<article class="cr-st" id="{i}" data-x="{RIDE_X[i]}" data-line="{SHELF[i][0]}" data-career-owner="{i}" aria-labelledby="{i}-h">\n'
                f'  <div class="cr-body"><header class="cr-l"><h2 class="cr-sign" id="{i}-h" tabindex="-1">{heading}</h2>'
                f'{station_identity(i)}</header><div class="cr-r">{composition(i)}</div></div>{ride_nav(i)}\n</article>\n')
    main = fill(read('career.html'), strip=strip, stations=sts)
    return page('career', 'career', 'Career, Sairam Krishnan', 'AI/ML Engineering Leader. Principal Software Engineer and Team Lead at Apple; previously Amazon Alexa, SIG, Microsoft; Wharton Executive MBA and Carnegie Mellon.', main)

BUILDERS['career'] = career

# ---------------- Research ----------------
def route(stops, cls=''):
    lis = ''.join(f'<li><span class="route__tick" aria-hidden="true"></span><p>{s}</p></li>' for s in stops)
    return f'<ol class="route {cls}" style="--n:{len(stops)}">{lis}</ol>'

RESEARCH = {
    'drone-megaddon': ('I co-built a prototype that translated real-time strategy interactions into drone commands.',
        ['Real-time strategy interactions', 'Android', 'Radio', 'Embedded control', 'Drone commands'], '', 'Built, 2014'),
    'drone-megaddon-2026': ('A proposed extension places language and vision models inside an operator-supervised system.',
        ['Operator language', 'Checked commands', 'Video grounding and target tracking', 'Coordinated assignments across drones'], 'route--proposed', 'Proposed extension'),
    'who-trains-the-next-senior': ('AI makes code abundant. Verification and judgment remain scarce.',
        ['Smaller reviewable units', 'Scrutiny matched to consequence', 'Evidence-backed gates', 'Outcome-based metrics'], '', 'Practical changes'),
    'ai-roi': ('Release each tranche of AI funding only on evidence.',
        ['Assess organizational readiness', 'Trace business value through ROIC', 'Phase investment through evidence-based gates', 'Synthesize a decision scorecard'], 'route--gates', 'The framework'),
}

def research():
    R = {r['slug']: r for r in D['research']}
    def meta(r):
        doi = r['href'].replace('https://doi.org/', 'doi:')
        venue = t(r['venue'].replace(' · ', '. '))
        return f'<p class="paper__meta"><span>{t(r["authors"])}</span><span>{venue}</span><a href="{r["href"]}">{doi}</a></p>'
    def summary(r):
        return f'<details class="paper__more"><summary>Read the summary</summary><p>{t(r["summary"])}</p></details>'
    # A: one line, built then proposed
    a1, a2 = R['drone-megaddon'], R['drone-megaddon-2026']
    s1 = ['Real-time strategy interactions', 'Android', 'Radio', 'Embedded control', 'Drone commands']
    s2 = ['Operator language', 'Checked commands', 'Video grounding and target tracking', 'Coordinated assignments across drones']
    stops = ''.join(f'<li class="xl__stop" style="grid-column:{i+1}"><span class="route__tick" aria-hidden="true"></span><p>{x}</p></li>' for i, x in enumerate(s1))
    stops2 = ''.join(f'<li class="xl__stop xl__stop--p" style="grid-column:{i+6}"><span class="route__tick" aria-hidden="true"></span><p>{x}</p></li>' for i, x in enumerate(s2))
    A = (f'<article class="paper paper--xl" id="drone-megaddon" data-line="purple">'
         f'<p class="paper__lead">Built in 2014. Extended in 2026 with language and vision models inside an operator-supervised system.</p>'
         f'<ol class="xl">'
         f'<li class="xl__head" style="grid-column:1 / span 5"><h2 class="paper__title"><span class="tag" data-line="purple">Built, 2014</span>{t(a1["title"])}</h2><p class="paper__sub">{t(a1["subtitle"])}</p>{meta(a1)}{summary(a1)}</li>'
         f'{stops}'
         f'<li class="xl__head xl__head--p" id="drone-megaddon-2026" style="grid-column:6 / span 4"><h2 class="paper__title"><span class="tag tag--dash" data-line="purple">Proposed extension</span>{t(a2["title"])}</h2><p class="paper__sub">{t(a2["subtitle"])}</p>{meta(a2)}{summary(a2)}</li>'
         f'{stops2}</ol></article>')
    # B: convergence
    b = R['who-trains-the-next-senior']
    fan = '<svg class="conv__svg" viewBox="0 0 520 300" aria-hidden="true" focusable="false">' + ''.join(
        f'<path d="M0 {y} H{150 - abs(i-2)*10} L{250} 150 H520" fill="none" stroke="{c}" stroke-width="12" stroke-linejoin="round"/>'
        for i, (y, c) in enumerate([(30, '#E2231A'), (90, '#0070C0'), (150, '#00A651'), (210, '#F7941D'), (270, '#7B3F98')])) + '<path d="M250 150 H520" stroke="#1A1A1A" stroke-width="22"/><circle cx="250" cy="150" r="20" fill="#fff" stroke="#1A1A1A" stroke-width="7"/></svg>'
    changes = ''.join(f'<li><span class="route__tick" aria-hidden="true"></span><p>{x}</p></li>' for x in ['Smaller reviewable units', 'Scrutiny matched to consequence', 'Evidence-backed gates', 'Outcome-based metrics'])
    B = (f'<article class="paper paper--conv" id="who-trains-the-next-senior" data-line="purple">'
         f'<div class="conv__fig"><p class="conv__in">Code, abundant</p>{fan}<p class="conv__out">Verification and judgment, scarce</p></div>'
         f'<div class="conv__text"><p class="paper__lead">AI makes code abundant. Verification and judgment remain scarce.</p>'
         f'<h2 class="paper__title"><span class="tag" data-line="purple">SSRN, 2026</span>{t(b["title"])}</h2><p class="paper__sub">{t(b["subtitle"])}</p>{meta(b)}{summary(b)}</div>'
         f'<div class="conv__changes"><p class="paper__status">The practical changes, on the scarce track</p><ol class="route route--black" style="--n:4">{changes}</ol></div></article>')
    # C: staircase of gates
    c = R['ai-roi']
    steps = ['Assess organizational readiness', 'Trace business value through ROIC', 'Phase investment through evidence-based gates', 'Synthesize a decision scorecard']
    stair = ''.join(f'<li style="--i:{i}"><span class="stair__gate" aria-hidden="true"></span><p>{x}</p></li>' for i, x in enumerate(steps))
    C = (f'<article class="paper paper--stair" id="ai-roi" data-line="purple">'
         f'<div class="stair__text"><p class="paper__lead">Release each tranche of AI funding only on evidence.</p>'
         f'<h2 class="paper__title"><span class="tag" data-line="purple">SSRN, 2026</span>{t(c["title"])}</h2>{meta(c)}{summary(c)}</div>'
         f'<ol class="stair">{stair}</ol></article>')
    main = fill(read('research.html'), papers=A + B + C)
    return page('research', 'research', 'Research, Sairam Krishnan', 'Four papers: Drone-Megaddon 2014 and 2026, Who Trains the Next Senior?, and a multi-layer framework for the ROI of AI projects.', main)

BUILDERS['research'] = research

# ---------------- Projects ----------------
SYSTEMS = {
    'ondoway': ['Graph-grounded storytelling', 'Deterministic itinerary planning', 'GPS-triggered narration', 'Calibrated LLM judges against frozen human labels'],
    'persuaider': ['Role-conditioned agents with private objectives', 'Stateful AI-versus-AI simulations', 'LLM deal extraction', 'Deterministic utility, walk-away, and value-left-on-the-table calculations', 'Configurable weighted coaching rubrics'],
    'gestiq': ['On-device Apple Vision hand-pose estimation', 'Palm-normalized temporal recognition', 'Application- and website-aware command routing', 'Target revalidation', 'Guarded actions'],
    'lore': ['PostgreSQL for identity and history', 'Neo4j for dependency traversal', 'Task-aware model routing across hosted and local models'],
    'crucible': ['Structured agent reports', 'Claim-level evidence checks', 'Risk-based verification', 'Mutation and undo evidence', 'Concurrent review', 'Bounded revision loops'],
}

def figure(slug):
    if slug in ('persuaider', 'lore', 'crucible'):
        return f'<div class="vfig"><!--gen:fig-{slug}--><!--/gen:fig-{slug}--><div class="vfig__alt">{route([t(x) for x in SYSTEMS[slug]])}</div></div>'
    cls = 'route--gates' if slug == 'gestiq' else ''
    return f'<div class="paper__route"><p class="paper__status">The system</p>{route([t(x) for x in SYSTEMS[slug]], cls)}</div>'

def projects():
    V = D['ventures']
    ids = [v['slug'] for v in V]
    names = [t(v['name']) for v in V]
    stops = ''.join(f'<button class="stop" type="button" data-stop="{v["slug"]}" style="grid-column:{k+1}"><span class="stop__tick"></span><span class="stop__name">{t(v["name"])}</span><span class="stop__fare">{t(v["thesis"])}</span></button>' for k, v in enumerate(V))
    pfs = ''
    for k, v in enumerate(V):
        img = ''
        if v['slug'] == 'ondoway':
            img = '<figure class="pf__phone"><img src="/public/assets/ondoway-journey-wireframe.png" width="392" height="813" loading="lazy" alt="Ondoway journey screen: a walking route on a Paris map with stops 2 and 3, a turn instruction along Quai de l’Horloge, and narration for stop 2 of 3, Approaching the Conciergerie"></figure>'
        facts = ''.join(f'<div class="vf"><h4>{h}</h4><p>{t(v[key])}</p></div>' for h, key in [('Problem', 'problem'), ('Role', 'role'), ('System', 'system'), ('State', 'state')])
        pfs += (f'<article class="platform" id="{v["slug"]}">\n  <div class="pf__in pf__in--venture{" has-phone" if img else ""}">\n'
                f'    <h2 class="sign"><span class="tag" data-line="green">Ventures line</span>{t(v["name"])}</h2>\n'
                f'    <p class="pf__thesis">{t(v["thesis"])}</p>\n'
                f'    <p class="pf__lead">{t(v["lesson"])}</p>\n'
                f'    {figure(v["slug"])}\n'
                f'    <details class="paper__more vmore"><summary>Problem, role, system, and state</summary><div class="vfacts">{facts}</div></details>\n    {img}\n'
                f'    {stopnav(ids, names, k)}\n  </div>\n</article>\n')
    main = fill(read('projects.html'), stops=stops, platforms=pfs)
    return page('projects', 'projects', 'Projects, Sairam Krishnan', 'Five ventures: Ondoway, Persuaider, Gestiq, Lore / DependIQ, and Crucible.', main)

BUILDERS['projects'] = projects

def contact():
    return page('contact', 'contact', 'Contact, Sairam Krishnan', 'Email, LinkedIn, phone, and résumé for Sairam Krishnan, and how to book a free Fit Call.', read('contact.html'))

BUILDERS['contact'] = contact

def home():
    return page('home', 'home', 'Sairam Krishnan, AI/ML Engineering Leader', 'Sairam Krishnan leads AI/ML engineering at Apple and AI executive education at Praxtera. Grow the people. The platforms follow.', read('home.html'))

BUILDERS['home'] = home

def write_machine_files():
    routes = PUBLIC_SITE['routes']
    urls = [SITE_ORIGIN + route['path'] for route in routes]
    llms = '''# Sairam Krishnan

AI/ML engineering leadership, executive education, advisory, speaking, research, and independent projects.

- [Services]({origin}/services): Advisory for engineering leaders and executives.
- [Speaking]({origin}/speaking): Keynotes and executive AI education.
- [Career]({origin}/career): Engineering leadership and technical work.
- [Résumé]({origin}/public/assets/Resume.pdf): The accepted professional record.
- [Research]({origin}/research): Published and working research.
- [Projects]({origin}/projects): Ventures and independent AI systems.
- [Contact]({origin}/contact): Email, LinkedIn, and phone.
'''.format(origin=SITE_ORIGIN)
    open(os.path.join(OUT, 'llms.txt'), 'w').write(llms)
    open(os.path.join(OUT, 'robots.txt'), 'w').write(
        'User-agent: *\nAllow: /\nSitemap: ' + SITE_ORIGIN + '/sitemap-index.xml\n'
    )
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sitemap.extend('  <url><loc>' + html.escape(url) + '</loc></url>' for url in urls)
    sitemap.append('</urlset>')
    open(os.path.join(OUT, 'sitemap-pages.xml'), 'w').write('\n'.join(sitemap) + '\n')
    index = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <sitemap><loc>' + SITE_ORIGIN + '/sitemap-pages.xml</loc></sitemap>',
        '</sitemapindex>',
    ]
    open(os.path.join(OUT, 'sitemap-index.xml'), 'w').write('\n'.join(index) + '\n')

# The content pages are built from his facts (render.py): every line in his words, inside its own unit, nothing cut.
import render as _render
for _k, _f in _render.BUILDERS.items():
    if _k != 'career':
        BUILDERS[_k] = (lambda f: lambda: f(sys.modules[__name__]))(_f)

if __name__ == '__main__':
    if os.environ.get('RUBRIC_PIPELINE') != '1':
        raise SystemExit('direct build is disabled; run npm run build or npm run release')
    if '--publish' in sys.argv[1:]:
        raise SystemExit('direct publication is disabled; run npm run release')
    candidate_requested = '--candidate' in sys.argv[1:]
    which = [arg for arg in sys.argv[1:] if arg != '--candidate'] or list(BUILDERS)
    for w in which:
        html_out = BUILDERS[w]()
        fn = 'index.html' if w == 'home' else f'{w}.html'
        open(OUT + fn, 'w').write(html_out)
        print('built', fn)
    write_machine_files()
    if candidate_requested:
        build_candidate()

