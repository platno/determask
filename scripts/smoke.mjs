#!/usr/bin/env node
/**
 * Cross-runtime smoke test (D1): the BUILT package, the README example,
 * byte-for-byte, on whichever runtime runs this file.
 *
 *   node scripts/smoke.mjs
 *   bun  scripts/smoke.mjs
 *   deno run --allow-read scripts/smoke.mjs
 *
 * No test framework and no runtime-specific API, so it means the same thing
 * everywhere. Exits non-zero on the first difference.
 */
import { createEngine, RestoreError, WithheldError } from "../packages/core/dist/index.js";

const runtime =
  typeof globalThis.Deno !== "undefined" ? `deno ${globalThis.Deno.version.deno}`
  : typeof globalThis.Bun !== "undefined" ? `bun ${globalThis.Bun.version}`
  : `node ${globalThis.process?.versions?.node}`;

let failures = 0;
function check(name, actual, expected) {
  if (actual === expected) return;
  failures++;
  console.error(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
}
function throws(name, fn, Err) {
  try {
    fn();
  } catch (e) {
    if (e instanceof Err) return;
    failures++;
    console.error(`FAIL ${name}: threw ${e?.name}, expected ${Err.name}`);
    return;
  }
  failures++;
  console.error(`FAIL ${name}: did not throw`);
}

const engine = createEngine({ configVersion: 1 });

// The README example.
const text = "Bệnh nhân Nguyễn Văn An, SĐT 0912 345 678. Tái khám: nguyen van an.";
const { findings } = engine.analyze(text, {
  locale: "vi-VN",
  knownValues: { PERSON: ["Nguyễn Văn An"], PHONE_NUMBER: ["0912 345 678"] },
});
const { text: masked, map } = engine.anonymize(text, findings);
check("README mask", masked, "Bệnh nhân ⟦PERSON_1⟧, SĐT ⟦PHONE_NUMBER_1⟧. Tái khám: ⟦PERSON_2⟧.");
check("README restore", engine.restore(masked, map, { strict: true }), text);

// Unicode behaviour that differs between engines when it is done wrong.
const sr = "Đorđe Šćekić, 😀 ０９１２, 𠀀Hoa";
const srOut = engine.anonymize(sr, engine.analyze(sr, {
  knownValues: { PERSON: ["Dorde Scekic", "Hoa"], PHONE_NUMBER: ["0912"] },
}).findings).text;
check("Unicode folding and boundaries", srOut, "⟦PERSON_1⟧, 😀 ⟦PHONE_NUMBER_1⟧, 𠀀Hoa");

// Script folding: other scripts' digits, Cyrillic ↔ Latin, numbers by any grouping.
const mixed = "هاتف ٠٩١٢٣٤٥٦٧٨, Петар Петровић, SĐT0912.345.678";
const mixedOut = engine.anonymize(mixed, engine.analyze(mixed, {
  knownValues: { PHONE_NUMBER: ["0912345678"], PERSON: ["Petar Petrović"] },
}).findings).text;
check("script folding", mixedOut, "هاتف ⟦PHONE_NUMBER_1⟧, ⟦PERSON_1⟧, SĐT⟦PHONE_NUMBER_2⟧");

// Fail closed.
throws("placeholder injection withheld", () => engine.anonymize("⟦PERSON_1⟧", []), WithheldError);
throws("unknown placeholder refused", () => engine.restore("⟦PERSON_9⟧", {}), RestoreError);

if (failures > 0) {
  console.error(`smoke: ${failures} failure(s) on ${runtime}`);
  globalThis.process?.exit?.(1);
  globalThis.Deno?.exit?.(1);
  throw new Error("smoke failed");
}
console.log(`smoke: OK on ${runtime}`);
