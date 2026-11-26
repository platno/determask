import { describe, expect, it } from "vitest";
import { createEngine, createStreamRestorer, RestoreError, STREAM_HOLD_LIMIT } from "../src/index.js";

const engine = createEngine({ configVersion: 1 });
const map = { "⟦PERSON_1⟧": "Nguyễn Văn An", "⟦PHONE_NUMBER_1⟧": "0912 345 678", "⟦PERSON_2⟧": "<Hoa & \"Lan\">" };

/** Push the chunks, then end; return everything emitted. */
const run = (chunks: string[], options = {}): string => {
  const r = createStreamRestorer(engine, map, options);
  return chunks.map((c) => r.push(c)).join("") + r.end();
};

/** mulberry32 — a tiny deterministic PRNG. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("createStreamRestorer — restore across chunks", () => {
  const whole = "Gọi ⟦PERSON_1⟧ ở số ⟦PHONE_NUMBER_1⟧, rồi ⟦PERSON_2⟧.";

  it("restores a placeholder split at every possible point", () => {
    for (let i = 0; i <= whole.length; i++) {
      expect(run([whole.slice(0, i), whole.slice(i)]), `split at ${i}`).toBe(engine.restore(whole, map));
    }
  });

  it("gives the same output as restore() for any chunking — 5,000 seeded cases, every format", () => {
    const parts = ["⟦PERSON_1⟧", "⟦PHONE_NUMBER_1⟧", "⟦PERSON_2⟧", "⟦", "⟦PERS", "⟧", " ", "a", "Đ", "⟦x", "⟦1", "_2", "😀"];
    const rand = prng(0x5ee);
    for (let k = 0; k < 5_000; k++) {
      const text = Array.from({ length: 1 + Math.floor(rand() * 12) }, () => parts[Math.floor(rand() * parts.length)]).join("");
      const chunks: string[] = [];
      for (let at = 0; at < text.length; ) {
        const n = 1 + Math.floor(rand() * 6);
        chunks.push(text.slice(at, at + n));
        at += n;
      }
      const format = (["text", "html", "json"] as const)[k % 3] as "text" | "html" | "json";
      const strict = k % 2 === 0;
      let expected: string | Error;
      try {
        expected = engine.restore(text, map, { format, strict });
        if (strict && /⟦(?:[A-Z][A-Z0-9_]*)?$/u.test(text)) expected = new RestoreError("open");
      } catch (e) {
        expected = e as Error;
      }
      if (expected instanceof Error) {
        expect(() => run(chunks, { format, strict }), JSON.stringify(chunks)).toThrow(RestoreError);
      } else {
        expect(run(chunks, { format, strict }), JSON.stringify(chunks)).toBe(expected);
      }
    }
  });

  it("emits text as soon as it is safe, holding only a fragment that could become a placeholder", () => {
    const r = createStreamRestorer(engine, map);
    expect(r.push("Xin chào ⟦PER")).toBe("Xin chào ");
    expect(r.push("SON_1")).toBe("");
    expect(r.push("⟧!")).toBe("Nguyễn Văn An!");
    expect(r.push("⟦ not one")).toBe("⟦ not one"); // a space can't be in a placeholder
    expect(r.push(" ⟦abc")).toBe(" ⟦abc"); // nor lower case
    expect(r.push(" ⟦1")).toBe(" ⟦1"); // an entity id starts with a letter
    expect(r.end()).toBe("");
  });

  it("escapes restored values for the output format, as restore() does", () => {
    expect(run(["<p>⟦PER", "SON_2⟧</p>"], { format: "html" })).toBe("<p>&lt;Hoa &amp; &quot;Lan&quot;&gt;</p>");
  });
});

describe("createStreamRestorer — fails closed", () => {
  it("throws on a placeholder not in the map as soon as it is complete, unless strict is off", () => {
    const r = createStreamRestorer(engine, map);
    expect(r.push("hi ⟦PERSON_")).toBe("hi ");
    expect(() => r.push("9⟧")).toThrow(RestoreError);
    expect(run(["hi ⟦PERSON_", "9⟧"], { strict: false })).toBe("hi ⟦PERSON_9⟧");
  });

  it("throws when the stream ends inside a placeholder, rather than flushing half of one", () => {
    expect(() => run(["Gọi ⟦PERSON_"])).toThrow("stream ended inside a placeholder");
    expect(run(["Gọi ⟦PERSON_"], { strict: false })).toBe("Gọi ⟦PERSON_");
  });

  it("stops holding a fragment longer than any placeholder could be", () => {
    const long = `⟦${"A".repeat(STREAM_HOLD_LIMIT)}`;
    expect(createStreamRestorer(engine, map).push(long)).toBe(long);
    // ... unless the map holds a placeholder that long.
    const token = `⟦${"B".repeat(STREAM_HOLD_LIMIT + 10)}_1⟧`;
    const r = createStreamRestorer(engine, { [token]: "x" });
    expect(r.push(token.slice(0, -3))).toBe("");
    expect(r.push(token.slice(-3))).toBe("x");
  });

  it("refuses push() after end(); a second end() returns nothing", () => {
    const r = createStreamRestorer(engine, map);
    expect(r.end()).toBe("");
    expect(r.end()).toBe("");
    expect(() => r.push("x")).toThrow("push() after end()");
  });
});
