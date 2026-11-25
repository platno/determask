# Security policy

## What counts as a vulnerability here

Beyond the usual (dependency CVEs, crypto misuse), this project treats the
following as security vulnerabilities, because the library's job is to keep
PII from leaving a boundary:

- **A leak**: input that should be masked under a documented config
  surviving into output, logs, error messages, or the MT request body.
- **A fail-open path**: any error condition that emits unmasked text
  instead of withholding it.
- **Placeholder injection**: crafted input that causes `restore()` to
  write attacker-chosen or wrong values.
- **ReDoS**: any built-in pattern with super-linear behaviour.
- **Vault weaknesses**: the sealed map being readable or malleable without
  the key.

## Reporting

Report privately via GitHub Security Advisories ("Report a vulnerability"
on the repository's Security tab). Please include a minimal reproducing
input — synthetic, never real patient data.

You can expect an acknowledgement within 7 days. Leaks and fail-open paths
are treated as the highest severity and fixed before any feature work.

## Supported versions

Pre-1.0: only the latest minor release receives fixes.
