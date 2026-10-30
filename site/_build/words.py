"""Plain string helpers for the build. No regular expressions."""
import unicodedata

MONTHS = {'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct', 'Nov', 'Dec', 'January', 'February', 'March', 'April',
          'June', 'July', 'August', 'September', 'October', 'November', 'December'}
QUOTES = {'’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-', ' ': ' ', ' ': ' '}
STOP = set('a an the and or of to in on at for by with from as is are was were be been it its this that these those i my me we our you your he his '
           'she her they their them into than then so but not no do does did has have had will would can could should up out over under about '
           'after before while each every all any both more most other some such own same very just also only which who whom whose what when '
           'where why how there here'.split())

def norm(s):
    """Lowercase, typographic quotes and dashes made plain, whitespace collapsed."""
    s = unicodedata.normalize('NFKC', str(s))
    s = ''.join(QUOTES.get(ch, ch) for ch in s)
    s = s.replace('·', ',')  # the build shows "a · b" as "a, b"
    return ' '.join(s.lower().split()).replace(' ,', ',')

def no_dash(s):
    """Apply the visible-text dash contract without escaping or changing any other character."""
    value = str(s)
    out, index = '', 0
    while index < len(value):
        if value[index] == '–':
            right = index + 1
            while right < len(value) and value[right] == ' ':
                right += 1
            if out.rstrip()[-1:].isdigit() and value[right:right + 1].isdigit():
                out, index = out.rstrip() + '-', right
                continue
        out += value[index]
        index += 1
    return out.replace(' – ', ' to ').replace('–', '-').replace('—', ', ')

def tokens(s):
    """Words of a string: letters, digits and the marks that belong to numbers (% + $ . ,) kept together."""
    out, cur = [], []
    for ch in norm(s):
        if ch.isalnum() or (ch in "%+$'" and cur) or (ch in '.,' and cur and cur[-1].isdigit()):
            cur.append(ch)
        elif ch == '$':
            cur.append(ch)
        else:
            if cur:
                out.append(''.join(cur).strip("'.,"))
            cur = []
    if cur:
        out.append(''.join(cur).strip("'.,"))
    return [w for w in out if w]

def content(s):
    """Words that carry meaning: tokens without the common little words."""
    return [w for w in tokens(s) if w not in STOP]

def sentences(s):
    """Split prose into sentences at a full stop, question or exclamation mark followed by a space and a capital or digit."""
    s = ' '.join(str(s).split())
    out, start = [], 0
    for i, ch in enumerate(s):
        if ch in '.?!' and i + 2 < len(s) and s[i + 1] == ' ' and (s[i + 2].isupper() or s[i + 2].isdigit()):
            prev = s[start:i + 1].split()
            if prev and prev[-1] in ('e.g.', 'i.e.', 'U.S.', 'M.S.', 'B.S.', 'Dr.', 'vs.'):
                continue
            out.append(s[start:i + 1].strip()); start = i + 2
    if s[start:].strip():
        out.append(s[start:].strip())
    return out

def count_words(s):
    return len(str(s).split())
