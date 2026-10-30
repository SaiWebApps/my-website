"""Builds the content pages from his facts. Every visible line is one of his facts in his exact words (the fact store,
.claude/rubric/facts/facts.json), shown inside the unit it belongs to. Nothing is cut: every fact marked "must" is
placed. A fact too long for one line is shown as several lines or stops, never shortened. A unit with more than three
lines gets more screens (cars on its train), never fewer words. No regular expressions.
"""
import html, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
FACTS_PATH = os.path.join(ROOT, '.claude/rubric/facts/facts.json')
REG = json.load(open(os.path.join(ROOT, '.claude/rubric/registry.json')))
sys.path.insert(0, os.path.join(ROOT, '.claude/rubric/facts'))
import words

FACTS = json.load(open(FACTS_PATH))
BY_ID = {f['id']: f for f in FACTS}
RANK = {'resume': 0, 'site': 1, 'sheet': 2, 'paper': 3, 'head': 4, 'approved': 5}
HEAD_FIELDS = {'org', 'label', 'name', 'title', 'role', 'dates', 'date', 'detail', 'eventName', 'education', 'headline', 'year', 'subtitle', 'authors', 'venue', 'citation'}
QUOTE_FIELDS = {'quotes', 'person', 'context'}
LINE_WORDS = 40      # D40: no line over 40 words; a sentence up to that stays whole
CAR_LINES, CAR_WORDS = 3, 60   # D17: a screen holds three lines, 60 words

def e(s):
    return html.escape(str(s), quote=False)

def entry_key(f):
    """Facts that came from one record (one job, one session, one recommendation) share a key."""
    # resume:apple:1:b3 -> resume:apple:1; site:careerLedger[3].bullets[0] -> site:careerLedger[3];
    # site:talks[1].engagements[2].parts[0].text -> site:talks[1].engagements[2].parts[0]
    i = f['id']
    if f['source'] in ('resume', 'sheet'):
        return ':'.join(i.split(':')[:3])
    return i.rsplit('.', 1)[0] if '.' in i else i

class Placer:
    """Hands out each fact once across the whole site, twins together, so nothing is cut and nothing repeats."""
    def __init__(s):
        s.done = set()
    def take(s, f):
        if f['id'] in s.done:
            return False
        group = {f['id']} | set(f.get('twins', []))
        if group & s.done:
            s.done.add(f['id'])
            return False
        s.done |= group
        return True

PLACER = Placer()

def facts_of(unit, shows=('must',)):
    rs = [f for f in FACTS if f['unit'] == unit and f['show'] in shows and not f.get('retired')]
    order = {f['id']: k for k, f in enumerate(FACTS)}
    return sorted(rs, key=lambda f: (RANK.get(f['source'], 9), order[f['id']]))

def split_line(text, limit=LINE_WORDS):
    """A fact as lines of at most `limit` words, every word kept, each line an exact piece of the fact."""
    out = []
    for sent in words.sentences(text):
        pieces = [sent]
        for sep in ('; ', ': ', ', and ', ', '):
            nxt = []
            for p in pieces:
                if words.count_words(p) <= limit:
                    nxt.append(p); continue
                bits = p.split(sep)
                bits = [b + sep.rstrip() for b in bits[:-1]] + [bits[-1]]
                cur = ''
                for b in bits:
                    cand = (cur + ' ' + b).strip() if cur else b
                    if cur and words.count_words(cand) > limit:
                        nxt.append(cur); cur = b
                    else:
                        cur = cand
                if cur:
                    nxt.append(cur)
            pieces = nxt
        for p in pieces:
            ws = p.split()
            while len(ws) > limit:
                out.append(' '.join(ws[:limit])); ws = ws[limit:]
            if ws:
                out.append(' '.join(ws))
    return out

def head_line(fs, visible=e):
    """An entry's heading: its name, role and dates, each its own fact, side by side."""
    order = ['org', 'label', 'name', 'title', 'education', 'role', 'eventName', 'detail', 'subtitle', 'authors', 'venue', 'citation', 'dates', 'date', 'year']
    fs = sorted(fs, key=lambda f: order.index(f['field']) if f['field'] in order else 99)
    return '<span class="eh__sep" aria-hidden="true"> · </span>'.join(f'<span class="eh__{f["field"]}">{visible(f["text"])}</span>' for f in fs)

def quote_cars(fs, visible=e):
    """A recommendation or review: every word of it, three lines a car, the person named on every car."""
    q = [f for f in fs if f['field'] == 'quotes']
    who = [f for f in fs if f['field'] in ('person', 'role', 'context', 'year')]
    cite = ''.join(f'<span class="q__{f["field"]}">{visible(f["text"])}</span>' for f in sorted(who, key=lambda f: ['person', 'role', 'context', 'year'].index(f['field'])))
    lines = [ln for f in q for ln in split_line(f['text'])]
    out, c = [], 0
    while c < len(lines):
        n = CAR_LINES - 1 if c == 0 else CAR_LINES  # the first car also carries who said it
        body = ''.join(f'<p>{visible(x)}</p>' for x in lines[c:c + n])
        out.append(f'<figure class="q"><blockquote>{body}</blockquote>' + (f'<figcaption>{cite}</figcaption>' if c == 0 else '') + '</figure>')
        c += n
    return out

def train(unit, extra_first=None, images=None, skip_fields=(), skip_ids=(), open_layout=False,
          open_class='', heading_tag='h4', visible=e):
    """Every remaining must-fact of a unit, as cars of at most three lines. Returns the cars markup."""
    fs = [f for f in facts_of(unit) if f['field'] not in skip_fields and f['id'] not in skip_ids]
    entries, order = {}, []
    for f in fs:
        k = entry_key(f)
        if k not in entries:
            entries[k] = []; order.append(k)
        entries[k].append(f)
    cars = []
    if extra_first:
        cars.append(extra_first)
    for k in order:
        fl = entries[k]
        if any(f['field'] in QUOTE_FIELDS for f in fl) and any(f['field'] == 'quotes' for f in fl):
            q = [f for f in fl if PLACER.take(f)]
            if any(f['field'] == 'quotes' for f in q):
                cars.extend(quote_cars(q, visible))
            continue
        # The unit's own name is on its sign and cover already: later cards do not repeat it.
        own_names = {words.norm(x) for x in REG['units'].get(unit, {}).get('names', [])}
        heads = [f for f in fl if f['field'] in HEAD_FIELDS and PLACER.take(f) and not (f['field'] in ('org', 'label', 'name') and words.norm(f['text']) in own_names)]
        body = [f for f in fl if f['field'] not in HEAD_FIELDS and f['field'] != 'session' and PLACER.take(f)]
        head = f'<{heading_tag} class="eh">{head_line(heads, visible)}</{heading_tag}>' if heads else ''
        # Each sentence is a line; a sentence too long for one line becomes a short lead and its parts as stops.
        items = []
        for f in body:
            for sent in words.sentences(f['text']):
                if words.count_words(sent) <= LINE_WORDS:
                    items.append(('line', sent))
                else:
                    lead, rest = (sent.split(': ', 1)[0] + ':', sent.split(': ', 1)[1]) if ': ' in sent and words.count_words(sent.split(': ', 1)[0]) <= 12 else ('', sent)
                    stops = split_line(rest, 16)
                    if lead:
                        items.append(('line', lead))
                    for k in range(0, len(stops), 6):
                        items.append(('stops', stops[k:k + 6]))
        if not items:
            if head:
                cars.append(head)
            continue
        def render_item(it):
            if it[0] == 'line':
                return f'<p class="ln">{visible(it[1])}</p>'
            return '<ol class="route route--clauses">' + ''.join(f'<li><span class="route__tick" aria-hidden="true"></span><p>{visible(x)}</p></li>' for x in it[1]) + '</ol>'
        # Pack into cars: at most three lines (a run of stops counts as one), the heading on the first.
        cur, n, first = '', 0, True
        for it in items:
            weight = 1 if it[0] == 'line' else 2
            if n and n + weight > CAR_LINES:
                cars.append((head if first else '') + cur); cur, n, first = '', 0, False
            cur += render_item(it); n += weight
        if cur:
            cars.append((head if first else '') + cur)
    for img in images or []:
        cars.append(img)
    if not cars:
        return ''
    if open_class:
        proofs = ''.join(
            f'<div class="{open_class}-proof" id="{unit}-proof-{i + 1}" data-project-proof data-proof-unit="{unit}">{c}</div>'
            for i, c in enumerate(cars)
        )
        return f'<div class="{open_class}-evidence">{proofs}</div>'
    if open_layout:
        proofs = ''.join(
            f'<div class="svc2-proof{" route__continuation" if i else ""}">{c}</div>'
            for i, c in enumerate(cars)
        )
        return f'<div class="svc2-evidence">{proofs}</div>'
    cs = ''.join(f'<section class="coach" data-screen>{c}</section>' for c in cars)
    # Where you are on the train: a short line with a marker that rides along it (no counter text).
    ctl = ('<div class="cars__ctl"><button class="cars__btn" type="button" data-car="-1" aria-label="Previous car"><span aria-hidden="true">←</span></button>'
           f'<span class="cars__line" aria-hidden="true" style="--n:{len(cars)}"><i></i></span>'
           '<button class="cars__btn" type="button" data-car="1" aria-label="Next car"><span aria-hidden="true">→</span></button></div>') if len(cars) > 1 else ''
    return f'<div class="cars" data-cars><div class="cars__track">{cs}</div>{ctl}</div>'

