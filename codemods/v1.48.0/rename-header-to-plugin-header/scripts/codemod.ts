import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('rename-header-to-plugin-header')

const RENAME_MAP: Record<string, string> = {
  Header: 'PluginHeader',
  HeaderProps: 'PluginHeaderProps',
  HeaderDefinition: 'PluginHeaderDefinition',
}

const TARGET_NAMES = new Set(Object.keys(RENAME_MAP))
const UI_SOURCE = '@backstage/ui'

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findImportStatementsFrom(rootNode: SgNode<TSX>, source: string): SgNode<TSX, 'import_statement'>[] {
  return rootNode.findAll({
    rule: {
      kind: 'import_statement',
      has: {
        kind: 'string',
        has: {
          kind: 'string_fragment',
          regex: `^${escapeRegex(source)}$`,
        },
      },
    },
  }) as SgNode<TSX, 'import_statement'>[]
}

interface RenameInfo {
  originalName: string
  localName: string
  newName: string
}

function collectRenameTargets(importStatements: SgNode<TSX, 'import_statement'>[], edits: Edit[]): RenameInfo[] {
  const renames: RenameInfo[] = []

  for (const imp of importStatements) {
    const nsImport = imp.find({ rule: { kind: 'namespace_import' } })
    if (nsImport) {
      // Namespace imports are handled separately via member expression renaming
      continue
    }

    for (const spec of imp.findAll({ rule: { kind: 'import_specifier' } })) {
      const identifiers = spec.findAll({
        rule: {
          any: [{ kind: 'identifier' }, { kind: 'type_identifier' }],
        },
      })

      const [importedNameNode] = identifiers
      if (!importedNameNode) {
        continue
      }
      const importedName = importedNameNode.text()
      if (!TARGET_NAMES.has(importedName)) {
        continue
      }

      const newName = RENAME_MAP[importedName]
      if (!newName) {
        continue
      }

      const localNameNode = identifiers[1] ?? importedNameNode
      const localName = localNameNode.text()

      // Rename the import specifier
      edits.push(importedNameNode.replace(newName))
      migrationMetric.increment({ action: 'import-renamed', from: importedName, to: newName })

      // If not aliased, we need to rename all usages
      if (localName === importedName) {
        renames.push({ originalName: importedName, localName, newName })
      }
    }
  }

  return renames
}

function collectNamespaceAliases(importStatements: SgNode<TSX, 'import_statement'>[]): string[] {
  const aliases: string[] = []
  for (const imp of importStatements) {
    const nsImport = imp.find({ rule: { kind: 'namespace_import' } })
    if (nsImport) {
      const aliasNode = nsImport.find({ rule: { kind: 'identifier' } })
      if (aliasNode) {
        aliases.push(aliasNode.text())
      }
    }
  }
  return aliases
}

function renameReferences(rootNode: SgNode<TSX>, renames: RenameInfo[], filename: string, edits: Edit[]): void {
  for (const rename of renames) {
    // Find all identifier references to this name
    const refs = rootNode.findAll({
      rule: {
        any: [
          { kind: 'identifier', regex: `^${escapeRegex(rename.localName)}$` },
          { kind: 'type_identifier', regex: `^${escapeRegex(rename.localName)}$` },
        ],
      },
    })

    // Track which nodes we've already renamed (import specifiers)
    const handledIds = new Set<number>()

    for (const ref of refs) {
      if (handledIds.has(ref.id())) {
        continue
      }

      // Skip the import specifier itself (already handled)
      const parent = ref.parent()
      if (parent?.is('import_specifier')) {
        continue
      }

      // Skip nodes that are inside other import statements from different sources
      const ancestorImport = ref.ancestors().find((a) => a.is('import_statement'))
      if (ancestorImport) {
        const sourceNode = ancestorImport.find({ rule: { kind: 'string_fragment' } })
        if (sourceNode && sourceNode.text() !== UI_SOURCE) {
          continue
        }
      }

      handledIds.add(ref.id())
      edits.push(ref.replace(rename.newName))
      migrationMetric.increment({ action: 'reference-renamed', from: rename.localName, to: rename.newName })
    }
  }
}

function renameNamespaceAccesses(rootNode: SgNode<TSX>, namespaceAliases: string[], edits: Edit[]): void {
  if (namespaceAliases.length === 0) {
    return
  }

  // Find member expressions like UI.Header, UI.HeaderProps, UI.HeaderDefinition
  for (const alias of namespaceAliases) {
    for (const [oldName, newName] of Object.entries(RENAME_MAP)) {
      const accesses = rootNode.findAll({
        rule: {
          kind: 'member_expression',
          has: {
            kind: 'property_identifier',
            regex: `^${escapeRegex(oldName)}$`,
          },
        },
      })

      for (const access of accesses) {
        const objNode = access.child(0)
        if (!objNode?.is('identifier') || objNode.text() !== alias) {
          continue
        }

        const propNode = access.find({
          rule: {
            kind: 'property_identifier',
            regex: `^${escapeRegex(oldName)}$`,
          },
        })

        if (propNode) {
          edits.push(propNode.replace(newName))
          migrationMetric.increment({ action: 'namespace-access-renamed', from: oldName, to: newName })
        }
      }
    }
  }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []
  const filename = root.filename()

  const uiImports = findImportStatementsFrom(rootNode, UI_SOURCE)
  if (uiImports.length === 0) {
    return null
  }

  const renames = collectRenameTargets(uiImports, edits)
  const namespaceAliases = collectNamespaceAliases(uiImports)

  if (renames.length === 0 && namespaceAliases.length === 0) {
    if (edits.length > 0) {
      return rootNode.commitEdits(edits)
    }
    return null
  }

  renameReferences(rootNode, renames, filename, edits)
  renameNamespaceAccesses(rootNode, namespaceAliases, edits)

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
