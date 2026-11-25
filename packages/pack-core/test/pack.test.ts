import { createEngine } from "@determask/core";
import { describe, expect, it } from "vitest";
import { corePack } from "../src/index.js";

describe("@determask/pack-core — pack contract", () => {
  it("is identified by its package name", () => {
    expect(corePack.id).toBe("pack-core");
  });

  it("declares exactly the locales it serves", () => {
    expect(corePack.locales).toEqual(["*"]);
  });

  it("declares only canonical BCP 47 locale tags (or * for locale-independent)", () => {
    for (const locale of corePack.locales) {
      if (locale === "*") continue;
      expect(Intl.getCanonicalLocales(locale)).toEqual([locale]);
    }
  });

  it("loads into the engine — which checks every recognizer's contract at load", () => {
    const engine = createEngine({ configVersion: 1 }, { packs: [corePack] });
    expect(engine.analyze("Nothing to find here, 0912345678.").findings).toEqual([]);
  });

  it("ships no recognizers yet — update this test in the PR that adds the first one", () => {
    expect(corePack.recognizers).toHaveLength(0);
  });

});