def name(unit):
    return e(REG['units'][unit]['names'][0]) if REG['units'][unit]['names'] else ''

def strip_name(unit):
    """The strip is a wayfinder: on narrow screens a long name gives way to its shortest registered form."""
    ns = REG['units'][unit]['names']
    short = min(ns, key=len)
    if short == ns[0]:
        return name(unit)
    return f'<span class="cr-strip__full">{e(ns[0])}</span><span class="cr-strip__short">{e(short)}</span>'

def take_fact(fid):
    f = BY_ID[fid]
    PLACER.take(f)
    return e(f['text'])

def find(unit, field, contains='', source=None):
    for f in facts_of(unit, ('must', 'may')):
        if f['field'] == field and contains in f['text'] and (source is None or f['source'] == source):
            return f
    return None

def show(unit, field, contains='', source=None, cls='', tag='span', visible=e):
    f = find(unit, field, contains, source)
    if not f:
        return ''
    PLACER.take(f)
    return f'<{tag} class="{cls}">{visible(f["text"])}</{tag}>'

AL = '<span aria-hidden="true">←</span> '
AR = ' <span aria-hidden="true">→</span>'

def session_route(unit):
    """His sheet's sessions for a stop: title and date, each a fact."""
    MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    lis = ''
    for k in range(9):
        t, d = BY_ID.get(f'sheet:{unit}:{k}:title'), BY_ID.get(f'sheet:{unit}:{k}:date')
        if not t:
            break
        PLACER.take(t); PLACER.take(d)
        lis += f'<li><span class="route__tick" aria-hidden="true"></span><p><strong>{e(t["text"])}</strong><span>{e(d["text"])}</span></p></li>'
    return f'<ol class="route route--prog" data-line="orange">{lis}</ol>' if lis else ''

# ---------------------------------------------------------------- Career
RIDE = ['cmu', 'microsoft', 'sig', 'amazon', 'apple', 'wharton']
RIDE_X = {'cmu': 6, 'microsoft': 25, 'sig': 44, 'amazon': 63, 'apple': 82, 'wharton': 92}

def first_dates(unit):
    f = find(unit, 'dates', source='resume') or find(unit, 'dates') or find(unit, 'date')
    return e(f['text']) if f else ''

# One fact of his, drawn big on each station's cover: the line that sells the unit. It is taken whole, so it is not
# also a card. (Chosen by looking for these words in his own facts; the line itself is his.)
HERO_FACT = {
    'cmu': ('resume:edu:4', '4.0/4.0'),
    'microsoft': ('resume:microsoft:4:b0', '4×'),
    'sig': ('resume:sig:3:b0', 'FINRA'),
    'amazon': ('resume:amazon:2:b2', '$40M annually'),
    'apple': ('resume:apple:1:b3', '100M+ users'),
    'wharton': ('resume:edu:2', 'Palmer Scholar'),
}

def cover(u):
    """Role and dates of a unit, each from the accepted record."""
    role = find(u, 'title', source='resume') or find(u, 'role', source='site')
    dates = find(u, 'dates', source='resume') or find(u, 'dates') or find(u, 'date')
    out = ''
    if role and PLACER.take(role) is not None:
        out += f'<p class="cover__role">{e(role["text"])}</p>'
    if dates:
        PLACER.take(dates)
        out += f'<p class="cover__dates">{e(dates["text"])}</p>'
    return f'<div class="cover">{out}</div>'

def hero_panel(unit):
    """One exact accepted fact, typeset around its strongest supported phrase."""
    fid, marker = HERO_FACT[unit]
    fact = BY_ID[fid]
    PLACER.take(fact)
    before, found, after = fact['text'].partition(marker)
    if not found:
        return f'<p class="cr-big cr-big--words"><strong>{e(fact["text"])}</strong></p>'
    context = ''.join(f'<span>{e(x)}</span>' for x in (before, after) if x)
    return f'<p class="cr-big"><strong>{e(found)}</strong><small>{context}</small></p>'

def career(B):
    figs = figures(B.D)
    strip = '<span class="cr-strip__ln"></span><span class="cr-strip__lens" aria-hidden="true"></span>'
    for u in RIDE:
        strip += f'<a class="cr-strip__s{" cr-strip__s--branch" if u == "wharton" else ""}" href="#{u}" data-go="{u}" style="left:{RIDE_X[u]}%"><i></i><b>{strip_name(u)}</b></a>'
    strip += '<span class="cr-train" aria-hidden="true"></span>'
    sts = ''
    for k, u in enumerate(RIDE):
        if u == 'wharton':
            prev = f'<a class="cr-prev" href="#apple" data-go="apple">{AL}<span>Back to Apple</span></a>'
            nxt = '<a class="cr-next cr-next--end" href="index.html">Back to the map</a>'
        else:
            prev = f'<a class="cr-prev" href="#{RIDE[k-1]}" data-go="{RIDE[k-1]}">{AL}<span>{name(RIDE[k-1])}</span></a>' if k else '<span></span>'
            if u == 'apple':
                nxt = ('<a class="cr-map" href="index.html">Back to the map</a>'
                       f'<a class="cr-next" href="#wharton" data-go="wharton"><span>Next station</span> <strong>{name("wharton")}</strong>{AR}</a>')
            else:
                nxt = f'<a class="cr-next" href="#{RIDE[k+1]}" data-go="{RIDE[k+1]}"><span>Next station</span> <strong>{name(RIDE[k+1])}</strong>{AR}</a>'
        side = ''
        if u == 'apple':  # what ran alongside Apple: the map's branches, by name
            side = ('<nav class="cr-change"><a href="#wharton" data-go="wharton"><i data-line="red"></i>Wharton Executive MBA</a>'
                    '<a href="speaking.html#praxtera"><i data-line="orange"></i>Praxtera AI Institute</a>'
                    '<a href="projects.html#ondoway"><i data-line="green"></i>Ondoway</a></nav>')
        role = find(u, 'title', source='resume') or find(u, 'role', source='site')
        dates = find(u, 'dates', source='resume') or find(u, 'dates') or find(u, 'date')
        cover_markup = cover(u)
        hero_markup = hero_panel(u)
        detail = train(u, images=figs.get(u), skip_ids=tuple(f['id'] for f in (role, dates) if f))
        sts += (f'<article class="cr-st" id="{u}" data-x="{RIDE_X[u]}" aria-label="{name(u)}">\n'
                f'  <div class="cr-body"><div class="cr-l"><h2 class="cr-sign">{name(u)}</h2>{cover_markup}{side}</div>'
                f'<div class="cr-r">{hero_markup}</div></div>\n'
                f'  <div class="cr-detail">{detail}</div>\n'
                f'  <nav class="cr-foot" aria-label="Ride">{prev}{nxt}</nav>\n</article>\n')
    main = (f'<section class="cr" data-career-ride aria-labelledby="career-h"><h1 id="career-h" class="vh">Career</h1>'
            f'<nav class="cr-strip" aria-label="Career stations">{strip}</nav><div class="cr-stage">\n{sts}</div></section>')
    return B.page('career', 'career', 'Career, Sairam Krishnan', 'AI/ML Engineering Leader. Principal Software Engineer and Team Lead at Apple; previously Amazon Alexa, SIG, Microsoft; Wharton Executive MBA and Carnegie Mellon.', main)

