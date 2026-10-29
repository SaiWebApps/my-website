# Governed fact store

`build_facts.py` accepts only an explicit `--out-dir`. It derives the store from the two hash-identical accepted résumé copies, current `site/content.json`, the registry, Speaking sheet, paper summaries and snapshots, approved/retired facts, and the sealed authority files listed in `source-hashes.json`.

Historical `src/data` is regression evidence, not authority. The builder reads only commit `8f2a57ac23235c9cfbc7d3c24d6e071cb9c1dfe9` and tree `ad8e824f71984ede88d408042021e7f0964e7d3b`; working-tree or future `HEAD` changes cannot enter the store. Every historical fact is tagged `historical-review`, can be at most `may`, and every historical Research fact is `never`.

`verify_facts.py` is read-only. It resolves the pinned Git objects, verifies every input hash, rebuilds into a temporary directory, and requires byte-for-byte equality for `facts.json`, `authority-coverage.json`, and `source-hashes.json`. `authority_gate.py` calls this verifier, so `score.py` remains the sole website orchestrator.

Résumé transitions use `acceptedText` as the canonical fact. `legacyText` is an audit preimage only. The five Projects transitions are bound as leading-verb-only changes with identical hashed tails and an exact canonical Projects ledger hash.

This store validates the source authority for Speaking groups. DOM ancestry, exact rendered group order, and headings are deliberately deferred to the Speaking renderer verifier; CSS classes alone are not conformance evidence.
