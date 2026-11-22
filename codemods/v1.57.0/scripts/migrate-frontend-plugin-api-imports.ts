import { listImports } from '@jssg/utils/javascript/imports'
import { getFileStyle, getLineIndent } from '@jssg/utils/javascript/style'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

import { utf16IndexAtByte } from './replace-removed-frontend-plugin-api-types-common.ts'

const MAIN = '@backstage/frontend-plugin-api'
const ALPHA = `${MAIN}/alpha`
const APP = '@backstage/frontend-app-api'
const REACT = '@backstage/plugin-app-react'
const ANALYTICS = new Set([
  'AnalyticsImplementation',
  'AnalyticsImplementationBlueprint',
  'AnalyticsImplementationFactory',
])
const metric = useMetricAtom('migrate-frontend-plugin-api-imports')

type Node = SgNode<TSX>
interface ImportState {
  node: Node
  source: string
  typeOnly: boolean
  named: Node | null
  specifiers: { name: string; text: string }[]
  defaultName: string | null
  changed: boolean
  namedChanged: boolean
  keepMain: boolean
}
interface NewImport {
  source: string
  typeOnly: boolean
  specifiers: string[]
  origin: Node | null
}

function destination(source: string, name: string): string {
  if ((source === MAIN || source === ALPHA) && name === 'ExtensionFactoryMiddleware') {
    return APP
  }
  if ((source === MAIN || source === ALPHA) && ANALYTICS.has(name)) {
    return REACT
  }
  return source === ALPHA ? MAIN : source
}

function namedList(named: Node, specs: string[], source: string, indentUnit: string): string {
  const comments = named
    .children()
    .filter((child) => child.is('comment'))
    .map((child) => child.text())
  const multiline = named.text().includes('\n') || comments.length > 0
  if (!multiline) {
    return `{ ${specs.join(', ')} }`
  }
  const sample = named.children().find((child) => child.is('import_specifier') || child.is('export_specifier'))
  const indent = sample ? getLineIndent(source, sample) : getLineIndent(source, named) + indentUnit
  const closingIndent = getLineIndent(source, named)
  const pending = [...specs]
  const items: string[] = []
  for (const child of named.children()) {
    if (child.is('comment')) {
      items.push(child.text())
    } else if (child.is('import_specifier') || child.is('export_specifier')) {
      const index = pending.indexOf(child.text())
      if (index >= 0) {
        items.push(`${pending[index]},`)
        pending.splice(index, 1)
      }
    }
  }
  items.push(...pending.map((spec) => `${spec},`))
  return `{\n${items.map((item) => `${indent}${item}`).join('\n')}\n${closingIndent}}`
}

function commentsBefore(named: Node, source: string): string {
  const indent = getLineIndent(source, named)
  return named
    .children()
    .filter((child) => child.is('comment'))
    .map((child) => `${indent}${child.text()}\n`)
    .join('')
}

function renderImport(state: ImportState, source: string, indentUnit: string): string {
  let text = state.node.text()
  const changes: { start: number; end: number; text: string }[] = []
  const base = state.node.range().start.index
  const sourceNode = state.node.field('source')
  if (state.source === ALPHA && sourceNode) {
    const quote = sourceNode.text()[0] ?? "'"
    changes.push({
      start: utf16IndexAtByte(text, sourceNode.range().start.index - base),
      end: utf16IndexAtByte(text, sourceNode.range().end.index - base),
      text: `${quote}${MAIN}${quote}`,
    })
  }
  let leading = ''
  if (state.named && state.namedChanged) {
    if (state.specifiers.length) {
      changes.push({
        start: utf16IndexAtByte(text, state.named.range().start.index - base),
        end: utf16IndexAtByte(text, state.named.range().end.index - base),
        text: namedList(
          state.named,
          state.specifiers.map((spec) => spec.text),
          source,
          indentUnit,
        ),
      })
    } else {
      leading = commentsBefore(state.named, source)
      if (!state.defaultName) {
        return leading.trimEnd()
      }
      // Remove the comma introducing the now-empty named clause, retaining the default import.
      const start = utf16IndexAtByte(text, state.named.range().start.index - base)
      const end = utf16IndexAtByte(text, state.named.range().end.index - base)
      const comma = text.lastIndexOf(',', start)
      changes.push({ start: comma >= 0 ? comma : start, end, text: '' })
    }
  }
  for (const change of changes.sort((a, b) => b.start - a.start)) {
    text = text.slice(0, change.start) + change.text + text.slice(change.end)
  }
  return leading + text
}

