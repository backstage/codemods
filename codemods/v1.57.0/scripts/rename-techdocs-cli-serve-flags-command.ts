// Shell is not a JSSG language. Only literal command words in a bounded shell segment
// are eligible; substitutions, concatenated words and aliases are deliberately skipped.
const delimiters = ';|&()<>'

interface CommandWord {
  value: string
  start: number
  end: number
  raw: string
  safe: boolean
}
interface CommandSegment {
  words: CommandWord[]
  unsafe: boolean
}

function wordsInSegment(source: string): CommandSegment[] {
  const segments: CommandSegment[] = []
  let words: CommandWord[] = []
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
    // Dynamic arguments do not invalidate literal command and flag tokens.
    if (quote) {
      unsafe = true
    }
  }
  flush()
  return segments
}

export function rewriteCommand(source: string, original = source): string {
  // The optional original has the same length, but preserves YAML folded newlines.
  // Here-documents can contain command-looking prose; leave the whole input unchanged.
  if (/(?:^|\n)[^\n]*<<-?\s*['"]?\w+/.test(source)) {
    return original
  }
  const edits: { start: number; end: number; replacement: string }[] = []
  let shadowedByAlias = false
  for (const { words, unsafe } of wordsInSegment(source)) {
    if (words[0]?.value === 'alias' && words.slice(1).some((word) => word.value.startsWith('techdocs-cli='))) {
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
      if (runner === 'npx' && ['-y', '--yes'].includes(words[index]?.value ?? '')) {
        index++
      }
      if (
        (['yarn', 'pnpm', 'npm'].includes(runner ?? '') && words[index]?.value === 'exec') ||
        (['yarn', 'pnpm'].includes(runner ?? '') && words[index]?.value === 'dlx')
      ) {
        index++
        if (runner === 'npm' && words[index]?.value === '--') {
          index++
        }
      }
      // npm requires `exec`; `npm techdocs-cli` is not an executable call.
      if (runner === 'npm' && !npmExec) {
        continue
      }
    }
    const executable = words[index]?.value
    if (
      !['techdocs-cli', '@techdocs/cli', './node_modules/.bin/techdocs-cli', 'node_modules/.bin/techdocs-cli'].includes(
        executable ?? '',
      ) &&
      !/^@techdocs\/cli@[^\s]+$/.test(executable ?? '')
    ) {
      continue
    }
    if (shadowedByAlias && executable === 'techdocs-cli' && runner === executable) {
      continue
    }
    if (words[index + 1]?.value !== 'serve' || !words.slice(index, index + 2).every((word) => word.safe)) {
      continue
    }
    for (const token of words.slice(index + 2)) {
      // A literal flag prefix is safe even if its value contains shell variables.
      const replacement = token.raw
        .replace(/^(['"]?)--mkdocs-port(?==|['"]?$)/, '$1--engine-port')
        .replace(/^(['"]?)--mkdocs-config-file-name(?==|['"]?$)/, '$1--config-file-name')
        .replace(/^(['"]?)--mkdocs-parameter-/, '$1--parameter-')
      if (replacement !== token.raw) {
        edits.push({ start: token.start, end: token.end, replacement })
      }
    }
  }
  for (const edit of edits.reverse()) {
    original = original.slice(0, edit.start) + edit.replacement + original.slice(edit.end)
  }
  return original
}
