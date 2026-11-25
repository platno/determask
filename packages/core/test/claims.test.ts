/**
 * The claims ledger, as tests.
 *
 * Every promise README.md and docs/ARCHITECTURE.md make is a test here,
 * named by the claim's id. A claim that is built ASSERTS its behaviour; a
 * claim that is not built yet is `it.todo`, named with the milestone that
 * delivers it — so `pnpm claims` prints exactly what determask does today
 * and what it only intends to. Promote a todo to a test in the same PR that
 * builds the feature; never delete one silently.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ConfigError, createEngine, RestoreError, WithheldError, type Recognizer, type Span } from "../src/index.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const config = { configVersion: 1 } as const;

function srcFiles(): string[] {
  const out: string[] = [];
  for (const pkg of readdirSync(join(ROOT, "packages"))) {
    const dir = join(ROOT, "packages", pkg, "src");
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (f.endsWith(".ts")) out.push(join(dir, f));
  }
  return out;
}

describe("README — the four first-class features", () => {
  it("R1 knownValues: matched case-, accent- and whitespace-insensitively", () => {
    const engine = createEngine(config);
    const text = "BN nguyen  van an; NGUYỄN VĂN AN";
    const { findings } = engine.analyze(text, { knownValues: { PERSON: ["Nguyễn Văn An"] } });
    expect(findings.map((f) => text.slice(f.start, f.end))).toEqual(["nguyen  van an", "NGUYỄN VĂN AN"]);
  });

  it("R2 knownValues: propagated across the whole document", () => {
    const engine = createEngine(config);
    const text = "Hoa. ".repeat(50);
    const { findings } = engine.analyze(text, { knownValues: { PERSON: ["Hoa"] } });
    expect(engine.anonymize(text, findings).text).not.toContain("Hoa");
  });

  it("R3 protect: values outside knownValues are never touched by the known-values layer", () => {
    const engine = createEngine(config);
    const text = "BP 120/80 mmHg, glucose 5.4 mmol/L, ICD E11.9, trace 4f9c2a1e-77d0-4c6b, v2.3.1";
    const { findings } = engine.analyze(text, { knownValues: { PERSON: ["Hoa"] } });
    expect(engine.anonymize(text, findings).text).toBe(text);
  });
  it.todo("R3 protect: a domain pack protects its values when pattern recognizers overlap them (M2, M8)");

  it("R4 withhold: a recognizer error withholds the text", () => {
    const broken: Recognizer = { id: "x", entities: ["X"], locales: ["*"], analyze: () => { throw new Error("boom"); } };
    expect(() => createEngine(config, { recognizers: [broken] }).analyze("anything")).toThrow(WithheldError);
  });
  it("R4 withhold: unsupported input (already placeholder-shaped) is withheld", () => {
    expect(() => createEngine(config).anonymize("⟦PERSON_1⟧ planted", [])).toThrow(WithheldError);
  });
  it.todo("R4 withhold: a residual-check hit on the masked output withholds the text (M2)");

  it.todo("R5 measured recall: each release publishes recall, FN per 100k tokens and over-masking (M5)");
});

describe("README — design paragraph", () => {
  it("R6 analyzer produces spans with scores and a rule trace", () => {
    const { findings } = createEngine(config).analyze("Hoa", { knownValues: { PERSON: ["Hoa"] } });
    expect(findings[0]).toMatchObject({ score: 1, recognizer: "core.known-values" });
    expect(findings[0]!.trace.length).toBeGreaterThan(0);
  });

  it("R7 anonymizer applies operators to ANY span list, including caller-supplied spans", () => {
    const s: Span = { entity: "PERSON", start: 0, end: 3, score: 1, recognizer: "human", trace: [] };
    expect(createEngine(config).anonymize("Hoa came", [s]).text).toBe("⟦PERSON_1⟧ came");
  });

  it("R8 offsets are UTF-16 code units of the ORIGINAL string, astral text included", () => {
    const text = "😀😀 Đức";
    const { findings } = createEngine(config).analyze(text, { knownValues: { PERSON: ["Duc"] } });
    expect(findings[0]).toMatchObject({ start: 5, end: 8 });
    expect(text.slice(5, 8)).toBe("Đức");
  });

  it("R9 the matching view folds width, diacritics and đ→d, and turns format characters into spaces", () => {
    const { findings } = createEngine(config).analyze("ĐỨC​HOÀ ０９１２", {
      knownValues: { PERSON: ["duc hoa"], PHONE_NUMBER: ["0912"] },
    });
    expect(findings.map((f) => f.entity)).toEqual(["PERSON", "PHONE_NUMBER"]);
  });
  it.todo("R9 a separate digit/punctuation view feeds numeric identifiers, all Unicode digits folded (M1)");

  it.todo("R10 built-in patterns are ReDoS-safe: static lint plus the n-vs-4n timing gate on real patterns (M1)");
  it.todo("R11 user-supplied patterns run on a linear-time engine (re2js) (M1)");

  it("R12 locale packs plug in and serve only their locales", () => {
    const vi: Recognizer = { id: "vi.x", entities: ["X"], locales: ["vi-VN"], analyze: () => [{ entity: "X", start: 0, end: 1, score: 1, recognizer: "vi.x", trace: [] }] };
    const engine = createEngine(config, { packs: [{ id: "pack-test", locales: ["vi-VN"], recognizers: [vi] }] });
    expect(engine.analyze("x", { locale: "vi-VN" }).findings).toHaveLength(1);
    expect(engine.analyze("x", { locale: "sr-RS" }).findings).toHaveLength(0);
  });
  it.todo("R12 locale packs ship recognizers: vi-VN (M2), en-US (M4), sr-RS and en-SG (after M1)");

  it("R13 restore is strict: an unknown placeholder is an error, never a guess", () => {
    expect(() => createEngine(config).restore("⟦PERSON_7⟧", {})).toThrow(RestoreError);
  });
  it.todo("R13 restore detects ALTERED or MISSING placeholders after translation (post-MT validator, M3)");

  it.todo("R14 operators beyond placeholder: mask, hash, encrypt, fpe, surrogate, dateShift, generalize (M6)");
  it.todo("R15 MT lane: <span translate=\"no\"> wrapping, HTML escaping, post-MT validation (M3)");
});

describe("ARCHITECTURE — decisions", () => {
  it("D1 core is pure JS with no runtime dependencies", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "packages/core/package.json"), "utf8")) as Record<string, unknown>;
    expect(pkg["dependencies"] ?? {}).toEqual({});
  });
  it("D1 no network calls and no dynamic code in any package source", () => {
    for (const file of srcFiles()) {
      const src = readFileSync(file, "utf8");
      for (const banned of [/\bfetch\s*\(/, /XMLHttpRequest/, /node:(http|https|net|dgram)/, /\beval\s*\(/, /new Function\s*\(/, /\bimport\s*\(/]) {
        expect(src, `${file} matches ${banned}`).not.toMatch(banned);
      }
    }
  });
  it("D1 the built package is smoke-tested on Node, Bun and Deno in CI", () => {
    const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
    expect(existsSync(join(ROOT, "scripts/smoke.mjs"))).toBe(true);
    expect(ci).toContain("pnpm smoke");
    expect(ci).toContain("bun scripts/smoke.mjs");
    expect(ci).toContain("deno run --allow-read scripts/smoke.mjs");
  });
  it.todo("D1 identical output in browsers (M1)");

  it("D2 the analyzer/anonymizer split: analyze returns spans, anonymize takes any spans", () => {
    const engine = createEngine(config);
    const { findings } = engine.analyze("Hoa", { knownValues: { PERSON: ["Hoa"] } });
    expect(engine.anonymize("Hoa", findings).text).toBe("⟦PERSON_1⟧");
  });

  it("D3 offsets are UTF-16 of the original (see R8)", () => {
    const text = "𠀀 Hoa";
    const { findings } = createEngine(config).analyze(text, { knownValues: { PERSON: ["Hoa"] } });
    expect(text.slice(findings[0]!.start, findings[0]!.end)).toBe("Hoa");
  });

  it("D5/F5 Unicode boundaries, not ASCII \\b", () => {
    const { findings } = createEngine(config).analyze("Hoàng Hoa", { knownValues: { PERSON: ["Hoa"] } });
    expect(findings).toHaveLength(1); // "Hoà" inside "Hoàng" is not a match
  });

  it.todo("D6 dictionaries and known values match through a code-point Aho-Corasick automaton (M1)");
  it.todo("D7 scores: base → validator → context boost → threshold; ordered rule sets clamped per step (M1)");
  it.todo("D8 context matches whole words per language; negative words count only before the value (M2)");
  it.todo("D9 validators are named pure functions; a throwing validator counts as a pass (M2)");

  it("D10 overlaps resolve as union with a deterministic tie-break", () => {
    const s = (entity: string, start: number, end: number, score: number): Span => ({ entity, start, end, score, recognizer: "t", trace: [] });
    const out = createEngine(config).anonymize("0912345678", [s("PHONE_NUMBER", 0, 6, 0.5), s("VN_PERSONAL_ID", 4, 10, 0.9)]);
    expect(out.text).toBe("⟦VN_PERSONAL_ID_1⟧");
  });
  it.todo("D10 alternative overlap strategies: merge-contained, trim, ordered (M1)");

  it("D11 knownValues are first-class per-call input (see R1, R2)", () => {
    expect(createEngine(config).analyze("An", { knownValues: { PERSON: ["An"] } }).findings).toHaveLength(1);
  });
  it.todo("D11 a value DETECTED once by a pattern is masked everywhere in the document (M2)");

  it.todo("D12 protected layer per domain pack: clinical, logs, support (M2, M8)");
  it.todo("D13 default-deny residual mode per field (M8)");

  it("D14 fail closed: invalid spans and recognizer failures withhold", () => {
    const engine = createEngine(config);
    expect(() => engine.anonymize("abc", [{ entity: "X", start: 0, end: 9, score: 1, recognizer: "t", trace: [] }])).toThrow(WithheldError);
  });

  it("D15 locale precedence: an unknown locale runs every recognizer rather than dropping recall", () => {
    const sr: Recognizer = { id: "sr.x", entities: ["X"], locales: ["sr-RS"], analyze: () => [{ entity: "X", start: 0, end: 1, score: 1, recognizer: "sr.x", trace: [] }] };
    expect(createEngine(config, { recognizers: [sr] }).analyze("x").findings).toHaveLength(1);
  });
  it.todo("D16 data packs versioned separately with valid_from/valid_to and provenance (M7)");

  it("D17 findings carry no text, and errors never quote the input", () => {
    const text = "Nguyễn Văn An";
    const { findings } = createEngine(config).analyze(text, { knownValues: { PERSON: [text] } });
    expect(JSON.stringify(findings)).not.toContain("Nguy");
    const leaky: Recognizer = { id: "leak", entities: ["X"], locales: ["*"], analyze: (v) => { throw new Error(v.original); } };
    try {
      createEngine(config, { recognizers: [leaky] }).analyze(text);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain("Nguy");
    }
  });

  it("D18 placeholders are typed and numbered, never derived from the value", () => {
    const engine = createEngine(config);
    const a = engine.anonymize("Hoa", [{ entity: "PERSON", start: 0, end: 3, score: 1, recognizer: "t", trace: [] }]);
    const b = engine.anonymize("Lan", [{ entity: "PERSON", start: 0, end: 3, score: 1, recognizer: "t", trace: [] }]);
    expect(a.text).toBe(b.text); // the token says nothing about the value it hides
  });
  it("D18 restore accepts only ids present in the map, and placeholder-like input is rejected", () => {
    const engine = createEngine(config);
    expect(() => engine.restore("⟦PERSON_2⟧", { "⟦PERSON_1⟧": "Hoa" })).toThrow(RestoreError);
    expect(() => engine.anonymize("⟦PERSON_1⟧", [])).toThrow(WithheldError);
  });
  it.todo("D18 the map can be sealed with AES-256-GCM, header bound as authenticated data (M3)");
  it.todo("D19 keyed crypto from @noble: HMAC/HKDF, AES-SIV, FF1 with a 10^6 domain floor (M6)");

  it("D20 unknown config keys refuse to load, at every level", () => {
    expect(() => createEngine({ configVersion: 1, tresholds: {} } as never)).toThrow(ConfigError);
    expect(() => createEngine({ configVersion: 1, locales: { primary: "vi-VN", fallbak: "en" } } as never)).toThrow(ConfigError);
  });
  it.todo("D20 a published JSON Schema states every default; every rule embeds tp/fp examples run as tests (M1)");

  it("D21 licence, notice, third-party notices, DCO and security policy are in the repository", () => {
    for (const f of ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md", "CONTRIBUTING.md", "SECURITY.md"]) {
      expect(existsSync(join(ROOT, f)), f).toBe(true);
    }
    expect(readFileSync(join(ROOT, "LICENSE"), "utf8")).toContain("Apache License");
    expect(readFileSync(join(ROOT, "CONTRIBUTING.md"), "utf8")).toContain("Signed-off-by");
  });
});

describe("ARCHITECTURE — failures the design must not repeat", () => {
  it("F2 bare numbers are not PII by themselves (nothing is guessed from shape alone)", () => {
    const text = "Invoice 0312345678, qty 1000000, ts 1732521600, MRN 4829301";
    expect(createEngine(config).analyze(text).findings).toEqual([]);
  });
  it("F3 output is never re-scanned into nested placeholders", () => {
    const engine = createEngine(config);
    const once = engine.anonymize("Hoa", [{ entity: "PERSON", start: 0, end: 3, score: 1, recognizer: "t", trace: [] }]);
    expect(() => engine.anonymize(once.text, [])).toThrow(WithheldError);
  });
  it("F6 partial masks never leak digits: overlapping spans are masked as one union", () => {
    const s = (start: number, end: number): Span => ({ entity: "PHONE_NUMBER", start, end, score: 0.5, recognizer: "t", trace: [] });
    const out = createEngine(config).anonymize("0912 345 678", [s(0, 8), s(5, 12)]);
    expect(out.text).toBe("⟦PHONE_NUMBER_1⟧"); // not "⟦PHONE_NUMBER_1⟧ 678" or similar
  });
  it("F11 tie-breaks are deterministic, whatever order the spans arrive in", () => {
    const s = (entity: string): Span => ({ entity, start: 0, end: 3, score: 0.5, recognizer: "t", trace: [] });
    const engine = createEngine(config);
    expect(engine.anonymize("abc", [s("B"), s("A")]).text).toBe(engine.anonymize("abc", [s("A"), s("B")]).text);
  });
  it("F12 masking replaces the whole span, non-ASCII letters included", () => {
    const out = createEngine(config).anonymize("Nguyễn", [{ entity: "PERSON", start: 0, end: 6, score: 1, recognizer: "t", trace: [] }]);
    expect(out.text).toBe("⟦PERSON_1⟧");
  });
  it("F13 configuration has no silent defaults for typos", () => {
    expect(() => createEngine({ configVersion: 1, onError: "emit" } as never)).toThrow(ConfigError);
  });
  it.todo("F14 an unknown validator name is a config-load error (M2)");
  it("F15 locale coupling never silently drops recall (see D15)", () => {
    const vi: Recognizer = { id: "vi.y", entities: ["Y"], locales: ["vi"], analyze: () => [{ entity: "Y", start: 0, end: 1, score: 1, recognizer: "vi.y", trace: [] }] };
    expect(createEngine(config, { recognizers: [vi] }).analyze("y", { locale: "vi-VN" }).findings).toHaveLength(1);
  });
  it.todo("F16 names need context, known values or adjacent evidence — capitalisation alone never counts (M2)");
});

describe("README — the API sketch runs exactly as documented", () => {
  it("masks, then restores, the README example byte for byte", () => {
    const engine = createEngine({ configVersion: 1 });
    const text = "Bệnh nhân Nguyễn Văn An, SĐT 0912 345 678. Tái khám: nguyen van an.";
    const { findings } = engine.analyze(text, {
      locale: "vi-VN",
      knownValues: { PERSON: ["Nguyễn Văn An"], PHONE_NUMBER: ["0912 345 678"] },
    });
    const { text: masked, map } = engine.anonymize(text, findings);
    expect(masked).toBe("Bệnh nhân ⟦PERSON_1⟧, SĐT ⟦PHONE_NUMBER_1⟧. Tái khám: ⟦PERSON_2⟧.");
    expect(engine.restore(masked, map, { strict: true })).toBe(text);
  });
});
