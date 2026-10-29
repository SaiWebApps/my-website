#!/usr/bin/env python3
"""Hermetic authority gate for the website. All runtime inputs are repository-relative; no regular expressions."""
import hashlib
import json
import os
import sys

from pypdf import PdfReader

RUBRIC = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(RUBRIC))
MANIFEST_PATH = os.path.join(RUBRIC, 'authority.json')
FACTS_DIR = os.path.join(RUBRIC, 'facts')
sys.path.insert(0, FACTS_DIR)
import verify_facts
sys.path.insert(0, RUBRIC)
import career_evidence
import career_visual_transition_verify

_FACT_REPORT = None


def sha256(path):
    with open(path, 'rb') as stream:
        return hashlib.sha256(stream.read()).hexdigest()


def normalized(text):
    return ' '.join(str(text).split()).casefold()


def is_sha256(value):
    if not isinstance(value, str) or len(value) != 64:
        return False
    return all(ch in '0123456789abcdef' for ch in value)


def repo_path(relative):
    if not isinstance(relative, str) or not relative or os.path.isabs(relative):
        raise ValueError('path is not repository-relative')
    path = os.path.abspath(os.path.join(ROOT, relative))
    if os.path.commonpath((ROOT, path)) != ROOT:
        raise ValueError('path leaves the repository')
    return path


def load_manifest():
    with open(MANIFEST_PATH) as stream:
        return json.load(stream)


def rubric_ids(path):
    ids = []
    for line in open(path):
        cells = [cell.strip() for cell in line.strip().split('|')[1:-1]]
        if not cells:
            continue
        cell = cells[0]
        if cell.startswith('**') and cell.endswith('**') and len(cell) > 4:
            ids.append(cell[2:-2])
    return ids


def failure(check, where, message):
    return {'check': check, 'page': '-', 'where': where, 'msg': message, 'src': 'authority'}


def fact_report():
    global _FACT_REPORT
    if _FACT_REPORT is None:
        _FACT_REPORT = verify_facts.verify(ROOT)
    return _FACT_REPORT


