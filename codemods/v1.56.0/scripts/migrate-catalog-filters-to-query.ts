import { importBindingOf } from '@jssg/utils/javascript/bindings'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-catalog-filters-to-query')

const CATALOG_REACT_SOURCE = '@backstage/plugin-catalog-react'
const ENTITY_FILTER_TYPE = 'EntityFilter'
const FILTERS_METHOD = 'getCatalogFilters'
const QUERY_METHOD = 'getCatalogQuery'

const TODO_MARKER = 'TODO(backstage-codemod): translate getCatalogFilters to a filter predicate'

type FilterContext = 'class' | 'object'

function isEntityFilterTypeIdentifier(node: SgNode<TSX> | null): boolean {
  if (!node?.is('type_identifier') || node.text() !== ENTITY_FILTER_TYPE) {
    return false
  }

  const binding = importBindingOf(node)
  return binding?.source === CATALOG_REACT_SOURCE && binding.importedName === ENTITY_FILTER_TYPE
}

function classImplementsEntityFilter(classNode: SgNode<TSX>): boolean {
  const heritage = classNode.find({ rule: { kind: 'class_heritage' } })
  if (!heritage) {
    return false
  }

  const typeIdentifiers = heritage.findAll({ rule: { kind: 'type_identifier' } })
  return typeIdentifiers.some((typeNode) => isEntityFilterTypeIdentifier(typeNode))
}

function declaratorIsEntityFilterTyped(declarator: SgNode<TSX>): boolean {
  const typeAnnotation = declarator.find({ rule: { kind: 'type_annotation' } })
  if (!typeAnnotation) {
    return false
  }

  const typeIdentifier = typeAnnotation.find({ rule: { kind: 'type_identifier' } })
  return isEntityFilterTypeIdentifier(typeIdentifier)
}

/**
 * Resolves the context of a `getCatalogFilters` method definition: either a
 * member of a class implementing `EntityFilter`, or a property of an object
 * literal assigned to an `EntityFilter`-typed binding.
 */
function getFilterContext(method: SgNode<TSX>): FilterContext | null {
  const parent = method.parent()
  if (parent?.is('class_body')) {
    const classNode = parent.parent()
    if (classNode && classImplementsEntityFilter(classNode)) {
      return 'class'
    }
    return null
  }

  if (parent?.is('object')) {
    const grandParent = parent.parent()
    if (grandParent?.is('variable_declarator') && declaratorIsEntityFilterTyped(grandParent)) {
      return 'object'
    }
    return null
  }

  return null
}

function isLiteralValueNode(node: SgNode<TSX>): boolean {
  const kind = node.kind()
  return (
    kind === 'string' ||
    kind === 'number' ||
    kind === 'true' ||
    kind === 'false' ||
    kind === 'null' ||
    kind === 'undefined'
  )
}

function arrayElements(arrayNode: SgNode<TSX>): SgNode<TSX>[] {
  return arrayNode.children().filter((child) => ![',', '[', ']'].includes(child.kind()))
}

/** Builds `{ key: value }` or `{ $any: [{ key: v1 }, { key: v2 }] }` for one pair. */
function pairCondition(pair: SgNode<TSX>): string | null {
  const keyNode = pair.field('key')
  const valueNode = pair.field('value')
  if (!keyNode || !valueNode) {
    return null
  }

  const keyKind = keyNode.kind()
  if (keyKind !== 'string' && keyKind !== 'property_identifier') {
    return null
  }
  const keyText = keyNode.text()

  if (valueNode.is('array')) {
    const elements = arrayElements(valueNode)
    if (elements.length === 0 || !elements.every((element) => isLiteralValueNode(element))) {
      return null
    }

    if (elements.length === 1) {
      return `{ ${keyText}: ${elements[0]?.text()} }`
    }
    const conditions = elements.map((element) => `{ ${keyText}: ${element.text()} }`)
    return `{ $any: [${conditions.join(', ')}] }`
  }

  if (!isLiteralValueNode(valueNode)) {
    return null
  }

  return `{ ${keyText}: ${valueNode.text()} }`
}

