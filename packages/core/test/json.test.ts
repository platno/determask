import { describe, expect, it } from "vitest";
import {
  createEngine,
  maskJson,
  patternRecognizer,
  restoreJson,
  RestoreError,
  WithheldError,
  type Engine,
  type Recognizer,
} from "../src/index.js";

const config = { configVersion: 1 } as const;

// A 9-digit number masked only with its "cmnd" label, and never after "invoice".
const cmnd = patternRecognizer({
  id: "t.cmnd",
  entity: "LEGACY_ID",
  locales: ["*"],
  patterns: [{ name: "nine", regex: "(?<!\\d)\\d{9}(?!\\d)", score: 0.2 }],
  context: ["cmnd"],
  contextBoost: 0.4,
  examples: { match: ["cmnd ⟪012345678⟫"], noMatch: ["012345678"] },
});
// A phone that masks on its own, unless "invoice" comes before it.
const phone = patternRecognizer({
  id: "t.phone",
  entity: "PHONE_NUMBER",
  locales: ["*"],
  patterns: [{ name: "ten", regex: "(?<!\\d)0\\d{9}(?!\\d)", score: 0.8 }],
  antiContext: ["invoice"],
  examples: { match: ["⟪0912345678⟫"], noMatch: ["invoice 0912345678"] },
});
const engine = createEngine(config, { recognizers: [cmnd, phone] });
const known = { knownValues: { EMAIL_ADDRESS: ["jane@example.com"], PERSON: ["Jane Doe"] } };

describe("maskJson — one map for a whole value", () => {
  const event = {
    message: "Payment failed for jane@example.com",
    user: { email: "jane@example.com", name: "Jane Doe", id: 42 },
    tags: ["checkout", "Jane Doe"],
    level: "error",
    handled: false,
    extra: null,
  };

  it("masks every string, giving the same value the same placeholder in every field", () => {
    const { value, map, report } = maskJson(engine, event, known);
    expect(value).toEqual({
      message: "Payment failed for ⟦EMAIL_ADDRESS_1⟧",
      user: { email: "⟦EMAIL_ADDRESS_1⟧", name: "⟦PERSON_1⟧", id: 42 },
      tags: ["checkout", "⟦PERSON_1⟧"],
      level: "error",
      handled: false,
      extra: null,
    });
    expect(map).toEqual({ "⟦EMAIL_ADDRESS_1⟧": "jane@example.com", "⟦PERSON_1⟧": "Jane Doe" });
    expect(report.counts).toEqual({ EMAIL_ADDRESS: 2, PERSON: 2 });
  });

  it("does not modify the input, and restoreJson gives it back exactly", () => {
    const before = structuredClone(event);
    const { value, map } = maskJson(engine, event, known);
    expect(event).toEqual(before);
    expect(restoreJson(engine, value, map)).toEqual(event);
  });

  it("accepts the same object reached twice (not a cycle)", () => {
    const shared = { email: "jane@example.com" };
    const { value } = maskJson(engine, { a: shared, b: [shared] }, known);
    expect(value).toEqual({ a: { email: "⟦EMAIL_ADDRESS_1⟧" }, b: [{ email: "⟦EMAIL_ADDRESS_1⟧" }] });
  });

  it("masks a top-level string or array", () => {
    expect(maskJson(engine, "Jane Doe", known).value).toBe("⟦PERSON_1⟧");
    expect(maskJson(engine, ["Jane Doe", 1], known).value).toEqual(["⟦PERSON_1⟧", 1]);
  });
});

