import { getImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const FRONTEND_PLUGIN_API = '@backstage/frontend-plugin-api'
const OLD_NAME = 'AnyExtensionDataRef'
const NEW_NAME = 'ExtensionDataRef'

const renamedExports = useMetricAtom('any-extension-data-ref-renames')

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const imp = getImport(rootNode, {
    type: 'named',
    name: OLD_NAME,
    from: FRONTEND_PLUGIN_API,
  })
  if (!imp || imp.isNamespace || imp.moduleType !== 'esm') {
    return null
  }

  // Check if ExtensionDataRef is already imported from the same module
  const existingNewImport = getImport(rootNode, {
    type: 'named',
    name: NEW_NAME,
    from: FRONTEND_PLUGIN_API,
  })

  const specifier = imp.node.parent()
  if (!specifier || !specifier.is('import_specifier')) {
    return null
  }

  const identifiers = specifier.children().filter((c) => c.is('identifier'))
  const importedNameNode = identifiers[0] as SgNode<TSX> | undefined
  if (!importedNameNode) {
    return null
  }
  const localNameNode = (identifiers[1] as SgNode<TSX> | undefined) ?? importedNameNode

  // Determine the replacement name: if ExtensionDataRef is already imported with
  // an alias (e.g. `import { ExtensionDataRef as EDR }`), use that alias
  let replacementName = NEW_NAME
  if (existingNewImport) {
    // Check if the existing import is aliased
    const existingSpec = existingNewImport.node.parent()
    if (existingSpec?.is('import_specifier')) {
      const existingIds = existingSpec.children().filter((c) => c.is('identifier'))
      if (existingIds.length >= 2 && existingIds[1]) {
        replacementName = existingIds[1].text()
      }
    }

    // Remove the AnyExtensionDataRef specifier entirely
    const namedImports = specifier.parent()
    if (namedImports) {
      const allSpecs = namedImports.findAll({ rule: { kind: 'import_specifier' } })
      const remaining = allSpecs.filter((s) => s.id() !== specifier.id())

      if (remaining.length === 0) {
        const importStmt = specifier.ancestors().find((a) => a.is('import_statement'))
        if (importStmt) {
          edits.push(importStmt.replace(''))
        }
      } else if (remaining.length >= 3) {
        // Multi-line formatting for 3+ specifiers
        const indent = '  '
        const specTexts = remaining.map((s) => `${indent}${s.text()}`).join(',\n')
        edits.push(namedImports.replace(`{\n${specTexts},\n}`))
      } else {
        edits.push(namedImports.replace(`{ ${remaining.map((s) => s.text()).join(', ')} }`))
      }
    }
  } else {
    // Rename the imported name
    edits.push(importedNameNode.replace(NEW_NAME))
  }

  renamedExports.increment({ from: OLD_NAME, to: NEW_NAME })

  // Rename all local references if not aliased
  if (imp.alias !== OLD_NAME) {
    // Aliased: `import { AnyExtensionDataRef as X }` — only rename the imported name
  } else {
    for (const refGroup of localNameNode.references()) {
      if (refGroup.root.filename() !== root.filename()) {
        continue
      }
      for (const refNode of refGroup.nodes) {
        if (refNode.id() === localNameNode.id()) {
          continue
        }
        edits.push(refNode.replace(replacementName))
      }
    }
  }

  if (edits.length === 0) {
    return null
  }
  const result = await Promise.resolve(rootNode.commitEdits(edits))
  return result
}

export default transform
