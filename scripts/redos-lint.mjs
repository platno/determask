#!/usr/bin/env node
/**
 * ReDoS gate (D5): every built-in pattern must be linear in practice.
 *
 * Collects patterns from each package's `src/patterns/` directory (files
 * exporting `PATTERNS: { name, regex }[]`) and runs the n-vs-4n timing
 * test from agent-redact's thresholds: t(4n)/t(n) <= 10 with a 1500 ms cap.
 *
 * Static analysis (recheck / redos-detector) is added in M1 when the first
 * real pattern lands; this script is the CI hook so the gate exists from M0.
 */
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const packagesDir = new URL("../packages/", import.meta.url).pathname;
const hostile = (n) => "0".repeat(n) + "!" + "9".repeat(n);

let checked = 0;
let failed = 0;

for (const pkg of readdirSync(packagesDir)) {
  const dir = join(packagesDir, pkg, "dist", "patterns");
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const mod = await import(pathToFileURL(join(dir, file)).href);
    for (const { name, regex } of mod.PATTERNS ?? []) {
      checked++;
      const re = new RegExp(regex, "gu");
      const time = (input) => {
        const t0 = performance.now();
        re.lastIndex = 0;
        while (re.exec(input) !== null) {
          /* drain */
        }
        return performance.now() - t0;
      };
      const t1 = time(hostile(10_000));
      const t4 = time(hostile(40_000));
      if (t4 > 1500 || (t1 > 1 && t4 / t1 > 10)) {
        failed++;
        console.error(
          `REDOS ${pkg}/${file} ${name}: t(n)=${t1.toFixed(1)}ms t(4n)=${t4.toFixed(1)}ms`,
        );
      }
    }
  }
}

console.log(`redos-lint: ${checked} pattern(s) checked, ${failed} failed`);
if (failed > 0) process.exit(1);
