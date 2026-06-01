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

function resolvePortableSchemaLocalNames(rootNode: SgNode<TSX>): Set<string> {
  const names = new Set<string>([PORTABLE_SCHEMA_TYPE])

  for (const imp of findStatementsFrom(rootNode, 'import_statement', FRONTEND_PLUGIN_API)) {
    for (const spec of imp.findAll({ rule: { kind: 'import_specifier' } })) {
      const importedName = spec.field('name')?.text()
      if (importedName !== PORTABLE_SCHEMA_TYPE) {
        continue
      }

      names.add(spec.field('alias')?.text() ?? importedName)
    }
  }

  return names
}

function importsPortableSchema(rootNode: SgNode<TSX>): boolean {
  for (const imp of findStatementsFrom(rootNode, 'import_statement', FRONTEND_PLUGIN_API)) {
    for (const spec of imp.findAll({ rule: { kind: 'import_specifier' } })) {
      if (spec.field('name')?.text() === PORTABLE_SCHEMA_TYPE) {
        return true
      }
    }
  }

  return false
}

function referencesPortableSchemaType(rootNode: SgNode<TSX>, portableSchemaNames: Set<string>): boolean {
  for (const name of portableSchemaNames) {
    const refs = rootNode.findAll({
      rule: {
        any: [
          { kind: 'type_identifier', regex: `^${escapeRegex(name)}$` },
          { kind: 'identifier', regex: `^${escapeRegex(name)}$` },
        ],
        not: { inside: { kind: 'import_specifier', stopBy: 'neighbor' } },
      },
    })

    if (refs.length > 0) {
      return true
    }
  }

  return false
}

/**
 * Returns true when the file likely contains PortableSchema usage.
 */
function hasPortableSchemaContext(rootNode: SgNode<TSX>): boolean {
  const portableSchemaNames = resolvePortableSchemaLocalNames(rootNode)
  return importsPortableSchema(rootNode) || referencesPortableSchemaType(rootNode, portableSchemaNames)
}

function typeAnnotationReferencesPortableSchema(
  typeAnnotation: SgNode<TSX>,
  portableSchemaNames: Set<string>,
): boolean {
  for (const name of portableSchemaNames) {
    const match = typeAnnotation.find({
      rule: {
        kind: 'type_identifier',
        regex: `^${escapeRegex(name)}$`,
      },
    })

    if (match) {
      return true
    }
  }

  return false
}

function isIdentifierTypedAsPortableSchema(identifier: SgNode<TSX>, portableSchemaNames: Set<string>): boolean {
  const def = identifier.definition()
  if (def?.kind === 'local') {
    const declarator = def.node
    if (declarator.kind() === 'variable_declarator') {
      const typeAnn = declarator.field('type')
      if (typeAnn && typeAnnotationReferencesPortableSchema(typeAnn, portableSchemaNames)) {
        return true
      }
    }

    if (declarator.kind() === 'required_parameter' || declarator.kind() === 'optional_parameter') {
      const typeAnn = declarator.field('type')
      if (typeAnn && typeAnnotationReferencesPortableSchema(typeAnn, portableSchemaNames)) {
        return true
      }
    }
  }

  let current: SgNode<TSX> | null = identifier.parent()
  while (current) {
    if (current.kind() === 'required_parameter' || current.kind() === 'optional_parameter') {
      const typeAnn = current.field('type')
      if (typeAnn && typeAnnotationReferencesPortableSchema(typeAnn, portableSchemaNames)) {
        return true
      }
    }

    current = current.parent()
  }

  return false
}

function isPortableSchemaReceiver(objectNode: SgNode<TSX>, portableSchemaNames: Set<string>): boolean {
  if (objectNode.kind() !== 'identifier') {
    return false
  }

  return isIdentifierTypedAsPortableSchema(objectNode, portableSchemaNames)
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
function transformSchemaPropertyAccess(rootNode: SgNode<TSX>, portableSchemaNames: Set<string>, edits: Edit[]): void {
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

    const receiver = schemaMember.field('object')
    if (!receiver || !isPortableSchemaReceiver(receiver, portableSchemaNames)) {
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

  const portableSchemaNames = resolvePortableSchemaLocalNames(rootNode)
  transformSchemaPropertyAccess(rootNode, portableSchemaNames, edits)

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
