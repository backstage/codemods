import { addImport, getImport, removeImport } from '@jssg/utils/javascript/imports'
import { parse } from 'codemod:ast-grep'
import type { Codemod, Edit, SgNode, SgRoot } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const TSX_LANG = 'tsx'
const FRONTEND_TEST_UTILS = '@backstage/frontend-test-utils'

const NAV_ASSERTION_TODO = '// TODO(backstage-codemod): verify nav assertions — renderTestApp uses real app shell'

const callsMigrated = useMetricAtom('render-test-app-calls-migrated')
const navAssertionsFlagged = useMetricAtom('nav-assertions-flagged')

function parseTsx(source: string): SgRoot<TSX> {
  return parse(TSX_LANG, source) as SgRoot<TSX>
}

function collapseExtraBlankLines(source: string): string {
  return source.replaceAll(/\n{3,}/g, '\n\n')
}

function tidyImportStatements(source: string): string {
  let out = source.replaceAll(/;(?=import\s)/g, ';\n')

  out = out.replaceAll(
    /(\n)([ \t]+)([^\n{}]*?,)(\n),\s*([^\n{}]+?)\s*\}/g,
    (_m, nl1: string, indent: string, prevLine: string, nl2: string, spec: string) =>
      `${nl1}${indent}${prevLine}${nl2}${indent}${spec.trim()},${nl2}}`,
  )

  const lines = out.split('\n')
  const next: string[] = []
  for (const line of lines) {
    const trimmed = line.trimStart()
    if (
      trimmed.startsWith('import ') &&
      !trimmed.startsWith('import type ') &&
      trimmed.includes(' from ') &&
      /\{[^}]*\}/.test(trimmed)
    ) {
      const formatted = line.replace(/import\s*\{([^}]*)\}\s*from/, (_m, inner: string) => {
        const parts = inner
          .split(',')
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0)
        return `import { ${parts.join(', ')} } from`
      })
      next.push(formatted)
    } else {
      next.push(line)
    }
  }
  return next.join('\n')
}

function finalizeSource(source: string): string {
  return collapseExtraBlankLines(tidyImportStatements(source))
}

function findContainingStatement(node: SgNode<TSX>): SgNode<TSX> | null {
  let current: SgNode<TSX> | null = node
  for (;;) {
    const parent: SgNode<TSX> | null = current.parent()
    if (!parent) {
      return null
    }
    const parentKind = parent.kind()
    if (parentKind === 'statement_block' || parentKind === 'program') {
      return current
    }
    current = parent
  }
}

function getIndentation(node: SgNode<TSX>, fullSource: string): string {
  const startIndex = node.range().start.index
  let lineStart = startIndex
  while (lineStart > 0 && fullSource[lineStart - 1] !== '\n') {
    lineStart--
  }
  const linePrefix = fullSource.slice(lineStart, startIndex)
  const match = linePrefix.match(/^(\s*)/)
  return match ? (match[1] ?? '') : ''
}

function getCallArguments(call: SgNode<TSX>): SgNode<TSX>[] {
  const argsNode = call.field('arguments')
  if (!argsNode) {
    return []
  }
  return argsNode.children().filter((child) => child.kind() !== ',' && child.kind() !== '(' && child.kind() !== ')')
}

function isNavItemFeatureText(text: string): boolean {
  return (
    /nav[-_]?item/i.test(text) || text.includes('NavItem') || text.includes("'nav-item'") || text.includes('"nav-item"')
  )
}

function isNavItemFeature(expr: SgNode<TSX>): boolean {
  return isNavItemFeatureText(expr.text())
}

function isNavBlueprintBackedFeature(element: SgNode<TSX>, navBlueprintImported: boolean): boolean {
  if (!navBlueprintImported || element.kind() !== 'identifier') {
    return false
  }

  const name = element.text()
  return /nav/i.test(name) || name.includes('NavItem')
}

function fileImportsNavItemBlueprint(program: SgNode<TSX, 'program'>): boolean {
  return Boolean(
    getImport(program, {
      type: 'named',
      name: 'NavItemBlueprint',
      from: '@backstage/frontend-plugin-api',
    }),
  )
}

function getArrayElements(arrayNode: SgNode<TSX>): SgNode<TSX>[] {
  return arrayNode.children().filter((child) => child.kind() !== '[' && child.kind() !== ']' && child.kind() !== ',')
}

