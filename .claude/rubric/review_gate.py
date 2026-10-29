#!/usr/bin/env python3
"""Common exact-hash validation for independent content, gate-integrity, and visual reviews."""
import hashlib
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')

def digest(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()

def read(path, problems):
    try:
        return json.load(open(path))
    except (OSError, json.JSONDecodeError) as error:
        problems.append(path + ' is missing or unreadable: ' + str(error))
        return {}

def verify(name, reviewer):
    problems = []
    manifest_path = os.path.join(OUT, 'visual-manifest.json')
    provenance_path = os.path.join(OUT, 'candidate', '.site-provenance.json')
    review_path = os.path.join(OUT, name)
    manifest = read(manifest_path, problems)
    provenance = read(provenance_path, problems)
    review = read(review_path, problems)
    if review.get('reviewer') != reviewer:
        problems.append(name + ' has the wrong reviewer')
    if review.get('overall') != 'pass':
        problems.append(name + ' overall is not pass')
    for key in ('baselineId', 'sourceHash', 'artifactHash'):
        if review.get(key) != manifest.get(key) or manifest.get(key) != provenance.get(key):
            problems.append(name + ' is stale for ' + key)
    if review.get('manifestSha256') != digest(manifest_path):
        problems.append(name + ' is not bound to the exact visual manifest')
    return problems
