import type { Codemod } from 'codemod:ast-grep'
import type JSON from 'codemod:ast-grep/langs/json'
import { useMetricAtom } from 'codemod:metrics'

const metric = useMetricAtom('update-react-peer-dependency-ranges')
const names = new Set(['react', 'react-dom', '@types/react'])

const transform: Codemod<JSON> = (root) => {
  const document = root.root()
  const source = document.text()
  // Includes 16/17 as well as all lower majors, including v-prefixed forms.
  if (!source.includes('peerDependencies') || !source.includes('||') || !/(?:1[0-7]|[0-9])(?:\D|$)/.test(source)) {
    return Promise.resolve(null)
  }
  try {
    globalThis.JSON.parse(source)
  } catch {
    return Promise.resolve(null)
  }
  const top = document.find({ rule: { kind: 'object' } })
  const peers = top
    ?.children()
    .find(
      (node) =>
        node.kind() === 'pair' && globalThis.JSON.parse(node.field('key')?.text() ?? 'null') === 'peerDependencies',
    )
    ?.field('value')
  if (peers?.kind() !== 'object') {
    return Promise.resolve(null)
  }

  const edits = []
  for (const pair of peers.children()) {
    if (pair.kind() !== 'pair' || !names.has(globalThis.JSON.parse(pair.field('key')?.text() ?? 'null') as string)) {
      continue
    }
    const value = pair.field('value')
    if (value?.kind() !== 'string') {
      continue
    }
    const raw = value.text().slice(1, -1)
    // Do not change escape spelling or guess the meaning of escaped separators.
    if (raw.includes('\\')) {
      continue
    }
    const parts = raw.split('||')
    if (parts.length < 2) {
      continue
    }
    const major = (part: string): number | undefined => {
      const match = part.trim().match(/^(?:[=^~]\s*)?v?(\d+)(?:\.(?:\d+|x|\*)){0,2}(?:-[\w.-]+)?$/i)
      return match ? Number(match[1]) : undefined
    }
    const retained = parts.filter((part) => {
      const version = major(part)
      return version === undefined || version >= 18
    })
    const hasSupported = retained.some((part) => {
      const version = major(part)
      return (
        (version !== undefined && version >= 18) ||
        /^(?:\*|x|>=\s*v?\d+(?:\.(?:\d+|x|\*)){0,2}(?:-[\w.-]+)?)$/i.test(part.trim())
      )
    })
    if (retained.length === parts.length || !hasSupported) {
      continue
    }
    edits.push(value.replace(`"${retained.join('||').trim()}"`))
    metric.increment({ action: 'range-updated' })
  }
  return Promise.resolve(edits.length ? document.commitEdits(edits) : null)
}

export default transform
