# Changelog

All packages share one version. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/); before 1.0, a minor
version may change the API.

## [0.1.0-alpha.0] — unreleased

The first published version. Every package is new.

### @determask/core

- `createEngine(config, { packs, recognizers })` with `analyze` →
  `anonymize` → `restore`. Unknown config keys, bad entity ids and bad
  spans throw instead of being ignored.
- Folded matching view with an offset map back to the original text:
  case, accents, `đ→d`, full-width forms, format characters, every
  script's decimal digits, and Cyrillic ↔ Latin on the Serbian standard.
- Unicode-aware word boundaries, per edge; a label glued to a number is a
  boundary (`CCCD001099012345`).
- `knownValues`: values you already hold, matched folded and, for
  numbers, whatever their grouping.
- Typed, numbered placeholders (`⟦PHONE_NUMBER_1⟧`), the same value
  getting the same placeholder; union overlap resolution; strict restore
  that escapes for `text`, `html` or `json`; placeholder-shaped input is
  withheld.
- Recognizer toolkit: `patternRecognizer` (pattern score, validator,
  context and before-only anti-context, per-entity thresholds) and
  `checkExamples` for the required examples.
- Fails closed: `ConfigError`, `WithheldError`, `RestoreError`; a
  recognizer that throws withholds the text. The engine refuses to load
  when `config.locales` names a locale no loaded recognizer serves, or a
  per-entity threshold names an entity nothing reports; a locale passed to
  `analyze` that no loaded pack is made for runs every recognizer instead
  of silently skipping them; locales match ignoring case and script (#7).
- Linear in the length of the text: analyze, anonymize and restore, with
  a scale gate in CI (#8).
- A value detected once and vouched for by a validator or context word is
  masked everywhere in the document (#9).
- Word boundaries in scripts written without spaces: names glued to
  particles in Japanese, Korean, Chinese and Thai are masked (#10).
- `maskJson` / `restoreJson` for structured data, one placeholder map
  across every field; a tested Sentry `beforeSend` recipe in
  `examples/sentry` (#12).
- A pattern that matches the empty string is refused at construction (#13).
- `createStreamRestorer` restores a streamed LLM or MT response chunk by
  chunk, holding back a split placeholder and throwing if the stream ends
  inside one (#14).
- Folding maps letters people type without their diacritic: ß→ss,
  Turkish ı→i, ø, ł, þ, æ, œ, Greek final ς, Arabic ة and ى, and drops
  the tatweel (#15).

### Locale packs

- `@determask/pack-core`: email (quoted local parts too, #13), URL, IPv4,
  IPv6, payment card (Luhn and IIN brand), IBAN (MOD 97-10).
- `@determask/pack-vi`: CCCD, legacy CMND, MST tax code, BHYT, BHXH, phones.
- `@determask/pack-sr`: JMBG, PIB, bank account (MOD 97), LBO, phones.
- `@determask/pack-sg`: NRIC/FIN (an unverified check letter is still
  masked), postal codes, phones, passports.
- `@determask/pack-my`: MyKad (date of birth and JPN place-of-birth codes;
  an unlisted code is still masked), phones, passports (#16).

### Not in this version

Names, addresses and dates; operators other than placeholders; the MT
lane; published recall figures. See [ROADMAP.md](ROADMAP.md).

[0.1.0-alpha.0]: https://github.com/platno/determask/releases/tag/v0.1.0-alpha.0
