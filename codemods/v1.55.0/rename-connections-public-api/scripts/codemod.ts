import type { Codemod, Edit, GetSelector, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('rename-connections-public-api')

const CONNECTIONS_SOURCE = '@backstage/connections'

const RENAME_MAP: Record<string, string> = {
  ConnectionAuthValue: 'ConnectionAuth',
  LookupStrategy: 'ConnectionLookupStrategy',
  ConnectionType: 'ConnectionTypeDefinition',
  ConnectionTypeKey: 'ConnectionType',
  isConnectionTypeKey: 'isConnectionType',
}

const CONNECTION_AUTH_MATCH = 'ConnectionAuthMatch'
const CONNECTION_AUTH_MATCH_INLINE = '{ plugins: string[] }'
const CONNECTION_AUTH_METHOD_KEY = 'ConnectionAuthMethodKey'

const CONNECTION_AUTH_MATCH_TODO =
  '/* TODO(backstage-codemod): ConnectionAuthMatch was removed in @backstage/connections@0.4.0; inline as { plugins: string[] } manually. */'
const CONNECTION_AUTH_METHOD_KEY_TODO =
  '/* TODO(backstage-codemod): ConnectionAuthMethodKey was removed in @backstage/connections@0.4.0; inline or replace this usage manually. */'
const LOCAL_COLLISION_TODO =
  '/* TODO(backstage-codemod): local-name collision while renaming @backstage/connections symbols; resolve this specifier manually. */'

const REMOVED_CONNECTION_TYPE_MEMBER_TODOS: Record<string, string> = {
  matchAuth:
    "/* TODO(backstage-codemod): 'matchAuth' was removed from ConnectionTypeDefinition in @backstage/connections@0.4.0; migrate this behavior manually. */",
  validate:
    "/* TODO(backstage-codemod): 'validate' was removed from ConnectionTypeDefinition in @backstage/connections@0.4.0; migrate this behavior manually. */",
}

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const getSelector: GetSelector<TSX> = () => ({
  rule: {
    kind: 'string',
    regex: `^['"]${escapeRegex(CONNECTIONS_SOURCE)}['"]$`,
    inside: {
      any: [{ kind: 'import_statement' }, { kind: 'export_statement' }],
    },
  },
})

function findStatementsFrom<K extends 'import_statement' | 'export_statement'>(
  rootNode: SgNode<TSX>,
  kind: K,
  source: string,
): SgNode<TSX, K>[] {
  return rootNode.findAll({
    rule: {
      kind,
      has: {
        kind: 'string',
        has: {
          kind: 'string_fragment',
          regex: `^${escapeRegex(source)}$`,
        },
      },
    },
  }) as SgNode<TSX, K>[]
}

interface SpecifierInfo {
  specNode: SgNode<TSX>
  localNameNode: SgNode<TSX>
  importedName: string
  localName: string
  specText: string
  hasInlineTypeModifier: boolean
}

function extractSpecifiers(node: SgNode<TSX>, kind: 'import_specifier' | 'export_specifier'): SpecifierInfo[] {
  const specifiers = node.findAll({ rule: { kind } })
  const result: SpecifierInfo[] = []

  for (const spec of specifiers) {
    const identifiers = spec.findAll({
      rule: {
        any: [{ kind: 'identifier' }, { kind: 'type_identifier' }],
      },
    })

    const [importedNameNode] = identifiers
    if (!importedNameNode) {
      continue
    }

    const localNameNode = identifiers[1] ?? importedNameNode
    const specText = spec.text()

    result.push({
      specNode: spec,
      localNameNode,
      importedName: importedNameNode.text(),
      localName: localNameNode.text(),
      specText,
      hasInlineTypeModifier: /^type\s+/.test(specText),
    })
  }

  return result
}

function isTypeOnlyStatement(node: SgNode<TSX>): boolean {
  return /^(import|export)\s+type\s/.test(node.text())
}

function isPureNamedStatement(node: SgNode<TSX>, keyword: 'import' | 'export'): boolean {
  return new RegExp(`^${keyword}\\s+(type\\s+)?\\{`, 'm').test(node.text())
}

function normalizeSpecifierTypeModifier(specText: string, statementTypeOnly: boolean): string {
  if (!statementTypeOnly) {
    return specText
  }

  return specText.replace(/^type\s+/, '')
}

function buildSpecifierText(
  spec: SpecifierInfo,
  importedName: string,
  localName: string,
  statementTypeOnly: boolean,
): string {
  const typeModifier = spec.hasInlineTypeModifier && !statementTypeOnly ? 'type ' : ''
  if (importedName === localName) {
    return `${typeModifier}${importedName}`
  }

  return `${typeModifier}${importedName} as ${localName}`
}

function buildNamedStatement(
  keyword: 'import' | 'export',
  specTexts: string[],
  source: string,
  typeOnly: boolean,
): string {
  const typeKw = typeOnly ? 'type ' : ''
  if (specTexts.length <= 2) {
    return `${keyword} ${typeKw}{ ${specTexts.join(', ')} } from '${source}';`
  }
  return `${keyword} ${typeKw}{\n  ${specTexts.join(',\n  ')},\n} from '${source}';`
}

function collectBodyReferences(bindingNode: SgNode<TSX>, filename: string): SgNode<TSX>[] {
  const declarationId = bindingNode.id()
  const refs: SgNode<TSX>[] = []

  for (const refGroup of bindingNode.references()) {
    if (refGroup.root.filename() !== filename) {
      continue
    }
    for (const refNode of refGroup.nodes) {
      if (refNode.id() === declarationId) {
        continue
      }
      refs.push(refNode)
    }
  }

  return refs
}

function isUnsafeConnectionAuthMatchHeritageRef(refNode: SgNode<TSX>): boolean {
  const parent = refNode.parent()
  if (!parent) {
    return false
  }

  if (parent.kind() === 'extends_type_clause' || parent.kind() === 'implements_clause') {
    return true
  }

  if (parent.kind() !== 'generic_type') {
    return false
  }

  const grandparent = parent.parent()
  if (!grandparent || (grandparent.kind() !== 'extends_type_clause' && grandparent.kind() !== 'implements_clause')) {
    return false
  }

  const [headNode] = parent.children()
  return headNode?.id() === refNode.id()
}

function isSafeConnectionAuthMatchTypeRef(refNode: SgNode<TSX>): boolean {
  return refNode.kind() === 'type_identifier' && !isUnsafeConnectionAuthMatchHeritageRef(refNode)
}

function addTodoToSpecifier(specText: string, todo: string): string {
  if (specText.includes('TODO(backstage-codemod):')) {
    return specText
  }
  return `${specText} ${todo}`
}

function getTypeAnnotatedObjectLiteral(refNode: SgNode<TSX>): SgNode<TSX> | null {
  const typeAnnotation = refNode.ancestors().find((a) => a.kind() === 'type_annotation')
  if (!typeAnnotation) {
    return null
  }

  const owner = typeAnnotation.parent()
  if (owner?.kind() !== 'variable_declarator') {
    return null
  }

  const valueNode = owner.field('value')
  if (valueNode?.kind() !== 'object') {
    return null
  }

  return valueNode
}

function collectConnectionTypeDefinitionObjectLiterals(bindingNode: SgNode<TSX>, filename: string): SgNode<TSX>[] {
  const objectNodes: SgNode<TSX>[] = []
  const seen = new Set<number>()

  for (const refNode of collectBodyReferences(bindingNode, filename)) {
    const objectNode = getTypeAnnotatedObjectLiteral(refNode)
    if (!objectNode || seen.has(objectNode.id())) {
      continue
    }
    seen.add(objectNode.id())
    objectNodes.push(objectNode)
  }

  return objectNodes
}

function shouldMapConnectionTypeImport(
  statementImportedNames: Set<string>,
  hasDefinitionObjectLiteral: boolean,
): boolean {
  if (statementImportedNames.has('ConnectionTypeKey')) {
    return true
  }

  if (statementImportedNames.has('ConnectionTypeDefinition')) {
    return false
  }

  return hasDefinitionObjectLiteral
}

function shouldMapConnectionTypeReexport(statementImportedNames: Set<string>): boolean {
  if (statementImportedNames.has('ConnectionTypeKey')) {
    return true
  }

  if (statementImportedNames.has('ConnectionTypeDefinition')) {
    return false
  }

  return false
}

interface BindingRename {
  bindingNode: SgNode<TSX>
  oldName: string
  newName: string
}

function collectImportLocalNames(statement: SgNode<TSX, 'import_statement'>): Set<string> {
  const localNames = new Set<string>()

  for (const spec of extractSpecifiers(statement, 'import_specifier')) {
    localNames.add(spec.localName)
  }

  const importClause = statement.find({ rule: { kind: 'import_clause' } })
  if (!importClause) {
    return localNames
  }

  for (const child of importClause.children()) {
    if (child.kind() === 'identifier' || child.kind() === 'type_identifier') {
      localNames.add(child.text())
      continue
    }

    if (child.kind() !== 'namespace_import') {
      continue
    }

    const namespaceName = child
      .children()
      .find((namespaceChild) => namespaceChild.kind() === 'identifier' || namespaceChild.kind() === 'type_identifier')
    if (namespaceName) {
      localNames.add(namespaceName.text())
    }
  }

  return localNames
}

function isTopLevelVariableDeclarator(declarator: SgNode<TSX, 'variable_declarator'>): boolean {
  let declarationNode: SgNode<TSX> | null = declarator.parent()
  while (declarationNode?.kind() === 'variable_declaration') {
    declarationNode = declarationNode.parent()
  }

  if (!declarationNode) {
    return false
  }

  let statementNode = declarationNode.parent()
  if (statementNode?.kind() === 'export_statement') {
    statementNode = statementNode.parent()
  }

  return statementNode?.kind() === 'program'
}

function collectBindingNamesFromPattern(patternNode: SgNode<TSX>, names: Set<string>): void {
  const kind = patternNode.kind()

  if (kind === 'identifier' || kind === 'type_identifier' || kind === 'shorthand_property_identifier_pattern') {
    names.add(patternNode.text())
    return
  }

  if (kind === 'pair_pattern') {
    const valueNode = patternNode.field('value')
    if (valueNode) {
      collectBindingNamesFromPattern(valueNode, names)
    }
    return
  }

  if (kind === 'assignment_pattern') {
    const leftNode = patternNode.field('left')
    if (leftNode) {
      collectBindingNamesFromPattern(leftNode, names)
      return
    }
  }

  if (kind === 'rest_pattern') {
    const argumentNode = patternNode.field('argument')
    if (argumentNode) {
      collectBindingNamesFromPattern(argumentNode, names)
      return
    }
  }

  for (const child of patternNode.children()) {
    if (!child.isNamed()) {
      continue
    }
    collectBindingNamesFromPattern(child, names)
  }
}

function collectDeclaredLocalNames(rootNode: SgNode<TSX, 'program'>): Set<string> {
  const names = new Set<string>()
  const declarationNodes = rootNode.findAll({
    rule: {
      any: [
        { kind: 'type_alias_declaration' },
        { kind: 'interface_declaration' },
        { kind: 'class_declaration' },
        { kind: 'function_declaration' },
        { kind: 'enum_declaration' },
        { kind: 'variable_declarator' },
      ],
    },
  })

  for (const declarationNode of declarationNodes) {
    if (declarationNode.kind() === 'variable_declarator') {
      const fieldNameNode = declarationNode.field('name')
      if (!fieldNameNode) {
        continue
      }

      if (fieldNameNode.kind() === 'identifier' || fieldNameNode.kind() === 'type_identifier') {
        names.add(fieldNameNode.text())
        continue
      }

      if (isTopLevelVariableDeclarator(declarationNode as SgNode<TSX, 'variable_declarator'>)) {
        collectBindingNamesFromPattern(fieldNameNode, names)
      }
      continue
    }

    const nameNode =
      declarationNode.children().find((child) => child.kind() === 'identifier' || child.kind() === 'type_identifier') ??
      null

    if (!nameNode) {
      continue
    }

    names.add(nameNode.text())
  }

  for (const importStatement of rootNode.findAll({ rule: { kind: 'import_statement' } }) as SgNode<
    TSX,
    'import_statement'
  >[]) {
    for (const localName of collectImportLocalNames(importStatement)) {
      names.add(localName)
    }
  }

  return names
}

function processImports(
  rootNode: SgNode<TSX, 'program'>,
  edits: Edit[],
  filename: string,
  declaredLocalNames: Set<string>,
): SgNode<TSX>[] {
  const importStatements = findStatementsFrom(rootNode, 'import_statement', CONNECTIONS_SOURCE)
  const connectionTypeDefinitionObjects: SgNode<TSX>[] = []
  const seenConnectionTypeObjectIds = new Set<number>()
  const occupiedLocalNamesGlobal = new Set<string>(declaredLocalNames)

  for (const imp of importStatements) {
    const source = imp.find({ rule: { kind: 'string_fragment' } })?.text()
    if (!source) {
      continue
    }

    const specifiers = extractSpecifiers(imp, 'import_specifier')
    if (specifiers.length === 0) {
      continue
    }

    const statementImportedNames = new Set(specifiers.map((spec) => spec.importedName))
    const mappedNameBySpecifierId = new Map<number, string | undefined>()

    for (const spec of specifiers) {
      const mappedName = RENAME_MAP[spec.importedName]
      if (spec.importedName !== 'ConnectionType') {
        mappedNameBySpecifierId.set(spec.specNode.id(), mappedName)
        continue
      }

      const definitionObjects = collectConnectionTypeDefinitionObjectLiterals(spec.localNameNode, filename)
      const shouldMap = shouldMapConnectionTypeImport(statementImportedNames, definitionObjects.length > 0)
      mappedNameBySpecifierId.set(spec.specNode.id(), shouldMap ? mappedName : undefined)

      if (!shouldMap) {
        continue
      }

      for (const objectNode of definitionObjects) {
        if (seenConnectionTypeObjectIds.has(objectNode.id())) {
          continue
        }
        seenConnectionTypeObjectIds.add(objectNode.id())
        connectionTypeDefinitionObjects.push(objectNode)
      }
    }

    const pendingRenames: BindingRename[] = []
    const outputById = new Map<number, string | null>()
    const finalLocalNameBySpecifierId = new Map<number, string | null>()
    let statementChanged = false

    const statementTypeOnly = isTypeOnlyStatement(imp)
    const canRewriteWholeStatement = isPureNamedStatement(imp, 'import')

    const occupiedLocalNames = new Set<string>(occupiedLocalNamesGlobal)
    for (const spec of specifiers) {
      const mappedName = mappedNameBySpecifierId.get(spec.specNode.id())
      const isAutoRenameCandidate = Boolean(mappedName && spec.localName === spec.importedName)
      if (isAutoRenameCandidate) {
        occupiedLocalNames.delete(spec.localName)
      }
    }

    for (const spec of specifiers) {
      outputById.set(spec.specNode.id(), spec.specText)
      finalLocalNameBySpecifierId.set(spec.specNode.id(), spec.localName)

      const mappedName = mappedNameBySpecifierId.get(spec.specNode.id())
      if (mappedName) {
        if (spec.localName !== spec.importedName) {
          const nextText = buildSpecifierText(spec, mappedName, spec.localName, statementTypeOnly)
          if (nextText !== spec.specText) {
            outputById.set(spec.specNode.id(), nextText)
            statementChanged = true
            migrationMetric.increment({ action: 'import-renamed', from: spec.importedName, to: mappedName })
          }
          continue
        }

        const preferredLocal = mappedName
        const fallbackLocal = spec.localName

        if (!occupiedLocalNames.has(preferredLocal)) {
          outputById.set(spec.specNode.id(), buildSpecifierText(spec, mappedName, mappedName, statementTypeOnly))
          finalLocalNameBySpecifierId.set(spec.specNode.id(), mappedName)
          statementChanged = true
          occupiedLocalNames.add(preferredLocal)
          pendingRenames.push({ bindingNode: spec.localNameNode, oldName: spec.localName, newName: mappedName })
          migrationMetric.increment({ action: 'import-renamed', from: spec.importedName, to: mappedName })
          continue
        }

        if (!occupiedLocalNames.has(fallbackLocal)) {
          const nextText = buildSpecifierText(spec, mappedName, fallbackLocal, statementTypeOnly)
          if (nextText !== spec.specText) {
            outputById.set(spec.specNode.id(), nextText)
            statementChanged = true
          }
          occupiedLocalNames.add(fallbackLocal)
          migrationMetric.increment({ action: 'collision-aliased', from: spec.importedName, to: mappedName })
          continue
        }

        const nextText = addTodoToSpecifier(spec.specText, LOCAL_COLLISION_TODO)
        if (nextText !== spec.specText) {
          outputById.set(spec.specNode.id(), nextText)
          statementChanged = true
        }
        migrationMetric.increment({ action: 'todo-added', name: spec.importedName, reason: 'local-collision' })
        continue
      }

      if (spec.importedName === CONNECTION_AUTH_MATCH) {
        const refs = collectBodyReferences(spec.localNameNode, filename)
        const unsafeRefs = refs.filter((ref) => !isSafeConnectionAuthMatchTypeRef(ref))

        if (unsafeRefs.length > 0) {
          const nextText = addTodoToSpecifier(spec.specText, CONNECTION_AUTH_MATCH_TODO)
          if (nextText !== spec.specText) {
            outputById.set(spec.specNode.id(), nextText)
            statementChanged = true
          }
          migrationMetric.increment({ action: 'todo-added', name: CONNECTION_AUTH_MATCH, reason: 'unsafe-reference' })
          continue
        }

        for (const refNode of refs) {
          edits.push(refNode.replace(CONNECTION_AUTH_MATCH_INLINE))
          migrationMetric.increment({ action: 'connection-auth-match-inlined' })
        }

        if (canRewriteWholeStatement) {
          outputById.set(spec.specNode.id(), null)
          finalLocalNameBySpecifierId.set(spec.specNode.id(), null)
          statementChanged = true
        } else {
          const nextText = addTodoToSpecifier(spec.specText, CONNECTION_AUTH_MATCH_TODO)
          if (nextText !== spec.specText) {
            outputById.set(spec.specNode.id(), nextText)
            statementChanged = true
            migrationMetric.increment({ action: 'todo-added', name: CONNECTION_AUTH_MATCH, reason: 'non-named-import' })
          }
        }
        continue
      }

      if (spec.importedName === CONNECTION_AUTH_METHOD_KEY) {
        const nextText = addTodoToSpecifier(spec.specText, CONNECTION_AUTH_METHOD_KEY_TODO)
        if (nextText !== spec.specText) {
          outputById.set(spec.specNode.id(), nextText)
          statementChanged = true
        }
        migrationMetric.increment({ action: 'todo-added', name: CONNECTION_AUTH_METHOD_KEY })
      }
    }

    for (const spec of specifiers) {
      occupiedLocalNamesGlobal.delete(spec.localName)
    }
    for (const finalLocalName of finalLocalNameBySpecifierId.values()) {
      if (finalLocalName) {
        occupiedLocalNamesGlobal.add(finalLocalName)
      }
    }

    for (const rename of pendingRenames) {
      for (const refNode of collectBodyReferences(rename.bindingNode, filename)) {
        edits.push(refNode.replace(rename.newName))
        migrationMetric.increment({ action: 'reference-renamed', from: rename.oldName, to: rename.newName })
      }
    }

    if (!statementChanged) {
      continue
    }

    if (canRewriteWholeStatement) {
      const specTexts = specifiers
        .map((spec) => outputById.get(spec.specNode.id()))
        .filter((text): text is string => text !== null && text !== undefined && text.length > 0)
        .map((text) => normalizeSpecifierTypeModifier(text, statementTypeOnly))

      const replacement =
        specTexts.length > 0 ? buildNamedStatement('import', specTexts, source, statementTypeOnly) : ''

      edits.push(imp.replace(replacement))
      continue
    }

    for (const spec of specifiers) {
      const nextText = outputById.get(spec.specNode.id())
      if (nextText === null || nextText === spec.specText || nextText === undefined) {
        continue
      }
      edits.push(spec.specNode.replace(nextText))
    }
  }

  return connectionTypeDefinitionObjects
}

function collectDeclaredReexportedNames(rootNode: SgNode<TSX, 'program'>): Set<string> {
  const names = new Set<string>()

  for (const exportStatement of rootNode.findAll({ rule: { kind: 'export_statement' } }) as SgNode<
    TSX,
    'export_statement'
  >[]) {
    for (const spec of extractSpecifiers(exportStatement, 'export_specifier')) {
      names.add(spec.localName)
    }
  }

  return names
}

function processReexports(rootNode: SgNode<TSX, 'program'>, edits: Edit[], declaredReexportedNames: Set<string>): void {
  const exportStatements = findStatementsFrom(rootNode, 'export_statement', CONNECTIONS_SOURCE)
  const occupiedExportedNamesGlobal = new Set<string>(declaredReexportedNames)

  for (const exp of exportStatements) {
    const source = exp.find({ rule: { kind: 'string_fragment' } })?.text()
    if (!source) {
      continue
    }

    const specifiers = extractSpecifiers(exp, 'export_specifier')
    if (specifiers.length === 0) {
      continue
    }

    const statementImportedNames = new Set(specifiers.map((spec) => spec.importedName))
    const mappedNameBySpecifierId = new Map<number, string | undefined>()

    for (const spec of specifiers) {
      if (spec.importedName !== 'ConnectionType') {
        mappedNameBySpecifierId.set(spec.specNode.id(), RENAME_MAP[spec.importedName])
        continue
      }

      mappedNameBySpecifierId.set(
        spec.specNode.id(),
        shouldMapConnectionTypeReexport(statementImportedNames) ? RENAME_MAP.ConnectionType : undefined,
      )
    }

    const outputById = new Map<number, string>()
    const finalExportedNameBySpecifierId = new Map<number, string>()
    let statementChanged = false

    const statementTypeOnly = isTypeOnlyStatement(exp)
    const canRewriteWholeStatement = isPureNamedStatement(exp, 'export')

    const occupiedExportedNames = new Set<string>(occupiedExportedNamesGlobal)
    for (const spec of specifiers) {
      const mappedName = mappedNameBySpecifierId.get(spec.specNode.id())
      const isAutoRenameCandidate = Boolean(mappedName && spec.localName === spec.importedName)
      if (isAutoRenameCandidate) {
        occupiedExportedNames.delete(spec.localName)
      }
    }

    for (const spec of specifiers) {
      outputById.set(spec.specNode.id(), spec.specText)
      finalExportedNameBySpecifierId.set(spec.specNode.id(), spec.localName)

      const mappedName = mappedNameBySpecifierId.get(spec.specNode.id())
      if (mappedName) {
        if (spec.localName !== spec.importedName) {
          const nextText = buildSpecifierText(spec, mappedName, spec.localName, statementTypeOnly)
          if (nextText !== spec.specText) {
            outputById.set(spec.specNode.id(), nextText)
            statementChanged = true
          }
          migrationMetric.increment({ action: 'reexport-renamed', from: spec.importedName, to: mappedName })
          continue
        }

        const preferredExportName = mappedName
        const fallbackExportName = spec.localName

        if (!occupiedExportedNames.has(preferredExportName)) {
          outputById.set(spec.specNode.id(), buildSpecifierText(spec, mappedName, mappedName, statementTypeOnly))
          finalExportedNameBySpecifierId.set(spec.specNode.id(), mappedName)
          statementChanged = true
          occupiedExportedNames.add(preferredExportName)
          migrationMetric.increment({ action: 'reexport-renamed', from: spec.importedName, to: mappedName })
          continue
        }

        if (!occupiedExportedNames.has(fallbackExportName)) {
          const nextText = buildSpecifierText(spec, mappedName, fallbackExportName, statementTypeOnly)
          if (nextText !== spec.specText) {
            outputById.set(spec.specNode.id(), nextText)
            statementChanged = true
          }
          occupiedExportedNames.add(fallbackExportName)
          migrationMetric.increment({ action: 'collision-aliased', from: spec.importedName, to: mappedName })
          continue
        }

        const nextText = addTodoToSpecifier(spec.specText, LOCAL_COLLISION_TODO)
        if (nextText !== spec.specText) {
          outputById.set(spec.specNode.id(), nextText)
          statementChanged = true
        }
        migrationMetric.increment({ action: 'todo-added', name: spec.importedName, reason: 'local-collision' })
        continue
      }

      if (spec.importedName === CONNECTION_AUTH_MATCH) {
        const nextText = addTodoToSpecifier(spec.specText, CONNECTION_AUTH_MATCH_TODO)
        if (nextText !== spec.specText) {
          outputById.set(spec.specNode.id(), nextText)
          statementChanged = true
        }
        migrationMetric.increment({ action: 'todo-added', name: CONNECTION_AUTH_MATCH, reason: 'reexport' })
        continue
      }

      if (spec.importedName === CONNECTION_AUTH_METHOD_KEY) {
        const nextText = addTodoToSpecifier(spec.specText, CONNECTION_AUTH_METHOD_KEY_TODO)
        if (nextText !== spec.specText) {
          outputById.set(spec.specNode.id(), nextText)
          statementChanged = true
        }
        migrationMetric.increment({ action: 'todo-added', name: CONNECTION_AUTH_METHOD_KEY, reason: 'reexport' })
      }
    }

    for (const spec of specifiers) {
      occupiedExportedNamesGlobal.delete(spec.localName)
    }
    for (const exportedName of finalExportedNameBySpecifierId.values()) {
      occupiedExportedNamesGlobal.add(exportedName)
    }

    if (!statementChanged) {
      continue
    }

    if (!canRewriteWholeStatement) {
      for (const spec of specifiers) {
        const nextText = outputById.get(spec.specNode.id())
        if (!nextText || nextText === spec.specText) {
          continue
        }
        edits.push(spec.specNode.replace(nextText))
      }
      continue
    }

    const replacement = buildNamedStatement(
      'export',
      specifiers
        .map((spec) => outputById.get(spec.specNode.id()) ?? spec.specText)
        .map((text) => normalizeSpecifierTypeModifier(text, statementTypeOnly)),
      source,
      statementTypeOnly,
    )

    edits.push(exp.replace(replacement))
  }
}

function annotateRemovedConnectionTypeMembers(edits: Edit[], connectionTypeDefinitionObjects: SgNode<TSX>[]): void {
  const seenPropertyIds = new Set<number>()

  for (const objectNode of connectionTypeDefinitionObjects) {
    for (const memberNode of objectNode.findAll({
      rule: { kind: 'property_identifier', regex: '^(matchAuth|validate)$' },
    })) {
      const propertyParent = memberNode.parent()
      if (!propertyParent || propertyParent.parent()?.id() !== objectNode.id()) {
        continue
      }

      if (seenPropertyIds.has(memberNode.id())) {
        continue
      }
      seenPropertyIds.add(memberNode.id())

      const memberName = memberNode.text()
      const todo = REMOVED_CONNECTION_TYPE_MEMBER_TODOS[memberName]
      if (!todo) {
        continue
      }

      if (propertyParent.text().includes('TODO(backstage-codemod):')) {
        continue
      }

      edits.push(memberNode.replace(`${memberName} ${todo}`))
      migrationMetric.increment({ action: 'todo-added', name: memberName, reason: 'removed-connection-type-member' })
    }
  }
}

const transform: Codemod<TSX> = async (root) => {
  if (!root.source().includes(CONNECTIONS_SOURCE)) {
    return null
  }

  const rootNode = root.root()
  const edits: Edit[] = []

  const filename = root.filename()
  const declaredLocalNames = collectDeclaredLocalNames(rootNode)
  const declaredReexportedNames = collectDeclaredReexportedNames(rootNode)
  const connectionTypeDefinitionObjects = processImports(rootNode, edits, filename, declaredLocalNames)
  processReexports(rootNode, edits, declaredReexportedNames)
  annotateRemovedConnectionTypeMembers(edits, connectionTypeDefinitionObjects)

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