# ---------------------------------------------------------------- Speaking
def speaking(B):
    """An open editorial atlas. Provenance is structural, not an interactive state."""
    def atom(fid, tag='p', cls=''):
        aid = html.escape(fid, quote=True)
        klass = f' class="{cls}"' if cls else ''
        return f'<{tag}{klass} data-atom data-fact-id="{aid}">{B.t(BY_ID[fid]["text"])}</{tag}>'

    def text_atom(text, tag='p', cls=''):
        klass = f' class="{cls}"' if cls else ''
        return f'<{tag}{klass} data-atom>{B.t(text)}</{tag}>'

    def fact_fragments(fid, fragments):
        source = BY_ID[fid]["text"]
        if ' '.join(fragments) != source:
            raise ValueError(f'Speaking fact fragments do not reproduce {fid}')
        fact_id = html.escape(fid, quote=True)
        total = len(fragments)
        return ''.join(
            f'<p data-atom data-fact-id="{fact_id}" data-fact-fragment="{index}/{total}">{B.t(fragment)}</p>'
            for index, fragment in enumerate(fragments, 1)
        )

    def fact_excerpt(fid, excerpt, tag='p', cls=''):
        if excerpt not in BY_ID[fid]["text"]:
            raise ValueError(f'Speaking fact excerpt does not occur in {fid}')
        fact_id = html.escape(fid, quote=True)
        klass = f' class="{cls}"' if cls else ''
        return f'<{tag}{klass} data-atom data-fact-id="{fact_id}" data-fact-excerpt>{B.t(excerpt)}</{tag}>'

    def proof(pid, owner, body, cls='', content_unit=''):
        extra = f' {cls}' if cls else ''
        content = f' data-content-unit="{html.escape(content_unit, quote=True)}"' if content_unit else ''
        return (f'<div class="sp2-proof{extra}" data-speaking-proof data-proof-unit="{owner}" '
                f'data-proof-id="{pid}" id="proof-{pid}"{content}>{body}</div>')

    def session(owner, title_id, date_id):
        owner_attr = html.escape(owner, quote=True)
        title_attr = html.escape(title_id, quote=True)
        date_attr = html.escape(date_id, quote=True)
        return (f'<li class="sp2-session" data-speaking-session data-session-owner="{owner_attr}" '
                f'data-session-id="{title_attr}"><strong data-session-title-fact="{title_attr}">'
                f'{B.t(BY_ID[title_id]["text"])}</strong><span data-session-date-fact="{date_attr}">'
                f'{B.t(BY_ID[date_id]["text"])}</span></li>')

    LOGOS = {'jacobson-strategic': 'jacobson.png', 'hp': 'hp.svg', 'morgan-lewis': 'morgan-lewis.png', 'pbs': 'pbs.svg',
             'sonova': 'sonova.svg', 'eagles': 'eagles.svg', 'cmu': 'cmu.svg', 'atos': 'atos.png'}

    def logo_ratio(path):
        if path.endswith('.png'):
            head = open(path, 'rb').read(24)
            return int.from_bytes(head[16:20], 'big') / int.from_bytes(head[20:24], 'big')
        svg = open(path).read()
        tag = svg[svg.index('<svg'):].split('>', 1)[0]
        if 'viewBox="' in tag:
            box = tag[tag.index('viewBox="') + 9:].split('"', 1)[0].replace(',', ' ').split()
            return float(box[2]) / float(box[3])
        size = lambda attr: float(tag[tag.index(f' {attr}="') + len(attr) + 3:].split('"', 1)[0])
        return size('width') / size('height')

    def logo(mid):
        # Each client's logo, painted in the poster's ink through a mask; the name stays as hidden text.
        name = LOGOS.get(mid)
        if not name:
            return ''
        ratio = logo_ratio(os.path.join(ROOT, 'public/assets/logos', name))
        return f'<span class="sp2-logo" style="--logo: url(/public/assets/logos/{name}); --ar: {ratio:.4f}"></span>'

    def member(mid, label, body, mod='', authority=None):
        modifier = f' sp2-member--{mod}' if mod else ''
        authority = authority or mid
        mark = logo(mid)
        name = f'{mark}<span class="vh">{B.t(label)}</span>' if mark else B.t(label)
        return (f'<article class="sp2-member{modifier}" id="{mid}" data-authority-member="{authority}" '
                f'aria-labelledby="sp2-{mid}-h"><h3 class="sp2-member__name" id="sp2-{mid}-h">{name}</h3>{body}</article>')

    source_links = ''.join(
        f'<a href="{html.escape(B.D["eaglesSummitSources"][i]["href"], quote=True)}">'
        f'{B.t(BY_ID[f"site:eaglesSummitSources[{i}].label"]["text"])}</a>'
        for i in range(3)
    )


    # The face is unchanged except the session line: displayTitle now sits where sheet:eagles:0:title was.
    # The claim moves off the face proof into the card. Otherwise "Basics to Advanced Automation" (4 words)
    # would make the face proof 4 lines, and guard D17 allows at most 3.
    eagles_proof = proof('eagles-lead', 'eagles',
        atom('site:talks[0].title', 'h4', 'sp2-eagles__title') +
        atom('site:talks[0].displayTitle', cls='sp2-eagles__session') +
        atom('site:talks[0].date', cls='sp2-eagles__date') +
        fact_excerpt('resume:praxtera:6:b4:retirement-redaction', '300+ community and business leaders', cls='sp2-eagles__count') +
        f'<p class="sp2-eagles__sources">{source_links}</p>', 'sp2-proof--eagles')
    eagles_photos = (
        '<figure class="sp2-eagles__photo">'
        '<img src="/public/assets/eagles-keynote-2.webp" width="1800" height="914" '
        'alt="Two presenters on a stage with a black curtain, a man in a blue suit with his fists raised and a woman with her hand up, '
        'while many audience members at round tables raise their hands; Praxtera AI Institute signs, an Eagles summit sign, and green, black, and white balloons stand behind them">'
        '<img class="sp2-eagles__photo-more" src="/public/assets/eagles-keynote-1.webp" width="1200" height="1800" loading="lazy" '
        'alt="The same stage seen from the back of the room: a large screen above the presenters reads How are you using AI today?, '
        'and the audience at round tables, some in Eagles jackets, faces the stage">'
        '</figure>')
    eg = 'site:talks[0]'
    eagles_card = (
        proof('eagles-brief', 'eagles', atom('sheet:eagles:0:title', 'h4') + atom(f'{eg}.lead') + atom('site:talks[0].summary:retirement-redaction')) +
        proof('eagles-context', 'eagles', atom(f'{eg}.context') + atom(f'{eg}.course', cls='sp2-course'), 'sp2-proof--cont') +
        ''.join(proof(f'eagles-part-{i}', 'eagles',
                      atom(f'{eg}.parts[{i}].title', 'h4') +
                      ''.join(atom(f'{eg}.parts[{i}].paras[{k}]') for k in range(len(part['paras']))))
                for i, part in enumerate(B.D['talks'][0]['parts'])) +
        proof('eagles-quote', 'eagles', atom(f'{eg}.quote.text', cls='sp2-quote') + atom(f'{eg}.quote.by', cls='sp2-quote__by')) +
        proof('eagles-credit', 'eagles', atom(f'{eg}.credit')))
    eagles = member('eagles', 'Philadelphia Eagles',
        eagles_photos + '<div class="sp2-member__proofs">' + eagles_proof + eagles_card + '</div>', 'eagles')

    # Praxtera's own record: only what no client card already says.
    praxtera_proofs = (
        proof('praxtera-scope', 'praxtera',
            atom('resume:praxtera:6:title', 'h3', 'sp2-branch__role') +
            '<p class="sp2-branch__meta">' +
            atom('resume:praxtera:6:d0', 'span') + atom('resume:praxtera:6:d1', 'span') + atom('resume:praxtera:6:dates', 'span') + '</p>', 'sp2-proof--scope') +
        proof('praxtera-curriculum', 'praxtera', atom('site:careerLedger[12].bullets[0]'), 'sp2-proof--curriculum') +
        proof('praxtera-transfer', 'praxtera', atom('site:services[4].proof[0]'), 'sp2-proof--transfer') +
        proof('praxtera-adoption', 'praxtera', atom('site:careerLedger[12].bullets[5]'), 'sp2-proof--adoption')
    )

    jacobson = member('jacobson-strategic', 'Jacobson Strategic',
        '<ol class="sp2-sessions">' + session('jacobson-strategic', 'sheet:jacobson-strategic:0:title', 'sheet:jacobson-strategic:0:date') + '</ol>' +
        '<div class="sp2-member__proofs">' +
        proof('jacobson-delivery', 'jacobson-strategic', atom('site:teachingPrograms[4].title', 'h4') + atom('site:talks[1].engagements[4].lead') + atom('site:talks[1].engagements[4].context')) +
        ''.join(proof(f'jacobson-part-{i}', 'jacobson-strategic',
                      atom(f'site:talks[1].engagements[4].parts[{i}].title', 'h4') +
                      ''.join(atom(f'site:talks[1].engagements[4].parts[{i}].paras[{k}]') for k in range(len(part['paras']))))
                for i, part in enumerate(B.D['talks'][1]['engagements'][4]['parts'])) +
        proof('jacobson-credit', 'jacobson-strategic', atom('site:talks[1].engagements[4].credit')) +
        '</div>', 'jacobson')

    # HP's sessions: the face carries the titles; the card names each session and the courses it came from.
    hp_heading = tuple(atom(f'site:talks[1].engagements[3].parts[{i}].heading', 'h4') for i in range(2))
    hp_course = tuple(atom(f'site:talks[1].engagements[3].parts[{i}].course', cls='sp2-course') for i in range(2))
    hp = member('hp', 'HP',
        '<ol class="sp2-sessions">' + session('hp', 'site:talks[1].engagements[3].parts[0].title', 'sheet:hp:0:date') + session('hp', 'site:talks[1].engagements[3].parts[1].displayTitle', 'sheet:hp:1:date') + '</ol>' +
        '<div class="sp2-member__proofs">' +
        proof('hp-program', 'hp', atom('site:teachingPrograms[0].title', 'h4') + atom('site:talks[1].engagements[3].date', cls='sp2-proof__date') + atom('site:talks[1].engagements[3].lead') + atom('site:talks[1].engagements[3].context')) +
        ''.join(proof(('hp-foundations', 'hp-solutions')[i], 'hp',
                      hp_heading[i] + atom(f'site:talks[1].engagements[3].parts[{i}].date', cls='sp2-proof__date') + hp_course[i] +
                      fact_fragments(f'site:talks[1].engagements[3].parts[{i}].text', words.sentences(part['text']))) +
                ''.join(proof(f'hp-{i}-detail-{k}', 'hp', atom(f'site:talks[1].engagements[3].parts[{i}].paras[{k}]'), 'sp2-proof--cont') for k in range(len(part['paras'])))
                for i, part in enumerate(B.D['talks'][1]['engagements'][3]['parts'])) +
        proof('hp-credit', 'hp', atom('site:talks[1].engagements[3].credit')) + '</div>', 'hp')

    ml_sentences = words.sentences(BY_ID['site:talks[1].engagements[2].parts[1].text']['text'])
    ml = B.D['talks'][1]['engagements'][2]
    def ml_para(i, k):
        return proof(f'morgan-{i}-detail-{k}', 'morgan-lewis', atom(f'site:talks[1].engagements[2].sessions[{i}].paras[{k}]'), 'sp2-proof--cont')
    morgan = member('morgan-lewis', 'Morgan Lewis',
        '<ol class="sp2-sessions">' + session('morgan-lewis', 'sheet:morgan-lewis:0:title', 'sheet:morgan-lewis:0:date') + session('morgan-lewis', 'site:talks[1].engagements[2].sessions[1].displayTitle', 'sheet:morgan-lewis:1:date') + '</ol>' +
        '<div class="sp2-member__proofs">' +
        proof('morgan-brief', 'morgan-lewis', atom('site:teachingPrograms[2].title', 'h4') + atom('site:talks[1].engagements[2].lead') + atom('site:talks[1].engagements[2].context')) +
        proof('morgan-s1', 'morgan-lewis', atom('site:talks[1].engagements[2].sessions[0].heading', 'h4') + atom('site:talks[1].engagements[2].eventName', cls='sp2-course')) +
        proof('morgan-adoption', 'morgan-lewis', atom('site:talks[1].engagements[2].parts[0].title', 'h5') + atom('site:talks[1].engagements[2].parts[0].text')) +
        ml_para(0, 0) +
        proof('morgan-roleplay', 'morgan-lewis', atom('site:talks[1].engagements[2].parts[1].title', 'h5') + ''.join(text_atom(x) for x in ml_sentences[:2])) +
        ml_para(0, 1) +
        proof('morgan-roleplay-live', 'morgan-lewis', text_atom(ml_sentences[2]), 'sp2-proof--cont') +
        ml_para(0, 2) +
        proof('morgan-toolkit', 'morgan-lewis', text_atom(ml_sentences[3]), 'sp2-proof--cont') +
        proof('morgan-s2', 'morgan-lewis', atom('site:talks[1].engagements[2].sessions[1].heading', 'h4') + atom('site:talks[1].engagements[2].sessions[1].course', cls='sp2-course')) +
        ''.join(ml_para(1, k) for k in range(len(ml['sessions'][1]['paras']))) +
        proof('morgan-quote', 'morgan-lewis', atom('site:talks[1].engagements[2].quote.text', cls='sp2-quote') + atom('site:talks[1].engagements[2].quote.by', cls='sp2-quote__by')) +
        proof('morgan-credit', 'morgan-lewis', atom('site:talks[1].engagements[2].credit')) + '</div>', 'morgan')

    # PBS: one session. Sairam's three points are the sections; the retired AI ROI title stays unrendered, the steps carry a new heading.
    pb = 'site:talks[1].engagements[1]'
    pbs = member('pbs', 'PBS',
        '<ol class="sp2-sessions">' + session('pbs', 'sheet:pbs:0:title', 'sheet:pbs:0:date') + '</ol>' +
        '<div class="sp2-member__proofs">' +
        proof('pbs-brief', 'pbs', atom('site:teachingPrograms[3].title', 'h4') + atom(f'{pb}.eventName', cls='sp2-course') +
              atom(f'{pb}.lead') + atom(f'{pb}.context')) +
        proof('pbs-foundations', 'pbs', atom(f'{pb}.parts[0].title', 'h4') + atom(f'{pb}.parts[0].text') +
              atom(f'{pb}.parts[0].paras[0]') + atom(f'{pb}.parts[0].paras[1]')) +
        proof('pbs-foundations-tools', 'pbs', atom(f'{pb}.parts[0].paras[2]'), 'sp2-proof--cont') +
        proof('pbs-governance', 'pbs', atom(f'{pb}.parts[1].title', 'h4') + atom(f'{pb}.parts[1].text')) +
        proof('pbs-workflow', 'pbs', atom(f'{pb}.parts[2].displayTitle', 'h4') +
              ''.join(atom(f'{pb}.parts[2].steps[{i}]') for i in range(3))) +
        proof('pbs-coordination', 'pbs', atom(f'{pb}.parts[2].paras[0]') +
              ''.join(atom(f'{pb}.parts[2].steps[{i}]') for i in range(3, 5)), 'sp2-proof--cont') +
        proof('pbs-examples', 'pbs', atom(f'{pb}.parts[2].paras[1]'), 'sp2-proof--cont') +
        proof('pbs-credit', 'pbs', atom(f'{pb}.credit')) + '</div>', 'pbs')

    # Sonova's sessions: the face carries the titles; the card names each session and the course it came from (HP model).
    sv = B.D['talks'][1]['engagements'][0]
    sv_heading = tuple(atom(f'site:talks[1].engagements[0].parts[{i}].heading', 'h4') for i in range(2))
    sv_course = tuple(atom(f'site:talks[1].engagements[0].parts[{i}].course', cls='sp2-course') for i in range(2))
    sonova = member('sonova', 'Sonova',
        '<ol class="sp2-sessions">' +
        session('sonova', 'site:talks[1].engagements[0].parts[0].displayTitle', 'sheet:sonova:0:date') +
        session('sonova', 'site:talks[1].engagements[0].parts[1].displayTitle', 'sheet:sonova:1:date') + '</ol>' +
        '<div class="sp2-member__proofs">' +
        proof('sonova-program', 'sonova', atom('site:teachingPrograms[1].title', 'h4') + atom('site:talks[1].engagements[0].date', cls='sp2-proof__date') +
              atom('site:talks[1].engagements[0].lead') + atom('site:talks[1].engagements[0].context')) +
        ''.join(proof(('sonova-prompting', 'sonova-skills')[i], 'sonova',
                      sv_heading[i] + atom(f'site:talks[1].engagements[0].parts[{i}].date', cls='sp2-proof__date') + sv_course[i]) +
                ''.join(proof(f'sonova-{i}-detail-{k}', 'sonova', atom(f'site:talks[1].engagements[0].parts[{i}].paras[{k}]'), 'sp2-proof--cont')
                        for k in range(len(part['paras'])))
                for i, part in enumerate(sv['parts'])) +
        proof('sonova-credit', 'sonova', atom('site:talks[1].engagements[0].credit')) + '</div>', 'sonova')

    praxtera = (f'<section class="sp2-group sp2-group--praxtera" id="praxtera" '
        f'data-authority-group="praxtera-client-provenance" aria-labelledby="sp2-praxtera-h">'
        f'<header class="sp2-group__head"><h2 id="sp2-praxtera-h">Praxtera AI Institute</h2></header>'
        f'<div class="sp2-branch">{praxtera_proofs}</div><div class="sp2-group__members">'
        f'{eagles}{jacobson}{hp}{morgan}{pbs}{sonova}</div></section>')

    # Carnegie Mellon: the face carries the approved title; the card follows the course from redesign to the fall 2013 class.
    cmu_t = 'site:talks[3]'
    cmu = member('cmu', 'Carnegie Mellon University',
        '<ol class="sp2-sessions">' + session('cmu-teaching', f'{cmu_t}.sessions[0].displayTitle', f'{cmu_t}.date') + '</ol>' +
        '<div class="sp2-member__proofs" data-covers-fact="resume:cmu-teaching:10:b0">' +
        proof('cmu-brief', 'cmu-teaching',
              atom(f'{cmu_t}.title', 'h4') + atom(f'{cmu_t}.subtitle', cls='sp2-course') +
              atom(f'{cmu_t}.lead') + atom(f'{cmu_t}.context')) +
        proof('cmu-redesign', 'cmu-teaching',
              atom(f'{cmu_t}.parts[0].title', 'h4') + atom('site:careerLedger[2].bullets[1]')) +
        proof('cmu-exercises', 'cmu-teaching',
              atom(f'{cmu_t}.parts[1].title', 'h4') + atom('site:careerLedger[2].bullets[2]') + atom('site:careerLedger[2].bullets[3]')) +
        proof('cmu-exercises-apps', 'cmu-teaching', atom('site:careerLedger[2].bullets[4]'), 'sp2-proof--cont') +
        proof('cmu-platform', 'cmu-teaching',
              atom(f'{cmu_t}.parts[2].title', 'h4') + atom('site:careerLedger[2].bullets[0]') +
              ''.join(atom(f'{cmu_t}.parts[2].paras[{k}]') for k in range(2))) +
        # Keeps the id cmu-accepted: verify-speaking.mjs reads its third atom, the 105+ sentence.
        proof('cmu-accepted', 'cmu-teaching',
              atom('site:careerLedger[2].label', 'h4') + atom(f'{cmu_t}.parts[3].paras[0]') +
              atom('head:pinned.career.ts.careerById.cmu-teaching.bullets[1]')) +
        proof('cmu-credit', 'cmu-teaching', atom(f'{cmu_t}.credit')) +
        '</div>', 'cmu', 'cmu-teaching')

    # Atos: the face carries the approved title; the card opens with the talk title and the sheet's title as its course line,
    # then the accepted summary, then his four closing lines as the sections. Paragraphs past the second go on a continuation screen.
    atos_summary = words.sentences(BY_ID['site:talks[2].summary']['text'])
    atos_intro, atos_graphs = atos_summary[0].split(', then where graphs go next:', 1)
    atos_fragments = [atos_intro + ',', 'then where graphs go next:' + atos_graphs, atos_summary[1]]
    def atos_part(i, part):
        paras = [atom(f'site:talks[2].parts[{i}].paras[{k}]') for k in range(len(part['paras']))]
        return (proof(f'atos-part-{i}', 'atos', atom(f'site:talks[2].parts[{i}].title', 'h4') + ''.join(paras[:2])) +
                (proof(f'atos-part-{i}-more', 'atos', ''.join(paras[2:]), 'sp2-proof--cont') if len(paras) > 2 else ''))
    atos = member('atos', BY_ID['site:talks[2].org']['text'],
        '<ol class="sp2-sessions">' + session('atos', 'site:talks[2].sessions[0].displayTitle', 'sheet:atos:0:date') + '</ol>' +
        '<div class="sp2-member__proofs">' +
        proof('atos-brief', 'atos', atom('site:talks[2].title', 'h4') + atom('sheet:atos:0:title', cls='sp2-course') +
              atom('resume:atos:9:b0') + atom('site:talks[2].context')) +
        proof('atos-talk', 'atos', fact_fragments('site:talks[2].summary', atos_fragments)) +
        ''.join(atos_part(i, part) for i, part in enumerate(B.D['talks'][2]['parts'])) +
        proof('atos-deck', 'atos',
            '<figure class="sp2-deck">'
            '<img src="/public/assets/atos-demo-poster.webp" width="1280" height="720" loading="eager" '
            'alt="Demo from the Atos talk: a local model running in the Ollama desktop app on a Mac, ready for a first message">'
            '<figcaption data-atom><a href="/public/talks/knowledge-graphs/index.html">Open the deck</a></figcaption></figure>') +
        proof('atos-credit', 'atos', atom('site:talks[2].credit')) + '</div>', 'atos')

    independent = (f'<section class="sp2-group sp2-group--independent" id="independent-speaking-teaching" '
        f'data-authority-group="independent-speaking-teaching" aria-labelledby="sp2-independent-h">'
        f'<header class="sp2-group__head"><h2 id="sp2-independent-h">Independent Speaking &amp; Teaching</h2></header>'
        f'<div class="sp2-group__members">{cmu}{atos}</div></section>')

    # Speaking topics: every talk once, grouped by the buyer's need. main.js turns the groups into one sentence,
    # "I need my [audience] to [need].", and lifts the best match forward; without script the grouped list stands.
    held = {r['id']: i for i, r in enumerate(B.D['speakingTopics'])}
    menu = {r['id']: i for i, r in enumerate(B.D['topicMenu'])}
    aud = {r['id']: r['aud'] for r in B.D['topicAudiences']}

    def talk(tid, rank):
        if tid in held:
            fid, rec = f'site:speakingTopics[{held[tid]}]', B.D['speakingTopics'][held[tid]]
        else:
            fid, rec = f'site:topicMenu[{menu[tid]}]', B.D['topicMenu'][menu[tid]]
        anchor = html.escape(tid, quote=True)
        body = (atom(fid + '.title', 'h4', 'ts__title') + atom(fid + '.promise', cls='ts__promise') +
                (atom(fid + '.proof', cls='ts__proof') if 'proof' in rec else ''))
        attrs = f'data-talk="{anchor}" data-aud="{" ".join(aud[tid])}" data-rank="{rank}"'
        if tid in held:
            return proof(f'topic-{held[tid] + 1}', 'talks', body, cls='ts__talk', content_unit=f'speakingTopics/{tid}').replace(
                '<div class="sp2-proof ts__talk"', f'<article class="sp2-proof ts__talk" {attrs}', 1)[:-6] + '</article>'
        return f'<article class="ts__talk" data-content-unit="topicMenu/{anchor}" {attrs}>{body}</article>'

    groups = ''.join(
        f'<section class="ts__group" data-need="{n["id"]}" data-content-unit="topicNeeds/{n["id"]}">'
        f'{atom(f"site:topicNeeds[{i}].text", "h3", "ts__need")}'
        f'<div class="ts__list">{"".join(talk(t["id"], k) for k, t in enumerate(n["topics"]))}</div></section>'
        for i, n in enumerate(B.D['topicNeeds']))
    topics = (f'<section class="sp2-topics" id="talks" aria-labelledby="sp2-topics-h"><h2 id="sp2-topics-h">Speaking topics</h2>'
              f'<div class="ts" data-ts><div class="ts__groups">{groups}</div></div></section>')

    fee = (f'<section class="sp2-booking" id="fee" aria-labelledby="sp2-fee-h"><h2 id="sp2-fee-h">Keynote</h2>'
           f'<a class="btn sp2-booking__link" data-line="orange" href="mailto:sairambkrishnan@gmail.com?subject=Keynote">Book a talk</a></section>')
    main = f'<section class="sp2" data-line="orange" aria-labelledby="sp2-h"><header class="sp2-hero"><h1 id="sp2-h">Speaking</h1></header>{praxtera}{independent}{topics}{fee}</section>'
    return B.page('speaking', 'speaking', 'Speaking, Sairam Krishnan', 'Keynote for the Philadelphia Eagles, executive AI education for HP, Morgan Lewis, PBS, Sonova and Jacobson Strategic, and the Atos knowledge-graph talk.', main)

