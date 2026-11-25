/** Thrown when the config is invalid. Loading fails, nothing runs (F13/F14). */
export class ConfigError extends Error {
  override name = "ConfigError";
}

/**
 * Thrown when text cannot be masked safely (D14). The caller must treat
 * this as "do not emit the text", never as "emit it unmasked".
 */
export class WithheldError extends Error {
  override name = "WithheldError";
}

/**
 * Thrown by strict restore when a placeholder-shaped token is not in the
 * map (D18): restoring a best guess is never allowed.
 */
export class RestoreError extends Error {
  override name = "RestoreError";
}
