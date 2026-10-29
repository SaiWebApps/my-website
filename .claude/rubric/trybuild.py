#!/usr/bin/env python3
"""Builds a scratch copy of the site with pending edits applied (no change to the real site) and runs the static checks.
Usage: trybuild.py EDITS.json [--grep TEXT]    EDITS.json: [{"file": "site/_build/build.py", "old": "...", "new": "..."}]
Prints the failures the edits would leave, and keeps the scratch copy's path for inspection.
"""
import json, os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rubric_gate as g, guard

def main(argv):
    edits = json.load(open(argv[0]))
    want = argv[argv.index('--grep') + 1] if '--grep' in argv else None
    tmp, t = g.scratch_copy()
    for ed in edits:
        target = os.path.join(tmp, os.path.relpath(os.path.join(g.ROOT, ed['file']), g.ROOT))
        cur = open(target).read() if os.path.exists(target) else ''
        new = ed['new'] if ed.get('write') else cur.replace(ed['old'], ed['new'], 1)
        if not ed.get('write') and ed['old'] not in cur:
            print('edit does not apply:', ed['file']); return 1
        open(target, 'w').write(new)
    ok, err = g.build(t)
    print('build ok' if ok else 'BUILD FAILED: ' + err)
    fails = guard.Run(t).run()
    shown = [f for f in fails if not want or want in f['msg'] or want == f['check']]
    for f in shown:
        print(f"FAIL {f['check']} {f['page']} {f['where']}: {f['msg'][:200]}")
    print(f'\n{len(fails)} fail ({len(shown)} shown); scratch copy at {t}')
    return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