# ---------------------------------------------------------------- Research
def research(B):
    records = {record['slug']: record for record in B.D['research']}
    specs = {
        'drone-megaddon': {
            'index': 0,
            'unit': 'drone-megaddon',
            'authority': 'research-drone-megaddon-2014',
            'stable': 'doi:10.31224/6924',
            'built': 'built-prototype',
            'status_id': 'authority:research-drone-megaddon-2014:status',
            'snapshot': 'bc69cd3c667249c9f0328af476063c647239bde83a8d35c9b7448032cc96a2a8',
        },
        'drone-megaddon-2026': {
            'index': 1,
            'unit': 'drone-megaddon-2026',
            'authority': 'research-drone-megaddon-2026',
            'stable': 'doi:10.31224/6987',
            'built': 'proposal',
            'status_id': 'authority:research-drone-megaddon-2026:status',
            'snapshot': 'f8c82936c83e08afcc1f7e523a203074c3f056f32084482d41b1eefc1f14ece5',
        },
        'who-trains-the-next-senior': {
            'index': 2,
            'unit': 'who-trains',
            'authority': 'research-who-trains',
            'stable': 'doi:10.2139/ssrn.7083078',
            'built': 'working-paper',
            'status_id': 'authority:research-who-trains:status',
            'snapshot': '7d6ea3c163b69c427f434e2f1d90c78b56e4c32527c71b320399ef4fd5b481d1',
        },
        'ai-roi': {
            'index': 3,
            'unit': 'ai-roi',
            'authority': 'research-ai-roi',
            'stable': 'doi:10.2139/ssrn.6732598',
            'built': 'working-paper',
            'status_id': 'authority:research-ai-roi:status',
            'snapshot': '0001596f0b910cd7b9eaee670dcdb6294f02f25d2b573c7accaf90649d9750d0',
        },
    }

    def fact(fid, tag='span', cls='', attrs=''):
        item = BY_ID[fid]
        PLACER.take(item)
        klass = f' class="{cls}"' if cls else ''
        extra = f' {attrs}' if attrs else ''
        return f'<{tag}{klass}{extra} data-fact-id="{html.escape(fid, quote=True)}">{e(item["text"])}</{tag}>'

    def marked(text, phrases):
        rendered = e(text)
        for phrase in phrases:
            escaped = e(phrase)
            if escaped not in rendered:
                raise ValueError(f'Research qualifier is not present in governed copy: {phrase}')
            rendered = rendered.replace(escaped, f'<span data-research-qualifier>{escaped}</span>', 1)
        return rendered

    def summary(slug, qualifiers=()):
        fid = f'site:research[{specs[slug]["index"]}].summary'
        item = BY_ID[fid]
        PLACER.take(item)
        parts = words.sentences(item['text'])
        if ' '.join(parts) != item['text']:
            raise ValueError(f'Research summary fragments do not reproduce {fid}')
        body = ''.join(
            f'<p data-research-summary-fragment data-fact-id="{html.escape(fid, quote=True)}">{marked(part, [q for q in qualifiers if q in part])}</p>'
            for part in parts
        )
        return f'<div class="rs-summary" data-research-summary>{body}</div>'

    def excerpt(fid, text, qualifiers=()):
        item = BY_ID[fid]
        if text not in item['text']:
            raise ValueError(f'Research excerpt does not occur in {fid}')
        PLACER.take(item)
        return (f'<p data-research-evidence-atom data-fact-id="{html.escape(fid, quote=True)}">'
                f'{marked(text, qualifiers)}</p>')

    def head(slug):
        spec, record = specs[slug], records[slug]
        index = spec['index']
        subtitle = ''
        if record.get('subtitle'):
            subtitle = fact(f'site:research[{index}].subtitle', 'p', 'rs-subtitle', 'data-research-subtitle')
        doi = record['href'].replace('https://doi.org/', '')
        title_id = f'site:research[{index}].title'
        authors_id = f'site:research[{index}].authors'
        title_attrs = f'id="rs-{slug}-title" data-research-title'
        return (
            f'<header class="rs-head">'
            f'{fact(title_id, "h2", "rs-title", title_attrs)}'
            f'{subtitle}'
            f'<p class="rs-byline">{fact(authors_id, attrs="data-research-authors")}</p>'
            f'<p class="rs-status" data-research-status>{fact(spec["status_id"])}</p>'
            f'<a class="rs-doi" data-research-doi href="{html.escape(record["href"], quote=True)}">{e(doi)}</a>'
            f'</header>'
        )

    def article(slug, figure, evidence, qualifiers=()):
        spec, record = specs[slug], records[slug]
        attributes = (
            f'id="{slug}" aria-labelledby="rs-{slug}-title" data-line="purple" '
            f'data-research-record data-research-authority-claim="{spec["authority"]}" '
            f'data-research-unit="{spec["unit"]}" data-research-stable-id="{spec["stable"]}" '
            f'data-research-claim-id="{html.escape(record["claim"]["id"], quote=True)}" '
            f'data-research-built-status="{spec["built"]}"'
        )
        return (
            f'<article class="research-record" {attributes}>'
            f'{head(slug)}{figure}'
            f'<div class="rs-reading">{summary(slug, qualifiers)}'
            f'<div class="rs-evidence" data-research-evidence>{evidence}</div></div>'
            f'</article>'
        )

    alt_2014 = html.escape(
        'Architecture diagram showing the Android RTS interface sending $RAD commands over serial and ZigBee through '
        'Firefly nodes to Drone-RK, with Piksi GPS connected by UART.',
        quote=True,
    )
    figure_2014 = (
        '<figure class="rs-figure rs-figure--native" data-research-figure data-figure-kind="native-pdf-crop" '
        'data-research-figure-id="research-drone-2014" data-research-owner="drone-megaddon" '
        f'data-source-snapshot-sha256="{specs["drone-megaddon"]["snapshot"]}">'
        '<a data-research-source-pdf href="/public/assets/research/drone-megaddon-2014.pdf">'
        '<img data-research-native-figure src="/public/assets/research/drone-megaddon-2014-architecture.png" '
        f'width="500" height="460" loading="eager" alt="{alt_2014}"></a>'
        f'{fact("approved:0", "figcaption")}</figure>'
    )
    evidence_2014 = excerpt(
        'resume:research:drone-megaddon',
        'Built an end-to-end Android, Zigbee radio, and embedded-control prototype using a real-time strategy interface.',
    )

    alt_2026 = html.escape(
        'An operator utterance enters the intent translator. Referring expressions route through the perception grounder, '
        'while multi-drone commands route through the coordination planner. The resulting $RAD messages enter the 2014 '
        'command queue, cross the ACK’d radio layer, and reach the drone commercial platform. Human inspection gates every '
        'AI-to-$RAD boundary.',
        quote=True,
    )
    figure_2026 = (
        '<figure class="rs-figure rs-figure--native rs-figure--portrait" data-research-figure data-figure-kind="native-pdf-crop" '
        'data-research-figure-id="research-drone-2026" data-research-owner="drone-megaddon-2026" '
        f'data-source-snapshot-sha256="{specs["drone-megaddon-2026"]["snapshot"]}">'
        '<a data-research-source-pdf href="/public/assets/research/drone-megaddon-2026.pdf">'
        '<img data-research-native-figure src="/public/assets/research/drone-megaddon-2026-language-vision-architecture.png" '
        f'width="536" height="790" loading="lazy" alt="{alt_2026}"></a>'
        f'{fact("approved:1", "figcaption")}</figure>'
    )
    evidence_2026 = excerpt(
        'resume:research:drone-megaddon-2026',
        'Proposes language-intent, visual-grounding, and multi-drone coordination layers with operator inspection gates, audit logs, and manual-control fallback under degraded connectivity.',
    ) + excerpt(
        'resume:research:drone-megaddon-2026',
        'Illustrated through a search-and-rescue scenario.',
    )

    who_nodes = [
        ('code-abundant', 'AI makes code abundant'),
        ('verification-judgment-scarce', 'verification and judgment remain scarce'),
        ('smaller-reviewable-units', 'Smaller reviewable units'),
        ('scrutiny-by-consequence', 'Scrutiny matched to consequence'),
        ('evidence-backed-gates', 'Evidence-backed gates'),
        ('outcome-based-metrics', 'Outcome-based metrics'),
    ]
    who_concept_markup = ''.join(
        f'<div class="rs-who__node rs-who__node--{node_id}" data-diagram-node="{node_id}">{e(label)}</div>'
        for node_id, label in who_nodes[:2]
    )
    who_move_markup = ''.join(
        f'<div class="rs-who__node rs-who__node--{node_id}" data-diagram-node="{node_id}">{e(label)}</div>'
        for node_id, label in who_nodes[2:]
    )
    figure_who = (
        '<figure class="rs-figure rs-figure--text" data-research-figure data-figure-kind="text-derived-diagram" '
        'data-research-figure-id="research-who-trains" data-research-owner="who-trains" '
        f'data-source-snapshot-sha256="{specs["who-trains-the-next-senior"]["snapshot"]}">'
        f'<div class="rs-who">{who_concept_markup}<div class="rs-who__move-group" '
        f'data-diagram-group="management-moves"><p class="rs-who__moves" data-diagram-group-label>'
        f'Four management moves</p>{who_move_markup}</div></div>'
        f'{fact("approved:2", "figcaption")}</figure>'
    )
    evidence_who = excerpt(
        'resume:research:who-trains',
        'Examines "review theater": approvals that no longer meaningfully verify AI-generated work.',
    ) + excerpt(
        'resume:research:who-trains',
        'Proposes smaller reviewable changes, scrutiny matched to consequence, deliberate apprenticeship, and measurement of verified outcomes rather than code volume.',
    ) + '<p data-research-qualifier>The analysis is correlational rather than causal.</p>'

    ai_nodes = [
        ('scale', 'SCALE strategic readiness assessment'),
        ('roic', 'ROIC decomposition through a value driver tree'),
        ('stage-gate', 'stage-gate phased investment'),
        ('scorecard', 'synthesized decision scorecard'),
    ]
    ai_edges = [('scale', 'roic'), ('roic', 'stage-gate'), ('stage-gate', 'scorecard')]
    ai_node_markup = ''.join(
        f'<li data-diagram-node="{node_id}"><span>{e(label)}</span></li>' for node_id, label in ai_nodes
    )
    ai_edge_markup = ''.join(
        f'<i data-diagram-edge data-edge-from="{source}" data-edge-to="{target}" aria-hidden="true"></i>'
        for source, target in ai_edges
    )
    figure_ai = (
        '<figure class="rs-figure rs-figure--text" data-research-figure data-figure-kind="source-markdown-diagram" '
        'data-research-figure-id="research-ai-roi" data-research-owner="ai-roi" '
        f'data-source-snapshot-sha256="{specs["ai-roi"]["snapshot"]}">'
        f'<div class="rs-layers"><ol>{ai_node_markup}</ol>{ai_edge_markup}</div>{fact("approved:3", "figcaption")}</figure>'
    )
    evidence_ai = excerpt(
        'resume:research:ai-roi',
        'Integrates readiness, ROIC value drivers, staged investment, and a decision scorecard with eight categories of AI risk, including vendor dependency and organizational friction.',
    ) + excerpt(
        'resume:research:ai-roi',
        'Eight illustrative public-company cases examine inference costs and organizational readiness.',
        ('Eight illustrative public-company cases',),
    ) + excerpt(
        'resume:research:ai-roi',
        'Wharton independent study; faculty sponsor Professor Gad Allon.',
    )

    papers = ''.join([
        article('drone-megaddon', figure_2014, evidence_2014),
        article(
            'drone-megaddon-2026', figure_2026, evidence_2026,
            ('illustrative search-and-rescue trace', 'no quantitative results from a deployed 2026 system'),
        ),
        article('who-trains-the-next-senior', figure_who, evidence_who, ('single organization',)),
        article(
            'ai-roi', figure_ai, evidence_ai,
            ('eight illustrative public-company cases', 'illustrative validation, not empirical validation', 'Professor Gad Allon'),
        ),
    ])
    main = (f'<section class="research" aria-labelledby="research-h"><div class="rs-hero"><h1 id="research-h">Research</h1></div>'
            f'<div class="research-collection" data-research-collection>{papers}</div></section>')
    return B.page('research', 'research', 'Research, Sairam Krishnan', 'Four papers: Drone-Megaddon 2014 and 2026, Who Trains the Next Senior?, and a multi-layer framework for the ROI of AI projects.', main)

