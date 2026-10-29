#!/usr/bin/env python3
"""The rubric's hooks. No regular expressions. Proactive: `pre` stops a mistake before it is written. Reactive: `stop`
refuses to end the turn until the site scores 100% and every past mistake is still caught.

prompt: save his latest message (text and time) to out/last-prompt.json.
pre:    P1 deny edits to the generated pages; P2 deny shell commands that write to the site (judged by what they write,
        read by shellcheck), except the build and check runners; P3 rebuild a scratch copy with the edit applied and
        deny it if the static checks find anything new, including any fact it cuts (B0); P4 the rubric only grows:
        ledger entries and retired facts cannot be dropped silently, approved lines need his words; R0 no edit may add
        a regular expression to a check, hook, build or site script.
stop:   G30 at most one question in my closing message; G32 the changed page was opened after the last change; G34
        score.json is 100% and newer than every change, test.py passed after the last change, the reviewer passed it;
        F28 fresh frames; G38 his latest message is in the review log, and if it corrects something, in the ledger.
"""
import hashlib, json, os, shutil, subprocess, sys, tempfile, time

RUBRIC = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(RUBRIC))
OUTD = os.path.join(RUBRIC, 'out')
TRANSIT = os.path.join(ROOT, 'site')
GENERATED = {f'{p}.html' for p in ('index', 'career', 'speaking', 'research', 'projects', 'services', 'contact')}
sys.path.insert(0, RUBRIC)
import shellcheck

RUNNER_ENDINGS = ('_build/build.py', '_build/maps.mjs', '_build/audit.mjs', 'scripts/shoot.mjs')
HARD = {'B0', 'A3', 'A4', 'A5', 'B10', 'C14', 'F26'}
FULL_RUBRIC = '.claude/rubric/score.py'
FULL_RUBRIC_MARKER = 'The complete rubric is the mandatory work loop for Codex, Claude, and every subagent.'
ROUTED_SCRIPTS = ('build', 'check', 'dev', 'serve', 'preview', 'release')
GOVERNED_FILES = ('AGENTS.md', 'PRODUCT.md', 'package.json', 'package-lock.json', 'requirements.txt', 'vercel.json',
                  '.vercelignore', '.claude/settings.json', '.claude/launch.json')
GOVERNED_DIRS = ('site', 'public', 'scripts', '.claude/agents', '.claude/rubric')

def mtime(p):
    try:
        return os.path.getmtime(p)
    except OSError:
        return 0.0

def governed_files(root=ROOT):
    for name in GOVERNED_FILES:
        path = os.path.join(root, name)
        if os.path.isfile(path):
            yield path
    for name in GOVERNED_DIRS:
        top = os.path.join(root, name)
        if not os.path.isdir(top):
            continue
        for directory, dirs, files in os.walk(top):
            if os.path.abspath(directory) == os.path.abspath(os.path.join(root, '.claude', 'rubric')):
                dirs[:] = [item for item in dirs if item not in ('out', '__pycache__')]
            else:
                dirs[:] = [item for item in dirs if item != '__pycache__']
            for filename in sorted(files):
                path = os.path.join(directory, filename)
                if path == os.path.join(root, '.claude', 'rubric', 'release-lock.json'):
                    continue
                yield path

def governed_hash(root=ROOT):
    digest = hashlib.sha256()
    for path in sorted(governed_files(root)):
        digest.update(os.path.relpath(path, root).encode())
        digest.update(open(path, 'rb').read())
    return digest.hexdigest()

def newest_site_change():
    newest = 0.0
    for path in governed_files():
        newest = max(newest, mtime(path))
    return newest

def full_score_words(words):
    score_at = next((index for index, word in enumerate(words) if word.replace('\\', '/').endswith(FULL_RUBRIC)), -1)
    if score_at < 0:
        return False
    flags = set(words[score_at + 1:])
    return not flags.intersection({'--fast', '--deploy-build', '--deploy-check', '--verify-review'})

def script_runs_full_score(script):
    return any(full_score_words(words) for words, _ in shellcheck.commands(script))

