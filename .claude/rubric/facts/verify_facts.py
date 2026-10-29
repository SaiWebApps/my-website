#!/usr/bin/env python3
"""Independently rebuild and validate the governed fact and authority store."""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile


EXPECTED_INPUTS = [
    'public/assets/Resume.pdf',
    'public/assets/Sairam_Krishnan_Resume.pdf',
    'public/assets/atos-demo-poster.webp',
    '.claude/rubric/sources/sheet.json',
    '.claude/rubric/sources/papers.txt',
    '.claude/rubric/sources/papers-full/SOURCES.md',
    '.claude/rubric/sources/papers-full/ai-roi.txt',
    '.claude/rubric/sources/papers-full/who-trains.txt',
    '.claude/rubric/sources/papers-full/drone-megaddon-2014.txt',
    '.claude/rubric/sources/papers-full/drone-megaddon-2026.txt',
    '.claude/rubric/sources/drone-megaddon-figure-assets.json',
    '.claude/rubric/approved.json',
    '.claude/rubric/retired.json',
    '.claude/rubric/authority.json',
    '.claude/rubric/authority/career-amazon-transition.json',
    '.claude/rubric/authority/career-evidence-contract.json',
    '.claude/rubric/authority/career-evidence-visual-transition.json',
    '.claude/rubric/authority/speaking-evidence-contract.json',
    '.claude/rubric/authority/research-evidence-contract.json',
    '.claude/rubric/authority/protected-claims.json',
    '.claude/rubric/authority/corrections.ndjson',
    '.claude/rubric/authority/profile.json',
    '.claude/rubric/authority/source-manifest-mirror.json',
    '.claude/rubric/authority/resume-equivalence.json',
    'site/content.json',
    '.claude/rubric/registry.json',
    '.claude/rubric/facts/build_facts.py',
    '.claude/rubric/facts/README.md',
    '.claude/rubric/facts/verify_facts.py',
    '.claude/rubric/facts/mutation_test.py',
    '.claude/rubric/facts/words.py',
    '.claude/rubric/facts/export_head.py',
    '.claude/rubric/facts/register.mjs',
    '.claude/rubric/facts/load_head.mjs',
    '.claude/rubric/career_evidence.py',
    '.claude/rubric/career_evidence_mutation_test.py',
    '.claude/rubric/career_visual_transition_capture.mjs',
    '.claude/rubric/career_visual_transition_verify.py',
    'public/assets/research/drone-megaddon-2014.pdf',
    'public/assets/research/drone-megaddon-2014-architecture.png',
    'public/assets/research/drone-megaddon-2026.pdf',
    'public/assets/research/drone-megaddon-2026-language-vision-architecture.png',
    '.claude/rubric/out/career-evidence-transition/capture.json',
    '.claude/rubric/out/career-evidence-transition/experience-audit-review.json',
    '.claude/rubric/guard.py',
    '.claude/rubric/authority_gate.py',
]

EXPECTED_GROUP_IDS = ['praxtera-client-provenance', 'independent-speaking-teaching']
EXPECTED_RESEARCH_UNITS = ['drone-megaddon', 'drone-megaddon-2026', 'who-trains', 'ai-roi']
EXPECTED_GROUPS = [
    {
        'id': 'praxtera-client-provenance',
        'heading': 'Praxtera AI Institute',
        'heading_unit': 'praxtera',
        'member_units': ['eagles', 'jacobson-strategic', 'hp', 'morgan-lewis', 'pbs', 'sonova'],
        'member_labels': ['Philadelphia Eagles / Eagles Care Summit', 'Jacobson Strategic', 'HP', 'Morgan Lewis', 'PBS', 'Sonova'],
        'source_correction': 'direct-user-correction-2026-10-28-003',
    },
    {
        'id': 'independent-speaking-teaching',
        'heading': 'Independent Speaking & Teaching',
        'heading_unit': None,
        'member_units': ['cmu-teaching', 'atos'],
        'member_labels': ['Carnegie Mellon University', 'Atos'],
        'source_correction': 'direct-user-correction-2026-10-28-002',
    },
]
EXPECTED_RESEARCH_STABLE_IDS = [
    'doi:10.31224/6924',
    'doi:10.31224/6987',
    'doi:10.2139/ssrn.7083078',
    'doi:10.2139/ssrn.6732598',
]
EXPECTED_ACCEPTED_RESUME_IDS = [
    'resume:atos:9:org',
    'resume:atos:9:title',
    'resume:atos:9:dates',
    'resume:atos:9:b0',
    'resume:cmu-teaching:10:org',
    'resume:cmu-teaching:10:title',
    'resume:cmu-teaching:10:dates',
    'resume:cmu-teaching:10:d0',
    'resume:cmu-teaching:10:b0',
    'resume:research:drone-megaddon',
    'resume:research:drone-megaddon-2026',
    'resume:research:who-trains',
    'resume:research:ai-roi',
]
EXPECTED_PROJECT_TRANSITION_IDS = [
    'resume:ondoway:5:b1',
    'resume:persuaider:7:b0',
    'resume:persuaider:7:b2',
    'resume:gestiq:8:b0',
    'resume:gestiq:8:b1',
]
EXPECTED_PROJECTS_LEDGER_SHA256 = 'eebab7d45349f624965cf5136439fc2b498291a4a5d9fedb1785215046049a9a'
PINNED_HISTORICAL_COMMIT = '8f2a57ac23235c9cfbc7d3c24d6e071cb9c1dfe9'
PINNED_HISTORICAL_TREE = 'ad8e824f71984ede88d408042021e7f0964e7d3b'


def sha256(path):
    with open(path, 'rb') as stream:
        return hashlib.sha256(stream.read()).hexdigest()


def safe_path(root, relative):
    if not isinstance(relative, str) or not relative or os.path.isabs(relative):
        raise ValueError('path must be nonempty and repository-relative')
    path = os.path.abspath(os.path.join(root, relative))
    if os.path.commonpath((root, path)) != root:
        raise ValueError('path leaves repository root')
    return path


def load_json(path):
    with open(path) as stream:
        return json.load(stream)


def normalized(text):
    return ' '.join(str(text).split()).casefold()


def canonical_sha256(value):
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
    return hashlib.sha256(payload).hexdigest()


def is_sha256(value):
    return (isinstance(value, str) and len(value) == 64
            and all(character in '0123456789abcdef' for character in value))


def failure(kind, where, message):
    return {'kind': kind, 'where': where, 'message': message}


def git_output(root, *arguments, binary=False):
    result = subprocess.run(
        ['git', '-C', root, *arguments],
        check=True,
        capture_output=True,
        text=not binary,
    )
    return result.stdout if binary else result.stdout.strip()


def expected_historical_input(root):
    commit = git_output(root, 'rev-parse', f'{PINNED_HISTORICAL_COMMIT}^{{commit}}')
    tree = git_output(root, 'rev-parse', f'{PINNED_HISTORICAL_COMMIT}^{{tree}}')
    source_tree = git_output(root, 'rev-parse', f'{PINNED_HISTORICAL_COMMIT}:src/data')
    if commit != PINNED_HISTORICAL_COMMIT or tree != PINNED_HISTORICAL_TREE:
        raise ValueError('pinned historical Git identity does not resolve exactly')
    files = {}
    listing = git_output(root, 'ls-tree', '-r', PINNED_HISTORICAL_COMMIT, '--', 'src/data')
    for line in listing.splitlines():
        metadata, path = line.split('\t', 1)
        _mode, object_type, object_id = metadata.split()
        if object_type != 'blob':
            raise ValueError(f'pinned historical input is not a blob: {path}')
        payload = git_output(root, 'show', f'{PINNED_HISTORICAL_COMMIT}:{path}', binary=True)
        files[path] = {'gitBlob': object_id, 'sha256': hashlib.sha256(payload).hexdigest()}
    return {
        'mode': 'pinned-quarantined',
        'commit': commit,
        'tree': tree,
        'srcDataTree': source_tree,
        'authorityRank': 'historical-review',
        'factPolicy': 'may-except-research-never',
        'files': files,
    }


def names_appear_in_order(text, names):
    haystack = normalized(text)
    cursor = -1
    for name in names:
        full_name = normalized(name)
        position = haystack.find(full_name, cursor + 1)
        if position < 0:
            position = haystack.find(full_name.split()[-1], cursor + 1)
        if position < 0:
            return False
        cursor = position
    return True


