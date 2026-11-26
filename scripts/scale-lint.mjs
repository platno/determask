#!/usr/bin/env node
/**
 * Scale gate: the whole engine must be linear in the length of the text.
 *
 * The ReDoS gate times each pattern on its own; this one times the engine
 * — analyze, anonymize and restore, with every built pack loaded — on long
 * documents at sizes n and 4n. Logs, transcripts and exports are long, and
 * a quadratic step turns a 2 MB input into a denial of service.
 *
 * A document fails when t(4n)/t(n) > 8 (linear is about 4) with t(n) above
 * the noise floor, when t(4n) > 5000 ms, or when it does not finish within
 * the deadline. Each document runs in its own child process, killed at the
 * deadline, so a regression cannot hang CI.
 *
 * Run after `pnpm build`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** One repeating unit per document; the document is the unit n times. */
const DOCUMENTS = {
  // Many findings: an email and an IP on every line.
  log: (i) => `2026-11-26T10:00:00Z INFO login user${i}@example.com from 10.0.${(i >> 8) & 255}.${i & 255} ok\n`,
  // Many candidates, none with its context word nearby.
  numbers: (i) => `row ${i} total ${100000000 + i} qty ${i % 97} code ${String(i).padStart(9, "0")}\n`,
  // Labelled identifiers from every pack, so context and validators run.
  clinical: (i) =>
    `BN Nguyễn Văn An, CCCD 001099012345, SĐT 0912 345 678, BHYT DN4010123456789. ` +
    `JMBG 0101990710008, tel 064 123 4567. NRIC S1234567D, HP 9123 4567. visit ${i}\n`,
  // Whitespace runs and format characters, which folding collapses.
  spacing: (i) => `a${i}   \t\t  b​​c    d\n\n\n`,
  // No findings at all: the cost of the scan itself.
  prose: (i) => `The quick brown fox jumps over the lazy dog, line ${i % 10}.\n`,
};
const N = 3_000;
const DEADLINE_MS = 30_000; // per document, both sizes and all three steps

// ── child: time one document, print the results as JSON ──────────────────────
if (process.argv[2] === "--probe") {
  const [, , , doc, entries] = process.argv;
  const { createEngine } = await import(pathToFileURL(join(packagesDir(), "core", "dist", "index.js")).href);
  const packs = [];
  for (const entry of JSON.parse(entries)) {
    for (const v of Object.values(await import(pathToFileURL(entry).href))) if (isPack(v)) packs.push(v);
  }
  const engine = createEngine({ configVersion: 1 }, { packs });
  const make = (n) => Array.from({ length: n }, (_, i) => DOCUMENTS[doc](i)).join("");
  const time = (text) => {
    const t0 = performance.now();
    const { findings } = engine.analyze(text, { knownValues: { PERSON: ["Nguyễn Văn An", "Petra Petrović"] } });
    const masked = engine.anonymize(text, findings);
    engine.restore(masked.text, masked.map);
    return performance.now() - t0;
  };
  time(make(N / 10)); // warm up the JIT
  process.stdout.write(JSON.stringify([time(make(N)), time(make(4 * N))]));
  process.exit(0);
}

function packagesDir() {
  return fileURLToPath(new URL("../packages/", import.meta.url));
}
function isPack(v) {
  return v && typeof v === "object" && typeof v.id === "string" && Array.isArray(v.recognizers);
}

// ── parent: probe each document in a killable child ──────────────────────────
const self = fileURLToPath(import.meta.url);
const entries = readdirSync(packagesDir())
  .filter((pkg) => pkg.startsWith("pack-"))
  .map((pkg) => join(packagesDir(), pkg, "dist", "index.js"))
  .filter(existsSync);

let failed = 0;
for (const doc of Object.keys(DOCUMENTS)) {
  const probe = spawnSync(process.execPath, [self, "--probe", doc, JSON.stringify(entries)], {
    timeout: DEADLINE_MS,
    killSignal: "SIGKILL",
    encoding: "utf8",
  });
  if (probe.status !== 0) {
    failed++;
    console.error(
      probe.signal
        ? `SCALE ${doc}: did not finish within ${DEADLINE_MS} ms`
        : `SCALE ${doc}: probe failed — ${probe.stderr.trim().split("\n")[0]}`,
    );
    continue;
  }
  const [t1, t4] = JSON.parse(probe.stdout);
  const line = `${doc}: t(n)=${t1.toFixed(0)}ms t(4n)=${t4.toFixed(0)}ms ratio ${(t4 / t1).toFixed(1)}`;
  if (t4 > 5000 || (t1 > 20 && t4 / t1 > 8)) {
    failed++;
    console.error(`SCALE ${line}`);
  } else {
    console.log(`  ${line}`);
  }
}

console.log(`scale-lint: ${Object.keys(DOCUMENTS).length} document(s), ${entries.length} pack(s), ${failed} failed`);
if (failed > 0) process.exit(1);
