/** Shared path helpers. */

/** Normalizes Windows separators so glob-style matching is consistent. */
export function normalizeSeparators(path: string): string {
  return path.replaceAll('\\', '/')
}

/**
 * True for test-fixture paths (`tests/`, `tests-css/` and their nested forms),
 * which oxfmt/oxlint ignore and the gates must not format or lint.
 */
export function isTestPath(path: string): boolean {
  const normalized = normalizeSeparators(path)
  return /(^|\/)tests\//.test(normalized) || /(^|\/)tests-[^/]+\//.test(normalized)
}

/** True for files the format gate covers (mirrors the bash `case` filter). */
export function isFormatTarget(path: string): boolean {
  return !isTestPath(path) && !normalizeSeparators(path).endsWith('.sh')
}

/** True for JavaScript/TypeScript files the lint gate covers. */
export function isLintTarget(path: string): boolean {
  return /\.(ts|js|mts|mjs|tsx|jsx)$/.test(path)
}
