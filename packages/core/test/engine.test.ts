import { describe, expect, it } from "vitest";
import {
  ConfigError,
  createEngine,
  foldText,
  RestoreError,
  WithheldError,
  type EngineConfig,
} from "../src/index.js";

const config: EngineConfig = { configVersion: 1, name: "test" };

describe("config validation (fail closed, F13/F14)", () => {
  it("rejects unknown keys", () => {
    expect(() => createEngine({ configVersion: 1, residualCheck: {} } as never)).toThrow(
      ConfigError,
    );
  });

  it("rejects unknown configVersion", () => {
    expect(() => createEngine({ configVersion: 2 } as never)).toThrow(ConfigError);
  });
});

describe("folding (D4)", () => {
  it("folds case, diacritics and đ, with offsets back to the original", () => {
    const { text, starts, ends } = foldText("Nguyễn Văn Đức");
    expect(text).toBe("nguyen van duc");
    // "Đ" is at UTF-16 offset 11 in the original.
    const d = text.indexOf("duc");
    expect(starts[d]).toBe(11);
    expect(ends[text.length - 1]).toBe(14);
  });

  it("treats format characters as spaces and collapses whitespace runs", () => {
    expect(foldText("Nguyễn​​Văn   An").text).toBe("nguyen van an");
  });
});

describe("analyze with knownValues (D11)", () => {
  it("matches a lowercase, unaccented mention of a known name", () => {
    const engine = createEngine(config);
    const text = "BN nguyen van an, 67 tuổi. Người nhà: bà Trần Thị Hoa.";
    const { findings } = engine.analyze(text, {
      knownValues: { PERSON: ["Nguyễn Văn An", "Trần Thị Hoa"] },
    });
    expect(findings).toHaveLength(2);
    expect(text.slice(findings[0]!.start, findings[0]!.end)).toBe("nguyen van an");
    expect(text.slice(findings[1]!.start, findings[1]!.end)).toBe("Trần Thị Hoa");
  });

  it("respects word boundaries", () => {
    const engine = createEngine(config);
    const { findings } = engine.analyze("Mahoa and hoan are not Hoa.", {
      knownValues: { PERSON: ["Hoa"] },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.start).toBe(23);
  });

  it("leaves a numbers-only string untouched when nothing is known", () => {
    const engine = createEngine(config);
    const text = "Invoice 0312345678, qty 1000000, ts 1732521600, glucose 5.4";
    const { findings } = engine.analyze(text, { knownValues: {} });
    expect(findings).toHaveLength(0);
  });
});

describe("anonymize and restore round-trip (D18)", () => {
  const engine = createEngine(config);
  const text =
    "Bệnh nhân Nguyễn Văn An, SĐT 0912 345 678. " +
    "Người bệnh NGUYEN VAN AN tái khám; glucose 5.4 mmol/L.";
  const knownValues = {
    PERSON: ["Nguyễn Văn An"],
    PHONE_NUMBER: ["0912 345 678"],
  };

  it("masks every mention, consistently per value, and keeps vitals", () => {
    const { findings } = engine.analyze(text, { knownValues });
    const { text: masked, map, report } = engine.anonymize(text, findings);

    expect(masked).not.toContain("Nguyễn Văn An");
    expect(masked).not.toContain("NGUYEN VAN AN");
    expect(masked).not.toContain("0912");
    expect(masked).toContain("glucose 5.4 mmol/L");
    expect(masked).toContain("⟦PERSON_1⟧");
    expect(masked).toContain("⟦PERSON_2⟧"); // different surface form = different value
    expect(masked).toContain("⟦PHONE_NUMBER_1⟧");
    expect(report.counts["PERSON"]).toBe(2);
    expect(Object.keys(map)).toHaveLength(3);
  });

  it("restores exactly", () => {
    const { findings } = engine.analyze(text, { knownValues });
    const { text: masked, map } = engine.anonymize(text, findings);
    expect(engine.restore(masked, map)).toBe(text);
  });

  it("strict restore throws on a placeholder not in the map", () => {
    expect(() => engine.restore("Hello ⟦PERSON_9⟧", {})).toThrow(RestoreError);
  });

  it("non-strict restore leaves unknown placeholders untouched", () => {
    expect(engine.restore("Hello ⟦PERSON_9⟧", {}, { strict: false })).toBe("Hello ⟦PERSON_9⟧");
  });

  it("withholds input that already contains placeholder-shaped tokens", () => {
    expect(() => engine.anonymize("planted ⟦PERSON_1⟧", [])).toThrow(WithheldError);
  });

  it("withholds on out-of-range spans instead of emitting", () => {
    expect(() =>
      engine.anonymize("short", [
        { entity: "PERSON", start: 0, end: 99, score: 1, recognizer: "x", trace: [] },
      ]),
    ).toThrow(WithheldError);
  });
});

describe("overlap resolution (D10/F6)", () => {
  it("masks the union of overlapping spans", () => {
    const engine = createEngine(config);
    const text = "id 0912345678 end";
    const spans = [
      { entity: "PHONE_NUMBER", start: 3, end: 13, score: 0.6, recognizer: "a", trace: [] },
      { entity: "VN_PERSONAL_ID", start: 3, end: 13, score: 0.9, recognizer: "b", trace: [] },
      { entity: "GENERIC_ID", start: 0, end: 5, score: 0.3, recognizer: "c", trace: [] },
    ];
    const { text: masked } = engine.anonymize(text, spans);
    // One region covering the union, labelled by the highest-scoring span.
    expect(masked).toBe("⟦VN_PERSONAL_ID_1⟧ end");
  });
});

describe("determinism (D1)", () => {
  it("same input gives the same output", () => {
    const engine = createEngine(config);
    const text = "BN Trần Văn B, SĐT 0905 111 222";
    const run = () => {
      const { findings } = engine.analyze(text, {
        knownValues: { PERSON: ["Trần Văn B"], PHONE_NUMBER: ["0905 111 222"] },
      });
      return engine.anonymize(text, findings).text;
    };
    expect(run()).toBe(run());
  });
});