def failures():
    out = []
    try:
        manifest = load_manifest()
    except (OSError, json.JSONDecodeError) as error:
        return [failure('P5', 'authority.json', f'authority manifest is missing or unreadable: {error}')]

    expected_precedence = [
        'direct-user-corrections',
        'accepted-professional-baseline',
        'authenticated-retirements',
        'accepted-profile',
        'product-contract',
        'rubric-implementation',
        'historical-review',
    ]
    precedence = manifest.get('precedence') or []
    if [item.get('id') for item in precedence] != expected_precedence:
        out.append(failure('P5', 'precedence', 'authority precedence is incomplete or reordered'))
    if [item.get('rank') for item in precedence] != list(range(1, len(expected_precedence) + 1)):
        out.append(failure('P5', 'precedence', 'authority ranks must be consecutive and start at one'))
    if not str(manifest.get('resolutionRule', '')).strip():
        out.append(failure('P5', 'precedence', 'authority conflict resolution rule is missing'))

    sources = manifest.get('sources') or {}
    file_sources = ('acceptedProfile', 'acceptedSourceManifest', 'acceptedCareerTransition',
                    'speakingEvidenceContract', 'researchEvidenceContract', 'careerEvidenceContract',
                    'careerEvidenceVisualTransition', 'protectedClaims', 'product', 'retirements', 'rubric')
    for source_id in file_sources:
        source = sources.get(source_id) or {}
        try:
            path = repo_path(source.get('path'))
        except (TypeError, ValueError) as error:
            out.append(failure('P5', source_id, f'authority source path is invalid: {error}'))
            continue
        expected = source.get('sha256')
        if not is_sha256(expected):
            out.append(failure('P5', source_id, 'authority source has no valid SHA-256'))
        elif not os.path.isfile(path):
            out.append(failure('P5', source_id, f'authority source is missing: {source.get("path")}'))
        elif sha256(path) != expected:
            out.append(failure('P5', source_id, f'authority source hash drifted: {source.get("path")}'))

    career_source = sources.get('careerEvidenceContract') or {}
    if (career_source.get('schemaVersion') != 1 or career_source.get('status') != 'accepted-live-dom'
            or career_source.get('route') != 'career'):
        out.append(failure('P5', 'careerEvidenceContract', 'Career evidence authority identity or status changed'))
    try:
        career_report = career_evidence.validate(ROOT)
        career_checks = {
            'wrong-owner': 'A3',
            'heading': 'A3',
            'b8-canonical-owner': 'A3',
            'contract-schema': 'P5',
            'artifact-drift': 'P5',
        }
        for item in career_report.get('failures', []):
            out.append(failure(
                career_checks.get(item.get('kind'), 'B0'),
                item.get('where') or 'Career evidence',
                item.get('message') or 'Career evidence validation failed',
            ))
    except Exception as error:
        out.append(failure('P5', 'careerEvidenceContract', f'Career evidence validator could not run: {error}'))

    research_source = sources.get('researchEvidenceContract') or {}
    if (research_source.get('schemaVersion') != 2
            or research_source.get('status') != 'accepted-static-open-authority'
            or research_source.get('route') != 'research'):
        out.append(failure('P5', 'researchEvidenceContract',
                           'Research evidence authority identity or status changed'))

    visual_source = sources.get('careerEvidenceVisualTransition') or {}
    if (visual_source.get('schemaVersion') != 1
            or visual_source.get('status') != 'accepted-independent-review'
            or visual_source.get('route') != 'career'
            or visual_source.get('priorSharedOracleSha256') != '2ce51c293a3cd60d83bd2d47c5ff5d93cc4a21de6e995a344785ef8bce7f6477'):
        out.append(failure('P5', 'careerEvidenceVisualTransition',
                           'Career visual-transition authority identity or prior oracle changed'))
    try:
        visual_report = career_visual_transition_verify.validate(ROOT)
        for item in visual_report.get('failures', []):
            out.append(failure(
                'P5',
                item.get('where') or 'Career visual transition',
                item.get('message') or 'Career visual-transition validation failed',
            ))
    except Exception as error:
        out.append(failure('P5', 'careerEvidenceVisualTransition',
                           f'Career visual-transition validator could not run: {error}'))

    profile_source = sources.get('acceptedProfile') or {}
    profile = {}
    try:
        profile = json.load(open(repo_path(profile_source.get('path'))))
        if profile.get('profile_id') != profile_source.get('profileId'):
            out.append(failure('P5', 'acceptedProfile', 'accepted profile identity does not match the manifest'))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        out.append(failure('P5', 'acceptedProfile', f'accepted profile cannot be validated: {error}'))

    source_manifest = sources.get('acceptedSourceManifest') or {}
    try:
        source_manifest_data = json.load(open(repo_path(source_manifest.get('path'))))
        if (source_manifest_data.get('profileId') != source_manifest.get('profileId')
                or (source_manifest_data.get('upstream') or {}).get('sha256') != source_manifest.get('upstreamSha256')
                or (source_manifest_data.get('upstream') or {}).get('profilePath') != (profile.get('authority') or {}).get('source_manifest')):
            out.append(failure('P5', 'acceptedSourceManifest', 'source-manifest mirror identity or upstream hash differs from authority'))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        out.append(failure('P5', 'acceptedSourceManifest', f'source-manifest mirror cannot be validated: {error}'))

    protected_source = sources.get('protectedClaims') or {}
    protected = {}
    try:
        protected = json.load(open(repo_path(protected_source.get('path'))))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        out.append(failure('B0', 'protectedClaims', f'protected claims cannot be validated: {error}'))
    corrections_path = None
    try:
        corrections_path = repo_path(protected_source.get('correctionsPath'))
        expected = protected_source.get('correctionsSha256')
        if not is_sha256(expected) or sha256(corrections_path) != expected:
            out.append(failure('P5', 'protectedClaims', 'sealed correction log hash drifted'))
    except (OSError, ValueError, TypeError) as error:
        out.append(failure('P5', 'protectedClaims', f'sealed correction log cannot be validated: {error}'))

    manifest_claims = protected_source.get('claims') or []
    protected_claims = protected.get('protected_facts') or []
    for claim in manifest_claims:
        claim_id = claim.get('id')
        source_claim = next((item for item in protected_claims if item.get('id') == claim_id), None)
        if source_claim is None or normalized(source_claim.get('required_meaning')) != normalized(claim.get('requiredMeaning')):
            out.append(failure('B0', claim_id or 'protectedClaims', 'manifest claim differs from the accepted protected claim'))
        correction_id = claim.get('sourceCorrection')
        if corrections_path and correction_id:
            records = []
            try:
                records = [json.loads(line) for line in open(corrections_path) if line.strip()]
            except (OSError, json.JSONDecodeError) as error:
                out.append(failure('B0', correction_id, f'sealed correction record cannot be read: {error}'))
            correction = next((item for item in records if item.get('id') == correction_id and item.get('status') == 'active'), None)
            if correction is None or normalized(claim.get('sourceDirective')) != normalized(correction.get('directive')):
                out.append(failure('B0', correction_id, 'active direct-user correction does not support the protected claim'))

    baseline = sources.get('acceptedBaseline') or {}
    expected_pdf = baseline.get('sha256')
    required_meaning = normalized(baseline.get('requiredMeaning'))
    pdf_bytes = []
    pdf_texts = []
    for relative in baseline.get('paths') or []:
        try:
            path = repo_path(relative)
            actual = sha256(path)
            pdf_bytes.append(open(path, 'rb').read())
            if not is_sha256(expected_pdf) or actual != expected_pdf:
                out.append(failure('B0', relative, 'public résumé hash differs from the accepted baseline'))
                continue
            text = normalized(' '.join((page.extract_text() or '') for page in PdfReader(path).pages))
            pdf_texts.append(text)
            if not required_meaning or required_meaning not in text:
                out.append(failure('B0', relative, 'public résumé omits the sealed seven-vendor management scope'))
        except (OSError, ValueError, TypeError) as error:
            out.append(failure('B0', str(relative), f'public résumé cannot be validated: {error}'))
    if len(pdf_bytes) != 2:
        out.append(failure('B0', 'acceptedBaseline', 'exactly two public résumé artifacts must be governed'))
    elif pdf_bytes[0] != pdf_bytes[1]:
        out.append(failure('B0', 'acceptedBaseline', 'the two public résumé artifacts are not byte-identical'))

    try:
        equivalence_path = repo_path(baseline.get('equivalencePath'))
        if sha256(equivalence_path) != baseline.get('equivalenceSha256'):
            out.append(failure('B0', 'resume-equivalence.json', 'résumé equivalence ledger hash drifted'))
        equivalence = json.load(open(equivalence_path))
        if (equivalence.get('schemaVersion') != 2 or equivalence.get('semantics') != {
                'canonicalFactSide': 'acceptedText',
                'legacyFactSide': 'audit-preimage-only',
                'acceptedSource': 'public/assets/Resume.pdf',
        }):
            out.append(failure('B0', 'resume-equivalence.json', 'résumé transition semantics are stale'))
        equivalences = equivalence.get('equivalences') or []
        facts = json.load(open(os.path.join(RUBRIC, 'facts', 'facts.json')))
        facts_by_id = {item.get('id'): item for item in facts}
        ids = [item.get('factId') for item in equivalences]
        if len(ids) != len(set(ids)):
            out.append(failure('B0', 'resume-equivalence.json', 'résumé equivalence ledger contains duplicate fact IDs'))
        for item in equivalences:
            fact_id = item.get('factId')
            fact = facts_by_id.get(fact_id)
            accepted_text = normalized(item.get('acceptedText'))
            if not fact or fact.get('source') != 'resume' or normalized(fact.get('text')) != accepted_text:
                out.append(failure('B0', fact_id or 'resume-equivalence.json', 'canonical fact does not equal acceptedText from the governed résumé'))
            if not normalized(item.get('legacyText')):
                out.append(failure('B0', fact_id or 'resume-equivalence.json', 'audit-preimage legacyText is absent'))
            if not accepted_text or any(accepted_text not in text for text in pdf_texts):
                out.append(failure('B0', fact_id or 'resume-equivalence.json', 'accepted side of résumé equivalence is absent from a public résumé'))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        out.append(failure('B0', 'resume-equivalence.json', f'résumé equivalence ledger cannot be validated: {error}'))

    rubric_source = sources.get('rubric') or {}
    try:
        actual_ids = rubric_ids(repo_path(rubric_source.get('path')))
        if actual_ids != rubric_source.get('ids'):
            out.append(failure('P4', 'rubric IDs', 'authority manifest rubric IDs differ from rubric.md'))
        if len(actual_ids) != len(set(actual_ids)):
            out.append(failure('P4', 'rubric IDs', 'rubric.md contains duplicate acceptance IDs'))
    except (OSError, ValueError, TypeError) as error:
        out.append(failure('P4', 'rubric IDs', f'rubric IDs cannot be validated: {error}'))

    fact_checks = {
        'accepted-resume': 'B0',
        'correction-fact': 'B0',
        'author-order': 'B0',
        'duplicate-claim-id': 'B0',
        'research-status': 'B0',
        'causal-qualifier': 'B0',
        'authority-drift': 'P5',
        'input-hash': 'P5',
        'rebuild-drift': 'P5',
        'historical-source-impact': 'P5',
        'duplicate-fact-id': 'P5',
    }
    try:
        governed_facts = fact_report()
        for item in governed_facts.get('failures', []):
            out.append(failure(
                fact_checks.get(item.get('kind'), 'P5'),
                item.get('where') or 'governed facts',
                item.get('message') or 'governed fact verification failed',
            ))
    except Exception as error:
        out.append(failure('P5', 'governed facts', f'independent fact verification could not run: {error}'))

    return out


def main():
    out = failures()
    for item in out:
        print(f"FAIL {item['check']} {item['where']}: {item['msg']}")
    if not out:
        print('authority: hashes, precedence, governed facts, protected claims, and both public résumés verified')
    return 1 if out else 0


if __name__ == '__main__':
    sys.exit(main())
