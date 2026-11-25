#!/usr/bin/env node
/**
 * ReDoS gate (D5): every built-in pattern must be linear in practice.
 *
 * Imports each package's BUILT entry point (packages/<pkg>/dist/index.js),
 * finds every exported pack, and times each recognizer's `patterns` on a
 * family of hostile inputs at sizes n and 4n. A pattern fails when
 * t(4n)/t(n) > 10 (with t(n) above the noise floor), when t(4n) > 1500 ms
 * — agent-redact's thresholds — or when it does not finish at all.
 *
 * ⛔ A runaway regex cannot be interrupted from the thread it runs on: a
 * timer read after `exec()` returns never fires (failure F9). So each
 * pattern is timed in its own child process, which is killed at the
 * deadline. Patterns run as the engine runs them, with the "gu" flags.
 *
 * Run after `pnpm build`. Static analysis (recheck / redos-detector) is a
 * follow-up; this gate already exercises the real patterns.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Hostile inputs: long runs of what patterns repeat over, ending in a mismatch. */
const GENERATORS = {
  digits: (n) => "0".repeat(n) + "!" + "9".repeat(n),
  letters: (n) => "a".repeat(n) + "!",
  separated: (n) => "0 ".repeat(n) + "!",
  mixed: (n) => "a0.".repeat(n) + "@",
  dotted: (n) => "1.".repeat(n) + "!",
};
const N = 5_000;
const DEADLINE_MS = 5_000; // per pattern, all generators together

// ── child: time one pattern, print the results as JSON ───────────────────────
if (process.argv[2] === "--probe") {
  const re = new RegExp(Buffer.from(process.argv[3], "base64").toString("utf8"), "gu");
  const time = (input) => {
    const t0 = performance.now();
    re.lastIndex = 0;
    while (re.exec(input) !== null) {
      if (re.lastIndex === 0) break;
    }
    return performance.now() - t0;
  };
  const out = {};
  for (const [gen, make] of Object.entries(GENERATORS)) out[gen] = [time(make(N)), time(make(4 * N))];
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// ── parent: collect every pattern, probe each in a killable child ────────────
const self = fileURLToPath(import.meta.url);
const packagesDir = new URL("../packages/", import.meta.url).pathname;
const isPack = (v) => v && typeof v === "object" && typeof v.id === "string" && Array.isArray(v.recognizers);

let checked = 0;
let failed = 0;

for (const pkg of readdirSync(packagesDir)) {
  const entry = join(packagesDir, pkg, "dist", "index.js");
  if (!existsSync(entry)) continue;
  const mod = await import(pathToFileURL(entry).href);
  for (const pack of Object.values(mod).filter(isPack)) {
    for (const recognizer of pack.recognizers) {
      for (const { name, regex } of recognizer.patterns ?? []) {
        checked++;
        const where = `${pack.id}/${recognizer.id} ${name}`;
        const probe = spawnSync(process.execPath, [self, "--probe", Buffer.from(regex).toString("base64")], {
          timeout: DEADLINE_MS,
          killSignal: "SIGKILL",
          encoding: "utf8",
        });
        if (probe.status !== 0) {
          failed++;
          console.error(
            probe.signal
              ? `REDOS ${where}: did not finish within ${DEADLINE_MS} ms — catastrophic backtracking`
              : `REDOS ${where}: probe failed — ${probe.stderr.trim().split("\n")[0]}`,
          );
          continue;
        }
        for (const [gen, [t1, t4]] of Object.entries(JSON.parse(probe.stdout))) {
          if (t4 > 1500 || (t1 > 1 && t4 / t1 > 10)) {
            failed++;
            console.error(`REDOS ${where} on ${gen}: t(n)=${t1.toFixed(1)}ms t(4n)=${t4.toFixed(1)}ms`);
          }
        }
      }
    }
  }
}

console.log(
  `redos-lint: ${checked} pattern(s) checked against ${Object.keys(GENERATORS).length} hostile inputs, ${failed} failed`,
);
if (failed > 0) process.exit(1);
