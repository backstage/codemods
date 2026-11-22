import { importBindingOf } from '@jssg/utils/javascript/bindings'
import { updateImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

import {
  blueprintParams,
  functionFor,
  linePrefix,
  property,
  removeListItem,
  todoCollector,
  value,
} from './migrate-router-blueprint-to-app-root-wrapper-helpers.ts'

const metric = useMetricAtom('migrate-router-blueprint-to-app-root-wrapper')
const ONLY_BROWSER =
  'TODO(backstage-codemod): this router override only installed BrowserRouter. The app owns history since 1.57 — delete this extension and its registration.'
const OTHER_ROUTER =
  "TODO(backstage-codemod): render this routing library's page router inside lazily loaded page components instead (see page routers guide)."
const LEGACY =
  'TODO(backstage-codemod): components.Router is no longer supported. Move global providers to AppRootWrapperBlueprint.'
const ATTACH =
  'TODO(backstage-codemod): app/root no longer has a router input since 1.57. Remove this extension or move its providers to AppRootWrapperBlueprint.'
const OPAQUE =
  'TODO(backstage-codemod): check that this component no longer renders a router — the app owns history since 1.57.'
const BROWSER_PROPS =
  'TODO(backstage-codemod): BrowserRouter was kept because it has props (e.g. basename). The app owns history since 1.57 — remove it and configure the base path via app.baseUrl.'
type Node = SgNode<TSX>

function binding(node: Node | null, name: string, sources: string[]): boolean {
  if (!node?.is('identifier')) {
    return false
  }
  const found = importBindingOf(node)
  return found?.importedName === name && sources.includes(found.source)
}

function objectArg(call: Node): Node | null {
  return (
    call
      .field('arguments')
      ?.children()
      .find((n) => n.is('object')) ?? null
  )
}

function opening(element: Node): Node | null {
  return element.is('jsx_element')
    ? (element.children().find((n) => n.is('jsx_opening_element')) ?? null)
    : element.is('jsx_self_closing_element')
      ? element
      : null
}

function browser(element: Node): boolean {
  return (
    element.is('jsx_element') &&
    binding(opening(element)?.child(1) ?? null, 'BrowserRouter', ['react-router', 'react-router-dom'])
  )
}

function otherRouter(element: Node): boolean {
  const name = opening(element)?.child(1)
  if (!name?.is('identifier')) {
    return false
  }
  const found = importBindingOf(name)
  return (
    !!found &&
    ((['react-router', 'react-router-dom'].includes(found.source) &&
      [
        'HashRouter',
        'MemoryRouter',
        'RouterProvider',
        'unstable_HistoryRouter',
        'HistoryRouter',
        'Router',
        'StaticRouter',
      ].includes(found.importedName)) ||
      (found.source.startsWith('@tanstack/') && found.importedName === 'RouterProvider'))
  )
}

function hasRouterProps(element: Node): boolean {
  const tag = opening(element)
  return (
    tag?.children().some((n) => (n.is('jsx_attribute') && n.child(0)?.text() !== 'key') || n.is('jsx_expression')) ??
    false
  )
}

function utf16Index(text: string, bytes: number): number {
  let offset = 0
  let count = 0
  for (const char of text) {
    if (count >= bytes) {
      break
    }
    const code = char.codePointAt(0) ?? 0
    count += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
    offset += char.length
  }
  return offset
}

function visibleChildren(element: Node): number {
  return element
    .children()
    .filter(
      (n) =>
        n.isNamed() &&
        !n.is('jsx_opening_element') &&
        !n.is('jsx_closing_element') &&
        !(n.is('jsx_text') && !n.text().trim()),
    )
    .reduce((count, n) => count + (browser(n) ? visibleChildren(n) : 1), 0)
}

/** Render the inner children, recursively removing any nested BrowserRouters. */
function unwrap(element: Node, browsers: Node[]): string {
  const open = opening(element)
  const close = element.children().find((n) => n.is('jsx_closing_element'))
  if (!open || !close) {
    return element.text()
  }
  const raw = element.text()
  const start = open.range().end.index - element.range().start.index
  const end = close.range().start.index - element.range().start.index
  let inner = raw.slice(utf16Index(raw, start), utf16Index(raw, end))
  const direct = browsers.filter(
    (n) =>
      n.id() !== element.id() &&
      n
        .ancestors()
        .find((a) => browsers.some((b) => b.id() === a.id()))
        ?.id() === element.id(),
  )
  for (const child of direct.sort((a, b) => b.range().start.index - a.range().start.index)) {
    const from = child.range().start.index - open.range().end.index
    const to = child.range().end.index - open.range().end.index
    inner = inner.slice(0, utf16Index(inner, from)) + unwrap(child, browsers) + inner.slice(utf16Index(inner, to))
  }
  const content = element
    .children()
    .filter(
      (n) =>
        n.isNamed() &&
        !n.is('jsx_opening_element') &&
        !n.is('jsx_closing_element') &&
        !(n.is('jsx_text') && !n.text().trim()),
    )
  if (content.length === 1 && content[0]?.is('jsx_expression') && !element.parent()?.is('jsx_element')) {
    const expression = content[0].children().find((n) => n.isNamed() && !n.is('comment'))
    if (expression) {
      return expression.text()
    }
  }
  if (element.parent()?.is('jsx_element')) {
    return inner
  }
  if (content.length === 1 && (content[0]?.is('jsx_element') || content[0]?.is('jsx_self_closing_element'))) {
    const single = inner.trim()
    if (direct.length === 1) {
      if (visibleChildren(direct[0] as Node) !== 1) {
        return `<>${inner}</>`
      }
      if (single.startsWith('{') && single.endsWith('}') && !single.slice(1).trimStart().startsWith('/*')) {
        return single.slice(1, -1)
      }
      if (!single.startsWith('<')) {
        return `<>${inner}</>`
      }
    }
    const [child] = content
    const source = element.getRoot().root().text()
    const outerIndent = linePrefix(source, element)
    const childIndent = linePrefix(source, child)
    if (
      !outerIndent.trim() &&
      !childIndent.trim() &&
      childIndent.startsWith(outerIndent) &&
      childIndent.length > outerIndent.length
    ) {
      return single
        .split('\n')
        .map((line, index) =>
          index > 0 && line.startsWith(childIndent) ? outerIndent + line.slice(childIndent.length) : line,
        )
        .join('\n')
    }
    return single
  }
  return `<>${inner}</>`
}

function returnsOnlyChildren(component: Node, browsers: Node[]): boolean {
  let body: Node | null = component.is('arrow_function')
    ? component.field('body')
    : component.is('function_expression')
      ? component.field('body')
      : component.is('function_declaration')
        ? component.field('body')
        : null
  if (body?.is('statement_block')) {
    const statements = body.children().filter((n) => n.isNamed() && !n.is('comment'))
    body =
      statements.length === 1 && statements[0]?.is('return_statement')
        ? (statements[0].children().find((n) => n.isNamed()) ?? null)
        : null
  }
  while (body?.is('parenthesized_expression')) {
    body = body.children().find((n) => n.isNamed()) ?? null
  }
  if (!body) {
    return false
  }
  const within = browsers.filter(
    (b) =>
      b.range().start.index >= body.range().start.index &&
      b.range().end.index <= body.range().end.index &&
      !b.ancestors().some((a) => browsers.some((other) => other.id() === a.id())),
  )
  if (!within.length) {
    return false
  }
  let rendered = body.text()
  for (const browserNode of within.sort((a, b) => b.range().start.index - a.range().start.index)) {
    const from = browserNode.range().start.index - body.range().start.index
    const to = browserNode.range().end.index - body.range().start.index
    rendered =
      rendered.slice(0, utf16Index(rendered, from)) +
      unwrap(browserNode, browsers) +
      rendered.slice(utf16Index(rendered, to))
  }
  return /^(?:children|<>\s*\{children\}\s*<\/>|\{children\})$/.test(rendered.trim())
}

const transform: Codemod<TSX> = (root) => {
  const program = root.root()
  const source = program.text()
  if (
    !['@backstage/plugin-app-react', '@backstage/core-compat-api', '@backstage/frontend-plugin-api'].some((name) =>
      source.includes(name),
    )
  ) {
    return Promise.resolve(null)
  }
  const edits: Edit[] = []
  const todos = todoCollector(source, () => metric.increment({ action: 'manual-review' }))
  const removedTags = new Set<number>()
  const removedLegacyRouters: Node[] = []
  let renameBlueprint = false
  const processedComponents = new Set<number>()
  for (const call of program.findAll({ rule: { kind: 'call_expression' } })) {
    const fn = call.field('function')
    if (
      fn?.is('member_expression') &&
      ['make', 'makeWithOverrides'].includes(fn.field('property').text()) &&
      binding(fn.field('object'), 'RouterBlueprint', ['@backstage/plugin-app-react'])
    ) {
      renameBlueprint = true
      const resolved = blueprintParams(call)
      if (resolved.unresolved) {
        todos.add(call, OPAQUE)
      }
      for (const params of resolved.params) {
        const supplied = value(property(params, 'component'))
        const component = functionFor(supplied, root.filename())
        if (!component) {
          todos.add(call, OPAQUE)
          continue
        }
        const elements = component.findAll({
          rule: { any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }] },
        })
        const allBrowsers = elements.filter(browser)
        const browsers = allBrowsers.filter((el) => !hasRouterProps(el))
        if (allBrowsers.length !== browsers.length) {
          todos.add(call, BROWSER_PROPS)
        }
        if (returnsOnlyChildren(component, browsers)) {
          todos.add(call, ONLY_BROWSER)
        }
        if (elements.some(otherRouter)) {
          todos.add(call, OTHER_ROUTER)
        }
        if (processedComponents.has(component.id())) {
          continue
        }
        processedComponents.add(component.id())
        for (const el of browsers) {
          const open = opening(el)
          const close = el.children().find((n) => n.is('jsx_closing_element'))
          const openName = open?.child(1)
          const closeName = close?.child(1)
          if (openName) {
            removedTags.add(openName.id())
          }
          if (closeName) {
            removedTags.add(closeName.id())
          }
          if (!el.ancestors().some((a) => browsers.some((b) => b.id() === a.id()))) {
            const unwrapped = unwrap(el, browsers)
            edits.push(el.replace(unwrapped.trim() === 'children' ? '<>{children}</>' : unwrapped))
            metric.increment({ action: 'browser-router-unwrapped' })
          }
        }
      }
      metric.increment({ action: 'blueprint-migrated' })
      continue
    }
    if (binding(fn, 'convertLegacyAppOptions', ['@backstage/core-compat-api'])) {
      const pair = property(objectArg(call), 'components')
      const components = value(pair)
      const router = property(components, 'Router')
      if (router && pair && components) {
        removedLegacyRouters.push(router)
        const entries = components.children().filter((n) => n.isNamed() && !n.is('comment'))
        if (entries.length === 1 && entries[0]?.id() === router.id()) {
          const removal = removeListItem(pair, source)
          const prefix = linePrefix(source, pair)
          if (!prefix.trim()) {
            const previous = pair.prev()
            if (!previous?.is('comment') || !previous.text().includes(LEGACY)) {
              const wholeLine = removal.startPos < pair.range().start.index && removal.endPos > pair.range().end.index
              removal.insertedText = wholeLine ? `${prefix}// ${LEGACY}\n` : `// ${LEGACY}\n${prefix}`
              metric.increment({ action: 'manual-review' })
            }
          } else {
            todos.add(call, LEGACY, pair, true)
          }
          edits.push(removal)
        } else {
          todos.add(call, LEGACY, pair, true)
          edits.push(removeListItem(router, source))
        }
        metric.increment({ action: 'legacy-router-removed' })
      }
      continue
    }
    if (binding(fn, 'createExtension', ['@backstage/frontend-plugin-api', '@backstage/frontend-plugin-api/alpha'])) {
      const attach = value(property(objectArg(call), 'attachTo'))
      if (
        value(property(attach, 'id'))?.text().slice(1, -1) === 'app/root' &&
        value(property(attach, 'input'))?.text().slice(1, -1) === 'router'
      ) {
        todos.add(call, ATTACH)
      }
    }
  }
  if (renameBlueprint) {
    const statements = program
      .findAll({ rule: { kind: 'import_statement' } })
      .filter((s) => s.field('source')?.text().slice(1, -1) === '@backstage/plugin-app-react')
    const existing = statements
      .flatMap((s) => s.findAll({ rule: { kind: 'import_specifier' } }))
      .find((s) => s.field('name')?.text() === 'AppRootWrapperBlueprint' && !s.field('alias'))
    const removed: Edit[] = []
    if (existing) {
      const existingClause = existing.parent()
      for (const statement of statements) {
        const specs = statement.findAll({ rule: { kind: 'import_specifier' } })
        const old = specs.find((s) => s.field('name')?.text() === 'RouterBlueprint' && !s.field('alias'))
        if (
          !old ||
          old.parent()?.id() === existingClause?.id() ||
          specs.some((s) => s.id() !== old.id() && s.field('name')?.text() === 'RouterBlueprint')
        ) {
          continue
        }
        const clause = statement.find({ rule: { kind: 'import_clause' } })
        const hasDefault = clause?.children().some((n) => n.is('identifier')) ?? false
        if (specs.length === 1 && !hasDefault) {
          const line = source.split('\n')[statement.range().end.line] ?? ''
          const newline =
            line.trim() === statement.text().trim() && statement.range().end.line < source.split('\n').length - 1
          removed.push({
            startPos: statement.range().start.index,
            endPos: statement.range().end.index + (newline ? 1 : 0),
            insertedText: '',
          })
        } else {
          removed.push(removeListItem(old, source))
        }
      }
    }
    const updates =
      updateImport(program, {
        type: 'named',
        from: '@backstage/plugin-app-react',
        specifiers: [{ name: 'RouterBlueprint', to: 'AppRootWrapperBlueprint' }],
      }) ?? []
    edits.push(
      ...removed,
      ...updates.filter((e) => !removed.some((r) => e.startPos < r.endPos && r.startPos < e.endPos)),
    )
    for (const id of program.findAll({ rule: { kind: 'identifier' } })) {
      if (id.text() !== 'RouterBlueprint' || id.ancestors().some((a) => a.is('import_statement'))) {
        continue
      }
      if (binding(id, 'RouterBlueprint', ['@backstage/plugin-app-react'])) {
        const parent = id.parent()
        if (parent?.is('export_specifier') && parent.field('name').id() === id.id()) {
          edits.push(
            id.replace(
              parent.field('alias') ? 'AppRootWrapperBlueprint' : 'AppRootWrapperBlueprint as RouterBlueprint',
            ),
          )
        } else {
          edits.push(id.replace('AppRootWrapperBlueprint'))
        }
      }
    }
    for (const id of program.findAll({ rule: { kind: 'shorthand_property_identifier' } })) {
      const found = importBindingOf(id)
      if (
        id.text() === 'RouterBlueprint' &&
        found?.source === '@backstage/plugin-app-react' &&
        found.importedName === 'RouterBlueprint'
      ) {
        edits.push(id.replace('RouterBlueprint: AppRootWrapperBlueprint'))
      }
    }
  }
  if (removedTags.size || removedLegacyRouters.length) {
    const identifiers = program.findAll({
      rule: { any: [{ kind: 'identifier' }, { kind: 'shorthand_property_identifier' }, { kind: 'type_identifier' }] },
    })
    for (const statement of program.findAll({ rule: { kind: 'import_statement' } })) {
      const from = statement.field('source')?.text().slice(1, -1)
      if (!from || !['react-router', 'react-router-dom'].includes(from)) {
        continue
      }
      const specs = statement.findAll({ rule: { kind: 'import_specifier' } })
      const unused = specs.filter((s) => {
        if (s.field('name')?.text() !== 'BrowserRouter') {
          return false
        }
        const local = s.field('alias')?.text() ?? 'BrowserRouter'
        const references = identifiers.filter((id) => {
          if (id.text() !== local || id.ancestors().some((a) => a.is('import_statement'))) {
            return false
          }
          const found = importBindingOf(id)
          return found?.importedName === 'BrowserRouter' && found.source === from
        })
        const removed = (id: Node) =>
          removedTags.has(id.id()) ||
          removedLegacyRouters.some(
            (router) =>
              id.range().start.index >= router.range().start.index && id.range().end.index <= router.range().end.index,
          )
        return references.some(removed) && references.every(removed)
      })
      if (!unused.length) {
        continue
      }
      const clause = statement.find({ rule: { kind: 'import_clause' } })
      const hasDefault = clause?.children().some((n) => n.is('identifier')) ?? false
      if (unused.length === specs.length && !hasDefault) {
        const line = source.split('\n')[statement.range().end.line] ?? ''
        const removeNewline =
          line.trim() === statement.text().trim() && statement.range().end.line < source.split('\n').length - 1
        edits.push({
          startPos: statement.range().start.index,
          endPos: statement.range().end.index + (removeNewline ? 1 : 0),
          insertedText: '',
        })
      } else {
        for (const spec of unused) {
          const edit = removeListItem(spec, source)
          const previousSpec = specs[specs.findIndex((s) => s.id() === spec.id()) - 1]
          if (
            previousSpec &&
            unused.some((s) => s.id() === previousSpec.id()) &&
            edit.startPos < spec.range().start.index
          ) {
            edit.startPos = spec.range().start.index
          }
          edits.push(edit)
        }
      }
      metric.increment({ action: 'browser-import-removed' })
    }
  }
  edits.push(...todos.edits())
  return Promise.resolve(edits.length ? program.commitEdits(edits) : null)
}

export default transform
