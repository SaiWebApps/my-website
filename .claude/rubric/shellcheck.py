"""Which files a shell command writes to. Used by both hooks. No regular expressions: the command is split into words
the way the shell does (shlex), heredoc bodies are set aside, and inline Python is read as Python (ast).

write_targets(cmd) -> list of (path, cwd) for every file the command would write, where cwd is the directory a
preceding `cd` moved to (or None).
"""
import ast, shlex

SEPARATORS = {';', '&&', '||', '|', '&', '\n'}
WRITERS_LAST = {'cp', 'mv', 'ln', 'install', 'rsync'}
WRITERS_ALL = {'tee', 'rm', 'touch', 'truncate', 'rmdir', 'unlink'}

def strip_heredocs(cmd):
    """Drop heredoc bodies (they are data, not commands); keep the line that opens each one."""
    out, lines, i = [], cmd.split('\n'), 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        if '<<' in line:
            after = line.split('<<', 1)[1].lstrip('-').strip()
            delim = after.split()[0].strip('\'"') if after.split() else ''
            if delim:
                i += 1
                while i < len(lines) and lines[i].strip() != delim:
                    i += 1
        i += 1
    return '\n'.join(out)

UNKNOWN = '<a path the command computes>'

def python_writes(code):
    """open(path, 'w'|'a'|'x'...), Path(path).write_text/write_bytes, os.replace/rename and shutil copies.
    A path held in a variable is followed back to the string it was set to; a path that cannot be followed is
    UNKNOWN, which the gates treat as a site write (a write nobody can see is not let through)."""
    found = []
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return found
    names = {}
    for n in ast.walk(tree):
        if isinstance(n, ast.Assign) and isinstance(n.value, ast.Constant) and isinstance(n.value.value, str):
            for t in n.targets:
                if isinstance(t, ast.Name):
                    names.setdefault(t.id, []).append(n.value.value)
        if isinstance(n, ast.For) and isinstance(n.target, ast.Name) and isinstance(n.iter, (ast.List, ast.Tuple)):
            for x in n.iter.elts:
                if isinstance(x, ast.Constant) and isinstance(x.value, str):
                    names.setdefault(n.target.id, []).append(x.value)
    def paths(node):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            return [node.value]
        if isinstance(node, ast.Name) and node.id in names:
            return names[node.id]
        return [UNKNOWN]
    for n in ast.walk(tree):
        if not isinstance(n, ast.Call):
            continue
        f = n.func
        if isinstance(f, ast.Name) and f.id == 'open' and n.args:
            mode = n.args[1].value if len(n.args) > 1 and isinstance(n.args[1], ast.Constant) else next((k.value.value for k in n.keywords if k.arg == 'mode' and isinstance(k.value, ast.Constant)), 'r')
            if any(ch in str(mode) for ch in 'wax+'):
                found += paths(n.args[0])
        if isinstance(f, ast.Attribute) and f.attr in ('write_text', 'write_bytes', 'touch', 'unlink'):
            found += paths(f.value.args[0]) if isinstance(f.value, ast.Call) and f.value.args else [UNKNOWN]
        if isinstance(f, ast.Attribute) and f.attr in ('replace', 'rename', 'remove', 'unlink', 'copy', 'copyfile', 'copy2', 'move', 'rmtree') \
                and isinstance(f.value, ast.Name) and f.value.id in ('os', 'shutil') and n.args:
            found += paths(n.args[-1] if f.attr not in ('remove', 'unlink', 'rmtree') else n.args[0])
    return found

def heredoc_bodies(cmd):
    """The text of every heredoc in the command, in order."""
    bodies, lines, i = [], cmd.split('\n'), 0
    while i < len(lines):
        line = lines[i]
        if '<<' in line and '<<<' not in line:
            after = line.split('<<', 1)[1].lstrip('-').strip()
            delim = after.split()[0].strip('\'"') if after.split() else ''
            if delim:
                i += 1
                body = []
                while i < len(lines) and lines[i].strip() != delim:
                    body.append(lines[i]); i += 1
                bodies.append('\n'.join(body))
        i += 1
    return bodies

def js_writes(code):
    """writeFileSync('path' ...) / writeFile('path' ...) / appendFileSync with a literal path."""
    found = []
    for name in ('writeFileSync(', 'writeFile(', 'appendFileSync(', 'appendFile('):
        start = code.find(name)
        while start >= 0:
            rest = code[start + len(name):].lstrip()
            if rest[:1] in ('"', "'", '`'):
                q = rest[0]
                end = rest.find(q, 1)
                if end > 0:
                    found.append(rest[1:end])
            start = code.find(name, start + 1)
    return found

