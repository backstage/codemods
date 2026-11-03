import { getAllImports } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-bui-props-to-intersection')

const TARGET_TYPES = new Set(['ComboboxProps', 'SelectProps'])
const UI_SOURCE = '@backstage/ui'

/**
 * Build the type alias replacement text from interface declaration parts.
 */
function buildTypeAlias(name: string, typeParams: string | null, extendsTypes: string[], body: string): string {
  const typeParamStr = typeParams ?? ''

  // Strip outer braces and trim whitespace from body
  const inner = body.replace(/^\{/, '').replace(/\}$/, '').trim()

  const parts = [...extendsTypes]
  if (inner.length > 0) {
    parts.push(`{\n  ${inner}\n}`)
  }

  return `type ${name}${typeParamStr} = ${parts.join(' & ')};`
}

/**
 * Transform interface declarations that extend ComboboxProps or SelectProps
 * into type alias intersections.
 */
/**
 * Check if a type node in the extends clause references a target type,
 * handling both direct names and namespace-qualified names (UI.ComboboxProps).
 */
function isTargetType(child: SgNode<TSX>, localNames: Set<string>, namespaceAliases: string[]): boolean {
  const kind = child.kind()

  if (kind === 'type_identifier') {
    return localNames.has(child.text())
  }

  // Handle UI.ComboboxProps (nested_type_identifier in extends clause)
  if (kind === 'nested_type_identifier') {
    const nsNode = child.find({ rule: { kind: 'identifier' } })
    const typeNode = child.find({ rule: { kind: 'type_identifier' } })
    if (nsNode && typeNode && namespaceAliases.includes(nsNode.text()) && TARGET_TYPES.has(typeNode.text())) {
      return true
    }
  }

  // Handle generic types like ComboboxProps<T> or UI.ComboboxProps<T>
  if (kind === 'generic_type') {
    // Check for namespace-qualified generic: UI.ComboboxProps<T>
    const nestedType = child.find({ rule: { kind: 'nested_type_identifier' } })
    if (nestedType) {
      const nsNode = nestedType.find({ rule: { kind: 'identifier' } })
      const typeNode = nestedType.find({ rule: { kind: 'type_identifier' } })
      if (nsNode && typeNode && namespaceAliases.includes(nsNode.text()) && TARGET_TYPES.has(typeNode.text())) {
        return true
      }
    }
    // Check for direct generic: ComboboxProps<T>
    const typeIdent = child.find({ rule: { kind: 'type_identifier' } })
    return typeIdent !== null && localNames.has(typeIdent.text())
  }

  return false
}

function transformInterfaces(
  rootNode: SgNode<TSX>,
  localNames: Set<string>,
  namespaceAliases: string[],
  edits: Edit[],
): void {
  // Find all interface declarations that have an extends clause
  const interfaceDecls = rootNode.findAll({
    rule: {
      kind: 'interface_declaration',
      has: {
        kind: 'extends_type_clause',
      },
    },
  })

  for (const decl of interfaceDecls) {
    const extendsClause = decl.find({
      rule: { kind: 'extends_type_clause' },
    })
    if (!extendsClause) {
      continue
    }

    // Collect all types listed in the extends clause
    const extendsTypes: string[] = []
    let hasTargetType = false

    for (const child of extendsClause.children()) {
      const kind = child.kind()
      if (kind === 'type_identifier' || kind === 'generic_type' || kind === 'nested_type_identifier') {
        if (isTargetType(child, localNames, namespaceAliases)) {
          hasTargetType = true
        }
        extendsTypes.push(child.text())
      }
    }

    if (!hasTargetType) {
      continue
    }

    // Get the interface name — it's the type_identifier direct child of interface_declaration
    // (not inside the extends clause)
    const allTypeIdents = decl.findAll({ rule: { kind: 'type_identifier' } })
    // The first type_identifier that is NOT inside the extends clause is the interface name
    let interfaceName: string | null = null
    for (const ident of allTypeIdents) {
      // Check if this identifier is a child of the extends clause
      let insideExtends = false
      let parent = ident.parent()
      while (parent) {
        if (parent.kind() === 'extends_type_clause') {
          insideExtends = true
          break
        }
        if (parent.kind() === 'interface_declaration') {
          break
        }
        parent = parent.parent()
      }
      if (!insideExtends) {
        interfaceName = ident.text()
        break
      }
    }
    if (!interfaceName) {
      continue
    }

    // Get type parameters if present
    const typeParamsNode = decl.find({ rule: { kind: 'type_parameters' } })
    const typeParams = typeParamsNode ? typeParamsNode.text() : null

    // Get the interface body
    const bodyNode = decl.find({ rule: { kind: 'interface_body' } })
    if (!bodyNode) {
      continue
    }

    const replacement = buildTypeAlias(interfaceName, typeParams, extendsTypes, bodyNode.text())

    edits.push(decl.replace(replacement))
    migrationMetric.increment({
      action: 'interface-to-type',
      interface: interfaceName,
    })
  }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  // Step 1+2: Collect locally imported ComboboxProps / SelectProps names and
  // namespace aliases (`import * as UI`) from @backstage/ui imports
  const localNames = new Set<string>()
  for (const name of TARGET_TYPES) {
    for (const binding of getAllImports(rootNode, { type: 'named', name, from: UI_SOURCE })) {
      if (!binding.isNamespace) {
        localNames.add(binding.alias)
      }
    }
  }
  const namespaceAliases = getAllImports(rootNode, { type: 'default', from: UI_SOURCE })
    .filter((binding) => binding.isNamespace)
    .map((binding) => binding.alias)

  if (localNames.size === 0 && namespaceAliases.length === 0) {
    return null
  }

  // Step 3: Transform matching interface declarations
  transformInterfaces(rootNode, localNames, namespaceAliases, edits)

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
