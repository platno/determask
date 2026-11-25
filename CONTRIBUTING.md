# Contributing

Thanks for helping build a masking engine people can audit. Three rules
below are non-negotiable because the project's licensing and safety story
depends on them.

## 1. DCO sign-off

Every commit must carry a `Signed-off-by:` line (`git commit -s`),
certifying the [Developer Certificate of Origin](https://developercertificate.org/).
You are stating that you wrote the change or have the right to submit it
under Apache-2.0.

## 2. Provenance

- **Ported code** (MIT/BSD/Apache sources) keeps a file-header attribution
  naming the source project, file and license, and gets a row in
  `THIRD_PARTY_NOTICES.md` in the same PR.
- **Validators are written from primary specifications** (the CMS, SSA,
  IRS, or Vietnamese circular that defines the identifier), cited in the
  validator's doc comment. **Never read GPL, LGPL, AGPL or
  source-available implementations while writing an equivalent.**
  python-stdnum and PhysioNet deid may be used as *checklists of which
  identifiers exist*, nothing more.
- **Data** is bundled only with a permissive license and a provenance
  entry (source, version, license, retrieval date). UMLS/SNOMED-derived
  lexicons and data-use-agreement corpora are never committed.

## 3. Safety invariants

Changes must not break these; CI enforces most of them:

- **Fail closed.** An error path never emits unmasked text. A validator
  that throws counts as a *pass* (the candidate is masked). An unknown
  validator name is a config-load error.
- **No ReDoS by construction.** Built-in patterns pass static linting and
  the n-vs-4n timing gate. User-supplied patterns run on re2js only.
- **Deterministic.** Same input + config + key ⇒ same output, on Node,
  Bun and browsers. No `Intl.Segmenter` in the core path, no network
  calls, no ML in this repository.
- **Offsets** are UTF-16 code units of the original string; every
  normalized view carries an offset map, and round-trips are property-
  tested.
- **Every recognizer rule embeds true-positive and false-positive
  examples** that run as tests (gitleaks-style).
- **No real PII anywhere** — not in tests, fixtures, issues or PR
  descriptions. Test identifiers must be structurally valid but fake
  (e.g. CMS's example NPI `1234567893`, SSA's known-fake SSNs).

## Development

```sh
pnpm install
pnpm check     # build + typecheck + test + ReDoS lint
```

Node ≥ 22, pnpm ≥ 10. The repo is ESM TypeScript throughout.

## Reporting security issues

Do not open a public issue for a leak (text surviving masking where it
should not). See [SECURITY.md](SECURITY.md).
