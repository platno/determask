import { describe, expect, it } from "vitest";
import {
  ConfigError,
  createEngine,
  RestoreError,
  WithheldError,
  type EngineConfig,
  type Span,
} from "../src/index.js";

const config: EngineConfig = { configVersion: 1, name: "test" };

const span = (entity: string, start: number, end: number, score = 1): Span => ({
  entity,
  start,
  end,
  score,
  recognizer: "test",
  trace: [],
});

describe("config validation — fail closed at load (F13/F14, D20)", () => {
  const bad: [string, unknown][] = [
    ["null", null],
    ["an array", []],
    ["a string", "config"],
    ["an unknown top-level key", { configVersion: 1, residualCheck: {} }],
    ["a missing configVersion", {}],
    ["an unsupported configVersion", { configVersion: 2 }],
    ["a non-string name", { configVersion: 1, name: 7 }],
    ["an unknown onError mode", { configVersion: 1, onError: "emit" }],
    ["locales that are not an object", { configVersion: 1, locales: "vi-VN" }],
    ["locales as an array", { configVersion: 1, locales: ["vi-VN"] }],
    ["an unknown key inside locales", { configVersion: 1, locales: { primary: "vi-VN", fallback: "en" } }],
    ["a missing locales.primary", { configVersion: 1, locales: {} }],
    ["an empty locales.primary", { configVersion: 1, locales: { primary: "" } }],
    ["locales.also that is not an array", { configVersion: 1, locales: { primary: "vi-VN", also: "en-US" } }],
    ["locales.also holding a non-string", { configVersion: 1, locales: { primary: "vi-VN", also: [1] } }],
  ];
  for (const [what, value] of bad) {
    it(`refuses ${what}`, () => {
      expect(() => createEngine(value as EngineConfig)).toThrow(ConfigError);
    });
  }

  it("accepts a complete valid config", () => {
    expect(() =>
      createEngine({
        configVersion: 1,
        name: "full",
        locales: { primary: "vi-VN", also: ["en-US"] },
        onError: "withhold",
      }),
    ).not.toThrow();
  });

  it("names the offending key without echoing config values", () => {
    expect(() => createEngine({ configVersion: 1, secret: "Nguyễn" } as never)).toThrow(/"secret"/);
    try {
      createEngine({ configVersion: 1, secret: "Nguyễn" } as never);
    } catch (e) {
      expect((e as Error).message).not.toContain("Nguyễn");
    }
  });
});

describe("analyze", () => {
  it("returns no findings without knownValues or recognizers", () => {
    expect(createEngine(config).analyze("Nguyễn Văn An, 0912345678").findings).toEqual([]);
  });

  it("leaves a numbers-only string untouched when nothing is known (F2)", () => {
    const text = "Invoice 0312345678, qty 1000000, ts 1732521600, glucose 5.4";
    expect(createEngine(config).analyze(text, { knownValues: {} }).findings).toEqual([]);
  });

  it("returns findings sorted by start, then end", () => {
    const { findings } = createEngine(config).analyze("Hoa An Hoa", {
      knownValues: { PERSON: ["Hoa", "An"] },
    });
    expect(findings.map((f) => [f.start, f.end])).toEqual([
      [0, 3],
      [4, 6],
      [7, 10],
    ]);
  });

  it("withholds a knownValues entity id that is not SCREAMING_SNAKE", () => {
    const engine = createEngine(config);
    expect(() => engine.analyze("Hoa", { knownValues: { person: ["Hoa"] } })).toThrow(WithheldError);
  });
});

