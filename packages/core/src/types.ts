/**
 * Public types. Offsets are always UTF-16 code units of the ORIGINAL
 * string (D3). Detection runs on folded views that carry offset maps.
 */

/** One step in the trace explaining how a span got its score (D2). */
export interface RuleStep {
  rule: string;
  detail?: string;
  scoreBefore?: number;
  scoreAfter?: number;
}

/** A detected (or caller-supplied) entity occurrence. */
export interface Span {
  entity: string;
  /** UTF-16 offset into the original string, inclusive. */
  start: number;
  /** UTF-16 offset into the original string, exclusive. */
  end: number;
  /** Confidence in [0, 1]. Caller-supplied spans may use 1. */
  score: number;
  /** Id of the recognizer that produced this span. */
  recognizer: string;
  trace: RuleStep[];
  /** Subtype/role attributes, e.g. { role: "patient" } (D15/catalogue). */
  attrs?: Record<string, string>;
}

/**
 * Known values from the record (D11): the strongest deterministic signal.
 * Keys are entity type ids, values the literal strings from the record.
 * Matching folds case, diacritics (incl. đ→d) and whitespace runs.
 */
export type KnownValues = Record<string, readonly string[]>;

/** A folded, offset-mapped view of the original text (D3/D4). */
export interface FoldedView {
  /** The folded text that matching runs on. */
  text: string;
  /** starts[i] = original UTF-16 index of the code point behind folded unit i. */
  starts: readonly number[];
  /** ends[i] = original UTF-16 index just past that code point. */
  ends: readonly number[];
}

export interface TextViews {
  original: string;
  folded: FoldedView;
}

export interface AnalyzeContext {
  locale: string;
  knownValues?: KnownValues;
  /** Stable id used for document-scoped consistency. */
  documentId?: string;
}

/** The open recognizer interface (D2): packs plug in without touching core. */
export interface Recognizer {
  id: string;
  entities: string[];
  /** Locale tags this recognizer serves; "*" means locale-independent. */
  locales: string[];
  analyze(views: TextViews, ctx: AnalyzeContext): Span[];
}

/** A locale pack: recognizers plus pack metadata (D15). */
export interface Pack {
  id: string;
  locales: string[];
  recognizers: Recognizer[];
}

export interface AnalyzeOptions {
  locale?: string;
  knownValues?: KnownValues;
  documentId?: string;
}

export interface AnalyzeResult {
  findings: Span[];
}

export interface AnonymizeOptions {
  /** Consistency scope for placeholder numbering. Only "document" so far. */
  scope?: "document";
}

export interface AnonymizeResult {
  text: string;
  /** placeholder token -> original value. Never leaves the trust boundary. */
  map: Record<string, string>;
  report: {
    /** Spans masked per entity type. No text is included (D17). */
    counts: Record<string, number>;
  };
}

export interface RestoreOptions {
  /** strict (default): any placeholder-shaped token not in the map throws. */
  strict?: boolean;
}

/** Engine configuration. The schema rejects unknown keys (D20/F13). */
export interface EngineConfig {
  configVersion: 1;
  name?: string;
  locales?: { primary: string; also?: string[] };
  /** What to do when masking cannot be completed safely (D14). */
  onError?: "withhold";
}

export interface Engine {
  analyze(text: string, options?: AnalyzeOptions): AnalyzeResult;
  anonymize(text: string, findings: readonly Span[], options?: AnonymizeOptions): AnonymizeResult;
  restore(text: string, map: Record<string, string>, options?: RestoreOptions): string;
}
