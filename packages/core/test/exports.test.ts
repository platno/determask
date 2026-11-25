import { describe, expect, it } from "vitest";
import * as core from "../src/index.js";

describe("public API surface", () => {
  it("exports exactly the documented runtime values", () => {
    expect(Object.keys(core).sort()).toEqual(
      [
        "ConfigError",
        "KNOWN_VALUES_RECOGNIZER_ID",
        "RestoreError",
        "WithheldError",
        "createEngine",
        "foldText",
        "foldValue",
        "hasWordBoundaries",
        "matchKnownValues",
      ].sort(),
    );
  });

  it("names each error class, so callers can tell them apart after serialisation", () => {
    for (const [Err, name] of [
      [core.ConfigError, "ConfigError"],
      [core.WithheldError, "WithheldError"],
      [core.RestoreError, "RestoreError"],
    ] as const) {
      const e = new Err("x");
      expect(e).toBeInstanceOf(Error);
      expect(e.name).toBe(name);
      expect(e.message).toBe("x");
    }
  });
});