describe("anonymize — placeholders (D18)", () => {
  const engine = createEngine(config);
  const text =
    "Bệnh nhân Nguyễn Văn An, SĐT 0912 345 678. " +
    "Người bệnh NGUYEN VAN AN tái khám; Nguyễn Văn An đồng ý; glucose 5.4 mmol/L.";
  const knownValues = { PERSON: ["Nguyễn Văn An"], PHONE_NUMBER: ["0912 345 678"] };

  it("masks every mention and leaves everything else byte-identical", () => {
    const { findings } = engine.analyze(text, { knownValues });
    const { text: masked } = engine.anonymize(text, findings);
    expect(masked).toBe(
      "Bệnh nhân ⟦PERSON_1⟧, SĐT ⟦PHONE_NUMBER_1⟧. " +
        "Người bệnh ⟦PERSON_2⟧ tái khám; ⟦PERSON_1⟧ đồng ý; glucose 5.4 mmol/L.",
    );
  });

  it("numbers placeholders in order of first mention", () => {
    const { findings } = engine.analyze("An then Hoa then An", {
      knownValues: { PERSON: ["An", "Hoa"] },
    });
    expect(engine.anonymize("An then Hoa then An", findings).text).toBe(
      "⟦PERSON_1⟧ then ⟦PERSON_2⟧ then ⟦PERSON_1⟧",
    );
  });

  it("gives each surface form its own token, so restore is exact", () => {
    const { findings } = engine.analyze(text, { knownValues });
    const { map } = engine.anonymize(text, findings);
    expect(map).toEqual({
      "⟦PERSON_1⟧": "Nguyễn Văn An",
      "⟦PHONE_NUMBER_1⟧": "0912 345 678",
      "⟦PERSON_2⟧": "NGUYEN VAN AN",
    });
  });

  it("numbers each entity type independently", () => {
    const t = "A B";
    const { text: masked } = engine.anonymize(t, [span("PERSON", 0, 1), span("LOCATION", 2, 3)]);
    expect(masked).toBe("⟦PERSON_1⟧ ⟦LOCATION_1⟧");
  });

  it("reports counts per entity, and no text (D17)", () => {
    const { findings } = engine.analyze(text, { knownValues });
    const { report } = engine.anonymize(text, findings);
    expect(report).toEqual({ counts: { PERSON: 3, PHONE_NUMBER: 1 } });
  });

  it("returns the text unchanged with an empty map when there are no findings", () => {
    expect(engine.anonymize("nothing here", [])).toEqual({
      text: "nothing here",
      map: {},
      report: { counts: {} },
    });
  });

  it("masks caller-supplied spans too (D2)", () => {
    expect(engine.anonymize("call 115 now", [span("PHONE_NUMBER", 5, 8)]).text).toBe(
      "call ⟦PHONE_NUMBER_1⟧ now",
    );
  });
});

describe("anonymize — fail closed (D14)", () => {
  const engine = createEngine(config);

  it("withholds input that already contains a placeholder-shaped token", () => {
    expect(() => engine.anonymize("planted ⟦PERSON_1⟧", [])).toThrow(WithheldError);
  });

  it("withholds even when called twice in a row (no stale regex state)", () => {
    expect(() => engine.anonymize("a ⟦X_1⟧", [])).toThrow(WithheldError);
    expect(() => engine.anonymize("b ⟦X_1⟧", [])).toThrow(WithheldError);
    expect(engine.anonymize("clean", []).text).toBe("clean");
  });

  it("refuses to re-mask its own output (F3: no nested placeholders)", () => {
    const first = engine.anonymize("Hoa", [span("PERSON", 0, 3)]);
    expect(() => engine.anonymize(first.text, [span("PERSON", 0, first.text.length)])).toThrow(
      WithheldError,
    );
  });

  const invalid: [string, Span][] = [
    ["a fractional start", span("PERSON", 0.5, 3)],
    ["a fractional end", span("PERSON", 0, 2.5)],
    ["a negative start", span("PERSON", -1, 3)],
    ["an end past the text", span("PERSON", 0, 99)],
    ["an empty span", span("PERSON", 2, 2)],
    ["a reversed span", span("PERSON", 3, 1)],
  ];
  for (const [what, s] of invalid) {
    it(`withholds on ${what}`, () => {
      expect(() => engine.anonymize("short", [s])).toThrow(WithheldError);
    });
  }

  it("withholds a span whose entity id would make an unrestorable token", () => {
    for (const entity of ["person", "Person", "DATE-TIME", "1ID", "", "ID\u0000X"]) {
      expect(() => engine.anonymize("short", [span(entity, 0, 2)])).toThrow(WithheldError);
    }
    expect(() =>
      engine.anonymize("short", [{ ...span("X", 0, 2), entity: 7 as unknown as string }]),
    ).toThrow(WithheldError);
  });
});

