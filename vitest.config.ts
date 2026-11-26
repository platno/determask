import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Tests exercise the TypeScript source, so coverage maps to real lines.
    alias: Object.fromEntries(
      ["core", "pack-core", "pack-vi", "pack-sr", "pack-sg"].map((pkg) => [
        `@determask/${pkg}`,
        fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url)),
      ]),
    ),
  },
  test: {
    // examples/ hold recipes users copy; each one is executed here.
    include: ["packages/*/test/**/*.test.ts", "examples/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      // types.ts holds only type declarations: no runtime code to cover.
      exclude: ["packages/*/src/types.ts"],
      reporter: ["text", "json-summary"],
      // Every line, branch and function we ship is exercised by a test.
      // Lowering this needs a reason in the PR, not a silent edit.
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