describe("maskJson — the property name as context", () => {
  it("reads a value with the name of its property in front", () => {
    expect(maskJson(engine, { cmnd: "012345678", note: "012345678" }).value).toEqual({
      cmnd: "⟦LEGACY_ID_1⟧",
      note: "012345678",
    });
  });

  it("splits camelCase, snake_case and kebab-case names into words", () => {
    const { value } = maskJson(engine, { cmndNumber: "012345678", old_cmnd: "111111111", "cmnd-no": "222222222" });
    expect(Object.values(value as object)).toEqual(["⟦LEGACY_ID_1⟧", "⟦LEGACY_ID_2⟧", "⟦LEGACY_ID_3⟧"]);
  });

  it("gives an array's items the array's property name", () => {
    expect(maskJson(engine, { cmnd: ["012345678"] }).value).toEqual({ cmnd: ["⟦LEGACY_ID_1⟧"] });
  });

  it("never turns a property name into anti-context: it can only add findings", () => {
    expect(maskJson(engine, { invoice: "call me 0912345678" }).value).toEqual({ invoice: "call me ⟦PHONE_NUMBER_1⟧" });
    // Anti-context inside the value still applies.
    expect(maskJson(engine, { note: "invoice 0912345678" }).value).toEqual({ note: "invoice 0912345678" });
  });

  it("ignores a finding that lies wholly in the property name", () => {
    const { value } = maskJson(engine, { "Jane Doe": "visit" }, { ...known, keys: false });
    expect(value).toEqual({ "Jane Doe": "visit" });
  });

  it("clamps a finding that starts in the property name to the value", () => {
    const greedy: Recognizer = {
      id: "t.greedy",
      entities: ["LINE"],
      locales: ["*"],
      analyze: (v) =>
        v.original.startsWith("label: ")
          ? [{ entity: "LINE", start: 0, end: v.original.length, score: 1, recognizer: "t.greedy", trace: [] }]
          : [],
    };
    const { value } = maskJson(createEngine(config, { recognizers: [greedy] }), { label: "secret" });
    expect(value).toEqual({ label: "⟦LINE_1⟧" });
  });
});

describe("maskJson — keys and numbers", () => {
  it("masks object keys by default, and restores them", () => {
    const input = { "jane@example.com": { visits: 2 } };
    const { value, map } = maskJson(engine, input, known);
    expect(value).toEqual({ "⟦EMAIL_ADDRESS_1⟧": { visits: 2 } });
    expect(restoreJson(engine, value, map)).toEqual(input);
  });

  it("leaves keys alone with keys: false", () => {
    expect(maskJson(engine, { "jane@example.com": 1 }, { ...known, keys: false }).value).toEqual({ "jane@example.com": 1 });
  });

  it("masks a number that holds a finding, as a placeholder string", () => {
    const { value, map } = maskJson(engine, { phone: 912345678, id: 7 }, { knownValues: { PHONE_NUMBER: ["912345678"] } });
    expect(value).toEqual({ phone: "⟦PHONE_NUMBER_1⟧", id: 7 });
    expect(restoreJson(engine, value, map)).toEqual({ phone: "912345678", id: 7 }); // comes back as a string
  });

  it("returns an untouched number as the very same number", () => {
    const { value } = maskJson(engine, { zero: -0, big: 1e21, pi: 3.14 });
    expect(Object.is((value as { zero: number }).zero, -0)).toBe(true);
    expect(value).toEqual({ zero: -0, big: 1e21, pi: 3.14 });
  });

  it("leaves numbers alone with numbers: keep, and non-finite numbers always", () => {
    const opts = { knownValues: { PHONE_NUMBER: ["912345678"] }, numbers: "keep" as const };
    expect(maskJson(engine, { phone: 912345678 }, opts).value).toEqual({ phone: 912345678 });
    expect(maskJson(engine, { a: Number.NaN, b: Infinity }).value).toEqual({ a: Number.NaN, b: Infinity });
  });

  it("keeps undefined, as JSON.stringify would drop it later", () => {
    expect(maskJson(engine, { a: undefined }).value).toEqual({ a: undefined });
  });

  it("treats a __proto__ key as a key, not as the prototype", () => {
    const input = JSON.parse('{"__proto__": {"name": "Jane Doe"}}') as object;
    const { value } = maskJson(engine, input, known);
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.hasOwn(value as object, "__proto__")).toBe(true);
    expect((value as Record<string, unknown>)["__proto__"]).toEqual({ name: "⟦PERSON_1⟧" });
  });
});

