import { describe, expect, it } from "vitest";
import {
  ConfigError,
  createEngine,
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

  it("treats a locale no loaded recognizer is made for as unknown, and runs every recognizer", () => {
    // JMBG is used in Bosnia, Montenegro and North Macedonia too; asking for
    // "hr-HR" with only Serbian recognizers loaded must not drop them silently.
    const engine = createEngine(config, { recognizers: [vi, sr, any] });
    for (const locale of ["hr-HR", "bs-BA", "mk-MK", "de-DE"]) {
      expect(entities(engine, locale), locale).toEqual(["ANY_THING", "SR_THING", "VI_THING"]);
    }
  });

  it("still tells the recognizers which locale was asked for", () => {
    const seen: string[] = [];
    const spy: Recognizer = { id: "t.spy", entities: ["X"], locales: ["*"], analyze: (_v, ctx) => (seen.push(ctx.locale), []) };
    createEngine(config, { recognizers: [spy, sr] }).analyze("x", { locale: "hr-HR" });
    expect(seen).toEqual(["hr-HR"]);
  });

  it("matches locales ignoring case and script", () => {
    const engine = createEngine(config, { recognizers: [vi, sr, any] });
    expect(entities(engine, "sr-Latn-RS")).toEqual(["ANY_THING", "SR_THING"]);
    expect(entities(engine, "SR-cyrl-rs")).toEqual(["ANY_THING", "SR_THING"]);
    expect(entities(engine, "VI-vn")).toEqual(["ANY_THING", "VI_THING"]);
    // A region is not a script: Serbian recognizers made for Serbia do not claim Montenegro.
    expect(entities(engine, "sr-Latn-ME")).toEqual(["ANY_THING", "SR_THING", "VI_THING"]);
    expect(() => createEngine({ configVersion: 1, locales: { primary: "sr-Latn-RS" } }, { recognizers: [sr] })).not.toThrow();
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

describe("declared coverage fails closed at load (D14, D20)", () => {
  const any = literal("t.any", "ANY_THING", "x", ["*"]);
  const vi = literal("t.vi", "VI_THING", "x", ["vi-VN"]);
  const viLang = literal("t.vi-lang", "VI_LANG_THING", "x", ["vi"]);

  it("refuses a primary locale that only locale-independent recognizers serve", () => {
    expect(() => createEngine({ configVersion: 1, locales: { primary: "en-SG" } }, { recognizers: [any] })).toThrow(
      /no loaded recognizer serves locale "en-SG"/,
    );
  });

  it("refuses a primary locale when nothing is loaded at all", () => {
    expect(() => createEngine({ configVersion: 1, locales: { primary: "vi-VN" } })).toThrow(ConfigError);
  });

  it("refuses an `also` locale nothing serves, even when the primary one is served", () => {
    expect(() =>
      createEngine({ configVersion: 1, locales: { primary: "vi-VN", also: ["sr-RS"] } }, { recognizers: [vi] }),
    ).toThrow(/"sr-RS"/);
  });

  it("accepts a locale served exactly or by its primary language", () => {
    expect(() => createEngine({ configVersion: 1, locales: { primary: "vi-VN" } }, { recognizers: [vi] })).not.toThrow();
    expect(() => createEngine({ configVersion: 1, locales: { primary: "vi-VN" } }, { recognizers: [viLang] })).not.toThrow();
  });

  it("refuses a per-entity threshold for an entity no loaded recognizer reports", () => {
    expect(() =>
      createEngine({ configVersion: 1, thresholds: { perEntity: { SG_NRIC_FIN: 0.6 } } }, { recognizers: [any] }),
    ).toThrow(/SG_NRIC_FIN, which no loaded recognizer reports/);
  });

  it("accepts a per-entity threshold for an entity a loaded recognizer reports", () => {
    expect(() =>
      createEngine({ configVersion: 1, thresholds: { perEntity: { ANY_THING: 0.6 } } }, { recognizers: [any] }),
    ).not.toThrow();
  });

  it("asks nothing of an engine that declares no locales and no thresholds", () => {
    expect(() => createEngine({ configVersion: 1 })).not.toThrow();
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
