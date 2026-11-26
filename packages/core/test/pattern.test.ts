import { describe, expect, it } from "vitest";
import {
  checkExamples,
  ConfigError,
  createEngine,
  DEFAULT_CONTEXT_BOOST,
  parseMarkedExample,
  patternRecognizer,
  type PatternRecognizerSpec,
} from "../src/index.js";

const examples = { match: ["id ⟪ab123⟫"], noMatch: ["nothing"] };

/** A minimal spec: "ab" + 3 digits, base score 0.6. */
const base = (over: Partial<PatternRecognizerSpec> = {}): PatternRecognizerSpec => ({
  id: "t.code",
  entity: "TEST_CODE",
  locales: ["*"],
  patterns: [{ name: "code", regex: "ab\\d{3}", score: 0.6 }],
  examples,
  ...over,
});

const find = (spec: PatternRecognizerSpec, text: string, config = { configVersion: 1 as const }) =>
  createEngine(config, { recognizers: [patternRecognizer(spec)] }).analyze(text).findings;

describe("patternRecognizer — matching on the folded view", () => {
  it("finds a match and reports original offsets", () => {
    const [f] = find(base(), "code AB123 here");
    expect(f).toMatchObject({ entity: "TEST_CODE", start: 5, end: 10, score: 0.6, recognizer: "t.code" });
  });

  it("matches through full-width characters and format characters, mapping back to the original", () => {
    const text = "ＡＢ１２３ and a​b123";
    // the zero-width space folds to a space, which the pattern allows
    const spans = find(base({ patterns: [{ name: "code", regex: "a ?b ?\\d{3}", score: 0.6 }] }), text);
    expect(spans.map((s) => text.slice(s.start, s.end))).toEqual(["ＡＢ１２３", "a​b123"]);
  });

  it("respects Unicode word boundaries", () => {
    expect(find(base(), "xab123 ab1234 ăab123")).toEqual([]);
  });

  it("finds every non-overlapping match in the text", () => {
    expect(find(base(), "ab111, ab222; ab333")).toHaveLength(3);
  });

  it("runs every pattern of the recognizer", () => {
    const spec = base({
      patterns: [
        { name: "a", regex: "ab\\d{3}", score: 0.6 },
        { name: "b", regex: "cd\\d{3}", score: 0.7 },
      ],
    });
    expect(find(spec, "ab123 cd456").map((s) => s.score)).toEqual([0.6, 0.7]);
  });

  it("skips empty matches instead of looping forever", () => {
    const spec = base({ patterns: [{ name: "opt", regex: "(?:ab\\d{3})?", score: 0.6 }] });
    expect(find(spec, "x ab123 y")).toHaveLength(1);
  });

  it("records the pattern in the trace", () => {
    expect(find(base(), "ab123")[0]!.trace[0]).toEqual({ rule: "pattern:code", scoreAfter: 0.6 });
  });

  it("puts the recognizer's attributes on every span, and none when it has none", () => {
    expect(find(base({ attrs: { kind: "x" } }), "ab123")[0]!.attrs).toEqual({ kind: "x" });
    expect(find(base(), "ab123")[0]).not.toHaveProperty("attrs");
  });
});

