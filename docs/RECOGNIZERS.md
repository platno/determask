# Writing a recognizer

A recognizer is data. You describe an identifier — its patterns, how to
validate a candidate, which words make it more or less likely — and
`patternRecognizer` from `@determask/core` turns that into something the
engine runs. Every locale pack is built this way, and so is any recognizer
you write for your own data.

```ts
import { patternRecognizer } from "@determask/core";

export const mrn = patternRecognizer({
  id: "site.mrn",
  entity: "MEDICAL_RECORD_NUMBER",
  locales: ["vi-VN"],
  patterns: [{ name: "eight-digits", regex: "\\d{8}", score: 0.2 }],
  context: ["mã bn", "mã bệnh nhân", "mrn"],
  antiContext: ["số lô", "lot"],
  examples: {
    match: ["Mã BN: ⟪24001234⟫"],
    noMatch: ["Số lô 24001234", "24001234"],
  },
});

const engine = createEngine({ configVersion: 1 }, { recognizers: [mrn] });
```

## How a candidate is scored

```
pattern score  →  validator (gate, may regrade)  →  context boost  →  threshold
```

1. **Pattern.** Each regex match is a candidate with the pattern's `score`.
2. **Validator** (optional). `validate(folded, original)` returns `false`
   to reject the candidate, `true` to keep its score, or
   `{ score, attrs, note }` to regrade it — a checksum that passes usually
   raises the score, a structure that is only plausible lowers it.
3. **Anti-context.** If any `antiContext` word appears *before* the value,
   the candidate is rejected. Only before: "invoice 0912345678" is not a
   phone, "0912345678 invoice" might still be.
4. **Context.** If any `context` word appears before or after the value,
   the score rises by `contextBoost` (default 0.35), capped at 1.
5. **Threshold.** The engine returns only findings scoring at least the
   threshold — 0.5 by default, configurable per entity:
   `thresholds: { default: 0.5, perEntity: { VN_TAX_CODE: 0.6 } }`.

So a weak, generic shape (`\d{9}` for a legacy ID card) gets a low pattern
score and is masked only with context; a checksum-validated identifier gets a
high score and is masked anywhere (F1, F2).

## Rules the toolkit enforces

- **Patterns run on the folded view**: lower case, accents stripped, `đ→d`,
  full-width forms folded, Unicode format characters turned into spaces.
  Write patterns in lower case with ASCII digits; full-width digits, Unicode
  case and zero-width tricks are handled for you. Offsets in the findings are
  always into the original text.
- **Word boundaries are Unicode-aware** and checked by the engine, not by the
  pattern — never use `\b` or `\w` (they are ASCII-only). The rule is per
  edge: a letter edge is glued by an adjacent letter, mark or underscore; a
  digit edge only by an adjacent digit. So a letter–digit transition is a
  boundary, and `CCCD001099012345` or `SĐT0912345678` is found — labels
  glued to numbers are common in hand-typed records.
- **Every Unicode decimal digit is ASCII in the folded view** (Arabic-Indic,
  Persian, Devanagari, Thai, …), and **Cyrillic is Latin** (Serbian standard:
  `ђ→d`, `ћ`/`ч→c`, `ж→z`, `ш→s`, `џ→dz`, `љ→lj`, `њ→nj`). A pattern
  written for ASCII digits and Latin letters covers every script.
- **Context words match whole words** on the folded view, within `window`
  code units (default 40), and the window **stops at the nearest other
  number**: in "CCCD 001…, SĐT 0912…" the phone does not get the CCCD's
  context.
- **A pattern that matches the empty string is refused** at construction
  (`\d*`, `\d{0,12}`, `(?:…)?`): it would match between every two
  characters. A lookaround that matches zero-length inside text is
  skipped while scanning, never returned as a span.
- **A validator that throws counts as a pass** — the candidate is masked at
  full score (D9). Never catch an error in a validator to return `false`.
- **Examples are required** (D20): at least one `match` example, with the
  span(s) that must be found marked `⟪like this⟫`, and one `noMatch`
  example. `checkExamples(recognizer)` runs them through a real engine and
  returns the failures; every pack's tests call it.
- **Every pattern passes the ReDoS gate** (`pnpm lint:redos`): it is timed on
  hostile inputs at sizes n and 4n in a process that is killed if it runs
  away.
- **Validators cite their primary source** — the law, circular or standard
  that defines the identifier — in a comment, and are written from that
  source, never from a GPL/LGPL implementation (CONTRIBUTING.md).