/** Builds a single entry predicate: one condition collapses, several join with `$all`. */
function entryPredicate(entry: SgNode<TSX>): string | null {
  if (!entry.is('object')) {
    return null
  }

  const pairs = entry.children().filter((child) => child.is('pair'))
  if (pairs.length === 0) {
    return null
  }

  const conditions: string[] = []
  for (const pair of pairs) {
    const condition = pairCondition(pair)
    if (condition === null) {
      return null
    }
    conditions.push(condition)
  }

  if (conditions.length === 1) {
    return conditions[0] ?? null
  }
  return `{ $all: [${conditions.join(', ')}] }`
}

/**
 * Translates a literal `CatalogFilters[]` return value into a filter predicate
 * expression, or null when the return is computed/non-literal.
 */
function buildQueryPredicate(returnStatement: SgNode<TSX>): string | null {
  const argument = returnStatement.children().find((child) => !['return', ';'].includes(child.kind()))
  if (!argument?.is('array')) {
    return null
  }

  const entries = arrayElements(argument)
  if (entries.length === 0) {
    return 'undefined'
  }

  const predicates: string[] = []
  for (const entry of entries) {
    const predicate = entryPredicate(entry)
    if (predicate === null) {
      return null
    }
    predicates.push(predicate)
  }

  if (predicates.length === 1) {
    return predicates[0] ?? null
  }
  return `{ $any: [${predicates.join(', ')}] }`
}

function getSingleReturnStatement(method: SgNode<TSX>): SgNode<TSX> | null {
  const body = method.children().find((child) => child.is('statement_block'))
  if (!body) {
    return null
  }

  const returnStatements = body.findAll({ rule: { kind: 'return_statement' } })
  if (returnStatements.length !== 1) {
    return null
  }

  return returnStatements[0] ?? null
}

function lineIndentOf(source: string, index: number): string {
  const lineStart = source.lastIndexOf('\n', index - 1) + 1
  const line = source.slice(lineStart, index)
  const match = line.match(/^[ \t]*/)
  return match?.[0] ?? ''
}

function buildQueryMethod(indent: string, predicate: string | null): string {
  if (predicate === null) {
    return [
      `${indent}${QUERY_METHOD}() {`,
      `${indent}  // ${TODO_MARKER}`,
      `${indent}  return undefined;`,
      `${indent}}`,
    ].join('\n')
  }

  return [`${indent}${QUERY_METHOD}() {`, `${indent}  return ${predicate};`, `${indent}}`].join('\n')
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const source = rootNode.text()

  // Files that already define getCatalogQuery are considered migrated.
  if (source.includes(QUERY_METHOD)) {
    return null
  }

  const edits: Edit[] = []

  const methods = rootNode.findAll({
    rule: {
      kind: 'method_definition',
      has: { field: 'name', kind: 'property_identifier', regex: `^${FILTERS_METHOD}$` },
    },
  })

  for (const method of methods) {
    const context = getFilterContext(method)
    if (!context) {
      continue
    }

    const returnStatement = getSingleReturnStatement(method)
    const predicate = returnStatement ? buildQueryPredicate(returnStatement) : null
    const indent = lineIndentOf(source, method.range().start.index)

    const insertionStart = method.range().end.index
    edits.push({
      startPos: insertionStart,
      endPos: insertionStart,
      insertedText: `\n\n${buildQueryMethod(indent, predicate)}`,
    })

    migrationMetric.increment({
      action: 'getCatalogQuery-added',
      context,
      result: predicate === null ? 'todo' : 'literal',
    })
  }

  if (edits.length === 0) {
    return null
  }

  const result = await Promise.resolve(rootNode.commitEdits(edits))
  return result
}

export default transform