function optionsHasNavItemFeatures(optionsNode: SgNode<TSX>, navBlueprintImported: boolean): boolean {
  if (optionsNode.kind() !== 'object') {
    return false
  }

  for (const child of optionsNode.children()) {
    if (child.kind() !== 'pair') {
      continue
    }
    const keyNode = child.field('key')
    if (keyNode?.text() !== 'features') {
      continue
    }
    const valueNode = child.field('value')
    if (valueNode?.kind() !== 'array') {
      continue
    }

    for (const element of getArrayElements(valueNode)) {
      if (isNavItemFeature(element)) {
        return true
      }
      if (isNavBlueprintBackedFeature(element, navBlueprintImported)) {
        return true
      }
    }
  }

  return false
}

function rebuildOptionsWithoutNavItems(optionsNode: SgNode<TSX>, navBlueprintImported: boolean): string | null {
  if (optionsNode.kind() !== 'object') {
    return optionsNode.text()
  }

  const keptProps: string[] = []

  for (const child of optionsNode.children()) {
    if (child.kind() !== 'pair') {
      continue
    }

    const keyNode = child.field('key')
    if (keyNode?.text() !== 'features') {
      keptProps.push(child.text())
      continue
    }

    const valueNode = child.field('value')
    if (valueNode?.kind() !== 'array') {
      keptProps.push(child.text())
      continue
    }

    const keptElements = getArrayElements(valueNode).filter((element) => {
      if (isNavItemFeature(element)) {
        return false
      }
      if (isNavBlueprintBackedFeature(element, navBlueprintImported)) {
        return false
      }
      return true
    })

    if (keptElements.length > 0) {
      keptProps.push(`features: [${keptElements.map((element) => element.text()).join(', ')}]`)
    }
  }

  if (keptProps.length === 0) {
    return null
  }

  return `{ ${keptProps.join(', ')} }`
}

function buildRenderTestAppCall(
  call: SgNode<TSX>,
  renderTestAppName: string,
  stripNavFeatures: boolean,
  navBlueprintImported: boolean,
): string {
  const [elementNode, optionsArg] = getCallArguments(call)
  const elementArg = elementNode?.text() ?? ''

  if (!optionsArg) {
    return `${renderTestAppName}(${elementArg})`
  }

  if (!stripNavFeatures) {
    return `${renderTestAppName}(${elementArg}, ${optionsArg.text()})`
  }

  const rebuiltOptions = rebuildOptionsWithoutNavItems(optionsArg, navBlueprintImported)
  if (!rebuiltOptions) {
    return `${renderTestAppName}(${elementArg})`
  }

  return `${renderTestAppName}(${elementArg}, ${rebuiltOptions})`
}

function getQueryMethodName(call: SgNode<TSX>): string | null {
  const fn = call.field('function')
  if (!fn) {
    return null
  }

  if (fn.kind() === 'identifier') {
    return fn.text()
  }

  if (fn.kind() === 'member_expression') {
    const prop = fn.field('property')
    return prop?.text() ?? null
  }

  return null
}

function callHasStringArgument(call: SgNode<TSX>, value: string): boolean {
  return (
    call.find({
      rule: {
        kind: 'string_fragment',
        regex: `^${value}$`,
      },
    }) !== null
  )
}

function callHasSidebarReference(call: SgNode<TSX>): boolean {
  return (
    call.find({
      rule: {
        kind: 'string_fragment',
        regex: 'sidebar',
      },
    }) !== null
  )
}

function isSidebarAssertionCall(call: SgNode<TSX>): boolean {
  const method = getQueryMethodName(call)
  if (!method) {
    return false
  }

  const isRoleQuery = /^(getByRole|queryByRole|findByRole|getAllByRole|queryAllByRole|findAllByRole)$/.test(method)
  const isSidebarQuery =
    /^(getByTestId|queryByTestId|findByTestId|getAllByTestId|queryAllByTestId|findAllByTestId)$/.test(method)

  if (isRoleQuery) {
    if (callHasStringArgument(call, 'link') || callHasStringArgument(call, 'navigation')) {
      return true
    }
    if (callHasSidebarReference(call)) {
      return true
    }
  }

  if (isSidebarQuery && callHasSidebarReference(call)) {
    return true
  }

  return false
}