def unquoted_newlines_to_semicolons(s):
    """A newline outside quotes ends a command, like ';'."""
    out, q, esc = [], None, False
    for ch in s:
        if esc:
            out.append(ch); esc = False; continue
        if ch == '\\' and q != "'":
            out.append(ch); esc = True; continue
        if q:
            if ch == q:
                q = None
            out.append(ch); continue
        if ch in ('"', "'"):
            q = ch; out.append(ch); continue
        out.append(' ; ' if ch == '\n' else ch)
    return ''.join(out)

def commands(cmd):
    """Split a command line into simple commands (lists of words), with redirect targets attached."""
    body = unquoted_newlines_to_semicolons(strip_heredocs(cmd))
    lex = shlex.shlex(body, posix=True, punctuation_chars=';&|<>')
    lex.whitespace_split = True
    out, cur, redirs = [], [], []
    try:
        toks = list(lex)
    except ValueError:
        toks = body.split()
    i = 0
    while i < len(toks):
        t = toks[i]
        if t and set(t) <= set(';&|'):
            if cur or redirs:
                out.append((cur, redirs))
            cur, redirs = [], []
            i += 1
            continue
        if t in ('>', '>>', '>|', '&>', '>&'):
            nxt = toks[i + 1] if i + 1 < len(toks) else ''
            # 2>&1 and >&- copy or close a descriptor; only a word that is not a number names a file.
            dup = t == '>&' and (nxt.isdigit() or nxt == '-')
            if nxt and not nxt.startswith('&') and not dup:
                redirs.append(nxt)
            i += 2
            continue
        if t in ('<', '<<', '<<<'):
            i += 2
            continue
        cur.append(t)
        i += 1
    if cur or redirs:
        out.append((cur, redirs))
    # A bare number right before a redirect (2>file) is the file descriptor, not an argument.
    return [([w for w in c if not (w.isdigit() and len(w) == 1)], r) for c, r in out]

def write_targets(cmd):
    targets, cwd = [], None
    bodies = heredoc_bodies(cmd)
    for words, redirs in commands(cmd):
        for r in redirs:
            targets.append((r, cwd))
        if not words:
            continue
        prog = words[0].split('/')[-1]
        args = [w for w in words[1:] if not w.startswith('-')]
        if prog == 'cd' and args:
            cwd = args[0]
        elif prog in WRITERS_LAST and args:
            targets.append((args[-1], cwd))
        elif prog in WRITERS_ALL:
            targets += [(a, cwd) for a in args]
        elif prog == 'sed' and any(w.startswith('-i') for w in words[1:]) and args:
            targets.append((args[-1], cwd))
        elif prog in ('perl', 'ruby') and any(w.startswith('-i') or w == '-pi' for w in words[1:]) and args:
            targets.append((args[-1], cwd))
        elif prog.startswith('python') and '-c' in words:
            k = words.index('-c')
            if k + 1 < len(words):
                targets += [(p, cwd) for p in python_writes(words[k + 1])]
        elif prog.startswith('python') and (not args or args[0] == '-'):
            # Python read from a heredoc: read the heredoc as Python.
            for b in bodies:
                targets += [(p, cwd) for p in python_writes(b)]
        elif prog.startswith('python') and args and args[0].endswith('.py') and not any(d in '/' + args[0] for d in ('/_build/', '/.claude/rubric/', '/.claude/hooks/')):
            # A script file: read it as Python too. The builders under _build/ are the sanctioned site writers;
            # the rubric's and hooks' own scripts are themselves held by the rubric gate on every edit.
            import os
            sp = args[0] if args[0].startswith('/') or not cwd else os.path.join(cwd, args[0])
            try:
                targets += [(p, cwd) for p in python_writes(open(sp).read())]
            except OSError:
                pass
        elif prog == 'node' and ('-e' in words or '--eval' in words):
            k = words.index('-e') if '-e' in words else words.index('--eval')
            if k + 1 < len(words):
                targets += [(p, cwd) for p in js_writes(words[k + 1])]
    return [(t, c) for t, c in targets if t not in ('/dev/null', '/dev/stdout', '/dev/stderr')]

SITE = ('site', 'src', 'public')

def is_site(path, cwd, root):
    """True when the path (taken relative to cwd if it is relative) lies under site/, src/ or public/ of the repo."""
    import os
    if path == UNKNOWN:
        return True
    base = root
    if cwd:
        base = cwd if cwd.startswith('/') else os.path.join(root, cwd)
    p = path if path.startswith('/') else os.path.join(base, path)
    rel = os.path.relpath(os.path.abspath(p), root)
    return not rel.startswith('..') and rel.split(os.sep)[0] in SITE