# ---------------------------------------------------------------- Projects
def projects(B):
    V = B.D['ventures']
    names = {v['slug']: name(v['slug']) for v in V}
    index = ''.join(
        f'<li><a href="#{v["slug"]}"><i aria-hidden="true"></i><span>{names[v["slug"]]}</span></a></li>'
        for v in V
    )

    def system_figure(unit):
        if unit == 'persuaider':
            nodes = [
                ('private-objectives', 'input', 'Role-conditioned agents with private objectives'),
                ('simulations', 'input', 'stateful AI-versus-AI simulations'),
                ('extraction', 'extract', 'LLM deal extraction'),
                ('utility', 'output', 'deterministic utility, walk-away, and value-left-on-the-table calculations'),
                ('coaching', 'output', 'configurable weighted coaching rubrics'),
            ]
            edges = [
                ('private-objectives-to-extraction', 'private-objectives', 'extraction', 250, 170, 445, 265),
                ('simulations-to-extraction', 'simulations', 'extraction', 750, 170, 555, 265),
                ('extraction-to-utility', 'extraction', 'utility', 445, 335, 250, 415),
                ('extraction-to-coaching', 'extraction', 'coaching', 555, 335, 750, 415),
            ]
            edge_markup = ''.join(
                f'<line data-graph-edge data-edge-id="{edge_id}" data-source="{source}" data-target="{target}" '
                f'x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" marker-end="url(#persuaider-arrow)"></line>'
                for edge_id, source, target, x1, y1, x2, y2 in edges
            )
            node_markup = ''.join(
                f'<span class="pj-system__term pj-system__term--{node_id}" id="persuaider-node-{node_id}" '
                f'data-graph-node data-node-id="{node_id}" data-node-role="{role}">{B.t(label)}</span>'
                for node_id, role, label in nodes
            )
            return ('<div class="pj-system pj-system--persuaider">'
                    '<svg class="pj-system__edges" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true" focusable="false">'
                    '<defs><marker id="persuaider-arrow" viewBox="0 0 24 24" markerWidth="24" markerHeight="24" refX="21" refY="12" orient="auto" markerUnits="userSpaceOnUse">'
                    '<path d="M0 0 L24 12 L0 24 Z"></path></marker></defs>' + edge_markup + '</svg>' + node_markup + '</div>')
        if unit == 'lore':
            return ('<div class="pj-system pj-system--lore">'
                    '<span class="pj-system__term pj-system__term--1">a dependency change</span>'
                    '<span class="pj-system__term pj-system__term--2">the organization-wide blast radius</span></div>')
        if unit == 'crucible':
            return ('<div class="pj-system pj-system--crucible">'
                    '<span class="pj-system__term pj-system__term--1">model judgment</span>'
                    '<span class="pj-system__term pj-system__term--2">Structured agent reports</span>'
                    '<span class="pj-system__term pj-system__term--3">the code that checks evidence structure</span>'
                    '<span class="pj-system__term pj-system__term--4">claim-level evidence checks</span>'
                    '<span class="pj-system__term pj-system__term--5">controls when work can proceed</span></div>')
        return ''

    ventures = ''
    for v in V:
        u = v['slug']
        imgs = []
        if u == 'ondoway':
            imgs.append('<figure class="pf__phone"><img src="/public/assets/ondoway-journey-wireframe.png" width="392" height="813" loading="lazy" alt="A travel companion that adapts as you walk."></figure>')
        if u in ('persuaider', 'lore', 'crucible'):
            imgs.append(system_figure(u))
        thesis = show(u, 'thesis', source='site', tag='p', cls='pf__thesis', visible=B.t)
        ventures += (f'<article class="pj-venture pj-venture--{u}" id="{u}" data-line="green" '
                     f'aria-labelledby="pj-{u}-h"><div class="pj-venture__head">'
                     f'<h2 class="pj-venture__name" id="pj-{u}-h">{names[u]}</h2>{thesis}</div>'
                     f'{train(u, images=imgs, open_class="pj", heading_tag="h3", visible=B.t)}</article>\n')
    main = (f'<section class="pj" data-line="green" aria-labelledby="pj-h">'
            f'<div class="pj-hero"><h1 id="pj-h">Projects</h1>'
            f'<nav class="pj-index" aria-label="Ventures"><ol>{index}</ol></nav></div>'
            f'<div class="pj-atlas">{ventures}</div></section>')
    return B.page('projects', 'projects', 'Projects, Sairam Krishnan', 'Five ventures: Ondoway, Persuaider, Gestiq, Lore / DependIQ, and Crucible.', main)

