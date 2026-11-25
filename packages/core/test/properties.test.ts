/**
 * Randomised properties of anonymize/restore, on a fixed seed so every run
 * is the same run. The oracle is independent of the engine's own overlap
 * code: it only knows which code units some span covered.
 */
import { describe, expect, it } from "vitest";
import { createEngine, type Span } from "../src/index.js";

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

// Letters, digits, marks, format chars, spaces, and two astral code points.
const ALPHABET = ["a", "Z", "Đ", "ễ", "0", "9", " ", ".", "́", "​", "😀", "𠀀"];
const ENTITIES = ["PERSON", "PHONE_NUMBER", "VN_PERSONAL_ID", "A"];
const PLACEHOLDER = /⟦[A-Z][A-Z0-9_]*_\d+⟧/gu;

const isHigh = (u: number) => u >= 0xd800 && u <= 0xdbff;
const isLow = (u: number) => u >= 0xdc00 && u <= 0xdfff;

function randomCase(rand: () => number): { text: string; spans: Span[] } {
  const cps = 1 + Math.floor(rand() * 30);
  let text = "";
  for (let i = 0; i < cps; i++) text += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  const spans: Span[] = [];
  const n = 2 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(rand() * text.length);
    const b = Math.floor(rand() * text.length);
    const start = Math.min(a, b);
    const end = Math.max(a, b) + 1; // non-empty, may split a surrogate pair on purpose
    spans.push({
      entity: ENTITIES[Math.floor(rand() * ENTITIES.length)] as string,
      start,
      end: Math.min(end, text.length),
      score: Math.round(rand() * 4) / 4,
      recognizer: "prop",
      trace: [],
    });
  }
  return { text, spans: spans.filter((s) => s.start < s.end) };
}

/** Which code units are covered, widened to whole code points like the engine promises. */
function covered(text: string, spans: readonly Span[]): boolean[] {
  const c = new Array<boolean>(text.length).fill(false);
  for (const s of spans) for (let i = s.start; i < s.end; i++) c[i] = true;
  for (let i = 0; i < text.length - 1; i++) {
    if (isHigh(text.charCodeAt(i)) && isLow(text.charCodeAt(i + 1)) && (c[i] || c[i + 1])) {
      c[i] = c[i + 1] = true;
    }
  }
  return c;
}

const engine = createEngine({ configVersion: 1 });
const CASES = 20_000;

describe(`anonymize/restore properties (${CASES} seeded random cases)`, () => {
  it("never leaves a covered code unit in clear, and changes nothing else", () => {
    const rand = prng(0xdec0de);
    for (let k = 0; k < CASES; k++) {
      const { text, spans } = randomCase(rand);
      const masked = engine.anonymize(text, spans).text;
      const c = covered(text, spans);
      const uncovered = Array.from({ length: text.length }, (_, i) => (c[i] ? "" : text[i])).join("");
      expect(masked.replace(PLACEHOLDER, ""), `case ${k}: ${JSON.stringify({ text, spans })}`).toBe(uncovered);
    }
  });

  it("restore(anonymize(x)) === x, exactly", () => {
    const rand = prng(0x5eed);
    for (let k = 0; k < CASES; k++) {
      const { text, spans } = randomCase(rand);
      const { text: masked, map } = engine.anonymize(text, spans);
      expect(engine.restore(masked, map), `case ${k}`).toBe(text);
    }
  });

  it("never emits a lone surrogate", () => {
    const rand = prng(0xa57a1);
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    for (let k = 0; k < CASES; k++) {
      const { text, spans } = randomCase(rand);
      expect(engine.anonymize(text, spans).text, `case ${k}`).not.toMatch(lone);
    }
  });

  it("is deterministic: the same spans in any order give the same output", () => {
    const rand = prng(0x0de7);
    for (let k = 0; k < 2_000; k++) {
      const { text, spans } = randomCase(rand);
      const reversed = engine.anonymize(text, [...spans].reverse());
      expect(reversed, `case ${k}`).toEqual(engine.anonymize(text, spans));
    }
  });
});