describe("patternRecognizer — validators (D9)", () => {
  it("rejects a candidate the validator returns false for", () => {
    expect(find(base({ validate: (v) => v !== "ab123" }), "ab123 ab124").map((s) => s.end)).toEqual([11]);
  });

  it("keeps the pattern score when the validator returns true", () => {
    const [f] = find(base({ validate: () => true }), "ab123");
    expect(f!.score).toBe(0.6);
    expect(f!.trace[1]).toEqual({ rule: "validator", detail: "pass", scoreAfter: 0.6 });
  });

  it("regrades and annotates when the validator returns an object", () => {
    const [f] = find(base({ validate: () => ({ score: 0.9, attrs: { checksum: "valid" }, note: "mod-11 ok" }) }), "ab123");
    expect(f).toMatchObject({ score: 0.9, attrs: { checksum: "valid" } });
    expect(f!.trace[1]).toEqual({ rule: "validator", detail: "mod-11 ok", scoreBefore: 0.6, scoreAfter: 0.9 });
  });

  it("accepts an object verdict with neither score nor attributes", () => {
    const [f] = find(base({ validate: () => ({}) }), "ab123");
    expect(f).toMatchObject({ score: 0.6 });
    expect(f!.trace[1]!.detail).toBe("pass");
  });

  it("gives the validator both the folded and the original match", () => {
    const seen: string[][] = [];
    find(base({ validate: (folded, original) => (seen.push([folded, original]), true) }), "ＡＢ１２３");
    expect(seen).toEqual([["ab123", "ＡＢ１２３"]]);
  });

  it("counts a validator that THROWS as a pass, at full score — fail closed", () => {
    const spec = base({
      patterns: [{ name: "weak", regex: "ab\\d{3}", score: 0.1 }],
      validate: () => {
        throw new Error("checksum table missing");
      },
    });
    const [f] = find(spec, "ab123");
    expect(f!.score).toBe(1);
    expect(f!.trace[1]!.detail).toMatch(/threw/);
  });
});

describe("patternRecognizer — context and anti-context (D8)", () => {
  const ctx = base({ patterns: [{ name: "code", regex: "ab\\d{3}", score: 0.3 }], context: ["mã số", "code"] });

  it("drops a weak match with no context (below the 0.5 threshold)", () => {
    expect(find(ctx, "ab123")).toEqual([]);
  });

  it("raises the score when a context word comes before the value", () => {
    const [f] = find(ctx, "Mã số: ab123");
    expect(f!.score).toBeCloseTo(0.3 + DEFAULT_CONTEXT_BOOST);
    expect(f!.trace.at(-1)).toMatchObject({ rule: "context", detail: "ma so" });
  });

  it("raises the score when a context word comes after the value", () => {
    expect(find(ctx, "ab123 is the code")).toHaveLength(1);
  });

  it("matches context words whole, never inside another word", () => {
    expect(find(ctx, "barcode ab123 codex")).toEqual([]);
  });

  it("does not look past the nearest other number, on either side", () => {
    expect(find(ctx, "code 77 ab123")).toEqual([]);
    expect(find(ctx, "ab123 77 code")).toEqual([]);
  });

  it("does not look further than the window", () => {
    expect(find({ ...ctx, window: 5 }, "code ........ ab123")).toEqual([]);
    expect(find({ ...ctx, window: 0 }, "code ab123")).toEqual([]);
  });

  it("caps the score at 1", () => {
    const strong = base({ patterns: [{ name: "c", regex: "ab\\d{3}", score: 0.9 }], context: ["code"], contextBoost: 0.5 });
    expect(find(strong, "code ab123")[0]!.score).toBe(1);
  });

  it("rejects a candidate when an anti-context word comes BEFORE it", () => {
    const anti = base({ antiContext: ["invoice", "mã đơn hàng"] });
    expect(find(anti, "Invoice ab123")).toEqual([]);
    expect(find(anti, "Mã đơn hàng: ab123")).toEqual([]);
  });

  it("ignores an anti-context word AFTER the value", () => {
    expect(find(base({ antiContext: ["invoice"] }), "ab123 invoice")).toHaveLength(1);
  });
});