describe("overlap resolution — union with deterministic tie-break (D10, F6, F11)", () => {
  const engine = createEngine(config);

  it("masks the union of overlapping spans, labelled by the highest score", () => {
    const text = "id 0912345678 end";
    const { text: masked } = engine.anonymize(text, [
      span("PHONE_NUMBER", 3, 13, 0.6),
      span("VN_PERSONAL_ID", 3, 13, 0.9),
      span("GENERIC_ID", 0, 5, 0.3),
    ]);
    expect(masked).toBe("⟦VN_PERSONAL_ID_1⟧ end");
  });

  it("chains overlaps into one region (no digits leak between them)", () => {
    const { text: masked, map } = engine.anonymize("0912 345 678", [
      span("PHONE_NUMBER", 0, 6, 0.5),
      span("PHONE_NUMBER", 5, 10, 0.5),
      span("PHONE_NUMBER", 9, 12, 0.5),
    ]);
    expect(masked).toBe("⟦PHONE_NUMBER_1⟧");
    expect(map["⟦PHONE_NUMBER_1⟧"]).toBe("0912 345 678");
  });

  it("keeps adjacent spans separate", () => {
    expect(engine.anonymize("AnHoa", [span("PERSON", 0, 2), span("PERSON", 2, 5)]).text).toBe(
      "⟦PERSON_1⟧⟦PERSON_2⟧",
    );
  });

  it("breaks score ties by length, then by start, then by entity id", () => {
    // equal scores: the longer span wins
    expect(
      engine.anonymize("abcdef", [span("SHORT", 0, 3, 0.5), span("LONGER", 1, 6, 0.5)]).text,
    ).toBe("⟦LONGER_1⟧");
    // equal score and length: the earlier start wins
    expect(
      engine.anonymize("abcdef", [span("LATER", 2, 6, 0.5), span("EARLIER", 0, 4, 0.5)]).text,
    ).toBe("⟦EARLIER_1⟧");
    // all equal: the alphabetically first entity id wins, whatever the input order
    for (const order of [
      ["C", "A", "B"],
      ["B", "C", "A"],
      ["A", "B", "C"],
    ]) {
      expect(engine.anonymize("abc", order.map((e) => span(e, 0, 3, 0.5))).text).toBe("⟦A_1⟧");
    }
  });

  it("tolerates exact duplicate spans", () => {
    expect(engine.anonymize("abc", [span("A", 0, 3), span("A", 0, 3)]).text).toBe("⟦A_1⟧");
  });
});

describe("restore — strict by default (D18)", () => {
  const engine = createEngine(config);

  it("restores exactly what anonymize replaced", () => {
    const text = "Bà Trần Thị Hoa, con trai anh Lê Văn Bình, SĐT 0905 111 222.";
    const { findings } = engine.analyze(text, {
      knownValues: { PERSON: ["Trần Thị Hoa", "Lê Văn Bình"], PHONE_NUMBER: ["0905 111 222"] },
    });
    const { text: masked, map } = engine.anonymize(text, findings);
    expect(masked).not.toMatch(/Hoa|Bình|0905/);
    expect(engine.restore(masked, map)).toBe(text);
  });

  it("restores tokens wherever the translation moved them", () => {
    const map = { "⟦PERSON_1⟧": "Trần Thị Hoa" };
    expect(engine.restore("Mrs ⟦PERSON_1⟧ was admitted. ⟦PERSON_1⟧ consented.", map)).toBe(
      "Mrs Trần Thị Hoa was admitted. Trần Thị Hoa consented.",
    );
  });

  it("throws on a placeholder that is not in the map", () => {
    expect(() => engine.restore("Hello ⟦PERSON_9⟧", {})).toThrow(RestoreError);
  });

  it("is strict when strict is set explicitly", () => {
    expect(() => engine.restore("Hello ⟦PERSON_9⟧", {}, { strict: true })).toThrow(RestoreError);
  });

  it("ignores inherited properties — only the map's own entries restore", () => {
    const map = Object.create({ "⟦PERSON_1⟧": "inherited" }) as Record<string, string>;
    expect(() => engine.restore("⟦PERSON_1⟧", map)).toThrow(RestoreError);
  });

  it("restores an empty value faithfully", () => {
    expect(engine.restore("[⟦X_1⟧]", { "⟦X_1⟧": "" })).toBe("[]");
  });

  it("non-strict restore leaves unknown placeholders untouched", () => {
    expect(engine.restore("Hello ⟦PERSON_9⟧", {}, { strict: false })).toBe("Hello ⟦PERSON_9⟧");
  });

  it("leaves text without placeholders unchanged", () => {
    expect(engine.restore("no tokens here", {})).toBe("no tokens here");
  });
});

describe("determinism (D1)", () => {
  it("same input and config give the same output, every time", () => {
    const text = "BN Trần Văn B, SĐT 0905 111 222, gặp lại Trần Văn B.";
    const knownValues = { PERSON: ["Trần Văn B"], PHONE_NUMBER: ["0905 111 222"] };
    const run = () => {
      const engine = createEngine(config);
      const { findings } = engine.analyze(text, { knownValues });
      return engine.anonymize(text, findings);
    };
    const first = run();
    for (let i = 0; i < 5; i++) expect(run()).toEqual(first);
  });
});
