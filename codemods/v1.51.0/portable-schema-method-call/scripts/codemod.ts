import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('portable-schema-method-call')

const FRONTEND_PLUGIN_API = '@backstage/frontend-plugin-api'
const PORTABLE_SCHEMA_TYPE = 'PortableSchema'

/**
 * JSON Schema property names commonly accessed on PortableSchema.schema().
 */
const JSON_SCHEMA_PROPERTIES = new Set([
  '$ref',
  '$schema',
  'additionalProperties',
  'allOf',
  'anyOf',
  'const',
  'default',
  'definitions',
  'description',
  'enum',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'format',
  'items',
  'maxItems',
  'maxLength',
  'maximum',
  'minItems',
  'minLength',
  'minimum',
  'multipleOf',
  'not',
  'oneOf',
  'pattern',
  'properties',
  'required',
  'title',
  'type',
  'uniqueItems',
])

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\/]/g, '\\$&')
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

/**
 * Returns true when the file likely contains PortableSchema usage.
 */
function hasPortableSchemaContext(rootNode: SgNode<TSX>): boolean {
  const frontendApiImports = findStatementsFrom(rootNode, 'import_statement', FRONTEND_PLUGIN_API)
  if (frontendApiImports.length > 0) {
    return true
  }

  const portableSchemaRefs = rootNode.findAll({
    rule: {
      any: [
        { kind: 'type_identifier', regex: `^${escapeRegex(PORTABLE_SCHEMA_TYPE)}$` },
        { kind: 'identifier', regex: `^${escapeRegex(PORTABLE_SCHEMA_TYPE)}$` },
      ],
    },
  })

  return portableSchemaRefs.length > 0
}

function isJsonSchemaPropertyAccess(node: SgNode<TSX>): boolean {
  if (node.kind() !== 'member_expression') {
    return false
  }

  const prop = node.field('property')
  if (prop?.kind() !== 'property_identifier') {
    return false
  }

  return JSON_SCHEMA_PROPERTIES.has(prop.text())
}

/**
 * Rewrite `X.schema.<jsonSchemaProp>` to `X.schema().<jsonSchemaProp>`.
 * Handles optional chaining on the property access: `X.schema?.type` -> `X.schema()?.type`.
 */
function transformSchemaPropertyAccess(rootNode: SgNode<TSX>, edits: Edit[]): void {
  const schemaPropertyAccesses = rootNode.findAll({
    rule: {
      kind: 'member_expression',
      has: {
        kind: 'property_identifier',
        regex: '^schema$',
      },
    },
  })

  for (const schemaMember of schemaPropertyAccesses) {
    const schemaProp = schemaMember.field('property')
    if (schemaProp?.text() !== 'schema') {
      continue
    }

    const parent = schemaMember.parent()
    if (!parent) {
      continue
    }

    // Skip when schema is already called: `schema().type`
    if (parent.kind() === 'call_expression' && parent.field('function')?.id() === schemaMember.id()) {
      continue
    }

    // Only transform property reads like `schema.type`, not bare `schema` assignments.
    if (parent.kind() !== 'member_expression' || !isJsonSchemaPropertyAccess(parent)) {
      continue
    }

    edits.push({
      startPos: schemaProp.range().end.index,
      endPos: schemaProp.range().end.index,
      insertedText: '()',
    })

    migrationMetric.increment({
      action: 'schema-method-call-inserted',
      property: parent.field('property')?.text() ?? 'unknown',
    })
  }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  if (!hasPortableSchemaContext(rootNode)) {
    return null
  }

  transformSchemaPropertyAccess(rootNode, edits)

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
