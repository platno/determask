export { createEngine, DEFAULT_THRESHOLD } from "./engine.js";
export {
  patternRecognizer,
  DEFAULT_CONTEXT_BOOST,
  DEFAULT_WINDOW,
  type PatternDef,
  type PatternRecognizerSpec,
  type ValidatorResult,
} from "./pattern.js";
export { checkExamples, parseMarkedExample, type ExampleCheckOptions } from "./examples.js";
export { foldText, foldValue, hasWordBoundaries } from "./fold.js";
export { matchKnownValues, KNOWN_VALUES_RECOGNIZER_ID } from "./knownValues.js";
export { ConfigError, RestoreError, WithheldError } from "./errors.js";
export { createStreamRestorer, STREAM_HOLD_LIMIT, type StreamRestorer } from "./stream.js";
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
  PatternInfo,
  Recognizer,
  RecognizerExamples,
  RestoreOptions,
  RuleStep,
  Span,
  TextViews,
} from "./types.js";
