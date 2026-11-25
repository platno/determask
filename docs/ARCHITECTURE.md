# Architecture

This document condenses the design research (November 2026) into the
decisions the code must honour. Each decision is numbered; code and PRs
reference them (e.g. "implements D9").

## The problem

No open-source library or cloud service deterministically masks personal
data in free text across languages and domains. The JS/TS redactors we
probed share the same failure classes, and those failures are not
domain-specific: a bare number misread as a phone corrupts a log line or an
LLM prompt exactly as it corrupts a clinical note. The rule-based
de-identifiers that do better are clinical-only, English-only and dormant.

The research started from the hardest case — Vietnamese clinical notes
sent to machine translation — and that remains the first consumer and the
proving ground. The design is general: locale packs and domain packs are
separate axes (see "Locales and domains" below).

The library is built from five proven parts:

- **Presidio**'s analyzer/anonymizer split and recognizer model (MIT);
- **Google Cloud DLP**'s rule semantics and operator catalogue (concepts only);
- **Philter**'s allow-list-first residual pass that withholds when unsure (BSD-3-Clause);
- **ntrieuvi97/vipii**'s Vietnamese identifier rules (MIT);
- **agent-redact**'s regex-safety and vault discipline (MIT).

## Observed failures → design rules

| # | Failure observed in existing tools | Rule here |
|---|---|---|
| F1 | Context-free generic patterns flood prose (clinical notes, logs, tickets) | Weak/generic types need context and are opt-in |
| F2 | Bare numbers become phones or IDs | Numeric types need a validator or context; anti-context lists |
| F3 | Placeholders get rescanned and nested | Detect once on the original text; operators never rescan their own output |
| F4 | Wrong checksums (e.g. NPI without the 80840 prefix) | Validators from primary specs, tested against official vectors |
| F5 | ASCII `\b`/`\w` splits Vietnamese words | Unicode-aware boundaries |
| F6 | Partial masks leak digits | Mask the union of overlapping spans; residual digit-run check |
| F7 | A generic match beats a specific one | Validator+context confirmed IDs outrank generic types |
| F8 | Domain content gets masked (ICD codes and doses in notes; UUIDs, hashes and timestamps in logs) | A protected layer, per domain, that never masks the values the domain needs |
| F9/F10 | Regex timers that can't interrupt; skip-on-timeout | ReDoS-safe by construction; fail closed |
| F11 | Arbitrary tie-breaks; piecewise overlap masking | Deterministic tie-break; union by default |
| F12 | Masking only ASCII leaks non-ASCII letters | Mask by Unicode character class |
| F13 | Silent defaults, semantic drift between versions | JSON Schema with explicit defaults; versioned operator semantics |
| F14 | Typo'd validator name passes silently (fails open) | Unknown validator = config-load error |
| F15 | Locale coupling silently drops recall | Explicit locale packs with explicit precedence |
| F16 | Name heuristics from capitalisation alone | Names need context, known values, or adjacency to other name evidence |

## Decisions