function findSidebarAssertionCalls(rootNode: SgNode<TSX>): SgNode<TSX>[] {
  return rootNode.findAll({ rule: { kind: 'call_expression' } }).filter((call) => isSidebarAssertionCall(call))
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const fullSource = rootNode.text()

  const renderInTestAppImport = getImport(rootNode, {
    type: 'named',
    name: 'renderInTestApp',
    from: FRONTEND_TEST_UTILS,
  })
  if (!renderInTestAppImport) {
    return null
  }

  const renderInTestAppName = renderInTestAppImport.alias
  const navBlueprintImported = fileImportsNavItemBlueprint(rootNode)
  const sidebarAssertionCalls = findSidebarAssertionCalls(rootNode)
  const hasSidebarAssertions = sidebarAssertionCalls.length > 0

  const renderCalls = rootNode.findAll({
    rule: {
      kind: 'call_expression',
      has: {
        field: 'function',
        kind: 'identifier',
        regex: `^${renderInTestAppName.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      },
    },
  })

  if (renderCalls.length === 0) {
    return null
  }

  const callEdits: Edit[] = []
  let migratedCount = 0

  for (const call of renderCalls) {
    const [, optionsArg] = getCallArguments(call)
    const hasNavFeatures = optionsArg ? optionsHasNavItemFeatures(optionsArg, navBlueprintImported) : false

    if (!hasNavFeatures && !hasSidebarAssertions) {
      continue
    }

    const replacement = buildRenderTestAppCall(call, 'renderTestApp', hasNavFeatures, navBlueprintImported)
    callEdits.push(call.replace(replacement))
    callsMigrated.increment({ pattern: hasNavFeatures ? 'nav-item-features' : 'sidebar-assertions' })
    migratedCount++
  }

  if (migratedCount === 0) {
    return null
  }

  // Only remove the renderInTestApp import when ALL calls were migrated;
  // otherwise un-migrated calls would reference an undefined identifier.
  if (migratedCount === renderCalls.length) {
    const removeRenderInTestAppEdit = removeImport(rootNode, {
      type: 'named',
      specifiers: ['renderInTestApp'],
      from: FRONTEND_TEST_UTILS,
    })
    if (removeRenderInTestAppEdit) {
      callEdits.push(removeRenderInTestAppEdit)
    }
  }

  const todoCommentedStmtIds = new Set<number>()
  const todoEdits: Edit[] = []

  for (const assertionCall of sidebarAssertionCalls) {
    const stmt = findContainingStatement(assertionCall)
    if (!stmt) {
      continue
    }

    const stmtId = stmt.id()
    if (todoCommentedStmtIds.has(stmtId)) {
      continue
    }
    todoCommentedStmtIds.add(stmtId)

    const indent = getIndentation(stmt, fullSource)
    todoEdits.push({
      startPos: stmt.range().start.index,
      endPos: stmt.range().start.index,
      insertedText: `${NAV_ASSERTION_TODO}\n${indent}`,
    })
    navAssertionsFlagged.increment()
  }

  const phase1Source = rootNode.commitEdits([...callEdits, ...todoEdits])

  const phase1HasImports = /^\s*(?:import\s|const\s+[^=]+=\s*require\b)/m.test(phase1Source)

  let out: string
  if (phase1HasImports) {
    const phase2Root = parseTsx(phase1Source).root()
    const addEdits: Edit[] = []

    const existingRenderTestApp = getImport(phase2Root, {
      type: 'named',
      name: 'renderTestApp',
      from: FRONTEND_TEST_UTILS,
    })

    if (!existingRenderTestApp) {
      const addRenderTestAppEdit = addImport(phase2Root, {
        type: 'named',
        specifiers: [{ name: 'renderTestApp' }],
        from: FRONTEND_TEST_UTILS,
        moduleType: renderInTestAppImport.moduleType,
      })
      if (addRenderTestAppEdit) {
        addEdits.push(addRenderTestAppEdit)
      }
    }

    out = addEdits.length > 0 ? phase2Root.commitEdits(addEdits) : phase1Source
  } else {
    out = `import { renderTestApp } from '${FRONTEND_TEST_UTILS}';\n\n${phase1Source.replace(/^\s+/, '')}`
  }

  const result = await Promise.resolve(finalizeSource(out))
  return result
}

export default transform
