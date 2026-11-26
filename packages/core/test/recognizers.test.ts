import { describe, expect, it } from "vitest";
import {
  ConfigError,
  createEngine,
  patternRecognizer,
  WithheldError,
  type AnalyzeContext,
  type Pack,
  type Recognizer,
  type Span,
  type TextViews,
} from "../src/index.js";

const config = { configVersion: 1 } as const;

/** A recognizer that finds a fixed literal, for exercising the plumbing. */
function literal(id: string, entity: string, needle: string, locales: string[] = ["*"]): Recognizer {
  return {
    id,
    entities: [entity],
    locales,
    analyze(views: TextViews): Span[] {
      const at = views.original.indexOf(needle);
      return at === -1
        ? []
        : [{ entity, start: at, end: at + needle.length, score: 0.9, recognizer: id, trace: [] }];
    },
  };
}

describe("plugging in recognizers and packs (D2)", () => {
  it("runs a standalone recognizer and returns its spans", () => {
    const engine = createEngine(config, { recognizers: [literal("t.mrn", "MEDICAL_RECORD_NUMBER", "24001234")] });
    const { findings } = engine.analyze("Mã BN: 24001234");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ entity: "MEDICAL_RECORD_NUMBER", start: 7, end: 15 });
  });

  it("runs every recognizer of every pack", () => {
    const pack: Pack = {
      id: "pack-test",
      locales: ["*"],
      recognizers: [literal("t.a", "A", "aaa"), literal("t.b", "B", "bbb")],
    };
    const { findings } = createEngine(config, { packs: [pack] }).analyze("aaa bbb");
    expect(findings.map((f) => f.entity)).toEqual(["A", "B"]);
  });

  it("merges recognizer spans with known values, sorted by position", () => {
    const engine = createEngine(config, { recognizers: [literal("t.id", "GENERIC_ID", "ID-9")] });
    const { findings } = engine.analyze("ID-9 belongs to Hoa", { knownValues: { PERSON: ["Hoa"] } });
    expect(findings.map((f) => f.entity)).toEqual(["GENERIC_ID", "PERSON"]);
  });

  it("passes locale, knownValues and documentId to the recognizer", () => {
    const seen: AnalyzeContext[] = [];
    const spy: Recognizer = { id: "t.spy", entities: ["X"], locales: ["*"], analyze: (_v, ctx) => (seen.push(ctx), []) };
    const engine = createEngine(config, { recognizers: [spy] });
    engine.analyze("x", { locale: "vi-VN", knownValues: { PERSON: ["An"] }, documentId: "doc-1" });
    engine.analyze("x");
    expect(seen[0]).toEqual({ locale: "vi-VN", knownValues: { PERSON: ["An"] }, documentId: "doc-1" });
    expect(seen[1]).toEqual({ locale: "und" });
  });
});

describe("locale selection (D15, F15)", () => {
  const vi = literal("t.vi", "VI_THING", "x", ["vi-VN"]);
  const viLang = literal("t.vi-lang", "VI_LANG_THING", "x", ["vi"]);
  const sr = literal("t.sr", "SR_THING", "x", ["sr-RS"]);
  const any = literal("t.any", "ANY_THING", "x", ["*"]);
  const entities = (engine: ReturnType<typeof createEngine>, locale?: string) =>
    engine.analyze("x", locale === undefined ? {} : { locale }).findings.map((f) => f.entity).sort();

  it("runs the recognizers serving the requested locale, plus the locale-independent ones", () => {
    const engine = createEngine(config, { recognizers: [vi, viLang, sr, any] });
    expect(entities(engine, "vi-VN")).toEqual(["ANY_THING", "VI_LANG_THING", "VI_THING"]);
    expect(entities(engine, "sr-RS")).toEqual(["ANY_THING", "SR_THING"]);
  });

  it("falls back to the config's primary locale", () => {
    const engine = createEngine({ configVersion: 1, locales: { primary: "sr-RS" } }, { recognizers: [vi, sr, any] });
    expect(entities(engine)).toEqual(["ANY_THING", "SR_THING"]);
  });

  it("runs EVERY recognizer when no locale is known — over-mask, never drop recall", () => {
    const engine = createEngine(config, { recognizers: [vi, sr, any] });
    expect(entities(engine)).toEqual(["ANY_THING", "SR_THING", "VI_THING"]);
  });
});