function renderNewImport(
  item: NewImport,
  source: string,
  quote: string,
  semicolon: string,
  indentUnit: string,
): string {
  const type = item.typeOnly ? 'type ' : ''
  const sample = item.origin?.children().find((child) => child.is('import_specifier'))
  const indent = sample ? getLineIndent(source, sample) || indentUnit : indentUnit
  const clause = item.origin?.text().includes('\n')
    ? `{\n${item.specifiers.map((spec) => `${indent}${spec},`).join('\n')}\n}`
    : `{ ${item.specifiers.join(', ')} }`
  return `import ${type}${clause} from ${quote}${item.source}${quote}${semicolon}`
}

function transformExport(node: Node, source: string, indentUnit: string): string | null {
  const sourceNode = node.field('source')
  const moduleName = sourceNode?.text().slice(1, -1)
  if (!sourceNode || (moduleName !== MAIN && moduleName !== ALPHA)) {
    return null
  }
  const clause = node.find({ rule: { kind: 'export_clause' } })
  if (!clause) {
    return null
  }
  if (clause.children().every((child) => !child.is('export_specifier'))) {
    if (moduleName !== ALPHA) {
      return null
    }
    metric.increment({ action: 'source-rewritten', kind: 'export' })
    const base = node.range().start.index
    const text = node.text()
    const offset = utf16IndexAtByte(text, sourceNode.range().start.index - base)
    const end = utf16IndexAtByte(text, sourceNode.range().end.index - base)
    return text.slice(0, offset) + sourceNode.text()[0] + MAIN + sourceNode.text()[0] + text.slice(end)
  }
  const specs = clause.children().filter((child) => child.is('export_specifier'))
  const groups = new Map<string, string[]>()
  for (const spec of specs) {
    const name = spec.field('name').text()
    if (!name) {
      continue
    }
    const target = destination(moduleName, name)
    const group = groups.get(target) ?? []
    group.push(spec.text())
    groups.set(target, group)
    if (target !== moduleName) {
      metric.increment({ action: 'export-moved', name })
    }
  }
  if ([...groups.keys()].every((target) => target === moduleName)) {
    return null
  }
  const quote = sourceNode.text()[0] ?? "'"
  const semicolon = node.text().trimEnd().endsWith(';') ? ';' : ''
  const type = /^export\s+type\b/.test(node.text()) ? 'type ' : ''
  let first = true
  const output: string[] = []
  for (const [target, group] of groups) {
    const list = first ? namedList(clause, group, source, indentUnit) : `{ ${group.join(', ')} }`
    output.push(`export ${type}${list} from ${quote}${target}${quote}${semicolon}`)
    first = false
  }
  return output.join('\n')
}

