export { createEngine } from "./engine.js";
export { foldText, foldValue, hasWordBoundaries } from "./fold.js";
export { matchKnownValues, KNOWN_VALUES_RECOGNIZER_ID } from "./knownValues.js";
export { ConfigError, RestoreError, WithheldError } from "./errors.js";
export type {
  AnalyzeContext,
  AnalyzeOptions,
  AnalyzeResult,
  AnonymizeOptions,
  AnonymizeResult,
  Engine,
  EngineConfig,
  EngineOptions,
  FoldedView,
  KnownValues,
  Pack,
  Recognizer,
  RestoreOptions,
  RuleStep,
  Span,
  TextViews,
} from "./types.js";
