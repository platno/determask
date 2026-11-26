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
  recognizer that throws withholds the text.

### Locale packs

- `@determask/pack-core`: email, URL, IPv4, IPv6, payment card (Luhn and
  IIN brand), IBAN (MOD 97-10).
- `@determask/pack-vi`: CCCD, legacy CMND, MST tax code, BHYT, BHXH, phones.
- `@determask/pack-sr`: JMBG, PIB, bank account (MOD 97), LBO, phones.
- `@determask/pack-sg`: NRIC/FIN (an unverified check letter is still
  masked), postal codes, phones, passports.

### Not in this version

Names, addresses and dates; operators other than placeholders; the MT
lane; published recall figures. See [ROADMAP.md](ROADMAP.md).

[0.1.0-alpha.0]: https://github.com/platno/determask/releases/tag/v0.1.0-alpha.0
