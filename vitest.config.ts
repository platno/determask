import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Tests exercise the TypeScript source, so coverage maps to real lines.
    alias: {
      "@determask/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
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
