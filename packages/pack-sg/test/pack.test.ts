import { createEngine } from "@determask/core";
import { describe, expect, it } from "vitest";
import { sgPack } from "../src/index.js";

describe("@determask/pack-sg — pack contract", () => {
  it("is identified by its package name", () => {
    expect(sgPack.id).toBe("pack-sg");
  });

  it("declares exactly the locales it serves", () => {
    expect(sgPack.locales).toEqual(["en-SG"]);
  });

  it("declares only canonical BCP 47 locale tags (or * for locale-independent)", () => {
    for (const locale of sgPack.locales) {
      if (locale === "*") continue;
      expect(Intl.getCanonicalLocales(locale)).toEqual([locale]);
    }
  });

  it("loads into the engine — which checks every recognizer's contract at load", () => {
    const engine = createEngine({ configVersion: 1 }, { packs: [sgPack] });
    expect(engine.analyze("Nothing to find here, 0912345678.").findings).toEqual([]);
  });

  it("ships no recognizers yet — update this test in the PR that adds the first one", () => {
    expect(sgPack.recognizers).toHaveLength(0);
  });

});
