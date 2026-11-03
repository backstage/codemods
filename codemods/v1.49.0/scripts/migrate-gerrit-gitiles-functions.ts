import { getImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const INTEGRATION_PKG = '@backstage/integration'

const RENAME_MAP = {
  parseGerritGitilesUrl: 'parseGitilesUrlRef',
  buildGerritGitilesArchiveUrl: 'buildGerritGitilesArchiveUrlFromLocation',
} as const

type DeprecatedExport = keyof typeof RENAME_MAP
const DEPRECATED_EXPORTS = Object.keys(RENAME_MAP) as DeprecatedExport[]

const renamedExports = useMetricAtom('gerrit-gitiles-renames')

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  for (const name of DEPRECATED_EXPORTS) {
    const imp = getImport(rootNode, { type: 'named', name, from: INTEGRATION_PKG })
    if (imp?.moduleType !== 'esm') {
      continue
    }

    const replacement = RENAME_MAP[name]

    if (imp.isNamespace) {
      // Handle: import * as alias from '@backstage/integration'; alias.oldName(...)
      const memberExprs = rootNode.findAll({
        rule: {
          kind: 'member_expression',
          all: [
            {
              has: {
                field: 'object',
                kind: 'identifier',
                regex: `^${imp.alias}$`,
              },
            },
            {
              has: {
                field: 'property',
                kind: 'property_identifier',
                regex: `^${name}$`,
              },
            },
          ],
        },
      })

      for (const expr of memberExprs) {
        const propNode = expr.field('property')
        if (propNode) {
          edits.push(propNode.replace(replacement))
        }
      }
      if (memberExprs.length > 0) {
        renamedExports.increment({ from: name, to: replacement })
      }
      continue
    }

    const specifier = imp.node.parent()
    if (!specifier || !specifier.is('import_specifier')) {
      continue
    }

    const identifiers = specifier.children().filter((c) => c.is('identifier'))
    const importedNameNode = identifiers[0] as SgNode<TSX> | undefined
    if (!importedNameNode) {
      continue
    }
    const localNameNode = (identifiers[1] as SgNode<TSX> | undefined) ?? importedNameNode

    renamedExports.increment({ from: name, to: replacement })
    edits.push(importedNameNode.replace(replacement))

    // Only rewrite local references when the binding is not aliased
    if (imp.alias !== name) {
      continue
    }

    for (const refGroup of localNameNode.references()) {
      if (refGroup.root.filename() !== root.filename()) {
        continue
      }
      for (const refNode of refGroup.nodes) {
        if (refNode.id() === localNameNode.id()) {
          continue
        }
        edits.push(refNode.replace(replacement))
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