# ---------------------------------------------------------------- Services
def services(B):
    S = B.D['services']
    groups = B.D['groups']
    line = {'eng': 'blue', 'exec': 'orange', 'stay': 'red'}
    names = {s['id']: name(s['id']) for s in S}
    routes = ''
    for i, group in enumerate(groups):
        gid = group['id']
        offers = [s for s in S if s['group'] == gid]
        title = take_fact(f'site:groups[{i}].title')
        links = ''.join(
            f'<li><a href="#{s["id"]}"><span>{names[s["id"]]}</span></a></li>'
            for s in offers
        )
        routes += (f'<section class="svc2-route" data-line="{line[gid]}">'
                   f'<h2 id="svc2-route-{gid}" class="svc2-route__name">{title}</h2>'
                   f'<ol class="svc2-route__offers" style="--count:{len(offers)}">{links}</ol></section>')
    last = {group['id']: [s for s in S if s['group'] == group['id']][-1]['id'] for group in groups}
    atlas = ''.join(
        f'<article class="svc2-offer svc2-offer--{s["group"]}{" svc2-offer--has-next" if s["id"] != last[s["group"]] else ""}" '
        f'id="{s["id"]}" data-line="{line[s["group"]]}" aria-labelledby="svc2-offer-{s["id"]}">'
        f'<h3 class="svc2-offer__name" id="svc2-offer-{s["id"]}">{names[s["id"]]}</h3>'
        f'{train(s["id"], open_layout=True)}</article>'
        for s in S
    )
    main = (f'<section class="svc2" aria-labelledby="svc2-h">'
            f'<div class="svc2-hero" id="offers"><h1 id="svc2-h">Services</h1>'
            f'<nav class="svc2-map" aria-label="Services">{routes}</nav>'
            f'<p class="svc2-book" id="book"><a class="btn" data-line="blue" href="mailto:sairambkrishnan@gmail.com?subject=Fit%20Call">Book a free Fit Call</a></p></div>'
            f'<div class="svc2-atlas">{atlas}</div></section>')
    return B.page('services', 'services', 'Services, Sairam Krishnan', 'Advisory for engineering leaders and executives: a free Fit Call, design reviews, AI ROI reviews, keynotes and masterclasses, an advisory retainer, and Fractional CTO.', main)

