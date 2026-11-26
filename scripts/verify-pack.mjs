#!/usr/bin/env node
/**
 * Release gate: what `pnpm publish` would upload, checked before it is.
 *
 * Packs every package with `pnpm pack` (which rewrites `workspace:*` to the
 * real version, as publish does), then for each tarball:
 *   - it contains the built entry point and types, the sources its source
 *     maps point at, README, LICENSE, NOTICE and THIRD_PARTY_NOTICES.md —
 *     the legal files byte-identical to the repository root's;
 *   - it contains no tests, coverage or build-info files;
 *   - its manifest has the release version, no `workspace:` ranges, a
 *     repository directory (npm provenance needs it) and provenance on;
 *   - every source a shipped `.map` file names is in the tarball.
 * Then it extracts the tarballs into an empty project's node_modules — no
 * workspace links — and runs the smoke test, a sentence through four packs,
 * and every packed pack's own recognizer examples, all imported by package
 * name, as a user would.
 *
 * Run after `pnpm build`. Offline: nothing is fetched or published.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packagesDir = join(root, "packages");
const LEGAL = ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"];
const REQUIRED = ["package.json", "README.md", ...LEGAL, "dist/index.js", "dist/index.d.ts"];
const FORBIDDEN = [/^test\//, /^coverage\//, /\.tsbuildinfo$/, /\.test\.[jt]s$/, /^node_modules\//];

const work = mkdtempSync(join(tmpdir(), "determask-verify-pack-"));
let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`FAIL ${msg}`);
};

try {
  const tarballs = join(work, "tarballs");
  const project = join(work, "project");
  mkdirSync(tarballs);
  mkdirSync(join(project, "node_modules", "@determask"), { recursive: true });

  // A folder without a manifest (build output left by another branch) is not a package.
  const packages = readdirSync(packagesDir)
    .filter((dir) => existsSync(join(packagesDir, dir, "package.json")))
    .sort();
  const versions = new Set();
  for (const dir of packages) {
    const manifest = JSON.parse(readFileSync(join(packagesDir, dir, "package.json"), "utf8"));
    versions.add(manifest.version);
    execFileSync("pnpm", ["pack", "--pack-destination", tarballs], { cwd: join(packagesDir, dir), stdio: "ignore" });
  }
  if (versions.size !== 1) fail(`packages disagree on the version: ${[...versions].join(", ")}`);
  const [version] = versions;
  const packNames = [];

  for (const file of readdirSync(tarballs).sort()) {
    const tgz = join(tarballs, file);
    const extracted = join(work, "x", file);
    mkdirSync(extracted, { recursive: true });
    execFileSync("tar", ["-xzf", tgz, "-C", extracted]);
    const pkgRoot = join(extracted, "package");
    const files = execFileSync("tar", ["-tzf", tgz], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .map((f) => f.replace(/^package\//, ""));
    const has = new Set(files);

    const manifest = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
    const name = manifest.name;
    for (const f of REQUIRED) if (!has.has(f)) fail(`${name}: ${f} is missing from the tarball`);
    for (const f of files) if (FORBIDDEN.some((re) => re.test(f))) fail(`${name}: ships ${f}`);
    for (const f of LEGAL) {
      if (has.has(f) && !readFileSync(join(pkgRoot, f)).equals(readFileSync(join(root, f)))) {
        fail(`${name}: ${f} differs from the repository root's`);
      }
    }

    if (manifest.version !== version) fail(`${name}: version ${manifest.version}, expected ${version}`);
    for (const [dep, range] of Object.entries(manifest.dependencies ?? {})) {
      if (String(range).startsWith("workspace:")) fail(`${name}: dependency ${dep} is still ${range}`);
      else if (dep.startsWith("@determask/") && range !== version) fail(`${name}: depends on ${dep}@${range}, not ${version}`);
    }
    if (typeof manifest.repository?.directory !== "string") fail(`${name}: repository.directory is missing`);
    if (manifest.publishConfig?.provenance !== true) fail(`${name}: publishConfig.provenance is not true`);
    if (manifest.publishConfig?.access !== "public") fail(`${name}: publishConfig.access is not public`);

    for (const map of files.filter((f) => f.endsWith(".map"))) {
      const { sources } = JSON.parse(readFileSync(join(pkgRoot, map), "utf8"));
      for (const source of sources) {
        const target = posix.normalize(posix.join(posix.dirname(map), source));
        if (!has.has(target)) fail(`${name}: ${map} points at ${target}, which is not shipped`);
      }
    }

    cpSync(pkgRoot, join(project, "node_modules", ...name.split("/")), { recursive: true });
    if (name.startsWith("@determask/pack-")) packNames.push(name);
    console.log(`  ${name}@${manifest.version}: ${files.length} files`);
  }

  // The smoke test, importing the package by name instead of from the repository.
  const smoke = readFileSync(join(root, "scripts", "smoke.mjs"), "utf8");
  const byName = smoke.replace('from "../packages/core/dist/index.js"', 'from "@determask/core"');
  if (byName === smoke) fail("smoke.mjs no longer imports ../packages/core/dist/index.js; update verify-pack");
  writeFileSync(join(project, "smoke.mjs"), byName);
  writeFileSync(
    join(project, "packs.mjs"),
    `import { createEngine } from "@determask/core";
import { corePack } from "@determask/pack-core";
import { viPack } from "@determask/pack-vi";
import { srPack } from "@determask/pack-sr";
import { sgPack } from "@determask/pack-sg";
const engine = createEngine({ configVersion: 1 }, { packs: [corePack, viPack, srPack, sgPack] });
const text = "a@b.io CCCD 001099012345 JMBG 0101990710008 NRIC S1234567D";
const { findings } = engine.analyze(text);
const out = engine.anonymize(text, findings).text;
const want = "⟦EMAIL_ADDRESS_1⟧ CCCD ⟦VN_PERSONAL_ID_1⟧ JMBG ⟦RS_PERSONAL_ID_1⟧ NRIC ⟦SG_NRIC_FIN_1⟧";
if (out !== want) { console.error("FAIL packs by name\\n  expected " + want + "\\n  actual   " + out); process.exit(1); }

// Every packed pack, imported by name, passes its recognizers' own examples.
import { checkExamples } from "@determask/core";
for (const name of ${JSON.stringify(packNames)}) {
  const packs = Object.values(await import(name)).filter((v) => v && typeof v === "object" && Array.isArray(v.recognizers));
  if (packs.length === 0) { console.error("FAIL " + name + " exports no pack"); process.exit(1); }
  for (const pack of packs) {
    for (const r of pack.recognizers) {
      const failures = checkExamples(r);
      if (failures.length > 0) { console.error("FAIL " + name + " " + r.id + ": " + JSON.stringify(failures)); process.exit(1); }
    }
  }
}
console.log("packs: OK by package name, " + ${JSON.stringify(packNames)}.length + " packs' examples pass");
`,
  );
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "verify", private: true, type: "module" }));
  for (const script of ["smoke.mjs", "packs.mjs"]) {
    try {
      execFileSync(process.execPath, [script], { cwd: project, stdio: "inherit" });
    } catch {
      fail(`${script} failed against the packed packages`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(`verify-pack: ${failures === 0 ? "OK" : `${failures} failure(s)`}`);
if (failures > 0) process.exit(1);