def contract_failures(root, facts):
    out = []
    rubric = os.path.join(root, '.claude', 'rubric')
    protected = load_json(os.path.join(rubric, 'authority', 'protected-claims.json'))
    authority = load_json(os.path.join(rubric, 'authority.json'))
    registry = load_json(os.path.join(rubric, 'registry.json'))
    content = load_json(os.path.join(root, 'site', 'content.json'))
    corrections = [json.loads(line) for line in open(os.path.join(rubric, 'authority', 'corrections.ndjson')) if line.strip()]
    active_corrections = {item.get('id'): item for item in corrections if item.get('status') == 'active'}
    facts_by_id = {item.get('id'): item for item in facts}

    research_contract = {}
    research_contract_source = authority.get('sources', {}).get('researchEvidenceContract') or {}
    try:
        research_contract_path = safe_path(root, research_contract_source.get('path'))
        research_contract = load_json(research_contract_path)
        if sha256(research_contract_path) != research_contract_source.get('sha256'):
            out.append(failure('authority-drift', 'research-evidence-contract.json', 'Research reader authority bytes differ from the authority manifest'))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        out.append(failure('authority-drift', 'research-evidence-contract.json', f'Research reader authority cannot be validated: {error}'))
    if (research_contract_source.get('schemaVersion') != 2
            or research_contract_source.get('status') != 'accepted-static-open-authority'
            or research_contract_source.get('route') != 'research'
            or research_contract.get('schemaVersion') != 2
            or research_contract.get('status') != 'accepted-static-open-authority'
            or research_contract.get('route') != 'research'):
        out.append(failure('authority-drift', 'researchEvidenceContract', 'Research reader authority identity or schema drifted'))

    accepted_baseline = authority.get('sources', {}).get('acceptedBaseline') or {}
    accepted_hash = accepted_baseline.get('sha256')
    accepted_paths = accepted_baseline.get('paths') or []
    if len(accepted_paths) != 2 or not isinstance(accepted_hash, str):
        out.append(failure('accepted-resume', 'authority.json', 'accepted baseline must govern exactly two résumé copies'))
    for relative in accepted_paths:
        try:
            if sha256(safe_path(root, relative)) != accepted_hash:
                out.append(failure('accepted-resume', relative, 'accepted résumé copy differs from the governed hash'))
        except (OSError, ValueError, TypeError) as error:
            out.append(failure('accepted-resume', str(relative), f'accepted résumé copy is unavailable: {error}'))

    source_manifest_authority = authority.get('sources', {}).get('acceptedSourceManifest') or {}
    source_manifest = {}
    try:
        source_manifest_path = safe_path(root, source_manifest_authority.get('path'))
        source_manifest = load_json(source_manifest_path)
        profile = load_json(os.path.join(rubric, 'authority', 'profile.json'))
        if sha256(source_manifest_path) != source_manifest_authority.get('sha256'):
            out.append(failure('authority-drift', 'source-manifest-mirror.json', 'source-manifest mirror hash differs from authority'))
        if (source_manifest.get('schemaVersion') != 1
                or source_manifest.get('profileId') != source_manifest_authority.get('profileId')
                or (source_manifest.get('upstream') or {}).get('sha256') != source_manifest_authority.get('upstreamSha256')
                or (source_manifest.get('upstream') or {}).get('profilePath') != (profile.get('authority') or {}).get('source_manifest')):
            out.append(failure('authority-drift', 'source-manifest-mirror.json', 'source-manifest mirror identity or upstream seal drifted'))
        manifest_sources = source_manifest.get('sources') or []
        if [item.get('id') for item in manifest_sources] != [
                'accepted-resume', 'research-drone-2014', 'research-drone-2026', 'research-next-senior', 'research-ai-roi']:
            out.append(failure('authority-drift', 'source-manifest-mirror.json', 'source-manifest mirror coverage or order drifted'))
        resume_source = next((item for item in manifest_sources if item.get('id') == 'accepted-resume'), {})
        if resume_source.get('sha256') != accepted_hash or resume_source.get('governedPaths') != accepted_paths:
            out.append(failure('accepted-resume', 'source-manifest-mirror.json', 'source-manifest résumé identity differs from accepted authority'))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        out.append(failure('authority-drift', 'source-manifest-mirror.json', f'source-manifest mirror cannot be validated: {error}'))

    protected_source = authority.get('sources', {}).get('protectedClaims') or {}
    try:
        if sha256(os.path.join(rubric, 'authority', 'protected-claims.json')) != protected_source.get('sha256'):
            out.append(failure('authority-drift', 'protected-claims.json', 'protected claims differ from the authority mirror hash'))
        if sha256(os.path.join(rubric, 'authority', 'corrections.ndjson')) != protected_source.get('correctionsSha256'):
            out.append(failure('authority-drift', 'corrections.ndjson', 'active corrections differ from the authority mirror hash'))
    except OSError as error:
        out.append(failure('authority-drift', 'authority inputs', f'authority source is unavailable: {error}'))

    equivalence_path = os.path.join(rubric, 'authority', 'resume-equivalence.json')
    equivalence = load_json(equivalence_path)
    equivalence_source = accepted_baseline.get('equivalenceSha256')
    if sha256(equivalence_path) != equivalence_source:
        out.append(failure('accepted-resume', 'resume-equivalence.json', 'accepted résumé transition ledger differs from authority'))
    if (equivalence.get('schemaVersion') != 2 or equivalence.get('semantics') != {
            'canonicalFactSide': 'acceptedText',
            'legacyFactSide': 'audit-preimage-only',
            'acceptedSource': 'public/assets/Resume.pdf',
    }):
        out.append(failure('accepted-resume', 'resume-equivalence.json', 'canonical/legacy transition semantics are stale'))
    equivalences = equivalence.get('equivalences') or []
    equivalence_ids = [item.get('factId') for item in equivalences]
    if len(equivalence_ids) != len(set(equivalence_ids)) or any(not item for item in equivalence_ids):
        out.append(failure('accepted-resume', 'resume-equivalence.json', 'accepted résumé transition IDs are empty or duplicated'))
    for item in equivalences:
        fact = facts_by_id.get(item.get('factId'))
        if (not fact or fact.get('source') != 'resume' or fact.get('text') != item.get('acceptedText')
                or not isinstance(item.get('legacyText'), str) or not item.get('legacyText')):
            out.append(failure('accepted-resume', item.get('factId') or 'resume-equivalence.json', 'canonical fact does not equal acceptedText or audit preimage is absent'))

    project_transition = equivalence.get('projectsTransition') or {}
    if (project_transition.get('factIds') != EXPECTED_PROJECT_TRANSITION_IDS
            or project_transition.get('changedField') != 'leading verb only'
            or project_transition.get('preservedDimensions') != ['ownership', 'metrics', 'mechanisms', 'scope', 'outcomes']
            or project_transition.get('canonicalProjectsLedgerSha256') != EXPECTED_PROJECTS_LEDGER_SHA256):
        out.append(failure('accepted-resume', 'projectsTransition', 'Projects transition coverage or preservation contract drifted'))
    by_equivalence_id = {item.get('factId'): item for item in equivalences}
    transition_payload = []
    for fact_id in EXPECTED_PROJECT_TRANSITION_IDS:
        item = by_equivalence_id.get(fact_id) or {}
        transition = item.get('transition') or {}
        try:
            legacy_verb, legacy_tail = item['legacyText'].split(' ', 1)
            accepted_verb, accepted_tail = item['acceptedText'].split(' ', 1)
        except (KeyError, ValueError):
            out.append(failure('accepted-resume', fact_id, 'Projects transition text is unavailable'))
            continue
        if (legacy_verb != transition.get('legacyLeadingVerb')
                or accepted_verb != transition.get('acceptedLeadingVerb')
                or transition.get('scope') != 'projects-proof-atom'
                or legacy_tail != accepted_tail
                or hashlib.sha256(accepted_tail.encode()).hexdigest() != transition.get('unchangedTailSha256')):
            out.append(failure('accepted-resume', fact_id, 'Projects transition changed more than its governed leading verb'))
        transition_payload.append({key: item.get(key) for key in ('factId', 'legacyText', 'acceptedText', 'transition')})
    if canonical_sha256(transition_payload) != project_transition.get('transitionSha256'):
        out.append(failure('accepted-resume', 'projectsTransition', 'Projects transition hash differs from its exact five-atom payload'))
    source_reconciliations = equivalence.get('sourceReconciliations') or {}
    reconciliation_entries = source_reconciliations.get('entries') or []
    if (canonical_sha256(reconciliation_entries) != source_reconciliations.get('sha256')
            or [item.get('id') for item in reconciliation_entries] != [
                'amazon-management-accepted-merge', 'cmu-teaching-accepted-deduplication']):
        out.append(failure('accepted-resume', 'sourceReconciliations', 'accepted-source reconciliation coverage or hash drifted'))
    for item in reconciliation_entries:
        fact = facts_by_id.get(item.get('acceptedFactId'))
        if (not fact or fact.get('text') != item.get('acceptedText')
                or not item.get('legacySourceIds') or not item.get('legacyTexts')
                or len(item.get('legacySourceIds')) != len(item.get('legacyTexts'))
                or not item.get('preservedDimensions')):
            out.append(failure('accepted-resume', item.get('id') or 'source reconciliation', 'accepted-source reconciliation lost its preimage, canonical fact, or preserved dimensions'))
        detail_id = item.get('preservedDetailFactId')
        if detail_id:
            detail = facts_by_id.get(detail_id)
            if not detail or hashlib.sha256(detail.get('text', '').encode()).hexdigest() != item.get('preservedDetailTextSha256'):
                out.append(failure('accepted-resume', item.get('id'), 'reconciled detail fact was weakened or removed'))

    speaking_source = authority.get('sources', {}).get('speakingEvidenceContract') or {}
    try:
        speaking_path = safe_path(root, speaking_source.get('path'))
        speaking = load_json(speaking_path)
        if sha256(speaking_path) != speaking_source.get('sha256'):
            out.append(failure('authority-drift', 'speaking-evidence-contract.json', 'Speaking evidence contract bytes differ from authority'))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        speaking = {}
        out.append(failure('authority-drift', 'speaking-evidence-contract.json', f'Speaking evidence contract cannot be validated: {error}'))
    if (speaking_source.get('schemaVersion') != 1
            or speaking_source.get('route') != 'speaking'
            or speaking.get('schemaVersion') != speaking_source.get('schemaVersion')
            or speaking.get('route') != speaking_source.get('route')):
        out.append(failure('authority-drift', 'speakingEvidenceContract', 'Speaking evidence contract identity or schema drifted'))
    group_ids = {
        item.get('id') for item in protected.get('typed_claims', [])
        if item.get('claim_type') == 'provenance_group'
    }
    reconciliation_ids = {item.get('id') for item in reconciliation_entries}
    composition_ids = []
    component_ids = []
    for composition in speaking.get('compositions', []):
        composition_id = composition.get('id')
        composition_ids.append(composition_id)
        accepted_id = composition.get('acceptedFactId')
        accepted_fact = facts_by_id.get(accepted_id) or {}
        covered_equivalents = composition.get('coveredEquivalentFactIds') or []
        owner = composition.get('owner') or {}
        marker = composition.get('coverageMarker') or {}
        components = composition.get('requiredComponents') or []
        component_fact_ids = [item.get('factId') for item in components]
        component_ids.extend(component_fact_ids)
        owner_unit = registry.get('units', {}).get(owner.get('unit')) or {}
        if (not composition_id or accepted_fact.get('source') != 'resume'
                or accepted_fact.get('unit') != owner.get('unit')
                or hashlib.sha256(accepted_fact.get('text', '').encode()).hexdigest() != composition.get('acceptedTextSha256')
                or composition.get('acceptedResumeSha256') != accepted_hash
                or composition.get('sourceReconciliationId') not in reconciliation_ids):
            out.append(failure('accepted-resume', composition_id or 'Speaking composition', 'Speaking composition is not bound to its accepted résumé fact and reconciliation'))
        if (not covered_equivalents or len(covered_equivalents) != len(set(covered_equivalents))
                or any((facts_by_id.get(item) or {}).get('unit') != owner.get('unit')
                       or (facts_by_id.get(item) or {}).get('text') != accepted_fact.get('text')
                       for item in covered_equivalents)):
            out.append(failure('accepted-resume', composition_id or 'Speaking composition', 'Speaking composition equivalent fact mapping is empty, duplicated, or textually different'))
        if (owner.get('page') != speaking.get('route')
                or owner_unit.get('home') != owner.get('page')
                or owner_unit.get('block') != owner.get('block')
                or owner.get('authorityGroup') not in group_ids):
            out.append(failure('authority-drift', composition_id or 'Speaking composition', 'Speaking composition owner differs from registry or typed provenance authority'))
        if marker != {'attribute': 'data-covers-fact', 'value': accepted_id}:
            out.append(failure('authority-drift', composition_id or 'Speaking composition', 'Speaking composition coverage marker is not exact'))
        if (not components or len(component_fact_ids) != len(set(component_fact_ids))
                or any(not item for item in component_fact_ids)):
            out.append(failure('accepted-resume', composition_id or 'Speaking composition', 'Speaking composition component IDs are empty or duplicated'))
        second_sentence_components = []
        for component in components:
            fact = facts_by_id.get(component.get('factId')) or {}
            if (fact.get('unit') != owner.get('unit')
                    or hashlib.sha256(fact.get('text', '').encode()).hexdigest() != component.get('textSha256')
                    or not str(component.get('role', '')).strip()):
                out.append(failure('accepted-resume', component.get('factId') or composition_id, 'Speaking composition component differs from its governed fact, owner, or role'))
            if component.get('role') == 'accepted-second-sentence-verbatim':
                second_sentence_components.append(fact)
        if (len(second_sentence_components) != 1
                or not accepted_fact.get('text', '').endswith(second_sentence_components[0].get('text', ''))):
            out.append(failure('accepted-resume', composition_id or 'Speaking composition', 'Speaking composition does not retain the exact accepted résumé second sentence'))
        if composition.get('renderPolicy') != {
                'markerOccurrences': 1,
                'componentOccurrences': 1,
                'fullAcceptedTextOccurrences': 0,
                'allComponentsInsideMarker': True,
        }:
            out.append(failure('authority-drift', composition_id or 'Speaking composition', 'Speaking composition render policy drifted'))
    if len(composition_ids) != len(set(composition_ids)) or any(not item for item in composition_ids):
        out.append(failure('authority-drift', 'speakingEvidenceContract', 'Speaking composition IDs are empty or duplicated'))

    mirror_ids = []
    canonical_ids = []
    for mirror in speaking.get('canonicalMirrors', []):
        mirror_id = mirror.get('id')
        mirror_ids.append(mirror_id)
        canonical_id = mirror.get('canonicalFactId')
        canonical_ids.append(canonical_id)
        aliases = mirror.get('mirrorFactIds') or []
        owner = mirror.get('owner') or {}
        owner_unit = registry.get('units', {}).get(owner.get('unit')) or {}
        canonical = facts_by_id.get(canonical_id) or {}
        aliases_data = [facts_by_id.get(item) or {} for item in aliases]
        if (not mirror_id or not aliases or len(aliases) != len(set(aliases))
                or canonical_id in aliases):
            out.append(failure('authority-drift', mirror_id or 'Speaking mirror', 'Speaking canonical mirror IDs are empty, duplicated, or self-referential'))
        if (canonical.get('source') != 'site'
                or canonical.get('unit') != owner.get('unit')
                or hashlib.sha256(canonical.get('text', '').encode()).hexdigest() != mirror.get('textSha256')
                or any(item.get('source') != 'site' or item.get('unit') != owner.get('unit')
                       or item.get('text') != canonical.get('text') for item in aliases_data)):
            out.append(failure('authority-drift', mirror_id or 'Speaking mirror', 'Speaking canonical mirror facts differ in text, source, owner, or hash'))
        if (owner.get('page') != speaking.get('route')
                or owner_unit.get('home') != owner.get('page')
                or owner_unit.get('block') != owner.get('block')
                or owner.get('authorityGroup') not in group_ids):
            out.append(failure('authority-drift', mirror_id or 'Speaking mirror', 'Speaking canonical mirror owner differs from registry or typed provenance authority'))
    flattened_mirrors = [item for mirror in speaking.get('canonicalMirrors', []) for item in mirror.get('mirrorFactIds', [])]
    if (len(mirror_ids) != len(set(mirror_ids)) or any(not item for item in mirror_ids)
            or len(canonical_ids) != len(set(canonical_ids))
            or len(flattened_mirrors) != len(set(flattened_mirrors))
            or set(component_ids).intersection(canonical_ids + flattened_mirrors)):
        out.append(failure('authority-drift', 'speakingEvidenceContract', 'Speaking evidence mappings overlap or contain duplicate identities'))
    description_ids = []
    for description in speaking.get('ownedDescriptions', []):
        description_id = description.get('id')
        description_ids.append(description_id)
        owner = description.get('owner') or {}
        owner_unit = registry.get('units', {}).get(owner.get('unit')) or {}
        heading = facts_by_id.get(description.get('headingFactId')) or {}
        asset = description.get('asset')
        try:
            asset_path = safe_path(root, str(asset).lstrip('/'))
            asset_exists = os.path.isfile(asset_path)
        except (ValueError, TypeError):
            asset_exists = False
        if (not description_id or description.get('attribute') != 'alt' or description.get('tag') != 'img'
                or not asset_exists or not str(description.get('proofId', '')).strip()
                or hashlib.sha256(str(description.get('text', '')).encode()).hexdigest() != description.get('textSha256')
                or heading.get('unit') != owner.get('unit')):
            out.append(failure('authority-drift', description_id or 'Speaking description', 'Speaking owned description text, asset, heading, or identity drifted'))
        if (owner.get('page') != speaking.get('route')
                or owner_unit.get('home') != owner.get('page')
                or owner_unit.get('block') != owner.get('block')
                or owner.get('authorityGroup') not in group_ids):
            out.append(failure('authority-drift', description_id or 'Speaking description', 'Speaking owned description owner differs from registry or typed provenance authority'))
    if len(description_ids) != len(set(description_ids)) or any(not item for item in description_ids):
        out.append(failure('authority-drift', 'speakingEvidenceContract', 'Speaking owned description IDs are empty or duplicated'))
    heading_ids = []
    for heading in speaking.get('sectionHeadings', []):
        heading_id = heading.get('id')
        heading_ids.append(heading_id)
        owner = heading.get('owner') or {}
        owner_unit = registry.get('units', {}).get(owner.get('unit')) or {}
        if (not heading_id
                or hashlib.sha256(str(heading.get('text', '')).encode()).hexdigest() != heading.get('textSha256')
                or heading.get('text') not in owner_unit.get('names', [])
                or owner.get('page') != speaking.get('route')
                or owner_unit.get('home') != owner.get('page')
                or owner_unit.get('block') != owner.get('block')):
            out.append(failure('authority-drift', heading_id or 'Speaking heading', 'Speaking section heading differs from its source-hashed registry owner'))
    if len(heading_ids) != len(set(heading_ids)) or any(not item for item in heading_ids):
        out.append(failure('authority-drift', 'speakingEvidenceContract', 'Speaking section heading IDs are empty or duplicated'))

    consolidation_ids = []
    covered_consolidation_ids = []
    for consolidation in speaking.get('consolidations', []):
        consolidation_id = consolidation.get('id')
        consolidation_ids.append(consolidation_id)
        canonical_id = consolidation.get('canonicalFactId')
        canonical = facts_by_id.get(canonical_id) or {}
        covered_ids = consolidation.get('coveredFactIds') or []
        covered_consolidation_ids.extend(covered_ids)
        covered = [facts_by_id.get(item) or {} for item in covered_ids]
        excerpts = consolidation.get('requiredExcerpts') or []
        supporting_ids = consolidation.get('supportingFactIds') or []
        supporting = [facts_by_id.get(item) or {} for item in supporting_ids]
        clauses = consolidation.get('requiredClauses') or []
        links = consolidation.get('sourceLinks') or []
        owner = consolidation.get('owner') or {}
        owner_unit = registry.get('units', {}).get(owner.get('unit')) or {}
        if (not consolidation_id or canonical.get('unit') != owner.get('unit')
                or hashlib.sha256(canonical.get('text', '').encode()).hexdigest() != consolidation.get('canonicalTextSha256')
                or not canonical.get('retirementRedaction')):
            out.append(failure('accepted-resume', consolidation_id or 'Speaking consolidation', 'Speaking consolidation canonical fact, owner, or retirement identity drifted'))
        if (not covered_ids or len(covered_ids) != len(set(covered_ids)) or canonical_id in covered_ids
                or any(item.get('source') not in ('site', 'resume') or item.get('show') != 'must'
                       or not item.get('retirementRedaction') for item in covered)):
            out.append(failure('accepted-resume', consolidation_id or 'Speaking consolidation', 'Speaking consolidation coverage IDs are empty, duplicated, or not governed retired facts'))
        excerpt_ids = [item.get('factId') for item in excerpts]
        if (not excerpts or len(excerpt_ids) != len(set(excerpt_ids))
                or any(item.get('factId') not in covered_ids
                       or item.get('occurrences') != 1
                       or item.get('text') not in (facts_by_id.get(item.get('factId')) or {}).get('text', '')
                       or hashlib.sha256(str(item.get('text', '')).encode()).hexdigest() != item.get('textSha256')
                       for item in excerpts)):
            out.append(failure('accepted-resume', consolidation_id or 'Speaking consolidation', 'Speaking consolidation excerpt mapping is absent, duplicated, or differs from its covered fact'))
        decision = consolidation.get('coverageDecision') or {}
        if decision != {
                'type': 'reviewed-semantic-coverage',
                'precedence': 'stronger-site-fact-retains-unique-clauses',
                'coveredResumeFactId': 'resume:praxtera:6:b4:retirement-redaction',
        } or decision.get('coveredResumeFactId') not in covered_ids:
            out.append(failure('accepted-resume', consolidation_id or 'Speaking consolidation', 'Speaking consolidation lost its reviewed semantic coverage decision'))
        if (not supporting_ids or len(supporting_ids) != len(set(supporting_ids))
                or any(item.get('unit') != owner.get('unit') or item.get('show') != 'must' for item in supporting)):
            out.append(failure('accepted-resume', consolidation_id or 'Speaking consolidation', 'Speaking consolidation supporting facts are absent, duplicated, or owned elsewhere'))
        canonical_text = canonical.get('text', '')
        if (not clauses or len(clauses) != len(set(clauses))
                or any(clause not in canonical_text for clause in clauses)
                or len(links) != 3 or len(links) != len(set(links))
                or any(not str(link).startswith('https://') for link in links)):
            out.append(failure('accepted-resume', consolidation_id or 'Speaking consolidation', 'Speaking consolidation lost a unique title, date, metric, or source link'))
        if (owner.get('page') != speaking.get('route')
                or owner_unit.get('home') != owner.get('page')
                or owner_unit.get('block') != owner.get('block')
                or owner.get('authorityGroup') not in group_ids):
            out.append(failure('authority-drift', consolidation_id or 'Speaking consolidation', 'Speaking consolidation owner differs from registry or typed provenance authority'))
        if consolidation.get('renderPolicy') != {
                'canonicalOccurrences': 1,
                'coveredFactOccurrences': 0,
                'supportingFactOccurrences': 1,
                'sourceLinkOccurrences': 1,
        }:
            out.append(failure('authority-drift', consolidation_id or 'Speaking consolidation', 'Speaking consolidation render policy drifted'))
    if (len(consolidation_ids) != len(set(consolidation_ids)) or any(not item for item in consolidation_ids)
            or len(covered_consolidation_ids) != len(set(covered_consolidation_ids))):
        out.append(failure('authority-drift', 'speakingEvidenceContract', 'Speaking consolidation IDs or covered fact identities are duplicated'))

    career_source = authority.get('sources', {}).get('acceptedCareerTransition') or {}
    try:
        career_path = safe_path(root, career_source.get('path'))
        career = load_json(career_path)
        if sha256(career_path) != career_source.get('sha256'):
            out.append(failure('authority-drift', 'career-amazon-transition.json', 'Career transition bytes differ from authority'))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        career = {}
        out.append(failure('authority-drift', 'career-amazon-transition.json', f'Career transition cannot be validated: {error}'))
    expected_career_ids = [
        'resume:amazon:2:b0',
        'site:careerLedger[9].bullets[0]',
        'site:careerLedger[9].bullets[2]',
    ]
    if (career_source.get('status') != 'accepted-independent-review'
            or career_source.get('route') != 'career'
            or career_source.get('stateKey') != 'amazon'
            or career_source.get('authorityIds') != expected_career_ids
            or not is_sha256(career_source.get('sharedOracleSha256'))):
        out.append(failure('authority-drift', 'acceptedCareerTransition', 'Career transition authority mirror is incomplete or reordered'))
    if career:
        career_authority = career.get('authority') or {}
        career_resume = career_authority.get('acceptedResume') or {}
        career_equivalence = career_authority.get('resumeEquivalence') or {}
        career_retirement = career_authority.get('retirement') or {}
        if (career.get('schemaVersion') != 1
                or career.get('status') != career_source.get('status')
                or career.get('route') != career_source.get('route')
                or career.get('stateKey') != career_source.get('stateKey')):
            out.append(failure('authority-drift', 'career-amazon-transition.json', 'Career transition identity or acceptance status drifted'))
        if (career_resume.get('paths') != accepted_paths or career_resume.get('sha256') != accepted_hash
                or career_equivalence.get('path') != accepted_baseline.get('equivalencePath')
                or career_equivalence.get('sha256') != accepted_baseline.get('equivalenceSha256')
                or career_equivalence.get('reconciliationId') != 'amazon-management-accepted-merge'):
            out.append(failure('accepted-resume', 'career-amazon-transition.json', 'Career transition differs from the accepted résumé or reconciliation authority'))
        retirement_source = authority.get('sources', {}).get('retirements') or {}
        if (career_retirement.get('path') != retirement_source.get('path')
                or career_retirement.get('sha256') != retirement_source.get('sha256')
                or career_retirement.get('forbiddenSubstring') != 'Alexa Core Engine'):
            out.append(failure('authority-drift', 'career-amazon-transition.json', 'Career transition retirement rule differs from authenticated retirements'))
        else:
            try:
                retirement_records = load_json(safe_path(root, career_retirement.get('path'))).get('facts') or []
                if not any(item.get('text') == career_retirement.get('forbiddenSubstring') for item in retirement_records):
                    out.append(failure('authority-drift', 'career-amazon-transition.json', 'Career transition retirement phrase is not authenticated'))
            except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
                out.append(failure('authority-drift', 'career-amazon-transition.json', f'Career retirement evidence cannot be read: {error}'))

        atom = career.get('atomTransition') or {}
        restored = career.get('restoredAtom') or {}
        amazon = next((item for item in (content.get('careerLedger') or []) if item.get('id') == 'amazon'), {})
        bullets = amazon.get('bullets') or []
        accepted_fact = facts_by_id.get('resume:amazon:2:b0') or {}
        accepted_site_fact = facts_by_id.get('site:careerLedger[9].bullets[0]') or {}
        restored_fact = facts_by_id.get('site:careerLedger[9].bullets[2]') or {}
        if (atom.get('index') != 0
                or atom.get('authorityIds') != expected_career_ids[:2]
                or atom.get('acceptedText') != accepted_fact.get('text')
                or atom.get('acceptedText') != accepted_site_fact.get('text')
                or hashlib.sha256(atom.get('acceptedText', '').encode()).hexdigest() != atom.get('acceptedTextSha256')
                or hashlib.sha256(atom.get('priorText', '').encode()).hexdigest() != atom.get('priorTextSha256')):
            out.append(failure('accepted-resume', 'career-amazon-transition.json', 'Career management atom is not bound to the canonical accepted résumé fact'))
        if (restored.get('index') != 2
                or restored.get('authorityIds') != [
                    'site:careerLedger[9].bullets[2]', 'resume:amazon:2:b0', 'amazon-management-accepted-merge']
                or restored.get('text') != restored_fact.get('text')
                or hashlib.sha256(restored.get('text', '').encode()).hexdigest() != restored.get('textSha256')
                or restored.get('priorOraclePresence') is not True
                or restored.get('preRepairCandidatePresence') is not False
                or restored.get('candidatePresence') is not True):
            out.append(failure('accepted-resume', 'career-amazon-transition.json', 'Career entry-level mentorship atom is absent, weakened, or unbound'))
        if (len(bullets) != 8 or bullets[:1] != [atom.get('acceptedText')]
                or len(bullets) <= 2 or bullets[2] != restored.get('text')
                or any(career_retirement.get('forbiddenSubstring', '') in text for text in bullets)):
            out.append(failure('accepted-resume', 'site/content.json', 'active Amazon source does not implement the exact accepted Career transition'))
        semantic = career.get('semanticEvidence') or {}
        prior_bullets = list(bullets)
        if prior_bullets:
            prior_bullets[0] = atom.get('priorText')
        if (semantic.get('atomCount') != 8
                or semantic.get('changedAtomIndexes') != [0]
                or semantic.get('restoredToPriorAtomIndexes') != [2]
                or canonical_sha256(bullets) != semantic.get('candidateSha256')
                or canonical_sha256(prior_bullets) != semantic.get('priorAcceptedSha256')):
            out.append(failure('authority-drift', 'career-amazon-transition.json', 'Career semantic transition hashes do not reproduce from the active eight-atom source'))

        frame_evidence = career.get('frameEvidence') or {}
        frames = frame_evidence.get('changedFrames') or []
        frame_keys = [(frame.get('width'), frame.get('theme')) for frame in frames]
        if (frame_evidence.get('oracleSha256') != career_source.get('sharedOracleSha256')
                or frame_evidence.get('capturedCareerFrames') != 38
                or frame_evidence.get('unchangedCareerFrames') != 34
                or frame_keys != [(375, 'light'), (1440, 'light'), (375, 'dark'), (1440, 'dark')]
                or any(not is_sha256(frame.get('priorSha256')) or not is_sha256(frame.get('candidateSha256'))
                       or frame.get('priorSha256') == frame.get('candidateSha256') for frame in frames)):
            out.append(failure('authority-drift', 'career-amazon-transition.json', 'Career four-frame transition evidence is incomplete, reordered, or invalid'))
        reviews = career.get('independentReviews') or []
        if ([item.get('reviewer') for item in reviews] != ['rubric_forensics', 'experience_audit']
                or any(item.get('verdict') != 'ACCEPT' for item in reviews)
                or reviews[0].get('evidenceArtifact') is not None
                or (reviews[1].get('evidenceArtifact') or {}).get('sha256') != '9acffbba9c7bb85aedaff82b00b029cf7066e00a9bca50b2e45d0d75198adc9c'):
            out.append(failure('authority-drift', 'career-amazon-transition.json', 'Career transition lacks both independent ACCEPT decisions or the persisted review hash'))

    if protected.get('schema_version') != '2.0.0':
        out.append(failure('authority-drift', 'protected-claims.json', 'typed authority schema is not 2.0.0'))
    typed = protected.get('typed_claims')
    if not isinstance(typed, list):
        return out + [failure('authority-drift', 'protected-claims.json', 'typed_claims is missing')]
    ids = [item.get('id') for item in typed if isinstance(item, dict)]
    if len(ids) != len(set(ids)) or any(not item for item in ids):
        out.append(failure('authority-drift', 'protected-claims.json', 'typed authority IDs are empty or duplicated'))
    mirrored = authority.get('sources', {}).get('protectedClaims', {}).get('typedClaims') or {}
    if (mirrored.get('schemaVersion') != protected.get('schema_version')
            or mirrored.get('ids') != ids
            or mirrored.get('sha256') != canonical_sha256(typed)):
        out.append(failure('authority-drift', 'authority.json', 'typed authority mirror differs from protected claims'))

    groups = [item for item in typed if item.get('claim_type') == 'provenance_group']
    if [item.get('id') for item in groups] != EXPECTED_GROUP_IDS:
        out.append(failure('authority-drift', 'provenance groups', 'Speaking provenance group order or identity changed'))
    if registry.get('authority_groups') != EXPECTED_GROUP_IDS:
        out.append(failure('authority-drift', 'registry authority_groups', 'registry does not reference the exact protected groups'))
    seen_members = set()
    for group, expected_group in zip(groups, EXPECTED_GROUPS):
        for key, expected_value in expected_group.items():
            if group.get(key) != expected_value:
                out.append(failure('authority-drift', group.get('id') or 'provenance group', f'exact Speaking {key} differs from accepted authority'))
        members = group.get('member_units')
        labels = group.get('member_labels')
        if (not isinstance(members, list) or not members or len(members) != len(set(members))
                or not isinstance(labels, list) or len(labels) != len(members)):
            out.append(failure('authority-drift', group.get('id'), 'group members and labels must be unique ordered peers'))
            continue
        overlap = seen_members.intersection(members)
        if overlap:
            out.append(failure('authority-drift', group.get('id'), 'a Speaking member belongs to more than one authority group'))
        seen_members.update(members)
        if any(member not in registry.get('units', {}) for member in members):
            out.append(failure('authority-drift', group.get('id'), 'Speaking authority group references an unregistered unit'))
        if group.get('non_stop') is not True:
            out.append(failure('authority-drift', group.get('id'), 'authority group must remain non-stop'))
        correction = active_corrections.get(group.get('source_correction'))
        if not correction or correction.get('directive') != group.get('source_directive'):
            out.append(failure('authority-drift', group.get('id'), 'active correction does not exactly support the group'))
        fact_id = f'authority:{group.get("id")}:heading'
        fact = facts_by_id.get(fact_id)
        if (not fact or fact.get('text') != group.get('heading') or fact.get('show') != 'must'
                or fact.get('authorityClaim') != group.get('id')
                or fact.get('sourceCorrection') != group.get('source_correction')):
            out.append(failure('correction-fact', fact_id, 'correction-derived heading fact is absent or unbound'))

    research = [item for item in typed if item.get('claim_type') == 'research_record']
    if [item.get('unit') for item in research] != EXPECTED_RESEARCH_UNITS:
        out.append(failure('authority-drift', 'research records', 'Research record order or identity changed'))
    if [item.get('stable_id') for item in research] != EXPECTED_RESEARCH_STABLE_IDS:
        out.append(failure('research-status', 'research records', 'stable DOI identities or their manuscript order changed'))
    for key in ('content_slug', 'stable_id', 'doi'):
        values = [item.get(key) for item in research]
        if len(values) != len(set(values)) or any(not item for item in values):
            out.append(failure('research-status', 'research records', f'Research {key} values are empty or duplicated'))
    claim_ids = [item.get('claim_id') for item in research]
    if len(claim_ids) != len(set(claim_ids)) or any(not item for item in claim_ids):
        out.append(failure('duplicate-claim-id', 'research records', 'Research claim IDs are empty or duplicated'))
    content_research = content.get('research') or []
    content_claim_ids = [(item.get('claim') or {}).get('id') for item in content_research]
    if len(content_claim_ids) != len(set(content_claim_ids)) or any(not item for item in content_claim_ids):
        out.append(failure('duplicate-claim-id', 'site/content.json', 'active Research claim IDs are empty or duplicated'))
    reader_records = research_contract.get('records') or []
    if ([item.get('authorityClaimId') for item in reader_records] != [item.get('id') for item in research]
            or [item.get('unit') for item in reader_records] != EXPECTED_RESEARCH_UNITS):
        out.append(failure('authority-drift', 'research-evidence-contract.json', 'Research reader authority record order or ownership changed'))
    reader_by_claim = {item.get('authorityClaimId'): item for item in reader_records}
    required_research_fields = {
        'id': str,
        'unit': str,
        'content_slug': str,
        'stable_id': str,
        'title': str,
        'manuscript_author_order': list,
        'public_metadata_author_order': list,
        'display_author_order': list,
        'display_order_decision': str,
        'decision_source_type': str,
        'status': str,
        'display_venue': str,
        'year': int,
        'doi': str,
        'built_status': str,
        'causal_qualifiers': list,
        'summary_required_phrases': list,
        'accepted_resume_fact_id': str,
        'accepted_resume_text_sha256': str,
        'snapshot_path': str,
        'snapshot_sha256': str,
        'original_source_sha256': str,
        'original_source_status': str,
        'figure_provenance': dict,
        'claim_id': str,
    }
    manifest_research = {
        item.get('stableId'): item
        for item in (source_manifest.get('sources') or [])
        if item.get('stableId')
    }
    for record in research:
        unit = record.get('unit')
        slug = record.get('content_slug')
        reader = reader_by_claim.get(record.get('id')) or {}
        invalid = [name for name, kind in required_research_fields.items() if not isinstance(record.get(name), kind)]
        if invalid:
            out.append(failure('research-status', unit or 'research record', 'typed Research fields are missing or mistyped: ' + ', '.join(invalid)))
            continue
        for order_name in ('manuscript_author_order', 'public_metadata_author_order', 'display_author_order'):
            order = record[order_name]
            if not order or any(not isinstance(name, str) or not name.strip() for name in order) or len(order) != len(set(order)):
                out.append(failure('author-order', unit, f'{order_name} must be a nonempty ordered set of names'))
        if set(record.get('public_metadata_author_order') or []) != set(record.get('manuscript_author_order') or []):
            out.append(failure('author-order', unit, 'public metadata and manuscript orders do not name the same authors'))
        item = next((entry for entry in content_research if entry.get('slug') == slug), None)
        if item is None:
            out.append(failure('research-status', unit, 'active Research content record is missing'))
            continue
        if record.get('stable_id') != 'doi:' + str(record.get('doi')):
            out.append(failure('research-status', unit, 'stable Research identity is not its DOI'))
        manifested = manifest_research.get(record.get('stable_id')) or {}
        if (manifested.get('sha256') != record.get('original_source_sha256')
                or manifested.get('snapshotPath') != record.get('snapshot_path')
                or manifested.get('snapshotSha256') != record.get('snapshot_sha256')):
            out.append(failure('input-hash', unit, 'typed Research source differs from the accepted source-manifest mirror'))
        derivation = record.get('claim_id_derivation')
        if unit == 'drone-megaddon-2026' and derivation != 'sha256(stable_id)[:24]':
            out.append(failure('duplicate-claim-id', unit, 'Drone-Megaddon 2026 claim identity has no stable derivation contract'))
        if derivation == 'sha256(stable_id)[:24]':
            expected_claim_id = 'claim:' + hashlib.sha256(record.get('stable_id', '').encode()).hexdigest()[:24]
            if record.get('claim_id') != expected_claim_id:
                out.append(failure('duplicate-claim-id', unit, 'Research claim identity differs from its stable derivation'))
        if record.get('display_order_decision') != 'accepted-baseline-precedence' or record.get('decision_source_type') != 'inference':
            out.append(failure('author-order', unit, 'author-order conflict resolution lost its inferred precedence basis'))
        if record.get('display_author_order') != record.get('manuscript_author_order'):
            out.append(failure('author-order', unit, 'display author order no longer follows the accepted manuscript order'))
        expected_authors = ', '.join(record.get('display_author_order') or [])
        if item.get('authors') != expected_authors:
            out.append(failure('author-order', unit, 'active Research author order differs from authority'))
        for key, active_key in (('title', 'title'), ('subtitle', 'subtitle'), ('display_venue', 'venue')):
            if item.get(active_key) != record.get(key):
                out.append(failure('research-status', unit, f'active {active_key} differs from authority'))
        if str(record.get('year')) not in str(item.get('venue')):
            out.append(failure('research-status', unit, 'active venue omits the governed Research year'))
        if item.get('href') != 'https://doi.org/' + str(record.get('doi')):
            out.append(failure('research-status', unit, 'active DOI differs from authority'))
        if (item.get('claim') or {}).get('id') != record.get('claim_id'):
            out.append(failure('duplicate-claim-id', unit, 'active claim identity differs from authority'))
        summary = normalized(item.get('summary'))
        for phrase in record.get('summary_required_phrases') or []:
            if normalized(phrase) not in summary:
                out.append(failure('causal-qualifier', unit, f'active summary omits protected qualifier: {phrase}'))
        if record.get('built_status') not in ('built-prototype', 'proposal', 'working-paper'):
            out.append(failure('research-status', unit, 'built/proposed Research status is invalid'))
        if (record.get('year') < 1900 or not record.get('status').strip()
                or any(not isinstance(value, str) or not value.strip() for value in record.get('causal_qualifiers', []))):
            out.append(failure('research-status', unit, 'Research year, status, or causal qualifiers are invalid'))
        reader_qualifiers = {value.get('factId'): value for value in reader.get('qualifiers', [])}
        for index, protected_phrase in enumerate(record.get('causal_qualifiers') or []):
            fact_id = f'authority:{record.get("id")}:qualifier:{index}'
            reader_qualifier = reader_qualifiers.get(fact_id) or {}
            fact = facts_by_id.get(fact_id) or {}
            if normalized(protected_phrase) not in normalized(reader_qualifier.get('text')):
                out.append(failure('research-authority-fact', fact_id, 'Research qualifier text does not preserve the protected phrase'))
            if (reader_qualifier.get('textSha256') != hashlib.sha256(str(reader_qualifier.get('text', '')).encode()).hexdigest()
                    or fact.get('unit') != unit
                    or fact.get('field') != 'authority_qualifier'
                    or fact.get('text') != reader_qualifier.get('text')
                    or fact.get('source') != 'authority'
                    or fact.get('show') != 'may'
                    or fact.get('authorityClaim') != record.get('id')
                    or fact.get('authorityPath') != 'qualifiers'):
                out.append(failure('research-authority-fact', fact_id, 'Research qualifier fact is absent or differs from the accepted contract'))
        reader_figure = reader.get('figure') or {}
        reader_fact_specs = []
        image_alt = reader_figure.get('imageAlt') or {}
        if image_alt.get('text'):
            reader_fact_specs.append((
                f'authority:{record.get("id")}:figure:image-alt',
                'authority_figure_alt', 'figure.imageAlt', image_alt.get('text'), image_alt.get('textSha256'),
            ))
        grouping = reader_figure.get('grouping') or {}
        if grouping.get('labelText'):
            reader_fact_specs.append((
                f'authority:{record.get("id")}:figure:group-label',
                'authority_figure_group_label', 'figure.grouping.labelText',
                grouping.get('labelText'), grouping.get('labelTextSha256'),
            ))
        for fact_id, field, authority_path, text, text_sha256 in reader_fact_specs:
            fact = facts_by_id.get(fact_id) or {}
            if (text_sha256 != hashlib.sha256(str(text).encode()).hexdigest()
                    or fact.get('unit') != unit
                    or fact.get('field') != field
                    or fact.get('text') != text
                    or fact.get('source') != 'authority'
                    or fact.get('show') != 'may'
                    or fact.get('authorityClaim') != record.get('id')
                    or fact.get('authorityPath') != authority_path):
                out.append(failure('research-authority-fact', fact_id, 'Research reader authority fact is absent or differs from the accepted contract'))
        if (len(record.get('snapshot_sha256', '')) != 64 or len(record.get('original_source_sha256', '')) != 64
                or any(ch not in '0123456789abcdef' for ch in record.get('original_source_sha256', ''))):
            out.append(failure('input-hash', unit, 'Research source hashes are not complete SHA-256 values'))
        figure = record.get('figure_provenance') or {}
        figure_kind = figure.get('kind')
        if figure_kind == 'native-pdf-available':
            if figure.get('source_pdf_sha256') != record.get('original_source_sha256') or not isinstance(figure.get('page'), int):
                out.append(failure('research-status', unit, 'native figure provenance differs from the governed source PDF'))
        elif figure_kind == 'source-markdown-exact':
            if figure.get('source_sha256') != record.get('snapshot_sha256'):
                out.append(failure('research-status', unit, 'markdown figure provenance differs from the governed snapshot'))
        elif figure_kind == 'text-derived-only':
            if not isinstance(figure.get('reason'), str) or not figure.get('reason').strip():
                out.append(failure('research-status', unit, 'text-only figure provenance lacks its source limitation'))
        else:
            out.append(failure('research-status', unit, 'Research figure provenance kind is missing or unsupported'))
        try:
            snapshot = safe_path(root, record.get('snapshot_path'))
            if sha256(snapshot) != record.get('snapshot_sha256'):
                out.append(failure('input-hash', unit, 'Research snapshot bytes differ from authority'))
        except (OSError, ValueError, TypeError) as error:
            out.append(failure('input-hash', unit, f'Research snapshot is unavailable: {error}'))
        resume_fact = facts_by_id.get(record.get('accepted_resume_fact_id'))
        if (not resume_fact or resume_fact.get('source') != 'resume'
                or hashlib.sha256(resume_fact.get('text', '').encode()).hexdigest() != record.get('accepted_resume_text_sha256')):
            out.append(failure('accepted-resume', unit, 'accepted résumé Research clause is absent or changed'))
        else:
            if not names_appear_in_order(resume_fact.get('text'), record.get('manuscript_author_order')):
                out.append(failure('author-order', unit, 'manuscript author order conflicts with the accepted résumé clause'))
            resume_text = normalized(resume_fact.get('text'))
            status_cues = {
                'built-prototype': ('built',),
                'proposal': ('propos',),
                'working-paper': ('working paper',),
            }
            if not any(cue in resume_text for cue in status_cues.get(record.get('built_status'), ())):
                out.append(failure('research-status', unit, 'built/proposed status conflicts with the accepted résumé clause'))
        if record.get('built_status') == 'proposal':
            if 'proposal' not in normalized(record.get('status')) or 'proposed' not in normalized(item.get('summary')):
                out.append(failure('research-status', unit, 'proposal status is not preserved in both authority and active summary'))
        try:
            snapshot_text = open(safe_path(root, record.get('snapshot_path')), encoding='utf-8', errors='replace').read()
            if not names_appear_in_order(snapshot_text, record.get('manuscript_author_order')):
                out.append(failure('author-order', unit, 'manuscript author order conflicts with the governed snapshot'))
        except (OSError, ValueError, TypeError) as error:
            out.append(failure('input-hash', unit, f'Research snapshot cannot be read for author order: {error}'))
    return out