describe("document-wide propagation of detected values (D11)", () => {
  // A 9-digit card number, found only with its "cmnd" label (no checksum).
  const cmnd = patternRecognizer({
    id: "t.cmnd",
    entity: "LEGACY_ID",
    locales: ["*"],
    patterns: [{ name: "nine", regex: "(?<!\\d)\\d{9}(?!\\d)", score: 0.2 }],
    context: ["cmnd"],
    contextBoost: 0.4,
    examples: { match: ["cmnd ⟪012345678⟫"], noMatch: ["012345678"] },
  });
  // A checksum-backed id written contiguously; the pattern cannot see a spaced form.
  const checked = patternRecognizer({
    id: "t.checked",
    entity: "CHECKED_ID",
    locales: ["*"],
    patterns: [{ name: "contiguous", regex: "(?<!\\d)\\d{9}(?!\\d)", score: 0.9 }],
    validate: (v) => v.endsWith("9"),
    examples: { match: ["⟪123456789⟫"], noMatch: ["123456788"] },
  });
  const found = (rs: Recognizer[], text: string) =>
    createEngine(config, { recognizers: rs }).analyze(text).findings.map((f) => `${f.recognizer}:${text.slice(f.start, f.end)}`);

  it("masks a later mention that lacks the label that vouched for the first", () => {
    expect(found([cmnd], "CMND 012345678 … gọi lại, số 012345678")).toEqual([
      "t.cmnd:012345678",
      "core.propagation:012345678",
    ]);
  });

  it("follows a validator-backed value into another grouping", () => {
    expect(found([checked], "id 123456789, again 123 456 789")).toEqual([
      "t.checked:123456789",
      "core.propagation:123 456 789",
    ]);
  });

  it("does not propagate a finding only its bare pattern supports", () => {
    const bare: Recognizer = {
      id: "t.bare",
      entities: ["BARE"],
      locales: ["*"],
      analyze: (v) => {
        const at = v.original.indexOf("zz777");
        return [{ entity: "BARE", start: at, end: at + 5, score: 0.9, recognizer: "t.bare", trace: [{ rule: "pattern:x" }] }];
      },
    };
    expect(found([bare], "zz777 then ZZ777")).toEqual(["t.bare:zz777"]);
  });

  it("never propagates a value shorter than 3 characters (llm-pii-proxy #28's failure)", () => {
    const unit: Recognizer = {
      id: "t.unit",
      entities: ["UNIT_ID"],
      locales: ["*"],
      analyze: (v) => {
        const at = v.original.indexOf("L");
        return [{ entity: "UNIT_ID", start: at, end: at + 1, score: 0.9, recognizer: "t.unit", trace: [{ rule: "context", detail: "id" }] }];
      },
    };
    expect(found([unit], "id L, then 500 kg/L and L again")).toEqual(["t.unit:L"]);
  });

  it("copies the source finding's score and attributes, with a trace that names it", () => {
    const withAttrs: Recognizer = {
      id: "t.attrs",
      entities: ["ATTR_ID"],
      locales: ["*"],
      analyze: (v) => {
        const at = v.original.indexOf("abc123");
        return [{ entity: "ATTR_ID", start: at, end: at + 6, score: 0.8, recognizer: "t.attrs", trace: [{ rule: "validator" }], attrs: { kind: "x" } }];
      },
    };
    const engine = createEngine(config, { recognizers: [withAttrs] });
    const copy = engine.analyze("abc123 and ABC123").findings.at(1);
    expect(copy).toMatchObject({ recognizer: "core.propagation", score: 0.8, attrs: { kind: "x" } });
    expect(copy!.trace).toEqual([{ rule: "propagation", detail: "from t.attrs" }]);
  });

  it("adds no copy where a finding of the same entity already covers the mention", () => {
    expect(found([cmnd], "CMND 012345678 and cmnd 012345678")).toEqual(["t.cmnd:012345678", "t.cmnd:012345678"]);
  });

  it("leaves known values alone — they are document-wide already", () => {
    const { findings } = createEngine(config).analyze("Hoa and Hoa", { knownValues: { PERSON: ["Hoa"] } });
    expect(findings.map((f) => f.recognizer)).toEqual(["core.known-values", "core.known-values"]);
  });
});

describe("recognizer failures fail closed (D14, D17)", () => {
  const secret = "Nguyễn Văn An 0912345678";

  it("withholds when a recognizer throws, without forwarding its message", () => {
    const leaky: Recognizer = {
      id: "t.leaky",
      entities: ["X"],
      locales: ["*"],
      analyze: (views) => {
        throw new Error(`could not parse ${views.original}`);
      },
    };
    const engine = createEngine(config, { recognizers: [leaky] });
    expect(() => engine.analyze(secret)).toThrow(WithheldError);
    try {
      engine.analyze(secret);
    } catch (e) {
      expect((e as Error).message).toContain("t.leaky");
      expect((e as Error).message).not.toContain("Nguyễn");
      expect((e as Error).message).not.toContain("0912");
    }
  });

  it("withholds when a recognizer returns a span outside the text", () => {
    const wild: Recognizer = {
      id: "t.wild",
      entities: ["X"],
      locales: ["*"],
      analyze: () => [{ entity: "X", start: 0, end: 999, score: 1, recognizer: "t.wild", trace: [] }],
    };
    expect(() => createEngine(config, { recognizers: [wild] }).analyze("short")).toThrow(WithheldError);
  });

  it("withholds when a recognizer returns an entity id restore could not recognise", () => {
    const lower: Recognizer = {
      id: "t.lower",
      entities: ["X"],
      locales: ["*"],
      analyze: () => [{ entity: "person", start: 0, end: 2, score: 1, recognizer: "t.lower", trace: [] }],
    };
    expect(() => createEngine(config, { recognizers: [lower] }).analyze("short")).toThrow(WithheldError);
  });
});

describe("recognizer declarations are checked at load (F14)", () => {
  const ok = literal("t.ok", "OK", "x");

  it("refuses duplicate recognizer ids, across packs and standalone recognizers", () => {
    const pack: Pack = { id: "p", locales: ["*"], recognizers: [ok] };
    expect(() => createEngine(config, { packs: [pack], recognizers: [ok] })).toThrow(ConfigError);
  });

  it("refuses an empty or missing recognizer id", () => {
    expect(() => createEngine(config, { recognizers: [{ ...ok, id: "" }] })).toThrow(ConfigError);
    expect(() =>
      createEngine(config, { recognizers: [{ ...ok, id: undefined as unknown as string }] }),
    ).toThrow(ConfigError);
  });

  it("refuses a declared entity id that is not SCREAMING_SNAKE", () => {
    expect(() => createEngine(config, { recognizers: [{ ...ok, entities: ["phone"] }] })).toThrow(ConfigError);
  });

  it("refuses a recognizer that serves no locale", () => {
    expect(() => createEngine(config, { recognizers: [{ ...ok, locales: [] }] })).toThrow(ConfigError);
  });

  it("accepts an engine with no packs and no recognizers", () => {
    expect(() => createEngine(config, {})).not.toThrow();
  });
});
