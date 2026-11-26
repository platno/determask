/**
 * Document-wide propagation of detected values (D11). The engine calls
 * `propagate` on the findings that passed their thresholds.
 */
import { foldValue } from "./fold.js";
import { findValues } from "./knownValues.js";
import type { Span, TextViews } from "./types.js";

export const PROPAGATION_RECOGNIZER_ID = "core.propagation";

/** The shortest value (folded) that is copied across a document. */
const MIN_PROPAGATED_LENGTH = 3;

/** Did something beyond the bare pattern vouch for this finding? */
const vouched = (span: Span): boolean => span.trace.some((step) => step.rule === "validator" || step.rule === "context");

/** Does some finding of `entity` overlap [start, end)? O(log n) per query. */
function coverageIndex(findings: readonly Span[]): (entity: string, start: number, end: number) => boolean {
  const byEntity = new Map<string, { starts: number[]; maxEnd: number[] }>();
  const sorted = [...findings].sort((a, b) => a.start - b.start);
  for (const f of sorted) {
    let e = byEntity.get(f.entity);
    if (e === undefined) byEntity.set(f.entity, (e = { starts: [], maxEnd: [] }));
    e.maxEnd.push(Math.max(f.end, e.maxEnd.at(-1) ?? 0));
    e.starts.push(f.start);
  }
  return (entity, start, end) => {
    const e = byEntity.get(entity) as { starts: number[]; maxEnd: number[] };
    // The last finding that starts before `end`; every earlier one starts before it too.
    let lo = 0;
    let hi = e.starts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((e.starts[mid] as number) < end) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 && (e.maxEnd[lo - 1] as number) > start;
  };
}

/**
 * D11, second half: a value detected once is masked everywhere in the
 * document — the mention without its "CMND" label, the regrouped number.
 *
 * Guarded, because a wrong finding copied everywhere does real damage
 * (llm-pii-proxy #28: a word read as a name corrupted every later mention).
 * A finding propagates only when something beyond its bare shape vouched
 * for it — a validator, or a context word — and never when it folds to
 * fewer than 3 characters. Known values are already document-wide; their
 * trace step is "known-value", so they never count as vouched.
 * Matching reuses the known-values matcher, so case, accents, script and
 * number grouping are folded the same way, and all values are found in one
 * pass over the text.
 */
export function propagate(views: TextViews, findings: readonly Span[]): Span[] {
  const sources: Span[] = [];
  const done = new Set<string>();
  for (const span of findings) {
    if (!vouched(span)) continue;
    const folded = foldValue(views.original.slice(span.start, span.end));
    if (folded.length < MIN_PROPAGATED_LENGTH) continue;
    const key = `${span.entity}\u0000${folded}`;
    if (done.has(key)) continue;
    done.add(key);
    sources.push(span);
  }
  const covered = coverageIndex(findings);
  const out: Span[] = [];
  for (const match of findValues(
    views,
    sources.map((s) => views.original.slice(s.start, s.end)),
  )) {
    const source = sources[match.index] as Span;
    // A mention some finding of the same entity already covers needs no copy
    // (e.g. the "+84 912…" phone and its digits without the "+").
    if (covered(source.entity, match.start, match.end)) continue;
    out.push({
      entity: source.entity,
      start: match.start,
      end: match.end,
      score: source.score,
      recognizer: PROPAGATION_RECOGNIZER_ID,
      trace: [{ rule: "propagation", detail: `from ${source.recognizer}` }],
      ...(source.attrs !== undefined ? { attrs: source.attrs } : {}),
    });
  }
  return out;
}
