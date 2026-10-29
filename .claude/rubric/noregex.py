#!/usr/bin/env python3
"""R0: no regular expressions in any check, hook, build or site script (his blanket ban, Oct 29, 2026).

Python files are read as Python (ast): any import of re, regex, sre_compile, sre_parse or fnmatch fails.
JavaScript files are scanned by the TypeScript scanner (node_modules/typescript): any regular-expression literal
or use of RegExp fails. Exit 1 on any hit. Usage: noregex.py [paths...] (defaults to every script in scope).
"""
import ast, json, os, subprocess, sys

RUBRIC = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(RUBRIC))
BANNED_MODULES = {'re', 'regex', 'sre_compile', 'sre_parse', 'sre_constants', 'fnmatch'}
CODE_SUFFIXES = ('.py', '.js', '.mjs', '.cjs', '.ts', '.tsx')
SKIP_DIRS = {'.git', 'node_modules', 'vendor', 'dist', '__pycache__', 'out'}

JS_SCAN = r"""
const ts = require(process.argv[1]);
const fs = require('fs');
const out = {};
for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, 'utf8');
  // The full parser, not a token scanner: it knows where an expression starts, so no regex can hide behind another.
  let kind = ts.ScriptKind.JS;
  if (f.endsWith('.tsx')) kind = ts.ScriptKind.TSX;
  else if (f.endsWith('.ts')) kind = ts.ScriptKind.TS;
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, kind);
  const hits = [];
  const line = n => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const walk = n => {
    if (n.kind === ts.SyntaxKind.RegularExpressionLiteral) hits.push(['regex literal', line(n), n.getText(sf).slice(0, 40)]);
    if (n.kind === ts.SyntaxKind.Identifier && n.getText(sf) === 'RegExp') hits.push(['RegExp', line(n), 'RegExp']);
    ts.forEachChild(n, walk);
  };
  walk(sf);
  out[f] = hits;
}
console.log(JSON.stringify(out));
"""

def py_hits(path):
    try:
        tree = ast.parse(open(path).read(), path)
    except SyntaxError as e:
        return [('unparseable', e.lineno or 0, str(e))]
    hits = []
    for n in ast.walk(tree):
        if isinstance(n, ast.Import):
            for a in n.names:
                if a.name.split('.')[0] in BANNED_MODULES:
                    hits.append(('import ' + a.name, n.lineno, ''))
        elif isinstance(n, ast.ImportFrom) and (n.module or '').split('.')[0] in BANNED_MODULES:
            hits.append(('from ' + n.module + ' import', n.lineno, ''))
        elif isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == '__import__' and n.args and isinstance(n.args[0], ast.Constant) and str(n.args[0].value).split('.')[0] in BANNED_MODULES:
            hits.append(('__import__', n.lineno, ''))
    return hits

def js_hits(paths):
    if not paths:
        return {}
    tsmod = os.path.join(ROOT, 'node_modules/typescript')
    r = subprocess.run(['node', '-e', JS_SCAN, tsmod] + paths, capture_output=True, text=True)
    if r.returncode != 0:
        return {p: [('scanner failed', 0, r.stderr[-200:])] for p in paths}
    return json.loads(r.stdout)

def main(argv):
    if argv:
        paths = argv
    else:
        paths = []
        for directory, dirs, files in os.walk(ROOT):
            rel = os.path.relpath(directory, ROOT)
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not (rel == '.claude/rubric' and d == 'out')]
            for name in files:
                if name.endswith(CODE_SUFFIXES):
                    paths.append(os.path.join(directory, name))
        paths.sort()
    bad = 0
    for p in [p for p in paths if p.endswith('.py')]:
        for what, line, txt in py_hits(p):
            bad += 1; print(f'FAIL R0 {os.path.relpath(p, ROOT)}:{line} {what} {txt}')
    for p, hits in js_hits([p for p in paths if p.endswith(('.js', '.mjs', '.cjs', '.ts', '.tsx'))]).items():
        for what, line, txt in hits:
            bad += 1; print(f'FAIL R0 {os.path.relpath(p, ROOT)}:{line} {what} {txt}')
    print(f'\n{bad} regex uses')
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
