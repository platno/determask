/**
 * Streaming restore: an LLM or MT response arrives in chunks, and a
 * placeholder can be split across them ("⟦PERS" + "ON_1⟧"). The restorer
 * releases text as soon as it is safe and holds back a trailing fragment
 * that could still grow into a placeholder.
 *
 * The guarantees are restore()'s, chunk by chunk: the concatenated output
 * equals `engine.restore(wholeText, map, options)` for any chunking, and in
 * strict mode (the default) a placeholder-shaped token not in the map
 * throws as soon as it is complete. A stream that ends inside a fragment
 * throws too, rather than flushing a half placeholder as text.
 *
 * Not caught here: placeholders the model altered ("⟦ PERSON_1 ⟧",
 * "[PERSON_1]"). They are not placeholder-shaped, so they pass through as
 * text; the post-LLM validator (M3) is what reports them.
 */
import { RestoreError } from "./errors.js";
import type { Engine, RestoreOptions } from "./types.js";

/** The longest fragment held back, unless the map holds a longer placeholder. */
export const STREAM_HOLD_LIMIT = 256;

/** A fragment that could still become `⟦ENTITY_n⟧` (an entity id starts with a letter). */
const PARTIAL = /^⟦(?:[A-Z][A-Z0-9_]*)?$/u;

export interface StreamRestorer {
  /** The restored text that is safe to emit now; may be "". */
  push(chunk: string): string;
  /** The rest, at end of stream. Strict: throws if a placeholder was left open. */
  end(): string;
}

export function createStreamRestorer(
  engine: Engine,
  map: Record<string, string>,
  options: RestoreOptions = {},
): StreamRestorer {
  const strict = options.strict ?? true;
  const limit = Object.keys(map).reduce((n, token) => Math.max(n, token.length), STREAM_HOLD_LIMIT);
  let held = "";
  let ended = false;
  const release = (text: string): string => (text === "" ? "" : engine.restore(text, map, options));

  return {
    push(chunk) {
      if (ended) throw new RestoreError("push() after end()");
      const text = held + chunk;
      const at = text.lastIndexOf("⟦");
      if (at !== -1 && text.length - at < limit && PARTIAL.test(text.slice(at))) {
        held = text.slice(at);
        return release(text.slice(0, at));
      }
      held = "";
      return release(text);
    },
    end() {
      if (ended) return "";
      ended = true;
      const rest = held;
      held = "";
      if (rest !== "" && strict) {
        throw new RestoreError(`stream ended inside a placeholder: ${JSON.stringify(rest)}`);
      }
      return rest;
    },
  };
}
