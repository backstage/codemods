import { listImports } from '@jssg/utils/javascript/imports'
import { getLineIndent } from '@jssg/utils/javascript/style'
import type { Codemod, Edit } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-table-to-use-table-hook')

const BUI_SOURCE = '@backstage/ui'
const TODO_COMMENT = '/* TODO(backstage-codemod): Review Table migration — verify column config and pagination mode */'
const TODO_JSX_COMMENT =
  '{/* TODO(backstage-codemod): Migrate TableHeader/TableBody/TablePagination to new Table API */}'

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const buiImports = listImports(rootNode, { from: BUI_SOURCE })

  if (buiImports.length === 0) {
    return null
  }

  const importedNames = new Set(buiImports.flatMap((imp) => imp.specifiers.map((spec) => spec.importedName)))
  const hasTableImport = importedNames.has('Table')
  const hasUseTableImport = importedNames.has('useTable')

  // Only proceed if file uses the old Table-related imports
  if (!hasTableImport && !hasUseTableImport) {
    return null
  }

  // 1. Find TableHeader/TableBody/TablePagination usage and add TODO comments.
  //    Keep imports intact — the AI fixup step handles the actual rewrite.
  const tableComponents = new Set(['TableHeader', 'TableBody', 'TablePagination'])

  for (const imp of buiImports) {
    const foundComponents = imp.specifiers
      .filter((spec) => tableComponents.has(spec.importedName))
      .map((spec) => spec.localName)

    if (foundComponents.length > 0) {
      // Add TODO comments before JSX elements that use these components
      for (const name of foundComponents) {
        const jsxElements = rootNode.findAll({
          rule: {
            any: [
              { kind: 'jsx_self_closing_element', has: { kind: 'identifier', regex: `^${name}$` } },
              { kind: 'jsx_opening_element', has: { kind: 'identifier', regex: `^${name}$` } },
            ],
          },
        })

        for (const el of jsxElements) {
          // Navigate to the enclosing jsx_element (or self-closing element)
          const jsxNode = el.kind() === 'jsx_opening_element' ? el.parent() : el
          if (!jsxNode) {
            continue
          }

          const startPos = jsxNode.range().start.index
          const indent = getLineIndent(rootNode.text(), jsxNode)

          edits.push({
            startPos,
            endPos: startPos,
            insertedText: `${TODO_JSX_COMMENT}\n${indent}`,
          })
        }

        migrationMetric.increment({
          type: 'jsx-todo-added',
          action: name,
        })
      }
    }
  }

  // 2. Add TODO comments above useTable hook calls that use old API patterns.
  //    Keep the code intact — the AI fixup step handles the full refactor.
  const useTableCalls = rootNode.findAll({
    rule: {
      kind: 'variable_declarator',
      has: {
        kind: 'call_expression',
        has: {
          kind: 'identifier',
          regex: '^useTable$',
        },
      },
    },
  })

  for (const declarator of useTableCalls) {
    const callExpr = declarator.find({ rule: { kind: 'call_expression' } })
    if (!callExpr) {
      continue
    }

    // Check if the destructured return has old-style properties (data, paginationProps)
    const objectPattern = declarator.find({ rule: { kind: 'object_pattern' } })
    if (!objectPattern) {
      continue
    }

    const patternText = objectPattern.text()
    const hasOldData = /\bdata\b/.test(patternText)
    const hasOldPaginationProps = /\bpaginationProps\b/.test(patternText)

    if (!hasOldData && !hasOldPaginationProps) {
      continue
    }

    // Add TODO comment above the declaration
    const varDecl = declarator.parent()
    if (varDecl) {
      const startPos = varDecl.range().start.index
      const indent = getLineIndent(rootNode.text(), varDecl)

      edits.push({
        startPos,
        endPos: startPos,
        insertedText: `${TODO_COMMENT}\n${indent}`,
      })
    }

    migrationMetric.increment({
      type: 'useTable-hook',
      action: 'todo-added',
    })
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
