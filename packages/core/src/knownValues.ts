/**
 * Known-values recognizer (D11): the patient's own record is the strongest
 * deterministic signal. Values are matched on the folded view — case,
 * diacritics (incl. đ→d) and whitespace runs ignored — and every
 * occurrence in the document is reported.
 *
 * The literature behind this: PhysioNet deid missed no patient names when
 * matching record values; see docs/ARCHITECTURE.md.
 *
 * M1 replaces the indexOf loop with a code-point Aho-Corasick automaton
 * (D6); the observable behaviour must not change.
 */
import { foldValue, hasWordBoundaries } from "./fold.js";
import type { KnownValues, Span, TextViews } from "./types.js";

export const KNOWN_VALUES_RECOGNIZER_ID = "core.known-values";

export function matchKnownValues(views: TextViews, knownValues: KnownValues): Span[] {
  const spans: Span[] = [];
  const { text: folded, starts, ends } = views.folded;

  for (const [entity, values] of Object.entries(knownValues)) {
    for (const value of values) {
      const needle = foldValue(value);
      if (needle.length === 0) continue;

      let from = 0;
      for (;;) {
        const at = folded.indexOf(needle, from);
        if (at === -1) break;
        from = at + 1;
        if (!hasWordBoundaries(folded, at, at + needle.length)) continue;

        const start = starts[at] as number;
        const end = ends[at + needle.length - 1] as number;
        spans.push({
          entity,
          start,
          end,
          score: 1,
          recognizer: KNOWN_VALUES_RECOGNIZER_ID,
          trace: [{ rule: "known-value", detail: `folded match for ${entity}` }],
        });
      }
    }
  }
  return spans;
}
