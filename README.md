# determask

**Deterministic, auditable PII masking for clinical free text.**
TypeScript, offline, no ML in the box, fails closed.

> **Status: pre-alpha.** The architecture is settled and documented; the
> engine is being built milestone by milestone. Nothing here is ready to
> protect real patient data yet. See [ROADMAP.md](ROADMAP.md).

## Why another redactor

We probed the popular JavaScript/TypeScript PII redactors against clinical
notes in English and Vietnamese. They turned invoice numbers and timestamps
into "phone numbers", broke Vietnamese diacritics, leaked digits from
partially masked phones, and slowed down super-linearly on hostile input.
Mature rule-based clinical de-identifiers (Philter, PhysioNet deid) do
better, but they are Python or Perl, English-only, and mostly dormant.

Four things none of them do — and this library makes first-class:

1. **`knownValues`** — the patient's own record (name, ID, phone, DOB,
   relatives) is the strongest deterministic signal. It is an input, not an
   afterthought: matched case-, accent- and whitespace-insensitively, and
   propagated across the whole document.
2. **`protect`** — clinical values (vitals, doses, lab results, ICD codes)
   are never masked, so the text stays medically useful.
3. **`withhold`** — on any recognizer error, unsupported input, or residual
   check hit, the text is withheld rather than emitted unmasked.
   Privacy fails closed.
4. **Measured recall** — every release publishes recall, false negatives
   per 100k tokens, and over-masking on open benchmarks. Deployments gate
   go-live on their own real gold sets, which never leave them.

This is a predictable, auditable masking engine that a site tunes and then
measures — not a black box with a recall number.

## Design in one paragraph

An **analyzer** produces spans with scores and a rule trace; an
**anonymizer** applies operators (placeholder, mask, hash, encrypt,
surrogate, date-shift, generalize, withhold) to any span list — including
spans a human or another tool supplied. Detection runs on normalized views
(NFC, width-folded, diacritic-folded with `đ→d`) that carry offset maps
back to the original UTF-16 string. Patterns are ReDoS-safe by
construction; user-supplied patterns run on a linear-time engine. Locale
packs (`vi-VN`, `en-US`, …) carry the recognizers, validators written from
primary specs, and context words. Reversible placeholders restore strictly:
unknown or altered placeholders are an error, never a guess.

The first consumer masks Vietnamese hospital notes before machine
translation: numbered placeholders inside `<span translate="no">`, a
reversible map that never leaves the hospital, kinship words kept as
gender cues.

## API sketch

```ts
import { createEngine } from "@determask/core";

const engine = createEngine(config); // throws on schema errors — fail closed

const { findings } = engine.analyze(text, {
  locale: "vi-VN",
  knownValues: { PERSON: ["Nguyễn Văn An"], PHONE_NUMBER: ["0912345678"] },
});

const { text: masked, map } = engine.anonymize(text, findings);
// "Bệnh nhân ⟦PER_1⟧, SĐT ⟦PHONE_1⟧ ..."

const restored = engine.restore(translated, map, { strict: true });
```

## Packages

| Package | Contents |
|---|---|
| `@determask/core` | Types, normalizer, engine, overlap handling, plain operators |
| `@determask/pack-core` | Locale-independent recognizers: email, URL, IP, card, IBAN |
| `@determask/pack-vi` | Vietnamese pack: CCCD, MST, BHYT, phones, names, addresses |
| `@determask/pack-sr` | Serbian pack: JMBG, LBO, PIB, phones, names (both scripts) |
| `@determask/pack-en-us` | US pack: SSN, ITIN, MBI, NPI, DEA, NANP, ZIP |
| `@determask/crypto` | Keyed operators on @noble: HMAC, AES-SIV, FF1, date shift |
| `@determask/mt` | Machine-translation lane: span wrapping, post-MT validation |
| `@determask/eval` | Evaluators (char/token/span recall, F2), synthetic generators |

## What this library does not claim

Masked text with a held map is **pseudonymised**, not de-identified —
under Vietnam's Law 91/2025 and under HIPAA alike. Rule-based systems
reach 99% recall only after per-site tuning, at ~78% precision. This
project promises predictability and tunability, and publishes its numbers;
it does not promise a recall figure out of the box. Nothing in this
repository is legal advice.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — note the DCO sign-off and the
provenance rule (no reading GPL/LGPL implementations while writing
validators; every validator cites its primary spec).

## License

[Apache-2.0](LICENSE). Ported code is attributed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