# ---------------------------------------------------------------- Contact
def contact(B):
    main = ('<section class="contact" id="contact" aria-labelledby="contact-h"><div class="pagehead"><h1 id="contact-h">Contact</h1></div>'
            '<div class="ic"><!--gen:map-x--><!--/gen:map-x--><!--gen:map-xm--><!--/gen:map-xm--></div>'
            '<p class="contact__book"><a class="btn" data-line="blue" href="mailto:sairambkrishnan@gmail.com?subject=Fit%20Call">Book a free Fit Call</a></p></section>')
    return B.page('contact', 'contact', 'Contact, Sairam Krishnan', 'Email, LinkedIn, phone, and résumé for Sairam Krishnan, and how to book a free Fit Call.', main)

BUILDERS = {'career': career, 'speaking': speaking, 'research': research, 'projects': projects, 'services': services, 'contact': contact}

# ---------------------------------------------------------------- images that belong to units
def figures(D):
    out = {}
    for x in D['careerLedger']:
        u = {'cmu-capstone': 'cmu'}.get(x['id'], x['id'])
        for fg in x.get('figures') or []:
            cap = ''.join(f'<span>{e(fg[k])}</span>' for k in ('title', 'detail', 'date') if fg.get(k))
            out.setdefault(u, []).append(f'<figure class="fig"><a href="/public{fg["href"]}"><img src="/public{fg["img"]}" width="{fg["width"]}" height="{fg["height"]}" loading="lazy" alt="{html.escape(fg["alt"])}"></a><figcaption>{cap}</figcaption></figure>')
    return out