| # | Decision |
|---|---|
| D1 | Synchronous TypeScript ESM core, pure JS; runs unchanged on Node ≥ 22, Bun, Deno, browsers. No native addons, no network calls, no ML in the repository. |
| D2 | `analyze()` returns spans + scores + a rule trace. `anonymize()` applies operators to *any* span list, including caller-supplied spans. |
| D3 | Public offsets are UTF-16 code units of the **original** string. Detection runs on normalized views carrying offset maps. |
| D4 | Normalization per code point: NFC; width folding for digits/punctuation; Unicode format characters become spaces; a second view folds diacritics with `đ→d` special-cased, every Unicode decimal digit to ASCII, and Cyrillic to Latin on the Serbian standard. No `Intl.Segmenter` in the core path (ICU varies by runtime). |
| D5 | Unicode boundaries instead of `\b`, per edge: a letter edge is glued by an adjacent letter, mark or underscore, a digit edge only by an adjacent digit — so a label glued to a number (`CCCD001…`) does not hide it. Built-in patterns pass an n-vs-4n timing gate in a killable process. User patterns run on re2js. |
| D6 | Dictionaries and known values match via a code-point Aho-Corasick automaton over the folded view (leftmost-longest, boundary-checked). A keyword prefilter picks which context-gated recognizers run. |
| D7 | Scores in [0,1]: base, then validator, then context boost, then per-entity threshold (default 0.5). DLP-style rule sets apply in declared order, clamped at each step. |
| D8 | Context matches whole words per language; windows measured in code points after NFC, stopping at the nearest other number; negative words count only *before* the value. |
| D9 | Validators are named pure functions. Unknown name = load error. A validator that **throws counts as a pass** (candidate masked): privacy fails closed. |
| D10 | Same-type duplicates removed in the analyzer. Cross-type overlaps resolved in the anonymizer, default `union`. Ties: priority, then length, then start, then registry order. |
| D11 | `knownValues` is first-class per-call input, matched with case/accents/script/whitespace folded, and numbers matched whatever their grouping; anything detected once is masked everywhere in the document. |
| D12 | Protected layer, shipped per domain: detectors for the values a domain needs intact — clinical (vitals, labs with units, doses, ICD/ATC), logs (UUIDs, trace ids, hashes, timestamps, versions), commerce/support (order ids, amounts, SKUs) — that never mask and suppress overlapping weak hits. |
| D13 | Optional default-deny residual mode per field: tokens absent from a deployment-supplied allow vocabulary are masked. |
| D14 | Fail closed: recognizer error, unsupported input, or residual-check hit ⇒ withhold or fully redact, never emit unmasked. |
| D15 | Locale packs set default phone country, date order, context words, precedence. Generic numeric types need context. |
| D16 | Data packs versioned separately with `valid_from`/`valid_to`, provenance and license metadata (Vietnam's 2025+ administrative reforms make this a privacy requirement). |
| D17 | Findings carry no text unless `includeText` is set; logs carry counts, rule IDs, durations only. |
| D18 | Reversible placeholders are typed and numbered (sequential or random IDs — never derived from PHI, per HIPAA §164.514(c)). Restore accepts only IDs present in the map. Placeholder-like input is escaped or rejected. The map is sealed with AES-256-GCM, header bound as authenticated data. |
| D19 | Crypto from @noble: HMAC-SHA-256 with HKDF subkeys, AES-SIV, FF1 only with domain ≥ 10^6. Never FF3/FF3-1, unkeyed hashes, or AES-CBC. Keys always come from the caller. |
| D20 | Declarative JSON config with a published JSON Schema that rejects unknown keys and states every default. Every rule embeds true/false-positive examples that run as tests. |
| D21 | Apache-2.0, NOTICE, THIRD_PARTY_NOTICES, DCO sign-off, provenance rule from day one. |

## Pipeline (seven deterministic steps)

1. **Validate and compile** the config once (D20).
2. **Build two views** with offset maps (D4): digits/punctuation view for
   numeric identifiers; letter view with accents folded for dictionaries
   and names.
3. **Keyword prefilter** picks the context-gated recognizers (D6).
4. **Run recognizers**: regex (native for gated built-ins, re2js for user
   patterns), phones via `findPhoneNumbersInText`, dictionaries,
   known values, dates with a fixed reference instant.
5. **Validate and score**, apply ordered rule sets and the protected layer
   (D7–D9, D12).
6. **Map back to original offsets**, propagate values across the document
   (D11), resolve overlaps (D10).
7. **Replace right-to-left**, then **rescan the output** with an
   independent high-recall residual check (digit runs, `@`, known values
   again, default-deny where enabled) (D13–D14).

## Package layout

```
packages/
  core         types, normalizer, engine, overlaps, plain operators (dep: re2js only)
  pack-core    email, URL, IP, card, IBAN
  pack-vi      Vietnamese pack (dep: libphonenumber-js)
  pack-sr      Serbian pack: Cyrillic/Latin dual script (dep: libphonenumber-js)
  pack-sg      Singapore pack: NRIC/FIN checksum, building-level postal codes
               (dep: libphonenumber-js)
  pack-en-us   US pack (dep: libphonenumber-js)
  domain-clinical  protected clinical values; clinical name/eponym exclusions
  domain-logs      protected UUIDs, trace ids, hashes, timestamps; streaming-friendly
  domain-support   protected order ids, amounts, SKUs; ticket/chat structure
  crypto       keyed operators on @noble/ciphers + @noble/hashes
  mt           placeholder round-trip through text-transforming services:
               MT (HTML span wrapping, post-MT validation) and LLMs
               (placeholder-safe prompts, restore across streamed chunks)
  eval         generators, evaluators, report output
  cli
  data-*       versioned gazetteers and name lists
```

## Locales and domains

Two independent axes, never coupled in core (F15):

- A **locale pack** (`pack-vi`, `pack-sr`, `pack-sg`, `pack-en-us`, …) owns
  what is true of a country or language: identifiers and their
  validators, phone and date formats, name and address rules, context
  words.
- A **domain pack** (`domain-clinical`, `domain-logs`, `domain-support`,
  …) owns what is true of a kind of text: which values must survive
  (D12), which exclusion dictionaries apply, and which entities are worth
  enabling by default (an MRN matters in a note, a trace id must survive in
  a log).

A **preset** is an ordinary config that `extends` one or more of each
(`vi-VN + clinical`, `en-US + logs`). Core holds neither: it has no
entities, no context words and no protected values of its own.

## Entity catalogue conventions

- IDs are SCREAMING_SNAKE. Generic types reuse Presidio's names
  (`PERSON`, `EMAIL_ADDRESS`, `PHONE_NUMBER`, …) so configs carry over.
- Country-specific types carry an ISO-3166-1 alpha-2 prefix
  (`VN_PERSONAL_ID`, `US_SSN`), US included.
- Roles/subtypes are attributes (`PERSON:provider`, `DATE_TIME:dob`).
- Each type carries category (`@GOVERNMENT_ID`), sensitivity, validator
  strength, and regulation tags (`HIPAA_SH:G`); presets are unions of tags.
- Vietnam's 2025 consolidation put CCCD, MST and BHXH/BHYT onto one
  12-digit number: one `VN_PERSONAL_ID` type, with the observed label as
  an attribute. Legacy formats stay detectable indefinitely.

## Evaluation stance

Binary-PHI **character recall** is the primary release gate (what share of
gold PHI characters got masked, regardless of entity label), with
per-category floors; F2 secondary; leak canaries must be 0. Synthetic
recall is tracked for regressions but never quoted as performance. Only
real gold sets at a deployment can gate go-live, and they never leave it.

## Legal framing

Masked text with a held map is **pseudonymised** — still personal data in
the hands of whoever holds the map (for the first consumer, the hospital)
under Vietnam's Law 91/2025 and in the EDPB's reading of GDPR. Restore IDs are random/sequential, never derived from
PHI (HIPAA §164.514(c)). The library says "masking and pseudonymisation";
"de-identified" is a claim for the deployment's legal analysis, not ours.