def verify(root):
    root = os.path.abspath(root)
    rubric = os.path.join(root, '.claude', 'rubric')
    facts_dir = os.path.join(rubric, 'facts')
    tracked = {
        'facts.json': os.path.join(facts_dir, 'facts.json'),
        'source-hashes.json': os.path.join(facts_dir, 'source-hashes.json'),
        'authority-coverage.json': os.path.join(facts_dir, 'authority-coverage.json'),
    }
    out = []
    try:
        sealed = load_json(tracked['source-hashes.json'])
        facts = load_json(tracked['facts.json'])
        coverage = load_json(tracked['authority-coverage.json'])
    except (OSError, json.JSONDecodeError) as error:
        return {'ok': False, 'failures': [failure('rebuild-drift', 'fact store', f'fact evidence is unreadable: {error}')], 'root': root}
    if (sealed.get('schemaVersion') != 3
            or sealed.get('generator') != 'deterministic-governed-sources-with-pinned-history'):
        out.append(failure('rebuild-drift', 'source-hashes.json', 'fact store generator identity is stale'))
    try:
        expected_history = expected_historical_input(root)
        if sealed.get('historicalHeadInput') != expected_history:
            out.append(failure('historical-source-impact', 'source-hashes.json', 'historical input is not the exact pinned, quarantined Git tree'))
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        out.append(failure('historical-source-impact', 'source-hashes.json', f'pinned historical input cannot be resolved: {error}'))
    inputs = sealed.get('inputs')
    if not isinstance(inputs, dict) or list(inputs) != sorted(EXPECTED_INPUTS):
        out.append(failure('input-hash', 'source-hashes.json', 'sealed fact input set is incomplete or reordered'))
    else:
        for relative, expected in inputs.items():
            try:
                path = safe_path(root, relative)
                if sha256(path) != expected:
                    out.append(failure('input-hash', relative, 'sealed fact input hash drifted'))
            except (OSError, ValueError, TypeError) as error:
                out.append(failure('input-hash', relative, f'sealed fact input is unavailable: {error}'))
    if len({item.get('id') for item in facts}) != len(facts):
        out.append(failure('duplicate-fact-id', 'facts.json', 'fact IDs are duplicated'))
    historical_facts = [item for item in facts if item.get('source') == 'head']
    if not historical_facts:
        out.append(failure('historical-source-impact', 'facts.json', 'pinned historical regression evidence is absent'))
    for item in historical_facts:
        if (item.get('historicalCommit') != PINNED_HISTORICAL_COMMIT
                or item.get('authorityRank') != 'historical-review'
                or item.get('show') not in ('may', 'never')):
            out.append(failure('historical-source-impact', item.get('id') or 'historical fact', 'historical fact escaped its pinned low-authority quarantine'))
            break
    if any(item.get('unit') in EXPECTED_RESEARCH_UNITS and item.get('show') != 'never' for item in historical_facts):
        out.append(failure('historical-source-impact', 'Research historical facts', 'historical Research data is not fully quarantined'))

    if not isinstance(coverage, dict) or coverage.get('conformanceScope') != {
        'authoritySourceValidity': 'verified-by-verify_facts.py',
        'domGroupAncestry': 'deferred-to-speaking-renderer-gate',
    }:
        out.append(failure('authority-drift', 'authority-coverage.json', 'authority-source validity and future DOM conformance are not explicitly separated'))
    clauses = coverage.get('acceptedResumeClauses') if isinstance(coverage, dict) else None
    if not isinstance(clauses, list) or [item.get('factId') for item in clauses] != EXPECTED_ACCEPTED_RESUME_IDS:
        out.append(failure('accepted-resume', 'authority-coverage.json', 'accepted résumé clause ledger is incomplete or reordered'))
    else:
        facts_by_id = {item.get('id'): item for item in facts}
        for clause in clauses:
            fact = facts_by_id.get(clause.get('factId'))
            if (not fact or fact.get('source') != 'resume'
                    or clause.get('source') != 'resume'
                    or clause.get('unit') != fact.get('unit')
                    or clause.get('field') != fact.get('field')
                    or clause.get('show') != fact.get('show')
                    or clause.get('text') != fact.get('text')
                    or clause.get('textSha256') != hashlib.sha256(fact.get('text', '').encode()).hexdigest()):
                out.append(failure('accepted-resume', clause.get('factId') or 'coverage clause', 'accepted résumé clause ledger differs from the rebuilt fact'))
    transition_coverage = coverage.get('acceptedResumeTransitions') if isinstance(coverage, dict) else None
    if (not isinstance(transition_coverage, dict)
            or transition_coverage.get('factIds') != EXPECTED_PROJECT_TRANSITION_IDS
            or transition_coverage.get('canonicalProjectsLedgerSha256') != EXPECTED_PROJECTS_LEDGER_SHA256
            or transition_coverage.get('preservedDimensions') != ['ownership', 'metrics', 'mechanisms', 'scope', 'outcomes']
            or transition_coverage.get('transitionSha256') != load_json(os.path.join(rubric, 'authority', 'resume-equivalence.json')).get('projectsTransition', {}).get('transitionSha256')):
        out.append(failure('accepted-resume', 'authority-coverage.json', 'Projects accepted-resume transition coverage is incomplete'))
    else:
        transition_items = transition_coverage.get('coverage') or []
        if [item.get('factId') for item in transition_items] != EXPECTED_PROJECT_TRANSITION_IDS:
            out.append(failure('accepted-resume', 'authority-coverage.json', 'Projects transition fact coverage is incomplete or reordered'))
        facts_by_id = {item.get('id'): item for item in facts}
        for item in transition_items:
            fact = facts_by_id.get(item.get('factId'))
            if (not fact or item.get('acceptedTextSha256') != item.get('canonicalFactTextSha256')
                    or item.get('canonicalFactTextSha256') != hashlib.sha256(fact.get('text', '').encode()).hexdigest()
                    or item.get('legacyTextSha256') == item.get('acceptedTextSha256')):
                out.append(failure('accepted-resume', item.get('factId') or 'transition coverage', 'Projects transition coverage does not bind the canonical accepted fact'))
    reconciliation_coverage = coverage.get('acceptedSourceReconciliations') if isinstance(coverage, dict) else None
    equivalence_reconciliations = load_json(os.path.join(rubric, 'authority', 'resume-equivalence.json')).get('sourceReconciliations') or {}
    if (not isinstance(reconciliation_coverage, dict)
            or reconciliation_coverage.get('sha256') != equivalence_reconciliations.get('sha256')
            or [item.get('id') for item in reconciliation_coverage.get('entries', [])] != [
                'amazon-management-accepted-merge', 'cmu-teaching-accepted-deduplication']):
        out.append(failure('accepted-resume', 'authority-coverage.json', 'accepted-source reconciliation coverage is incomplete'))
    redaction_coverage = coverage.get('retirementRedactions') if isinstance(coverage, dict) else None
    redacted_facts = [item for item in facts if item.get('retirementRedaction')]
    if (not isinstance(redaction_coverage, list)
            or [item.get('factId') for item in redaction_coverage] != [item.get('id') for item in redacted_facts]):
        out.append(failure('authority-drift', 'authority-coverage.json', 'phrase-retirement redaction coverage differs from governed facts'))
    else:
        facts_by_id = {item.get('id'): item for item in facts}
        for item in redaction_coverage:
            fact = facts_by_id.get(item.get('factId'))
            source_fact = facts_by_id.get(item.get('sourceFact'))
            if (not fact or not source_fact or source_fact.get('show') != 'never' or source_fact.get('retired') is not True
                    or item.get('retiredPhrase') in fact.get('text', '')
                    or item.get('text') != fact.get('text')
                    or item.get('textSha256') != hashlib.sha256(fact.get('text', '').encode()).hexdigest()):
                out.append(failure('authority-drift', item.get('factId') or 'retirement redaction', 'phrase retirement either leaked the retired phrase or lost the preserved remainder'))
        eagles_resume = next((item for item in redacted_facts if item.get('source') == 'resume' and item.get('unit') == 'eagles'), None)
        if not eagles_resume or '300+' not in eagles_resume.get('text', '') or eagles_resume.get('show') != 'must':
            out.append(failure('accepted-resume', 'Eagles retirement redaction', 'retiring the venue incorrectly removed the accepted 300+ keynote fact'))
    if sha256(tracked['facts.json']) != sealed.get('factsSha256') or len(facts) != sealed.get('recordCount'):
        out.append(failure('rebuild-drift', 'facts.json', 'tracked facts differ from their record count or hash'))
    try:
        if sha256(tracked['authority-coverage.json']) != sealed.get('coverageSha256'):
            out.append(failure('rebuild-drift', 'authority-coverage.json', 'coverage ledger hash differs from its seal'))
    except OSError as error:
        out.append(failure('rebuild-drift', 'authority-coverage.json', f'coverage ledger is unavailable: {error}'))
    try:
        out.extend(contract_failures(root, facts))
    except (OSError, ValueError, TypeError, json.JSONDecodeError, KeyError) as error:
        out.append(failure('authority-drift', 'authority contract', f'authority contract could not be validated: {error}'))

    rebuilt_dir = tempfile.mkdtemp(prefix='facts-rebuild-')
    try:
        run = subprocess.run(
            [sys.executable, os.path.join(facts_dir, 'build_facts.py'), '--out-dir', rebuilt_dir],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=120,
        )
        if run.returncode != 0:
            out.append(failure('rebuild-drift', 'build_facts.py', 'independent rebuild failed: ' + run.stderr[-400:]))
        else:
            for name, tracked_path in tracked.items():
                rebuilt_path = os.path.join(rebuilt_dir, name)
                if not os.path.isfile(rebuilt_path) or open(tracked_path, 'rb').read() != open(rebuilt_path, 'rb').read():
                    out.append(failure('rebuild-drift', name, 'independent rebuild differs byte-for-byte'))
    finally:
        shutil.rmtree(rebuilt_dir, ignore_errors=True)
    report = {
        'ok': not out,
        'failures': out,
        'root': root,
        'recordCount': len(facts),
        'factsSha256': sha256(tracked['facts.json']),
        'sourceHashesSha256': sha256(tracked['source-hashes.json']),
        'coverageSha256': sha256(tracked['authority-coverage.json']) if os.path.isfile(tracked['authority-coverage.json']) else None,
    }
    return report


def main(argv=None):
    default_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    parser = argparse.ArgumentParser(description='Rebuild and verify the governed fact store without modifying it.')
    parser.add_argument('--root', default=default_root, help='Repository root to verify.')
    parser.add_argument('--json', dest='json_path', help='Optional structured report path.')
    args = parser.parse_args(argv)
    report = verify(args.root)
    if args.json_path:
        with open(args.json_path, 'w') as stream:
            json.dump(report, stream, indent=2, sort_keys=True)
            stream.write('\n')
    for item in report['failures']:
        print(f"FAIL {item['kind']} {item['where']}: {item['message']}")
    if report['ok']:
        print(f"facts: {report['recordCount']} records independently rebuilt and authority-bound")
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
