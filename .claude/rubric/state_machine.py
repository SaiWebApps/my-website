#!/usr/bin/env python3
"""Fail-closed release state. No command may skip a state or reuse evidence after source/artifact bytes change."""
import hashlib, json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(HERE, 'out')
STATE_PATH = os.path.join(OUT, 'state.json')
PIPELINE = json.load(open(os.path.join(HERE, 'pipeline.json')))
ORDER = PIPELINE['states'][:-1]

def tree_hash(root, omitted=()):
    h = hashlib.sha256()
    skip = set(omitted)
    for directory, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d != '__pycache__')
        for name in sorted(files):
            path = os.path.join(directory, name)
            rel = os.path.relpath(path, root)
            if rel in skip:
                continue
            h.update(rel.encode())
            h.update(open(path, 'rb').read())
    return h.hexdigest()

def load():
    try:
        return json.load(open(STATE_PATH))
    except (OSError, json.JSONDecodeError):
        return {'state': 'SOURCE_DIRTY', 'sourceHash': '', 'artifactHash': '', 'evidence': {}}

def save(state):
    os.makedirs(OUT, exist_ok=True)
    state['updatedAt'] = time.time()
    with open(STATE_PATH, 'w') as stream:
        json.dump(state, stream, indent=2)
        stream.write('\n')

def validate_registry():
    missing = []
    for gate in PIPELINE['gates']:
        for key in ('script', 'agent'):
            if not os.path.isfile(os.path.join(ROOT, gate[key])):
                missing.append(gate['id'] + ': ' + gate[key])
    if missing:
        raise SystemExit('pipeline registry is incomplete: ' + '; '.join(missing))

def hashes():
    candidate = os.path.join(OUT, 'candidate')
    provenance = json.load(open(os.path.join(candidate, '.site-provenance.json')))
    source_hash = tree_hash(os.path.join(ROOT, 'site'))
    artifact_hash = tree_hash(candidate, ('.site-provenance.json',))
    if provenance.get('sourceHash') != source_hash or provenance.get('artifactHash') != artifact_hash:
        raise SystemExit('candidate provenance is stale')
    return source_hash, artifact_hash

def main(argv):
    validate_registry()
    cmd = argv[0] if argv else 'show'
    if cmd == 'show':
        print(json.dumps(load(), indent=2)); return 0
    if cmd == 'dirty':
        save({'state': 'SOURCE_DIRTY', 'sourceHash': tree_hash(os.path.join(ROOT, 'site')), 'artifactHash': '', 'evidence': {}})
        return 0
    if cmd == 'built':
        source_hash, artifact_hash = hashes()
        save({'state': 'CANDIDATE_BUILT', 'sourceHash': source_hash, 'artifactHash': artifact_hash, 'evidence': {}})
        return 0
    if cmd == 'lock':
        prior = load()
        save({'state': 'VIOLATION_LOCK', 'sourceHash': prior.get('sourceHash', ''), 'artifactHash': prior.get('artifactHash', ''),
              'failedCheck': argv[1] if len(argv) > 1 else 'unknown', 'evidence': prior.get('evidence', {})})
        return 1
    if cmd == 'pass':
        if len(argv) < 3:
            raise SystemExit('pass requires STATE and EVIDENCE_FILE')
        target, evidence_path = argv[1], os.path.abspath(argv[2])
        prior = load()
        if target not in ORDER or target in ('SOURCE_DIRTY', 'CANDIDATE_BUILT'):
            raise SystemExit('invalid pass state ' + target)
        expected = ORDER[ORDER.index(target) - 1]
        if prior.get('state') != expected:
            raise SystemExit('illegal transition ' + str(prior.get('state')) + ' -> ' + target + '; expected ' + expected)
        source_hash, artifact_hash = hashes()
        if prior.get('sourceHash') != source_hash or prior.get('artifactHash') != artifact_hash:
            raise SystemExit('candidate changed during the pipeline')
        if not os.path.isfile(evidence_path):
            raise SystemExit('missing evidence ' + evidence_path)
        ev_hash = hashlib.sha256(open(evidence_path, 'rb').read()).hexdigest()
        evidence = dict(prior.get('evidence', {})); evidence[target] = {'file': os.path.relpath(evidence_path, ROOT), 'sha256': ev_hash}
        save({'state': target, 'sourceHash': source_hash, 'artifactHash': artifact_hash, 'evidence': evidence})
        return 0
    raise SystemExit('unknown state command ' + cmd)

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
