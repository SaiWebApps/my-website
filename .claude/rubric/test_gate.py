"""Cases for the shell gate (P2): writes to the site are refused; reads and notes that only mention site paths pass."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rubric_gate as g

CASES = [
    ("sed -i '' 's/PBS/PBS AI ROI/' site/_build/build.py", 'deny'),
    ("cat > /Users/x/site-notes.md <<'SPEC_EOF'\nrun node site/_build/audit.mjs and read public/assets/Resume.pdf\nSPEC_EOF", 'allow'),
    ('cat site/style.css | head', 'allow'),
    ('echo x > site/style.css', 'deny'),
    ('echo x >> src/data/career.ts', 'deny'),
    ('cd site && python3 _build/build.py | tail -1 && node _build/maps.mjs all', 'allow'),
    ('cd site && echo hi > notes.txt', 'deny'),
    ('grep -n foo src/data/x.ts 2>/dev/null', 'allow'),
    ("python3 -c \"open('public/x.txt','w').write('a')\"", 'deny'),
    ('cp /tmp/a.css site/style.css', 'deny'),
    ('rm site/proposal.html', 'deny'),
    ('git commit -m "Fix site research page"', 'allow'),
    # 2>&1 copies a descriptor; it writes no file.
    ('cd site && node _build/audit.mjs 2>&1 | tail -5', 'allow'),
    # Python fed through a heredoc, with the path in a variable, is read as Python.
    ("cd site && python3 - <<'EOF'\np='style.css'; s=open(p).read()\nopen(p,'w').write(s)\nEOF", 'deny'),
    # A path nobody can follow is not let through.
    ("python3 - <<'EOF'\nimport json\njson.dump(1, open(name, 'w'))\nEOF", 'deny'),
]

def main():
    bad = 0
    for c, want in CASES:
        got = 'deny' if g.pre_decision('Bash', {'command': c}) else 'allow'
        bad += got != want
        print(('ok   ' if got == want else 'WRONG'), want, repr(c[:70]))
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(main())
