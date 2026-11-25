# Testing

determask is a privacy tool, so a test suite that only *runs* code is not
enough: it has to prove that what the README promises is true, and fail
the day it stops being true. Six layers do that.

| Layer | Where | What it proves |
|---|---|---|
| Unit tests | `packages/*/test/*.test.ts` | each module's behaviour, every branch |
| Claims ledger | `packages/core/test/claims.test.ts` | every promise in README and ARCHITECTURE, by id |
| Property tests | `packages/core/test/properties.test.ts` | invariants over tens of thousands of seeded random inputs |
| Coverage gate | `vitest.config.ts` | 100% lines, branches, functions, statements — CI fails below |
| Cross-runtime smoke | `scripts/smoke.mjs` | the **built** package gives identical output on Node, Bun and Deno |
| Type-check of tests | `tsconfig.test.json` | tests compile under the same strict settings as the source |

## The claims ledger

Each `it(...)` in `claims.test.ts` is named by the id of a claim in the docs
— `R1` to `R15` for the README, `D1` to `D21` for the architecture
decisions, `F2` to `F16` for the failures the design must not repeat. A
claim that is built **asserts its behaviour**. A claim that is not built is
`it.todo("… (M<n>)")`, naming the milestone that delivers it.

```sh
pnpm claims     # ✓ for what works, ↓ todo for what is only promised
```

Rules:

- A new promise in the docs gets a claim in the same PR — as a test if it is
  true, as a `todo` with its milestone if it is not.
- Building a `todo` means promoting it to a real test in that PR.
- A claim is never deleted silently. If a promise is withdrawn, the doc
  change and the claim removal land together and the PR says why.

The README's API example is itself a claim: it is executed byte for byte,
so the example cannot drift from what the code does.

## Property tests

`properties.test.ts` runs each invariant over seeded random inputs (a
fixed-seed PRNG, so every run is the same run). The oracle never reuses the
engine's own logic — for the leak property it only knows which code units
some span covered:

- masking never leaves a covered code unit in clear, and changes nothing else;
- `restore(anonymize(x)) === x`, exactly;
- no lone surrogate is ever emitted (a span that splits an emoji or a CJK
  Extension B character is widened to the whole character);
- the same spans in any order give the same output.

A failure prints the case number and the exact input, so it can be pasted
into a unit test.

## Coverage is a floor, not the goal

100% coverage means every line ran; it does not mean every line is
checked. Before merging a change to `packages/core/src`, check that the
tests would notice it being wrong: change a comparison, drop a guard,
flip a default — the suite must go red. The change that introduced this
document was checked that way: 11 such mutations (span bounds, overlap
tie-break, strict restore, regex state, locale fallback, inherited map
entries, entity-id validation, numbering order, the `đ` fold, word
boundaries, surrogate pairs), and every one failed the suite.

Tests that pass whatever the code does are not coverage — a loop over an
empty list, an assertion on a value the test itself constructed. The pack
tests assert explicitly that each pack ships no recognizers *yet*, so they
fail, and get rewritten, the day the first recognizer lands.

## Cross-runtime

`scripts/smoke.mjs` imports `packages/core/dist` — the code that would be
published — and checks the README example, Unicode folding and boundaries,
and the fail-closed paths, with no test framework and no runtime-specific
API. CI runs it on Node 22 and 24 (`test` job) and on Bun and Deno
(`runtimes` job). Running Vitest through `bun x` would execute Node, not
Bun, which is why the runtimes are checked with the smoke script instead.

## Test data

No real personal data, anywhere — not in tests, fixtures, issues or PR
descriptions. Names, phone numbers and identifiers in tests are synthetic.
Identifiers that must pass a checksum use published example values (for
instance CMS's example NPI `1234567893`), never a real person's.
