#!/usr/bin/env python3
"""Validate the mandatory design review against the exact contract, manifest, frames, and candidate."""
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(HERE, 'out')

def digest(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()

def load(path, problems):
    try:
        return json.load(open(path))
    except (OSError, json.JSONDecodeError) as error:
        problems.append(path + ' is missing or unreadable: ' + str(error))
        return {}

def verify():
    problems = []
    contract_path = os.path.join(HERE, 'design-contract.json')
    manifest_path = os.path.join(OUT, 'visual-manifest.json')
    review_path = os.path.join(OUT, 'design-review.json')
    provenance_path = os.path.join(OUT, 'candidate', '.site-provenance.json')
    contract = load(contract_path, problems)
    manifest = load(manifest_path, problems)
    review = load(review_path, problems)
    provenance = load(provenance_path, problems)
    for key in ('baselineId', 'sourceHash', 'artifactHash'):
        if review.get(key) != manifest.get(key) or manifest.get(key) != provenance.get(key):
            problems.append('design review is stale for ' + key)
    if review.get('reviewer') != 'design-compliance-reviewer':
        problems.append('wrong design reviewer')
    if review.get('manifestSha256') != digest(manifest_path):
        problems.append('design review is not bound to the exact manifest')
    if review.get('contractSha256') != digest(contract_path):
        problems.append('design review is not bound to the exact contract')
    required = [item.get('id') for item in contract.get('items', [])]
    results = review.get('items') or []
    found = [item.get('id') for item in results]
    if found != required:
        problems.append('design review items are missing, duplicated, or out of contract order')
    frame_names = [frame.get('file') for frame in manifest.get('frames') or []]
    frame_set = set(frame_names)
    inspected = set(review.get('inspectedFrames') or [])
    if inspected != frame_set:
        problems.append('design review did not inspect every exact manifest frame')
    for item in results:
        item_id = str(item.get('id', 'unknown'))
        if item.get('verdict') != 'pass':
            problems.append(item_id + ' did not pass')
        evidence = item.get('evidence') or []
        if not evidence or any(name not in frame_set for name in evidence):
            problems.append(item_id + ' lacks exact manifest-frame evidence')
        if len(str(item.get('observation', '')).strip()) < 24:
            problems.append(item_id + ' lacks a specific rendered observation')
    if review.get('overall') != 'pass':
        problems.append('design review overall is not pass')
    return problems

if __name__ == '__main__':
    failures = verify()
    if failures:
        print('\n'.join(failures))
        sys.exit(1)
    print('design compliance passed for the exact candidate and every exact frame')
