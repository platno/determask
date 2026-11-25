import { createEngine } from "@determask/core";
import { describe, expect, it } from "vitest";
import { viPack } from "../src/index.js";

describe("@determask/pack-vi — pack contract", () => {
  it("is identified by its package name", () => {
    expect(viPack.id).toBe("pack-vi");
  });

  it("declares exactly the locales it serves", () => {
    expect(viPack.locales).toEqual(["vi-VN"]);
  });

  it("declares only canonical BCP 47 locale tags (or * for locale-independent)", () => {
    for (const locale of viPack.locales) {
      if (locale === "*") continue;
      expect(Intl.getCanonicalLocales(locale)).toEqual([locale]);
    }
  });

  it("loads into the engine — which checks every recognizer's contract at load", () => {
    const engine = createEngine({ configVersion: 1 }, { packs: [viPack] });
    expect(engine.analyze("Nothing to find here, 0912345678.").findings).toEqual([]);
  });

  it("ships no recognizers yet — update this test in the PR that adds the first one", () => {
    expect(viPack.recognizers).toHaveLength(0);
  });

});