def workflow_bypass(cmd, root=ROOT):
    try:
        scripts = json.load(open(os.path.join(root, 'package.json'))).get('scripts', {})
    except (OSError, json.JSONDecodeError, TypeError):
        scripts = {}
    forbidden = ('site/_build/build.py', '.claude/rubric/build_candidate.py', 'site/_build/audit.mjs',
                 '.claude/rubric/a11y.mjs', '.claude/rubric/shots.mjs', '.claude/rubric/test.py',
                 'scripts/shoot.mjs', 'scripts/serve-dist.mjs')
    for words, _ in shellcheck.commands(cmd):
        if not words:
            continue
        normalized = [word.replace('\\', '/') for word in words]
        if any(word.endswith(FULL_RUBRIC) for word in normalized) and '--fast' in words:
            return 'the partial --fast score cannot replace the complete rubric'
        program = normalized[0].split('/')[-1]
        if program in ('npm', 'pnpm', 'yarn') and 'run' in words:
            at = words.index('run')
            name = words[at + 1] if at + 1 < len(words) else ''
            if name in ROUTED_SCRIPTS and not script_runs_full_score(scripts.get(name, '')):
                return f'the {name} script does not begin with the complete rubric'
            continue
        direct_target = normalized[1] if len(normalized) > 1 and (program.startswith('python') or program == 'node') else ''
        if any(direct_target.endswith(ending) for ending in forbidden):
            return 'direct build, verifier, screenshot, mutation, or server commands bypass the complete rubric'
        if program.startswith('python') and '-m' in words and 'http.server' in words:
            return 'a raw server bypasses the complete rubric; use npm run dev, serve, or preview'
    return None

def rel(p):
    p = os.path.abspath(p if os.path.isabs(p) else os.path.join(ROOT, p))
    return os.path.relpath(p, ROOT)