describe("maskJson — fails closed on anything that is not plain JSON (D14)", () => {
  const withheld = (v: unknown, opts = {}) => () => maskJson(engine, v, opts);

  it("withholds a cycle", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(withheld(a)).toThrow(WithheldError);
    expect(withheld(a)).toThrow("$.self is a cycle");
  });

  it("withholds non-plain objects, naming the path and the kind", () => {
    expect(withheld({ at: new Date(0) })).toThrow("$.at is a Date, not a plain object");
    expect(withheld({ m: new Map() })).toThrow("$.m is a Map");
    class Patient {}
    expect(withheld([new Patient()])).toThrow("$[0] is a Patient");
    expect(withheld(Object.create(Object.create(null) as object))).toThrow("$ is a object, not a plain object");
  });

  it("withholds functions, bigints and symbols", () => {
    expect(withheld({ f: () => 1 })).toThrow("$.f is a function, not JSON");
    expect(withheld({ n: 10n })).toThrow("$.n is a bigint");
    expect(withheld({ s: Symbol("x") })).toThrow("$.s is a symbol");
  });

  it("accepts an object with a null prototype", () => {
    const bare = Object.assign(Object.create(null) as object, { name: "Jane Doe" });
    expect(maskJson(engine, bare, known).value).toEqual({ name: "⟦PERSON_1⟧" });
  });

  it("withholds nesting deeper than maxDepth", () => {
    let deep: unknown = "x";
    for (let i = 0; i < 300; i++) deep = [deep];
    expect(withheld(deep)).toThrow("nested deeper than 256");
    // maxDepth counts nested arrays and objects: [["x"]] has two.
    expect(maskJson(engine, [["x"]], { maxDepth: 2 }).value).toEqual([["x"]]);
    expect(withheld([["x"]], { maxDepth: 1 })).toThrow("nested deeper than 1");
  });

  it("withholds placeholder-shaped text anywhere in the value", () => {
    expect(withheld({ note: "⟦PERSON_1⟧" })).toThrow(WithheldError);
  });

  it("joins fields with a character none of them uses, or withholds", () => {
    const { value } = maskJson(engine, { a: " Jane Doe", b: "" }, known);
    expect(value).toEqual({ a: " ⟦PERSON_1⟧", b: "" });
    let all = "";
    for (let cp = 0xe000; cp <= 0xf8ff; cp++) all += String.fromCodePoint(cp);
    expect(withheld({ all })).toThrow("every private-use character");
  });

  it("withholds when two keys of one object would become the same text", () => {
    // Real masking never does this; the check guards an engine that would.
    const collapsing: Engine = {
      analyze: () => ({ findings: [] }),
      anonymize: (text) => ({ text: text.replace(/[ab]/gu, "k"), map: {}, report: { counts: {} } }),
      restore: (text) => text,
    };
    expect(() => maskJson(collapsing, { a: 1, b: 2 })).toThrow("two keys of one object became the same text");
  });
});

describe("restoreJson", () => {
  it("throws on a placeholder not in the map, unless strict is off", () => {
    expect(() => restoreJson(engine, { a: "⟦PERSON_9⟧" }, {})).toThrow(RestoreError);
    expect(restoreJson(engine, { a: "⟦PERSON_9⟧" }, {}, { strict: false })).toEqual({ a: "⟦PERSON_9⟧" });
  });

  it("fails closed on input that is not plain JSON, too", () => {
    expect(() => restoreJson(engine, { at: new Date(0) }, {})).toThrow(WithheldError);
    expect(() => restoreJson(engine, [[1]], {}, { maxDepth: 1 })).toThrow("nested deeper than 1");
  });
});
