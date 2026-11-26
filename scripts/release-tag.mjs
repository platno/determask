#!/usr/bin/env node
/**
 * Release check: the pushed tag must name the version every package has,
 * and the npm dist-tag follows from it — a pre-release (`0.1.0-alpha.0`)
 * goes out under its identifier (`alpha`), so `npm install @determask/core`
 * never picks up a pre-release by accident; a plain version goes out as
 * `latest`.
 *
 *   node scripts/release-tag.mjs v0.1.0-alpha.0   → prints "alpha"
 *
 * Exits non-zero, naming the mismatch, when the tag and the packages
 * disagree. In GitHub Actions it also writes `dist-tag=` to $GITHUB_OUTPUT.
 */
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tag = process.argv[2] ?? "";
const packagesDir = fileURLToPath(new URL("../packages/", import.meta.url));
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const fail = (msg) => {
  console.error(`release-tag: ${msg}`);
  process.exit(1);
};

if (!tag.startsWith("v")) fail(`tag ${JSON.stringify(tag)} must look like v1.2.3 or v1.2.3-alpha.0`);
const version = tag.slice(1);
const match = SEMVER.exec(version);
if (match === null) fail(`tag ${tag} is not a semantic version`);

for (const dir of readdirSync(packagesDir)) {
  const { name, version: v, private: isPrivate } = JSON.parse(readFileSync(join(packagesDir, dir, "package.json"), "utf8"));
  if (!isPrivate && v !== version) fail(`${name} is at ${v}, but the tag is ${tag}`);
}

const prerelease = match[4];
const distTag = prerelease === undefined ? "latest" : (/^[A-Za-z][0-9A-Za-z-]*/.exec(prerelease)?.[0] ?? "next");
console.log(distTag);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `dist-tag=${distTag}\n`);
