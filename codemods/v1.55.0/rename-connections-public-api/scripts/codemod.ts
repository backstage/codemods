import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
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

const REMOVED_CONNECTION_TYPE_MEMBER_TODOS: Record<string, string> = {
  matchAuth:
    "/* TODO(backstage-codemod): 'matchAuth' was removed from ConnectionTypeDefinition in @backstage/connections@0.4.0; migrate this behavior manually. */",
  validate:
    "/* TODO(backstage-codemod): 'validate' was removed from ConnectionTypeDefinition in @backstage/connections@0.4.0; migrate this behavior manually. */",
}

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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

    result.push({
      specNode: spec,
      localNameNode,
      importedName: importedNameNode.text(),
      localName: localNameNode.text(),
      specText: spec.text(),
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

function isSafeConnectionAuthMatchTypeRef(refNode: SgNode<TSX>): boolean {
  return refNode.kind() === 'type_identifier'
}

function addTodoToSpecifier(specText: string, todo: string): string {
  if (specText.includes('TODO(backstage-codemod):')) {
    return specText
  }
  return `${specText} ${todo}`
}

interface BindingRename {
  bindingNode: SgNode<TSX>
  oldName: string
  newName: string
}

function getMappedName(importedName: string, statementImportedNames: Set<string>): string | undefined {
  const mapped = RENAME_MAP[importedName]
  if (!mapped) {
    return undefined
  }

  if (importedName !== 'ConnectionType') {
    return mapped
  }

  if (statementImportedNames.has('ConnectionTypeDefinition') && !statementImportedNames.has('ConnectionTypeKey')) {
    return undefined
  }

  return mapped
}

function processImports(rootNode: SgNode<TSX, 'program'>, edits: Edit[], filename: string): boolean {
  let shouldAnnotateRemovedMembers = false
  const importStatements = findStatementsFrom(rootNode, 'import_statement', CONNECTIONS_SOURCE)

  for (const imp of importStatements) {
    const source = imp.find({ rule: { kind: 'string_fragment' } })?.text()
    if (!source) {
      continue
    }

    const specifiers = extractSpecifiers(imp, 'import_specifier')
    if (specifiers.length === 0) {
      continue
    }

    const pendingRenames: BindingRename[] = []
    const outputById = new Map<number, string | null>()
    let statementChanged = false

    const statementImportedNames = new Set(specifiers.map((spec) => spec.importedName))

    const predictedLocalCounts = new Map<string, number>()
    const predictedImportedCounts = new Map<string, number>()

    for (const spec of specifiers) {
      let predictedImported = spec.importedName
      let predictedLocal = spec.localName

      const mappedName = getMappedName(spec.importedName, statementImportedNames)
      if (mappedName) {
        predictedImported = mappedName
        if (spec.localName === spec.importedName) {
          predictedLocal = mappedName
        }
      }

      predictedLocalCounts.set(predictedLocal, (predictedLocalCounts.get(predictedLocal) ?? 0) + 1)
      predictedImportedCounts.set(predictedImported, (predictedImportedCounts.get(predictedImported) ?? 0) + 1)
    }

    const canRewriteWholeStatement = isPureNamedStatement(imp, 'import')

    for (const spec of specifiers) {
      outputById.set(spec.specNode.id(), spec.specText)

      const mappedName = getMappedName(spec.importedName, statementImportedNames)
      if (mappedName) {
        if (spec.importedName === 'ConnectionType') {
          shouldAnnotateRemovedMembers = true
        }

        if (spec.localName !== spec.importedName) {
          const nextText = `${mappedName} as ${spec.localName}`
          if (nextText !== spec.specText) {
            outputById.set(spec.specNode.id(), nextText)
            statementChanged = true
            migrationMetric.increment({ action: 'import-renamed', from: spec.importedName, to: mappedName })
          }
          continue
        }

        const localCollision = (predictedLocalCounts.get(mappedName) ?? 0) > 1
        const importedCollision = (predictedImportedCounts.get(mappedName) ?? 0) > 1

        if (localCollision || importedCollision) {
          const nextText = `${mappedName} as ${spec.localName}`
          if (nextText !== spec.specText) {
            outputById.set(spec.specNode.id(), nextText)
            statementChanged = true
            migrationMetric.increment({ action: 'collision-aliased', from: spec.importedName, to: mappedName })
          }
          continue
        }

        outputById.set(spec.specNode.id(), mappedName)
        statementChanged = true
        pendingRenames.push({ bindingNode: spec.localNameNode, oldName: spec.localName, newName: mappedName })
        migrationMetric.increment({ action: 'import-renamed', from: spec.importedName, to: mappedName })
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

      const replacement =
        specTexts.length > 0 ? buildNamedStatement('import', specTexts, source, isTypeOnlyStatement(imp)) : ''

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

  return shouldAnnotateRemovedMembers
}

function processReexports(rootNode: SgNode<TSX, 'program'>, edits: Edit[]): void {
  const exportStatements = findStatementsFrom(rootNode, 'export_statement', CONNECTIONS_SOURCE)

  for (const exp of exportStatements) {
    const source = exp.find({ rule: { kind: 'string_fragment' } })?.text()
    if (!source) {
      continue
    }

    const specifiers = extractSpecifiers(exp, 'export_specifier')
    if (specifiers.length === 0) {
      continue
    }

    const outputById = new Map<number, string>()
    let statementChanged = false

    const statementImportedNames = new Set(specifiers.map((spec) => spec.importedName))

    const predictedExportedCounts = new Map<string, number>()

    for (const spec of specifiers) {
      const mappedName = getMappedName(spec.importedName, statementImportedNames)
      const predictedExported = mappedName && spec.localName === spec.importedName ? mappedName : spec.localName
      predictedExportedCounts.set(predictedExported, (predictedExportedCounts.get(predictedExported) ?? 0) + 1)
    }

    for (const spec of specifiers) {
      outputById.set(spec.specNode.id(), spec.specText)

      const mappedName = getMappedName(spec.importedName, statementImportedNames)
      if (mappedName) {
        if (spec.localName !== spec.importedName) {
          const nextText = `${mappedName} as ${spec.localName}`
          if (nextText !== spec.specText) {
            outputById.set(spec.specNode.id(), nextText)
            statementChanged = true
          }
          migrationMetric.increment({ action: 'reexport-renamed', from: spec.importedName, to: mappedName })
          continue
        }

        const exportedCollision = (predictedExportedCounts.get(mappedName) ?? 0) > 1
        if (exportedCollision) {
          const nextText = `${mappedName} as ${spec.localName}`
          if (nextText !== spec.specText) {
            outputById.set(spec.specNode.id(), nextText)
            statementChanged = true
          }
          migrationMetric.increment({ action: 'collision-aliased', from: spec.importedName, to: mappedName })
          continue
        }

        if (mappedName !== spec.specText) {
          outputById.set(spec.specNode.id(), mappedName)
          statementChanged = true
        }
        migrationMetric.increment({ action: 'reexport-renamed', from: spec.importedName, to: mappedName })
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

    if (!statementChanged) {
      continue
    }

    if (!isPureNamedStatement(exp, 'export')) {
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
      specifiers.map((spec) => outputById.get(spec.specNode.id()) ?? spec.specText),
      source,
      isTypeOnlyStatement(exp),
    )

    edits.push(exp.replace(replacement))
  }
}

function annotateRemovedConnectionTypeMembers(rootNode: SgNode<TSX, 'program'>, edits: Edit[]): void {
  const memberNodes = rootNode.findAll({
    rule: {
      kind: 'property_identifier',
      regex: '^(matchAuth|validate)$',
    },
  })

  for (const memberNode of memberNodes) {
    const memberName = memberNode.text()
    const todo = REMOVED_CONNECTION_TYPE_MEMBER_TODOS[memberName]
    if (!todo) {
      continue
    }

    const parentText = memberNode.parent()?.text() ?? ''
    if (parentText.includes('TODO(backstage-codemod):')) {
      continue
    }

    edits.push(memberNode.replace(`${memberName} ${todo}`))
    migrationMetric.increment({ action: 'todo-added', name: memberName, reason: 'removed-connection-type-member' })
  }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const filename = root.filename()
  const shouldAnnotateRemovedMembers = processImports(rootNode, edits, filename)
  processReexports(rootNode, edits)

  if (shouldAnnotateRemovedMembers) {
    annotateRemovedConnectionTypeMembers(rootNode, edits)
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
