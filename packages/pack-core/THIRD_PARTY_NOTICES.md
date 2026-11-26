# Third-party notices

This project ports or adapts code and data from the projects below, with
attribution, under their original licenses. Every ported file carries a
header naming its source. This file is the canonical list; add an entry
in the same PR that ports the code.

## Code ported or adapted

| Source | License | What was taken | Where |
|---|---|---|---|
| _none yet_ | | | |

Planned sources (see docs/ARCHITECTURE.md for the full licensing analysis):

- **Presidio** (MIT, Copyright (c) Presidio Contributors) — pattern regexes, validators, context-word lists, normalizer, operator semantics.
- **ntrieuvi97/vipii** (MIT, © 2026 Vi Nguyen) — Vietnamese recognizers: CCCD/MST validators, context and anti-context lists, surnames, exclusions.
- **hmtrii/vipii** (MIT) — BHYT shape and context lists.
- **agent-redact** (MIT) — ReDoS fuzz test, vault format.
- **rehydra** (MIT, © 2025 ELAN Languages) — key/storage provider interfaces, tag attributes.
- **openredaction** (MIT) — individual validators, each re-tested first.
- **Philter** (BSD-3-Clause, © 2018 The Regents of the University of California) and **philter-lite** (BSD-3-Clause) — ordered include/exclude precedence; regexes rewritten Unicode-aware. The names of the Regents may not be used to endorse this project.
- **scrubadub**, **detect-secrets**, **Phileas** (Apache-2.0) — detector semantics and filter ideas; NOTICE contents carried over when code is ported, modified files marked.
- **presidio-research** (MIT) — evaluator semantics. Its bundled Fake Name Generator data (CC BY-SA 3.0 US) is **not** used.
- **pii-codex** (BSD-3-Clause) — PII-type to NIST/DHS/HIPAA mapping table.
- **gitleaks** (MIT) — rule schema, per-rule true/false-positive sample pattern.

## Data

| Source | License | Use |
|---|---|---|
| _none yet_ | | |

Never bundled, by policy: UMLS/SNOMED-derived lexicons, n2c2/i2b2 corpora,
PhoNER_COVID19, NLM-Scrubber, anything GPL/LGPL/AGPL or source-available.

## Reimplemented from primary specifications only

Validators whose only open implementations are LGPL/GPL (python-stdnum,
PhysioNet deid) are written from the primary specifications (CMS, SSA, IRS,
Vietnamese circulars) without consulting those implementations. Each
validator's doc comment cites the primary source it was written from.
