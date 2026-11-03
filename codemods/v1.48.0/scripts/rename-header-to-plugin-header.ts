import { renameReferences } from '@jssg/utils/javascript/bindings'
import { listImports, updateImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('rename-header-to-plugin-header')

const RENAME_MAP: Record<string, string> = {
  Header: 'PluginHeader',
  HeaderProps: 'PluginHeaderProps',
  HeaderDefinition: 'PluginHeaderDefinition',
}

const UI_SOURCE = '@backstage/ui'

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

  const uiImports = listImports(rootNode, { from: UI_SOURCE })
  if (uiImports.length === 0) {
    return null
  }

  const namespaceAliases: string[] = []
  const renameSpecifiers: { name: string; to: string }[] = []
  // Local binding nodes of non-aliased target imports — their references need renaming too
  const localBindingRenames: { from: string; to: string; binding: SgNode<TSX> }[] = []

  for (const imp of uiImports) {
    if (imp.namespaceName) {
      namespaceAliases.push(imp.namespaceName)
    }

    for (const spec of imp.specifiers) {
      const to = RENAME_MAP[spec.importedName]
      if (!to) {
        continue
      }

      renameSpecifiers.push({ name: spec.importedName, to })
      migrationMetric.increment({ action: 'import-renamed', from: spec.importedName, to })

      if (spec.localName === spec.importedName) {
        const binding = spec.node.field('name')
        if (binding) {
          localBindingRenames.push({ from: spec.importedName, to, binding })
        }
      }
    }
  }

  if (renameSpecifiers.length > 0) {
    edits.push(...(updateImport(rootNode, { type: 'named', from: UI_SOURCE, specifiers: renameSpecifiers }) ?? []))
  }

  for (const rename of localBindingRenames) {
    for (const edit of renameReferences(rename.binding, rename.to, filename)) {
      edits.push(edit)
      migrationMetric.increment({ action: 'reference-renamed', from: rename.from, to: rename.to })
    }
  }

  renameNamespaceAccesses(rootNode, namespaceAliases, edits)

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
