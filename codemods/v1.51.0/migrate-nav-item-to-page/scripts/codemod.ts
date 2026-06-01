import { getImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const FRONTEND_API_SOURCE = '@backstage/frontend-plugin-api'

const migrationMetric = useMetricAtom('nav-item-to-page-migration')

const TODO_UNPAIRED =
  '// TODO(backstage-codemod): Migrate NavItemBlueprint — no matching PageBlueprint with the same routeRef found'
const TODO_AMBIGUOUS =
  '// TODO(backstage-codemod): Ambiguous NavItemBlueprint pairing — multiple PageBlueprint extensions share the same routeRef'
const TODO_DYNAMIC =
  '// TODO(backstage-codemod): NavItemBlueprint uses a dynamic routeRef — merge title/icon into PageBlueprint manually'
const TODO_ICON = '// TODO(backstage-codemod): Convert nav icon to IconElement JSX manually'

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

function sgField(node: SgNode<TSX>, fieldName: string): SgNode<TSX> | null {
  return node.field(fieldName) ?? null
}

function collapseExtraBlankLines(source: string): string {
  return source.replaceAll(/\n{3,}/g, '\n\n')
}

function finalizeSource(source: string): string {
  return collapseExtraBlankLines(source)
}

function blueprintObjectMatches(node: SgNode<TSX> | null | undefined, blueprintName: string): boolean {
  if (!node) {
    return false
  }
  if (node.is('identifier')) {
    return node.text() === blueprintName
  }
  if (node.kind() === 'member_expression') {
    const prop = sgField(node, 'property')
    return prop?.text() === blueprintName
  }
  return false
}

function getBlueprintMakeMethod(call: SgNode<TSX>): 'make' | 'makeWithOverrides' | null {
  const fn = call.field('function')
  if (fn?.kind() !== 'member_expression') {
    return null
  }
  const method = sgField(fn, 'property')?.text()
  if (method === 'make') {
    return 'make'
  }
  if (method === 'makeWithOverrides') {
    return 'makeWithOverrides'
  }
  return null
}

function isBlueprintCall(call: SgNode<TSX>, blueprintName: string): boolean {
  const method = getBlueprintMakeMethod(call)
  if (!method) {
    return false
  }
  const fn = call.field('function')
  const calleeObject = fn?.field('object')
  return blueprintObjectMatches(calleeObject, blueprintName)
}

function getFirstObjectArg(call: SgNode<TSX>): SgNode<TSX> | null {
  const args = call.field('arguments')
  if (!args) {
    return null
  }
  for (const child of args.children()) {
    if (child.kind() === 'object') {
      return child
    }
  }
  return null
}

function findPairInObject(objectNode: SgNode<TSX>, key: string): SgNode<TSX> | null {
  return objectNode.find({
    rule: {
      kind: 'pair',
      any: [
        {
          has: {
            field: 'key',
            kind: 'property_identifier',
            regex: `^${escapeRegex(key)}$`,
          },
        },
        {
          has: {
            field: 'key',
            kind: 'shorthand_property_identifier',
            regex: `^${escapeRegex(key)}$`,
          },
        },
      ],
    },
  })
}

function findPropertyInObject(objectNode: SgNode<TSX>, key: string): SgNode<TSX> | null {
  const pair = findPairInObject(objectNode, key)
  if (pair) {
    return pair
  }

  return objectNode.find({
    rule: {
      kind: 'shorthand_property_identifier',
      regex: `^${escapeRegex(key)}$`,
    },
  })
}

function hasPairInObject(objectNode: SgNode<TSX>, key: string): boolean {
  return findPropertyInObject(objectNode, key) !== null
}

function getPairValueText(objectNode: SgNode<TSX>, key: string): { text: string; node: SgNode<TSX> } | null {
  const property = findPropertyInObject(objectNode, key)
  if (!property) {
    return null
  }

  if (property.is('shorthand_property_identifier')) {
    return { text: property.text(), node: property }
  }

  const value = property.field('value')
  if (value) {
    return { text: value.text(), node: value }
  }

  const keyNode = property.field('key')
  if (keyNode) {
    return { text: keyNode.text(), node: keyNode }
  }

  return null
}

function isStaticRouteRef(valueNode: SgNode<TSX>): boolean {
  return (
    valueNode.is('identifier') || valueNode.is('member_expression') || valueNode.is('shorthand_property_identifier')
  )
}

function getParamsObjectFromMakeCall(call: SgNode<TSX>): SgNode<TSX> | null {
  const argObject = getFirstObjectArg(call)
  if (!argObject) {
    return null
  }
  const paramsPair = findPairInObject(argObject, 'params')
  return paramsPair?.field('value') ?? null
}

function getPageParamsTarget(call: SgNode<TSX>): SgNode<TSX> | null {
  const method = getBlueprintMakeMethod(call)
  if (method === 'make') {
    return getParamsObjectFromMakeCall(call)
  }
  if (method === 'makeWithOverrides') {
    return getOriginalFactoryFirstArgObject(call)
  }
  return null
}

function getFactoryBodyNode(configObject: SgNode<TSX>): SgNode<TSX> | null {
  const method = configObject.find({
    rule: {
      kind: 'method_definition',
      has: { field: 'name', regex: '^factory$' },
    },
  })
  if (method) {
    return sgField(method, 'body')
  }

  const factoryPair = findPairInObject(configObject, 'factory')
  const factoryValue = factoryPair ? sgField(factoryPair, 'value') : null
  if (factoryValue && (factoryValue.kind() === 'arrow_function' || factoryValue.kind() === 'function_expression')) {
    return sgField(factoryValue, 'body')
  }

  return null
}

function findOriginalFactoryCall(body: SgNode<TSX>): SgNode<TSX> | null {
  if (body.is('call_expression')) {
    return body
  }

  if (!body.is('statement_block')) {
    return null
  }

  const returnStmt = body.find({
    rule: {
      kind: 'return_statement',
      has: { kind: 'call_expression' },
    },
  })
  return returnStmt?.find({ rule: { kind: 'call_expression' } }) ?? null
}

function getOriginalFactoryFirstArgObject(makeWithOverridesCall: SgNode<TSX>): SgNode<TSX> | null {
  const configObject = getFirstObjectArg(makeWithOverridesCall)
  if (!configObject) {
    return null
  }

  const body = getFactoryBodyNode(configObject)
  if (!body) {
    return null
  }

  const factoryCall = findOriginalFactoryCall(body)
  if (!factoryCall) {
    return null
  }

  const args = factoryCall.field('arguments')
  if (!args) {
    return null
  }

  for (const child of args.children()) {
    if (child.kind() === 'object') {
      return child
    }
  }

  return null
}

function removeNavItemBlueprintImport(rootNode: SgNode<TSX>): Edit | null {
  for (const importStmt of rootNode.findAll({ rule: { kind: 'import_statement' } })) {
    const source = importStmt.find({ rule: { kind: 'string_fragment' } })?.text()
    if (source !== FRONTEND_API_SOURCE) {
      continue
    }

    const specifiers = importStmt.findAll({ rule: { kind: 'import_specifier' } })
    const remaining = specifiers.filter((spec) => {
      const importedName = spec.find({ rule: { kind: 'identifier' } })?.text()
      return importedName !== 'NavItemBlueprint'
    })

    if (remaining.length === specifiers.length) {
      continue
    }

    if (remaining.length === 0) {
      return importStmt.replace('')
    }

    const typeOnly = importStmt.text().trimStart().startsWith('import type')
    const originalText = importStmt.text()
    const isMultiline = originalText.includes('\n')
    const specTexts = remaining.map((s) => s.text())
    const typeKw = typeOnly ? 'type ' : ''

    const rebuilt = isMultiline
      ? `import ${typeKw}{\n  ${specTexts.join(',\n  ')},\n} from '${source}';`
      : `import ${typeKw}{ ${specTexts.join(', ')} } from '${source}';`

    return importStmt.replace(rebuilt)
  }

  return null
}

interface NavItemInfo {
  varName: string | null
  routeRef: string
  routeRefIsStatic: boolean
  title: string | null
  icon: { text: string; node: SgNode<TSX> } | null
  makeCall: SgNode<TSX>
  declaration: SgNode<TSX> | null
}

interface PageInfo {
  routeRef: string | null
  routeRefIsStatic: boolean
  paramsObject: SgNode<TSX>
  makeCall: SgNode<TSX>
}

function getVariableNameFromMakeCall(call: SgNode<TSX>): string | null {
  const declarator = call.parent()
  if (!declarator?.is('variable_declarator')) {
    return null
  }
  const nameNode = declarator.field('name')
  return nameNode.kind() === 'identifier' ? nameNode.text() : null
}

function findEnclosingStatement(node: SgNode<TSX>): SgNode<TSX> | null {
  let current: SgNode<TSX> | null = node
  while (current) {
    if (
      current.is('export_statement') ||
      current.is('lexical_declaration') ||
      current.is('variable_declaration') ||
      current.is('expression_statement')
    ) {
      return current
    }
    current = current.parent()
  }
  return null
}

function getStatementForMakeCall(call: SgNode<TSX>): SgNode<TSX> | null {
  return getDeclarationStatementFromMakeCall(call) ?? findEnclosingStatement(call)
}

function getDeclarationStatementFromMakeCall(call: SgNode<TSX>): SgNode<TSX> | null {
  let current: SgNode<TSX> | null = call.parent()
  while (current) {
    if (current.is('export_statement')) {
      return current
    }
    if (current.is('lexical_declaration') || current.is('variable_declaration')) {
      const parent = current.parent()
      if (parent?.is('export_statement')) {
        return parent
      }
      return current
    }
    current = current.parent()
  }
  return null
}

function collectNavItems(rootNode: SgNode<TSX>, navBlueprintName: string): NavItemInfo[] {
  const items: NavItemInfo[] = []

  for (const call of rootNode.findAll({ rule: { kind: 'call_expression' } })) {
    if (!isBlueprintCall(call, navBlueprintName)) {
      continue
    }

    const params = getParamsObjectFromMakeCall(call)
    if (!params) {
      continue
    }

    const routeRef = getPairValueText(params, 'routeRef')
    if (!routeRef) {
      continue
    }

    items.push({
      varName: getVariableNameFromMakeCall(call),
      routeRef: routeRef.text,
      routeRefIsStatic: isStaticRouteRef(routeRef.node),
      title: getPairValueText(params, 'title')?.text ?? null,
      icon: getPairValueText(params, 'icon'),
      makeCall: call,
      declaration: getStatementForMakeCall(call),
    })
  }

  return items
}

function collectPages(rootNode: SgNode<TSX>, pageBlueprintName: string): PageInfo[] {
  const pages: PageInfo[] = []

  for (const call of rootNode.findAll({ rule: { kind: 'call_expression' } })) {
    if (!isBlueprintCall(call, pageBlueprintName)) {
      continue
    }

    const paramsObject = getPageParamsTarget(call)
    if (!paramsObject) {
      continue
    }

    const routeRef = getPairValueText(paramsObject, 'routeRef')
    pages.push({
      routeRef: routeRef?.text ?? null,
      routeRefIsStatic: routeRef ? isStaticRouteRef(routeRef.node) : false,
      paramsObject,
      makeCall: call,
    })
  }

  return pages
}

function convertIconToJsx(
  icon: { text: string; node: SgNode<TSX> },
  allowJsx: boolean,
): { jsx: string; ambiguous: boolean } {
  const { text, node } = icon

  if (node.is('jsx_element') || node.is('jsx_self_closing_element')) {
    return { jsx: text, ambiguous: false }
  }

  if (node.is('identifier')) {
    if (allowJsx) {
      return { jsx: `<${node.text()} fontSize="inherit" />`, ambiguous: false }
    }
    return { jsx: text, ambiguous: true }
  }

  return { jsx: text, ambiguous: true }
}

function detectObjectInnerIndent(objectNode: SgNode<TSX>): string {
  const firstPair = objectNode.find({ rule: { kind: 'pair' } })
  if (firstPair) {
    const col = firstPair.range().start.column
    return ' '.repeat(col)
  }
  return ' '.repeat(objectNode.range().start.column + 2)
}

function insertNavPropsIntoObject(paramsObject: SgNode<TSX>, title: string | null, iconJsx: string | null): string {
  const text = paramsObject.text()
  const braceIndex = text.indexOf('{')
  if (braceIndex < 0) {
    return text
  }

  const indent = detectObjectInnerIndent(paramsObject)
  const additions: string[] = []

  if (title && !hasPairInObject(paramsObject, 'title')) {
    additions.push(`${indent}title: ${title},`)
  }
  if (iconJsx !== null && !hasPairInObject(paramsObject, 'icon')) {
    additions.push(`${indent}icon: ${iconJsx},`)
  }

  if (additions.length === 0) {
    return text
  }

  const beforeInner = text.slice(0, braceIndex + 1)
  const afterInner = text.slice(braceIndex + 1)
  const innerTrimmed = afterInner.trimStart()

  if (innerTrimmed.length === 0) {
    return `${beforeInner}\n${additions.join('\n')}\n${indent.slice(2) || ''}}`
  }

  const normalizedAfter = afterInner.startsWith('\n') ? afterInner : `\n${indent}${afterInner.trimStart()}`
  return `${beforeInner}\n${additions.join('\n')}${normalizedAfter}`
}

function removeIdentifierFromArray(arrayNode: SgNode<TSX>, identifier: string): Edit[] {
  const elements = arrayNode.children().filter((c) => c.kind() !== '[' && c.kind() !== ']' && c.kind() !== ',')

  const target = elements.find((el) => el.kind() === 'identifier' && el.text() === identifier)
  if (!target) {
    return []
  }

  const remaining = elements.filter((el) => el !== target)
  if (remaining.length === 0) {
    return [arrayNode.replace('[]')]
  }

  const rebuilt = `[${remaining.map((el) => el.text()).join(', ')}]`
  return [arrayNode.replace(rebuilt)]
}

function removeFromExtensionsArrays(rootNode: SgNode<TSX>, varName: string): Edit[] {
  const edits: Edit[] = []

  for (const pair of rootNode.findAll({
    rule: {
      kind: 'pair',
      has: {
        field: 'key',
        kind: 'property_identifier',
        regex: '^extensions$',
      },
    },
  })) {
    const array = pair.field('value')
    if (!array?.is('array')) {
      continue
    }

    edits.push(...removeIdentifierFromArray(array, varName))
  }

  return edits
}

function prependTodo(statement: SgNode<TSX>, todo: string): Edit {
  return statement.replace(`${todo}\n${statement.text()}`)
}

function resolveNavBlueprintName(rootNode: SgNode<TSX, 'program'>): string | null {
  const navImport = getImport(rootNode, {
    type: 'named',
    name: 'NavItemBlueprint',
    from: FRONTEND_API_SOURCE,
  })
  if (navImport) {
    return navImport.alias
  }

  for (const importStmt of rootNode.findAll({ rule: { kind: 'import_statement' } })) {
    const source = importStmt.find({ rule: { kind: 'string_fragment' } })?.text()
    if (source !== FRONTEND_API_SOURCE) {
      continue
    }
    const nsImport = importStmt.find({ rule: { kind: 'namespace_import' } })
    if (nsImport) {
      const nsName = nsImport.find({ rule: { kind: 'identifier' } })?.text()
      if (nsName) {
        for (const call of rootNode.findAll({ rule: { kind: 'call_expression' } })) {
          const fn = call.field('function')
          if (fn?.kind() !== 'member_expression') {
            continue
          }
          const prop = sgField(fn, 'property')?.text()
          if (prop !== 'make') {
            continue
          }
          const calleeObject = sgField(fn, 'object')
          if (calleeObject?.kind() === 'member_expression') {
            const outer = sgField(calleeObject, 'object')
            const innerProp = sgField(calleeObject, 'property')?.text()
            if (outer?.text() === nsName && innerProp === 'NavItemBlueprint') {
              return `${nsName}.NavItemBlueprint`
            }
          }
        }
      }
    }
  }

  return null
}

function resolvePageBlueprintName(rootNode: SgNode<TSX, 'program'>): string {
  const pageImport = getImport(rootNode, {
    type: 'named',
    name: 'PageBlueprint',
    from: FRONTEND_API_SOURCE,
  })
  return pageImport?.alias ?? 'PageBlueprint'
}

function findBlueprintCallsForName(rootNode: SgNode<TSX>, blueprintRef: string): SgNode<TSX>[] {
  if (!blueprintRef.includes('.')) {
    return rootNode.findAll({ rule: { kind: 'call_expression' } }).filter((call) => isBlueprintCall(call, blueprintRef))
  }

  const [namespace, blueprintName] = blueprintRef.split('.')
  return rootNode.findAll({ rule: { kind: 'call_expression' } }).filter((call) => {
    const fn = call.field('function')
    if (fn?.kind() !== 'member_expression') {
      return false
    }
    if (sgField(fn, 'property')?.text() !== 'make') {
      return false
    }
    const calleeObject = sgField(fn, 'object')
    if (calleeObject?.kind() !== 'member_expression') {
      return false
    }
    const outer = sgField(calleeObject, 'object')
    const innerProp = sgField(calleeObject, 'property')
    return outer?.text() === namespace && innerProp?.text() === blueprintName
  })
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const allowJsx = root.filename().endsWith('.tsx')
  const navBlueprintRef = resolveNavBlueprintName(rootNode)
  if (!navBlueprintRef) {
    return null
  }

  const pageBlueprintName = resolvePageBlueprintName(rootNode)
  const navBlueprintName = navBlueprintRef.includes('.')
    ? (navBlueprintRef.split('.')[1] ?? 'NavItemBlueprint')
    : navBlueprintRef

  const navItems = navBlueprintRef.includes('.')
    ? findBlueprintCallsForName(rootNode, navBlueprintRef).flatMap((call) => {
        const params = getParamsObjectFromMakeCall(call)
        if (!params) {
          return []
        }
        const routeRef = getPairValueText(params, 'routeRef')
        if (!routeRef) {
          return []
        }
        return [
          {
            varName: getVariableNameFromMakeCall(call),
            routeRef: routeRef.text,
            routeRefIsStatic: isStaticRouteRef(routeRef.node),
            title: getPairValueText(params, 'title')?.text ?? null,
            icon: getPairValueText(params, 'icon'),
            makeCall: call,
            declaration: getStatementForMakeCall(call),
          },
        ]
      })
    : collectNavItems(rootNode, navBlueprintName)

  if (navItems.length === 0) {
    return null
  }

  const pages = collectPages(rootNode, pageBlueprintName)
  const edits: Edit[] = []
  const declarationsToRemove = new Set<SgNode<TSX>>()

  for (const navItem of navItems) {
    if (!navItem.routeRefIsStatic) {
      migrationMetric.increment({ outcome: 'todo-dynamic' })
      if (navItem.declaration) {
        edits.push(prependTodo(navItem.declaration, TODO_DYNAMIC))
      }
      continue
    }

    const matchingPages = pages.filter((page) => page.routeRefIsStatic && page.routeRef === navItem.routeRef)

    if (matchingPages.length === 0) {
      migrationMetric.increment({ outcome: 'todo-unpaired' })
      if (navItem.declaration) {
        edits.push(prependTodo(navItem.declaration, TODO_UNPAIRED))
      }
      continue
    }

    if (matchingPages.length > 1) {
      migrationMetric.increment({ outcome: 'todo-ambiguous' })
      if (navItem.declaration) {
        edits.push(prependTodo(navItem.declaration, TODO_AMBIGUOUS))
      }
      continue
    }

    const [page] = matchingPages
    if (!page) {
      continue
    }

    let iconJsx: string | null = null
    let iconAmbiguous = false
    if (navItem.icon) {
      const converted = convertIconToJsx(navItem.icon, allowJsx)
      iconJsx = converted.jsx
      iconAmbiguous = converted.ambiguous
    }

    const updatedParams = insertNavPropsIntoObject(page.paramsObject, navItem.title, iconJsx)

    if (iconAmbiguous) {
      const pageStatement = getStatementForMakeCall(page.makeCall)
      if (pageStatement) {
        const updatedStatement = `${TODO_ICON}\n${pageStatement.text().replace(page.paramsObject.text(), updatedParams)}`
        edits.push(pageStatement.replace(updatedStatement))
      } else {
        edits.push(page.paramsObject.replace(updatedParams))
      }
    } else {
      edits.push(page.paramsObject.replace(updatedParams))
    }

    migrationMetric.increment({ outcome: 'merged' })

    if (navItem.declaration) {
      declarationsToRemove.add(navItem.declaration)
    }

    if (navItem.varName) {
      edits.push(...removeFromExtensionsArrays(rootNode, navItem.varName))
    }
  }

  for (const declaration of declarationsToRemove) {
    edits.push(declaration.replace(''))
  }

  const removeImportEdit = declarationsToRemove.size === navItems.length ? removeNavItemBlueprintImport(rootNode) : null
  if (removeImportEdit) {
    edits.push(removeImportEdit)
  }

  if (edits.length === 0) {
    return null
  }

  const result = await Promise.resolve(finalizeSource(rootNode.commitEdits(edits)))
  return result
}

export default transform
