// Shell is not a JSSG language. Only literal command words in a bounded shell segment
// are eligible; substitutions, concatenated words and aliases are deliberately skipped.
const delimiters = ';|&()<>'

/** @typedef {{value: string, start: number, end: number, raw: string, safe: boolean}} CommandWord */
/** @typedef {{words: CommandWord[], unsafe: boolean}} CommandSegment */

/** @param {string} source @returns {CommandSegment[]} */
function wordsInSegment(source) {
  /** @type {CommandSegment[]} */
  const segments = []
  /** @type {CommandWord[]} */
  let words = []
  let unsafe = false
  let parenDepth = 0
  let redirected = false
  let index = 0

  function flush() {
    if (words.length) {
      segments.push({ words, unsafe })
    }
    words = []
    unsafe = parenDepth > 0 || redirected
  }

  while (index < source.length) {
    const char = source.charAt(index)
    if (char === '\\' && source[index + 1] === '\n') {
      index += 2
      continue
    }
    if (char === '\n' || delimiters.includes(char)) {
      flush()
      if (char === '(') {
        parenDepth++
      }
      if (char === ')') {
        parenDepth = Math.max(0, parenDepth - 1)
      }
      if (char === '<' || char === '>') {
        redirected = true
      } else if (char === '\n' || char === ';' || char === '&' || char === '|') {
        redirected = false
      }
      unsafe = parenDepth > 0 || redirected
      index++
      continue
    }
    if (/\s/.test(char)) {
      index++
      continue
    }
    if (char === '#') {
      const end = source.indexOf('\n', index)
      index = end < 0 ? source.length : end
      continue
    }

    const start = index
    let value = ''
    let quote = ''
    let safe = true
    while (index < source.length) {
      const current = source.charAt(index)
      if (!quote && (current === '\n' || /\s/.test(current) || delimiters.includes(current))) {
        break
      }
      if (current === '\\') {
        safe = false
        if (source[index + 1] === '\n') {
          index += 2
          continue
        }
        value += source[index + 1] ?? ''
        index += 2
        continue
      }
      if (current === "'" || current === '"') {
        if (!quote) {
          quote = current
        } else if (quote === current) {
          quote = ''
        } else {
          value += current
        }
        index++
        continue
      }
      if (current === '$' || current === '`' || current === '\n') {
        safe = false
      }
      value += current
      index++
    }
    const raw = source.slice(start, index)
    // Only an unquoted word or one wholly quoted literal is a stable command token.
    const literal = raw === value || raw === `'${value}'` || raw === `"${value}"`
    words.push({ value, start, end: index, raw, safe: safe && !quote && literal })
    if (!safe || quote) {
      unsafe = true
    }
  }
  flush()
  return segments
}

/** @param {string} source @returns {string} */
export function rewriteCommand(source) {
  // Here-documents can contain command-looking prose; leave the whole input unchanged.
  if (/(?:^|\n)[^\n]*<<-?\s*['"]?\w+/.test(source)) {
    return source
  }
  /** @type {{start: number, end: number, replacement: string}[]} */
  const edits = []
  let shadowedByAlias = false
  for (const { words, unsafe } of wordsInSegment(source)) {
    if (words[0]?.value === 'alias' && words.slice(1).some((word) => word.value.startsWith('backstage-repo-tools='))) {
      shadowedByAlias = true
    }
    if (unsafe) {
      continue
    }
    let index = 0
    while (/^[A-Za-z_][A-Za-z_0-9]*=/.test(words[index]?.value ?? '')) {
      index++
    }
    if (words[index]?.value === 'env') {
      index++
      while (/^[A-Za-z_][A-Za-z_0-9]*=/.test(words[index]?.value ?? '')) {
        index++
      }
    }
    const runner = words[index]?.value
    const npmExec = runner === 'npm' && words[index + 1]?.value === 'exec'
    if (['yarn', 'pnpm', 'npm', 'npx', 'bunx'].includes(runner ?? '')) {
      index++
      if (['yarn', 'pnpm', 'npm'].includes(runner ?? '') && words[index]?.value === 'exec') {
        index++
        if (runner === 'npm' && words[index]?.value === '--') {
          index++
        }
      }
      // npm requires `exec`; `npm backstage-repo-tools` is not an executable call.
      if (runner === 'npm' && !npmExec) {
        continue
      }
    }
    const executable = words[index]?.value
    if (executable !== 'backstage-repo-tools' && executable !== './node_modules/.bin/backstage-repo-tools') {
      continue
    }
    if (shadowedByAlias && executable === 'backstage-repo-tools' && runner === executable) {
      continue
    }
    if (
      words[index + 1]?.value !== 'repo' ||
      words[index + 2]?.value !== 'schema' ||
      words[index + 3]?.value !== 'openapi' ||
      words[index + 4]?.value !== 'verify'
    ) {
      continue
    }
    const token = words[index + 4]
    if (!token || !words.slice(index, index + 5).every((word) => word.safe)) {
      continue
    }
    const replacement = token.raw === 'verify' ? 'validate' : `${token.raw.charAt(0)}validate${token.raw.charAt(0)}`
    edits.push({ start: token.start, end: token.end, replacement })
  }
  for (const edit of edits.reverse()) {
    source = source.slice(0, edit.start) + edit.replacement + source.slice(edit.end)
  }
  return source
}