describe("patternRecognizer — the spec is checked at load", () => {
  const bad: [string, Partial<PatternRecognizerSpec>][] = [
    ["no patterns", { patterns: [] }],
    ["no match example", { examples: { match: [], noMatch: ["x"] } }],
    ["no noMatch example", { examples: { match: ["⟪ab123⟫"], noMatch: [] } }],
    ["a pattern score above 1", { patterns: [{ name: "x", regex: "a", score: 1.5 }] }],
    ["a negative pattern score", { patterns: [{ name: "x", regex: "a", score: -0.1 }] }],
    ["a non-numeric pattern score", { patterns: [{ name: "x", regex: "a", score: Number.NaN }] }],
    ["an invalid regex", { patterns: [{ name: "x", regex: "(", score: 0.5 }] }],
    ["a boost above 1", { contextBoost: 2 }],
    ["a negative window", { window: -1 }],
    ["a fractional window", { window: 1.5 }],
    ["a context word that folds to nothing", { context: ["​"] }],
    ["an anti-context word that folds to nothing", { antiContext: ["  "] }],
  ];
  for (const [what, over] of bad) {
    it(`refuses ${what}`, () => {
      expect(() => patternRecognizer(base(over))).toThrow(ConfigError);
    });
  }

  it("exposes its patterns (for the ReDoS gate) and its examples", () => {
    const r = patternRecognizer(base());
    expect(r.patterns).toEqual([{ name: "code", regex: "ab\\d{3}" }]);
    expect(r.examples).toBe(examples);
    expect(r.entities).toEqual(["TEST_CODE"]);
  });
});

describe("docs/RECOGNIZERS.md", () => {
  it("its example recognizer works exactly as documented", () => {
    const mrn = patternRecognizer({
      id: "site.mrn",
      entity: "MEDICAL_RECORD_NUMBER",
      locales: ["vi-VN"],
      patterns: [{ name: "eight-digits", regex: "\\d{8}", score: 0.2 }],
      context: ["mã bn", "mã bệnh nhân", "mrn"],
      antiContext: ["số lô", "lot"],
      examples: { match: ["Mã BN: ⟪24001234⟫"], noMatch: ["Số lô 24001234", "24001234"] },
    });
    expect(checkExamples(mrn)).toEqual([]);
  });
});

describe("parseMarkedExample", () => {
  it("strips the markers and returns the marked ranges", () => {
    expect(parseMarkedExample("a ⟪bc⟫ d ⟪e⟫")).toEqual({ text: "a bc d e", spans: [[2, 4], [7, 8]] });
  });

  it("rejects malformed markers", () => {
    for (const bad of ["no marks", "⟪open", "close⟫", "⟪⟪nested⟫⟫", "⟪⟫empty", "a ⟪b⟫ ⟪c"]) {
      expect(parseMarkedExample(bad), bad).toBeNull();
    }
  });
});

describe("checkExamples (D20)", () => {
  it("returns no failures when every example holds", () => {
    expect(checkExamples(patternRecognizer(base({ examples: { match: ["id ⟪ab123⟫ and ⟪ab456⟫"], noMatch: ["ab12", "xab123"] } })))).toEqual([]);
  });

  it("reports a missed span, an extra span and a false positive", () => {
    const r = patternRecognizer(
      base({ examples: { match: ["⟪ab123⟫", "⟪ab1⟫", "⟪ab123⟫ ab456"], noMatch: ["ab999"] } }),
    );
    const failures = checkExamples(r);
    expect(failures).toHaveLength(3);
    expect(failures.join("\n")).toMatch(/expected spans \[0-3\], found \[\]/);
    expect(failures.join("\n")).toMatch(/expected spans \[0-5\], found \[0-5, 6-11\]/);
    expect(failures.join("\n")).toMatch(/"ab999" must not match/);
  });

  it("reports a malformed example", () => {
    const r = patternRecognizer(base({ examples: { match: ["no markers"], noMatch: ["x"] } }));
    expect(checkExamples(r)[0]).toMatch(/malformed/);
  });

  it("reports a recognizer that carries no examples", () => {
    const bare = { id: "bare", entities: ["X"], locales: ["*"], analyze: () => [] };
    expect(checkExamples(bare)).toEqual(["bare: carries no examples"]);
  });

  it("runs under the recognizer's own locale, or the one given", () => {
    const vi = patternRecognizer(base({ locales: ["vi-VN"] }));
    expect(checkExamples(vi)).toEqual([]);
    // A locale nothing loaded is made for runs every recognizer, so the examples still pass.
    expect(checkExamples(vi, { locale: "sr-RS" })).toEqual([]);
  });

  it("runs under the config given", () => {
    const r = patternRecognizer(base());
    expect(checkExamples(r, { config: { configVersion: 1, thresholds: { default: 0.9 } } })).toHaveLength(1);
  });
});