def project_failures(root=ROOT):
    """P5-P7: one accepted baseline, one control path, and no design detritus."""
    failures = []
    registry_path = os.path.join(root, '.claude', 'rubric', 'registry.json')
    try:
        policy = json.load(open(registry_path))['project']
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as e:
        return [('P5', f'the project authority in registry.json cannot be read: {e}')]

    baseline = policy.get('baseline') or {}
    baseline_id = baseline.get('id')
    baseline_root = baseline.get('root')
    if not baseline_id or baseline_root != 'site':
        failures.append(('P5', f'the accepted baseline must have an ID and live at site/; found {baseline_id!r} at {baseline_root!r}'))
    active = os.path.join(root, baseline_root or '')
    if not baseline_root or not os.path.isdir(active):
        failures.append(('P5', 'the accepted Transit baseline directory is missing'))
    marker_path = os.path.join(root, 'site', '.baseline.json')
    try:
        marker = json.load(open(marker_path))
    except (OSError, json.JSONDecodeError, TypeError) as e:
        marker = {}
        failures.append(('P8', f'site/.baseline.json is missing or unreadable: {e}'))
    if marker.get('id') != baseline_id or marker.get('root') != baseline_root or marker.get('approvedSaid') != baseline.get('said'):
        failures.append(('P8', 'baseline promotion is partial: registry.json and site/.baseline.json do not identify the same accepted design'))

    package_path = os.path.join(root, 'package.json')
    try:
        scripts = json.load(open(package_path)).get('scripts', {})
        build = scripts.get('build', '')
    except (OSError, json.JSONDecodeError, TypeError) as e:
        scripts = {}
        build = ''
        failures.append(('P5', f'package.json cannot identify the active build: {e}'))
    if not script_runs_full_score(build):
        failures.append(('P5', f'the active build does not run the complete rubric: {build!r}'))
    for name in ROUTED_SCRIPTS:
        if not script_runs_full_score(scripts.get(name, '')):
            failures.append(('P6', f'the {name} command bypasses the complete rubric'))
    agents_path = os.path.join(root, 'AGENTS.md')
    try:
        agents = open(agents_path).read()
    except OSError as e:
        agents = ''
        failures.append(('P6', f'AGENTS.md cannot identify the mandatory work loop: {e}'))
    if FULL_RUBRIC_MARKER not in agents or 'python3 .claude/rubric/score.py' not in agents:
        failures.append(('P6', 'AGENTS.md does not make the complete rubric the mandatory work loop'))

    settings_path = os.path.join(root, '.claude', 'settings.json')
    try:
        settings = json.load(open(settings_path))
    except (OSError, json.JSONDecodeError, TypeError) as e:
        settings = {}
        failures.append(('P6', f'.claude/settings.json cannot identify the active controls: {e}'))
    commands = []
    def collect(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key == 'command' and isinstance(item, str):
                    commands.append(item)
                else:
                    collect(item)
        elif isinstance(value, list):
            for item in value:
                collect(item)
    collect(settings.get('hooks', {}))
    for mode in ('prompt', 'pre', 'stop'):
        if not any('rubric_gate.py' in command and command.split()[-1] == mode for command in commands):
            failures.append(('P6', f'the rubric {mode} hook is not active'))
    if any('release-gate.mjs' in command or 'governor_gate.py' in command for command in commands):
        failures.append(('P6', 'a competing release or governor hook is active beside rubric_gate.py'))

    ignore_path = os.path.join(root, '.gitignore')
    try:
        ignored = {line.strip() for line in open(ignore_path) if line.strip() and not line.lstrip().startswith('#')}
    except OSError as error:
        ignored = set()
        failures.append(('P7', f'.gitignore cannot identify generated evidence: {error}'))
    for pattern in ('.claude/rubric/out/', '.claude/rubric/**/out/'):
        if pattern not in ignored:
            failures.append(('P7', f'generated rubric evidence is not ignored by {pattern}'))

    for path in policy.get('forbidden_design_roots', []):
        if os.path.exists(os.path.join(root, path)):
            failures.append(('P7', f'an obsolete design workspace exists: {path}'))
    allowed_top = set(policy.get('allowed_top_level_dirs', []))
    try:
        top_dirs = [name for name in os.listdir(root) if os.path.isdir(os.path.join(root, name))]
    except OSError:
        top_dirs = []
    for name in sorted(top_dirs):
        if name not in allowed_top:
            failures.append(('P7', f'an unapproved top-level directory exists: {name}/'))
    for path in policy.get('forbidden_roots', []):
        if os.path.exists(os.path.join(root, path)):
            failures.append(('P7', f'a scratch or litter path exists: {path}'))
    for path in policy.get('parallel_implementation_paths', []):
        if os.path.exists(os.path.join(root, path)):
            failures.append(('P7', f'a parallel website implementation exists: {path}'))
    for path in policy.get('generated_in_source', []):
        if os.path.exists(os.path.join(root, path)):
            failures.append(('P7', f'generated evidence is stored inside source: {path}'))
    for path in policy.get('competing_control_paths', []):
        if os.path.exists(os.path.join(root, path)):
            failures.append(('P6', f'a competing or obsolete control path exists: {path}'))
    return failures

# ------------------------------------------------------------------ proactive
def apply_edit(text, inp, tool):
    if tool == 'Write':
        return inp.get('content', '')
    for e in inp.get('edits') or [inp]:
        old, new = e.get('old_string', ''), e.get('new_string', '')
        if old not in text:
            return None
        text = text.replace(old, new) if e.get('replace_all') else text.replace(old, new, 1)
    return text

def scratch_copy():
    tmp = tempfile.mkdtemp(prefix='rubric-')
    t = os.path.join(tmp, 'site')
    shutil.copytree(TRANSIT, t, ignore=shutil.ignore_patterns('shots', '.*'))
    controls = os.path.join(tmp, '.claude', 'rubric')
    os.makedirs(controls)
    for name in ('registry.json', 'authority.json'):
        shutil.copy2(os.path.join(RUBRIC, name), os.path.join(controls, name))
    shutil.copytree(os.path.join(RUBRIC, 'facts'), os.path.join(controls, 'facts'),
                    ignore=shutil.ignore_patterns('out', '__pycache__'))
    return tmp, t

def build(tdir):
    env = dict(os.environ); env['RUBRIC_PIPELINE'] = '1'
    r1 = subprocess.run(['python3', os.path.join(tdir, '_build/build.py')], capture_output=True, text=True, timeout=60, env=env)
    r2 = subprocess.run(['node', os.path.join(tdir, '_build/maps.mjs'), 'all'], capture_output=True, text=True, timeout=60)
    return r1.returncode == 0 and r2.returncode == 0, (r1.stderr + r2.stderr)[-600:]

def guard_keys(tdir):
    import guard
    return {f['key']: f for f in guard.Run(tdir).run()}

def simulate(path, inp, tool):
    """Rebuild a scratch copy with the edit applied; return the failures it would add."""
    tmp, t = scratch_copy()
    try:
        ok, _ = build(t)
        base = guard_keys(t) if ok else {}
        target = os.path.join(tmp, rel(path))
        cur = open(target).read() if os.path.exists(target) else ''
        new = apply_edit(cur, inp, tool)
        if new is None:
            return None, 'edit does not apply'
        os.makedirs(os.path.dirname(target), exist_ok=True)
        open(target, 'w').write(new)
        ok2, err2 = build(t)
        if not ok2:
            return [{'check': 'F26', 'page': '-', 'where': rel(path), 'msg': 'the build fails with this edit: ' + err2.strip()[-300:]}], None
        after = guard_keys(t)
        return [after[k] for k in after if k not in base], None
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

def grows(old, new, path):
    """P4: the rubric only grows."""
    try:
        o, n = json.loads(old), json.loads(new)
    except json.JSONDecodeError as e:
        return f'{os.path.basename(path)} would not be valid JSON: {e}'
    b = os.path.basename(path)
    if b == 'ledger.json':
        gone = {e['id'] for e in o['entries']} - {e['id'] for e in n['entries']}
        if gone:
            return f'removes ledger entries {sorted(gone)}: past mistakes stay tested. Only he can retire one.'
    if b == 'approved.json':
        for x in n['lines']:
            if not x.get('said') or not x.get('at'):
                return f'the approved line "{x.get("text")}" has no words of his ("said") and date ("at")'
    if b == 'retired.json':
        for x in n['facts']:
            if not x.get('said') or not x.get('at'):
                return f'the retired fact "{x.get("text")}" has no words of his ("said") and date ("at"): only he retires a fact'
    return None

def adds_regex(path, new):
    """R0 for an edit: would the new file use a regular expression?"""
    if not path.endswith(('.py', '.js', '.mjs')):
        return None
    import noregex
    tmp = tempfile.mkdtemp(prefix='noregex-')
    try:
        p = os.path.join(tmp, os.path.basename(path))
        open(p, 'w').write(new)
        hits = noregex.py_hits(p) if p.endswith('.py') else noregex.js_hits([p]).get(p, [])
        return hits
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

SCORE_FILES = ('.claude/rubric/release-lock.json', '.claude/rubric/out/score.json', '.claude/rubric/out/test.json',
               '.claude/rubric/out/audit.json', '.claude/rubric/out/last-prompt.json', '.claude/rubric/out/visual-manifest.json',
               '.claude/rubric/out/visual-review.json')

def writes_score(path):
    return rel(path) in SCORE_FILES

def pre_decision(tool, inp, agent=None):
    """Returns (check, reason) to deny, or None to allow. `agent` is the subagent's type when a subagent is calling."""
    # G35: the builder never writes its own pass, spec, score or test result: only the governor writes its two files,
    # and only the scripts write theirs.
    if tool in ('Edit', 'Write', 'MultiEdit') and writes_score(inp.get('file_path', '')):
        review = rel(inp.get('file_path', '')) == '.claude/rubric/out/visual-review.json' and agent == 'visual-release-reviewer'
        if not review:
            return 'G35', f'{rel(inp.get("file_path", ""))} is written only by its scoring script or the visual release reviewer, never by the builder.'
    if tool == 'Bash' and any(writes_score(t if t.startswith('/') else os.path.join(c or ROOT, t)) for t, c in shellcheck.write_targets(inp.get('command', ''))):
        return 'G35', 'This command writes release evidence, which only the scoring scripts may write.'
    if tool in ('Edit', 'Write', 'MultiEdit'):
        path = inp.get('file_path', '')
        r = rel(path)
        parts = r.split('/')
        if r.startswith('site/') and len(parts) == 2 and parts[-1] in GENERATED:
            return 'P1', f'{r} is generated by _build/build.py and maps.mjs; a hand edit is lost on the next build. Edit the build source.'
        cur = open(os.path.join(ROOT, r)).read() if os.path.exists(os.path.join(ROOT, r)) else ''
        new = apply_edit(cur, inp, tool)
        if new is None:
            return None  # the Edit tool reports a non-matching edit itself
        in_scope = r.startswith(('.claude/', 'site/_build/', 'scripts/')) or r == 'site/main.js'
        if in_scope:
            # Only what the edit adds counts: a file that still has old regex can be edited while it is being cleaned up.
            was = [(w, t) for w, _, t in (adds_regex(r, cur) or [])] if cur else []
            hits = [h for h in (adds_regex(r, new) or []) if not ((h[0], h[2]) in was and not was.remove((h[0], h[2])))]
            if hits:
                return 'R0', f'{r} would use a regular expression ({hits[0][0]}, line {hits[0][1]}): he banned regex in every check, hook, build and site script. Compare facts, structure or parsed values instead.'
        if r.startswith('.claude/rubric/') and r.endswith('.json'):
            why = grows(cur or '{}', new, r)
            if why:
                return 'P4', why
        if r.startswith('site/_build/') or r == 'site/content.json':
            if r.endswith(('audit.mjs', 'ev.mjs', 'peek.mjs')):
                return None
            added, err = simulate(path, inp, tool)
            if err:
                return None
            # Refused outright: anything this edit cuts, misplaces, invents, sells off Services or brings back after
            # he retired it, and a broken build. Layout failures may swing during a rebuild; the stop check holds them.
            added = [f for f in (added or []) if f['check'] in HARD]
            if added:
                lines = '\n'.join(f"{f['check']} {f['page']} {f['where']}: {f['msg']}" for f in added[:12])
                return 'P3', f'This edit would add {len(added)} rubric failure(s) to the built pages:\n{lines}'
        return None
    if tool == 'Bash':
        cmd = inp.get('command', '')
        bypass = workflow_bypass(cmd)
        if bypass:
            return 'G34', bypass
        for t, c in shellcheck.write_targets(cmd):
            if shellcheck.is_site(t, c, ROOT):
                return 'P2', f'This command writes to the site ({t}) outside the rubric check that runs on Edit and Write. Use Edit or Write on the build sources, then run the build.'
        return None
    return None

# ------------------------------------------------------------------ reactive
def check_message(text):
    """What a script can judge in my closing message: the number of questions. Tone, process talk and answering first
    are judged by the reviewer, who reads the draft."""
    out = []
    body, inside = [], False
    for line in (text or '').split('\n'):
        if line.strip().startswith('```'):
            inside = not inside
            continue
        if not inside:
            body.append(' '.join(w for w in line.split() if not w.startswith(('http://', 'https://'))))
    n = '\n'.join(body).count('?')
    if n > 1:
        out.append(('G30', f'{n} questions in the closing message; at most one, with a recommendation'))
    return out

def review_has(prompt):
    """Is his message in the review log (a line of it quoted exactly)? And is it a correction with no ledger entry?"""
    p = ' '.join(prompt.split())
    rv = os.path.join(RUBRIC, 'review.json')
    entries = json.load(open(rv))['entries'] if os.path.exists(rv) else []
    hits = [e for e in entries if len(e.get('said', '')) >= 8 and ' '.join(e['said'].split()) in p]
    led = json.load(open(os.path.join(RUBRIC, 'ledger.json')))['entries']
    corrections = [e for e in hits if e.get('kind') in ('correction', 'rule', 'unflagged')]
    in_ledger = any(' '.join(l.get('said', '').split()) in p or any(' '.join(e['said'].split()) == ' '.join(l.get('said', '').split()) for e in corrections) for l in led)
    return bool(hits), (not corrections) or in_ledger

def check_turn(st):
    """st: site_changed, opened, score_fresh, score_pct, tests_pass, verdict_fresh, shots_fresh, prompt, reviewed, ledgered."""
    out = []
    if st.get('prompt'):
        if not st.get('reviewed', True):
            out.append(('G38', 'his latest message is not in review.json: log every point in it (his exact words, what it reacted to, kind, class, rule, check)'))
        elif not st.get('ledgered', True):
            out.append(('G38', 'his latest message corrects something and has no ledger entry: add it to ledger.json with his words, a plant and the check that catches it (write the check if none does), then run test.py'))
    if not st.get('site_changed'):
        return out
    if not st.get('opened'):
        out.append(('G32', 'the changed page was not opened in the browser pane after the last change'))
    if not st.get('score_fresh'):
        out.append(('G34', 'out/score.json is older than the last site change: run python3 .claude/rubric/score.py'))
    elif st.get('score_pct', 100) < 100:
        out.append(('G34', f'the site scores {st["score_pct"]}% on the rubric; keep going until 100% (see out/score.json)'))
    if not st.get('shots_fresh', True):
        out.append(('F28', 'no frames of all seven pages at five widths in both themes since the last change: run score.py'))
    if not st.get('tests_pass'):
        out.append(('G34', 'test.py has not passed since the last change: every past mistake must still be caught'))
    if not st.get('verdict_fresh'):
        out.append(('G34', 'the second reviewer has not scored the result since the last change'))
    return out

def parse_ts(ts):
    try:
        return time.mktime(time.strptime(ts[:19], '%Y-%m-%dT%H:%M:%S')) - time.timezone
    except (ValueError, TypeError):
        return 0

def transcript_state(path, since):
    """My last text to him, and whether the browser pane was opened on the site after `since`."""
    last, opened = '', False
    try:
        for line in open(path):
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue
            if o.get('type') != 'assistant':
                continue
            t = parse_ts(o.get('timestamp', ''))
            for c in (o.get('message', {}).get('content') or []):
                if not isinstance(c, dict):
                    continue
                if c.get('type') == 'text' and c.get('text', '').strip():
                    last = c['text']
                if c.get('type') == 'tool_use' and t >= since:
                    n, i = c.get('name', ''), json.dumps(c.get('input', {}))
                    if 'Claude_Browser' in n and ('navigate' in n or 'preview_start' in n or '"navigate"' in i) and 'localhost:4401' in i:
                        opened = True
    except OSError:
        pass
    return last, opened

def real_state(data):
    lpf = os.path.join(OUTD, 'last-prompt.json')
    lp = json.load(open(lpf)) if os.path.exists(lpf) else {}
    since = lp.get('t', 0)
    changed = newest_site_change()
    last, opened = transcript_state(data.get('transcript_path', ''), changed - 1)
    load = lambda n: json.load(open(os.path.join(OUTD, n))) if os.path.exists(os.path.join(OUTD, n)) else {}
    score, test = load('score.json'), load('test.json')
    lock_path = os.path.join(RUBRIC, 'release-lock.json')
    lock = json.load(open(lock_path)) if os.path.exists(lock_path) else {}
    provenance_path = os.path.join(ROOT, 'dist', '.site-provenance.json')
    provenance = json.load(open(provenance_path)) if os.path.exists(provenance_path) else {}
    reviewed, ledgered = review_has(lp.get('text', '')) if lp.get('text') else (True, True)
    return {
        'site_changed': changed > since, 'opened': opened,
        'score_fresh': score.get('t', 0) >= changed and score.get('governedHash') == governed_hash(), 'score_pct': score.get('pct', 0),
        'tests_pass': test.get('pass') is True and test.get('t', 0) >= changed,
        'verdict_fresh': mtime(lock_path) >= changed and lock.get('state') == 'RELEASED'
                          and lock.get('baselineId') == provenance.get('baselineId')
                          and lock.get('sourceHash') == provenance.get('sourceHash')
                          and lock.get('artifactHash') == provenance.get('artifactHash'),
        'shots_fresh': score.get('shots_t', 0) >= changed,
        'prompt': lp.get('text', ''), 'reviewed': reviewed, 'ledgered': ledgered,
    }, last

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    raw = sys.stdin.read() if not sys.stdin.isatty() else ''
    try:
        data = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        data = {}
    os.makedirs(OUTD, exist_ok=True)
    if mode == 'prompt':
        if data.get('agent_id') or '/subagents/' in str(data.get('transcript_path', '')):
            return
        text = str(data.get('prompt', '')).lstrip()
        if text.startswith(('<task-notification', '<agent-message', '<cross-session-message', '[SYSTEM NOTIFICATION', '<system-reminder')) or '[Subagent hand-back]' in text[:400]:
            return
        json.dump({'text': text, 't': time.time()}, open(os.path.join(OUTD, 'last-prompt.json'), 'w'))
    elif mode == 'pre':
        # A subagent call carries agent_id; the governor is the subagent that writes the pass and the spec.
        agent = data.get('agent_type')
        d = pre_decision(data.get('tool_name', ''), data.get('tool_input', {}) or {}, agent)
        if d:
            print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': 'deny', 'permissionDecisionReason': f'{d[0]}: {d[1]}'}}))
    elif mode == 'stop':
        if data.get('agent_id') or '/subagents/' in str(data.get('transcript_path', '')):
            return
        st, last = real_state(data)
        problems = project_failures() + check_turn(st) + check_message(last)
        cnt = os.path.join(OUTD, 'stop-retries.json')
        if not problems:
            if os.path.exists(cnt):
                os.remove(cnt)
            return
        # A message-only problem gets three tries, so a faulty check can never trap the turn.
        r = json.load(open(cnt)) if os.path.exists(cnt) else {}
        key = '|'.join(sorted(c for c, _ in problems))
        r[key] = r.get(key, 0) + 1
        json.dump(r, open(cnt, 'w'))
        if all(c == 'G30' for c, _ in problems) and r[key] > 3:
            return
        print(json.dumps({'decision': 'block', 'reason': 'The rubric blocks the end of this turn:\n' + '\n'.join(f'{c}: {m}' for c, m in problems)}))

if __name__ == '__main__':
    main()
