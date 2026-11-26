# determask

**Deterministic, auditable PII masking for free text — in any language.**
TypeScript, offline, no ML in the box, fails closed.

Use it wherever personal data must not cross a boundary: application logs,
LLM and agent prompts, machine-translation requests, support tickets and
chat transcripts, analytics exports, test fixtures — and clinical notes,
the hardest case, where it was proven first.

> **Status: pre-alpha.** The architecture is settled and documented; the
> engine is being built milestone by milestone. Nothing here is ready to
> protect real personal data yet. See [ROADMAP.md](ROADMAP.md).

## Why another redactor

We probed the popular JavaScript/TypeScript PII redactors against real-world
text in English and Vietnamese. They turned invoice numbers and timestamps
into "phone numbers", broke Vietnamese diacritics, leaked digits from
partially masked phones, and slowed down super-linearly on hostile input.
None of that is specific to one domain: the same bugs corrupt a log line, an
LLM prompt or a support ticket. The mature rule-based de-identifiers that do
better (Philter, PhysioNet deid) are clinical-only, English-only, Python or
Perl, and mostly dormant.

Four things none of them do — and this library makes first-class:

1. **`knownValues`** — when you already know whose data it is (the
   patient's record, the customer's account, the user's profile), those
   values are the strongest deterministic signal. They are an input, not an
   afterthought: matched case-, accent- and whitespace-insensitively, and
   propagated across the whole document.
2. **`protect`** — the values your domain needs intact are never masked:
   vitals and doses in a clinical note, order totals in a ticket, UUIDs,
   hashes and timestamps in a log line. Domain packs ship the rules, so the
   text stays useful after masking.
3. **`withhold`** — on any recognizer error, unsupported input, or residual
   check hit, the text is withheld rather than emitted unmasked.
   Privacy fails closed.
4. **Measured recall** — every release publishes recall, false negatives
   per 100k tokens, and over-masking on open benchmarks. Deployments gate
   go-live on their own real gold sets, which never leave them.

This is a predictable, auditable masking engine that you tune and then
measure — not a black box with a recall number.

## Locales and domains

Two independent axes, each a separate package you install only if you need
it:

- **Locale packs** know a country's identifiers, phone formats, names,
  addresses and context words: Vietnamese, Serbian, Singapore, Malaysian,
  US — and any other language through the same pack contract.
- **Domain packs** know what must survive in a kind of text: clinical
  (vitals, doses, lab values, ICD/ATC codes), logs and observability (UUIDs,
  trace ids, hashes, timestamps, versions), commerce and support (order
  ids, amounts, SKUs), and more as they are needed.

A preset combines them: `vi-VN + clinical` for a hospital note before
translation, `en-US + logs` for a log pipeline, `sr-RS + support` for a
helpdesk export.

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
an unknown placeholder is an error, never a guess (detecting placeholders a
translation engine altered or dropped is milestone M3).

The first consumer masks Vietnamese hospital notes before machine
translation: numbered placeholders inside `<span translate="no">`, a
reversible map that never leaves the hospital, kinship words kept as
gender cues.

## API

This example is executed, byte for byte, by the test suite
(`packages/core/test/claims.test.ts`) and by `scripts/smoke.mjs` on Node,
Bun and Deno — if it stops being true, CI goes red.

```ts
import { createEngine } from "@determask/core";

const engine = createEngine({ configVersion: 1 }); // unknown keys throw — fail closed

const text = "Bệnh nhân Nguyễn Văn An, SĐT 0912 345 678. Tái khám: nguyen van an.";
const { findings } = engine.analyze(text, {
  locale: "vi-VN",
  knownValues: { PERSON: ["Nguyễn Văn An"], PHONE_NUMBER: ["0912 345 678"] },
});

const { text: masked, map } = engine.anonymize(text, findings);
// "Bệnh nhân ⟦PERSON_1⟧, SĐT ⟦PHONE_NUMBER_1⟧. Tái khám: ⟦PERSON_2⟧."
// Each distinct spelling gets its own token, so restore is exact.

engine.restore(masked, map, { strict: true }) === text; // true
```

Locale packs and your own recognizers plug in at construction:

```ts
const engine = createEngine(config, { packs: [viPack], recognizers: [myMrnRecognizer] });
```

## What works today

Every promise in this README and in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
is a test in [`packages/core/test/claims.test.ts`](packages/core/test/claims.test.ts),
named by its id. What is built **asserts its behaviour**; what is not yet
built is listed as `todo` with the milestone that delivers it. Run
`pnpm claims` to see both lists.

Built and tested: known-values matching (case, accents, `đ→d`, whitespace,
full-width, format characters, any script's digits, Cyrillic ↔ Latin, and
numbers whatever their grouping — `0912345678` finds `0912 345 678`),
document-wide propagation, typed and
numbered placeholders, union overlap resolution, strict restore that escapes
values for HTML or JSON output, pluggable
recognizers and locale packs with locale selection, score thresholds, and
fail-closed handling of bad config, bad spans, failing recognizers and
planted placeholders — 100% line and branch coverage, enforced in CI, plus
seeded randomised property tests.

The recognizer toolkit (`patternRecognizer`, see
[docs/RECOGNIZERS.md](docs/RECOGNIZERS.md)) is built; what each locale pack
detects with it is listed in that pack's README.

Not built yet: names and addresses, the protect layer, the residual check,
crypto operators, the MT adapter and the evaluation harness. See
[ROADMAP.md](ROADMAP.md).

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
