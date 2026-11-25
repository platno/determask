# Roadmap

Safety rails come before coverage. The Vietnamese pack and the
machine-translation path ship first because that consumer is exposed today.
Evaluation is a product, not an afterthought.

| Milestone | Scope | Exit criterion |
|---|---|---|
| **M0 Repository & governance** ← *here* | Apache-2.0, NOTICE, THIRD_PARTY_NOTICES, DCO, provenance rule, security policy, no-ML policy; CI with typecheck, tests, ReDoS lint and n/4n timing gate; JSON Schema skeleton | CI green on an empty pack |
| **M1 Core engine** | Types; normalizer with offset maps and folded views; regex runner (native for CI-gated built-ins, re2js for user patterns); code-point Aho-Corasick + keyword prefilter; scoring and ordered rule sets; overlap strategies; fail-closed errors; rule trace; re2js astral-offset and throughput benchmarks | Offsets round-trip under property tests; the likelihood +1/−1 clamp vector passes; identical output on Node, Bun, browser |
| **M2 Vietnamese pack + knownValues → v0.1** | CCCD, CMND, MST, BHYT/BHXH, phones (libphonenumber-js `max`, VN default, legacy 11-digit), email/URL/IP, day-first dates & DOB, address chain, plates, bank accounts, passport, GPLX, names (surname + honorific, ambiguity lists), knownValues + propagation, anti-context words, protected clinical values | The Vietnamese probe note masks fully (incl. BHYT and a lowercase unaccented known name); the numbers-only probe is untouched; vitals survive |
| **M3 Placeholders, restore & MT adapter → v0.2** | `placeholder` operator, sealed map, strict restore, literal escaping, HTML escaper + `<span translate="no">` wrapper, post-MT validator, gender metadata; run the batched Translation v2 verification request | v2 go/no-go recorded (fallback: v3 or DeepL XML); leak canaries at 0 |
| **M4 US/HIPAA pack → v0.3** | SSN, ITIN, MBI, NPI, DEA, NANP, ZIP3 data, age>89 generalization, English names from Census/SSA with gating; `hipaa-safe-harbor` preset | Every Safe Harbor item mapped or marked out of scope; EN probe masks while ICD-10/doses/vitals survive |
| **M5 Evaluation harness → v0.4** | Char/token/span-IoU evaluators (pinned threshold), F2, FN per 100k, fallout; synthetic generator with template split; OpenPII scoring; local n2c2 runner; comparison runner | Benchmark report published per release |
| **M6 Crypto & clinical operators → v0.5** | `hash` (HMAC/HKDF), `encrypt` (AES-SIV), `fpe` (FF1, 10^6 domain floor, check-digit recompute), keyed `surrogate`, `dateShift`, `generalize` | Known-answer tests; external crypto review |
| **M7 Data packs** | Gazetteer spanning Vietnam's 2025 administrative reform with validity dates and successor crosswalk; name packs with provenance; data updates need no code release | Data packages versioned independently |
| **M8 Default-deny & protected layer → v0.6** | Per-field allow-vocabulary mode; protected clinical dictionaries from openly licensed sources; eponym/drug exclusion lists | Recall gain measured on a gold set |
| **v1.0** | API freeze; pack contract documented; gates met on one real Vietnamese and one real US deployment gold set; security review of vault and operators | Binary-PHI recall ≥ 0.95 per real gold set with category floors; zero canary leaks; no ReDoS failures |

**Additional locale packs** (e.g. `@determask/pack-sr` — Serbian: JMBG, LBO,
PIB, dual Cyrillic/Latin script; `@determask/pack-sg` — Singapore: NRIC/FIN,
building-level postal codes) follow the pack contract and can land any time
after M1, independently of the milestone train above.

Open technical items per milestone (CCCD century table, BHYT object codes,
MST weights vs the tax authority spec, VN passport digit count, re2js astral
offsets, NIST SP 800-38G Rev. 1 status, …) are tracked as GitHub issues
labelled `open-item`.