const transform: Codemod<TSX> = async (root) => {
  const program = root.root()
  const source = program.text()
  if (
    !source.includes(MAIN) ||
    (!source.includes(ALPHA) &&
      !source.includes('ExtensionFactoryMiddleware') &&
      !source.includes('AnalyticsImplementation'))
  ) {
    return null
  }
  const style = getFileStyle(program)
  const states: ImportState[] = listImports(program, { from: [ALPHA, MAIN, APP, REACT] })
    .filter((item) => item.moduleType === 'esm' && item.node.is('import_statement'))
    .map((item) => ({
      node: item.node,
      source: item.source,
      typeOnly: item.isTypeOnly,
      named: item.node.find({ rule: { kind: 'named_imports' } }),
      specifiers: item.specifiers.map((spec) => ({ name: spec.importedName, text: spec.node.text() })),
      defaultName: item.defaultName,
      changed: item.source === ALPHA,
      namedChanged: false,
      keepMain: false,
    }))
  for (const typeOnly of [false, true]) {
    if (states.some((state) => state.source === MAIN && state.typeOnly === typeOnly && state.named)) {
      continue
    }
    const first = states.find(
      (state) =>
        state.source === ALPHA &&
        state.typeOnly === typeOnly &&
        state.named &&
        state.specifiers.some((spec) => destination(ALPHA, spec.name) === MAIN),
    )
    if (first) {
      first.keepMain = true
    }
  }
  const moved: { source: string; typeOnly: boolean; name: string; text: string; origin: Node | null }[] = []
  for (const state of states) {
    if (state.source === ALPHA && (state.specifiers.length === 0 || state.keepMain)) {
      metric.increment({ action: 'source-rewritten', kind: 'import' })
    }
    const remaining = []
    for (const spec of state.specifiers) {
      const target = destination(state.source, spec.name)
      if (target === state.source || (target === MAIN && state.keepMain)) {
        remaining.push(spec)
      } else {
        state.changed = true
        state.namedChanged = true
        moved.push({ source: target, typeOnly: state.typeOnly, origin: state.named, ...spec })
        metric.increment({ action: 'import-moved', name: spec.name })
      }
    }
    state.specifiers = remaining
  }
  const newImports: NewImport[] = []
  for (const spec of moved) {
    const target = states.find(
      (state) =>
        (state.source === spec.source || (state.keepMain && spec.source === MAIN)) &&
        state.typeOnly === spec.typeOnly &&
        state.named,
    )
    if (target) {
      if (!target.specifiers.some((existing) => existing.text === spec.text)) {
        target.specifiers.push({ name: spec.name, text: spec.text })
        target.changed = true
        target.namedChanged = true
      }
    } else {
      let group = newImports.find((item) => item.source === spec.source && item.typeOnly === spec.typeOnly)
      if (!group) {
        group = { source: spec.source, typeOnly: spec.typeOnly, specifiers: [], origin: spec.origin }
        newImports.push(group)
      }
      if (!group.specifiers.includes(spec.text)) {
        group.specifiers.push(spec.text)
      }
      if (spec.origin?.text().includes('\n') && !group.origin?.text().includes('\n')) {
        group.origin = spec.origin
      }
    }
  }
  const edits: Edit[] = []
  for (const state of states) {
    if (!state.changed) {
      continue
    }
    let replacement = renderImport(state, source, style.indentUnit)
    const newForState = newImports.filter((item) =>
      item.origin?.ancestors().some((ancestor) => ancestor.id() === state.node.id()),
    )
    if (newForState.length) {
      const additions = newForState
        .map((item) => renderNewImport(item, source, style.quote, style.semicolon, style.indentUnit))
        .join('\n')
      replacement = replacement ? `${replacement}\n${additions}` : additions
    }
    if (replacement) {
      edits.push(state.node.replace(replacement))
    } else {
      let end = state.node.range().end.index
      const endChar = utf16IndexAtByte(source, end)
      if (source.slice(endChar, endChar + 2) === '\r\n') {
        end += 2
      } else if (source[endChar] === '\n') {
        end += 1
      }
      edits.push({ startPos: state.node.range().start.index, endPos: end, insertedText: '' })
    }
  }
  for (const node of program.findAll({ rule: { kind: 'export_statement' } })) {
    const sourceNode = node.field('source')
    if (sourceNode?.text().slice(1, -1) === ALPHA && !node.children().some((child) => child.is('export_clause'))) {
      if (node.children().some((child) => child.is('namespace_export'))) {
        const quote = sourceNode.text()[0] ?? "'"
        edits.push(sourceNode.replace(`${quote}${MAIN}${quote}`))
        metric.increment({ action: 'source-rewritten', kind: 'export' })
      }
      continue
    }
    const replacement = transformExport(node, source, style.indentUnit)
    if (replacement !== null) {
      edits.push(node.replace(replacement))
    }
  }
  return Promise.resolve(edits.length ? program.commitEdits(edits) : null)
}

export default transform
