import type { Codemod, Edit, GetSelector, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { getState } from 'codemod:workflow'

type Node = SgNode<TSX>
const API = '@backstage/frontend-plugin-api'
const TODO = 'TODO(backstage-codemod)'
const factories = new Set(['createExtension', 'createExtensionBlueprint'])
const blueprintMethods = new Set(['makeWithOverrides', 'override'])
// Only Zod v4 methods with expression-only arguments are lifted. Unknown methods stay for review.
const zodMethods = new Set([
  'string',
  'number',
  'boolean',
  'object',
  'array',
  'enum',
  'union',
  'literal',
  'record',
  'unknown',
  'any',
  'optional',
  'nullable',
  'default',
  'min',
  'max',
  'length',
  'email',
  'url',
  'uuid',
  'regex',
  'describe',
  'int',
  'positive',
  'nonnegative',
  'trim',
])

function property(object: Node, name: string): Node | undefined {
  return object.children().find((child) => child.is('pair') && child.field('key').text() === name)
}

function importedNames(root: Node, source: string): { named: Map<string, string>; namespace?: string } {
  const named = new Map<string, string>()
  let namespace: string | undefined
  for (const statement of root.findAll({ rule: { kind: 'import_statement' } })) {
    if (statement.field('source')?.text().slice(1, -1) !== source || statement.text().startsWith('import type ')) {
      continue
    }
    const clause = statement.find({ rule: { kind: 'import_clause' } })
    if (!clause) {
      continue
    }
    for (const specifier of clause.findAll({ rule: { kind: 'import_specifier' } })) {
      const identifiers = specifier.children().filter((child) => child.is('identifier'))
      if (identifiers[0]) {
        named.set(identifiers[0].text(), identifiers[1]?.text() ?? identifiers[0].text())
      }
    }
    const ns = clause.find({ rule: { kind: 'namespace_import' } })
    if (ns) {
      namespace = ns.find({ rule: { kind: 'identifier' } })?.text()
    }
  }
  return { named, namespace }
}

function member(node: Node): { receiver: Node; name: string } | undefined {
  if (!node.is('member_expression')) {
    return undefined
  }
  const receiver = node.field('object')
  const name = node.field('property')
  if (!name.is('property_identifier')) {
    return undefined
  }
  return { receiver, name: name.text() }
}

function shadowed(root: Node): Set<string> {
  const names = new Set<string>()
  for (const kind of [
    'variable_declarator',
    'required_parameter',
    'function_declaration',
    'class_declaration',
  ] as const) {
    for (const node of root.findAll({ rule: { kind } })) {
      const binding =
        node.field('name') ?? node.field('pattern') ?? node.children().find((child) => child.is('identifier'))
      if (binding?.is('identifier')) {
        names.add(binding.text())
      }
    }
  }
  return names
}

function unambiguousBlueprintBinding(root: Node, declaration: Node, name: string): boolean {
  for (const kind of [
    'variable_declarator',
    'required_parameter',
    'function_declaration',
    'class_declaration',
  ] as const) {
    for (const node of root.findAll({ rule: { kind } })) {
      if (node === declaration || node.range().start.index === declaration.range().start.index) {
        continue
      }
      const binding =
        node.field('name') ?? node.field('pattern') ?? node.children().find((child) => child.is('identifier'))
      if (binding?.is('identifier') && binding.text() === name) {
        return false
      }
    }
  }
  return true
}

function directCall(node: Node, names: ReturnType<typeof importedNames>, shadows: Set<string>): boolean {
  if (node.is('identifier')) {
    return !shadows.has(node.text()) && [...factories].some((name) => names.named.get(name) === node.text())
  }
  const access = member(node)
  return (
    !!access &&
    access.receiver.is('identifier') &&
    !shadows.has(access.receiver.text()) &&
    access.receiver.text() === names.namespace &&
    factories.has(access.name)
  )
}

function isExtensionCall(
  call: Node,
  names: ReturnType<typeof importedNames>,
  blueprints: Set<string>,
  shadows: Set<string>,
): boolean {
  const callee = call.field('function')
  if (!callee) {
    return false
  }
  if (directCall(callee, names, shadows)) {
    return true
  }
  const access = member(callee)
  return (
    !!access &&
    blueprintMethods.has(access.name) &&
    access.receiver.is('identifier') &&
    blueprints.has(access.receiver.text())
  )
}

function zodV4Available(file: string): boolean {
  // Only the nearest package boundary counts; no root/other package fallback.
  const normalized = file.replaceAll('\\', '/')
  let directory = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : ''
  for (;;) {
    const compatible = getState<boolean>(`zod-v4-package:${directory}`)
    if (compatible !== undefined) {
      return compatible
    }
    if (!directory) {
      return false
    }
    directory = directory.slice(0, directory.lastIndexOf('/'))
  }
}

function liftCallback(value: Node, binding: string): { text?: string; reason?: string } {
  if (!value.is('arrow_function')) {
    return { reason: 'non-inline schema factory' }
  }
  const param = value.field('parameter')
  const parameter = param?.is('identifier')
    ? param
    : param
        ?.children()
        .find((child) => child.is('required_parameter'))
        ?.find({ rule: { kind: 'identifier' } })
  const body = value.field('body')
  if (!parameter || !body.is('call_expression')) {
    return { reason: 'non-expression schema factory' }
  }
  const name = parameter.text()
  if (
    body.findAll({ rule: { kind: 'arrow_function' } }).length > 0 ||
    body.findAll({ rule: { kind: 'function_expression' } }).length > 0
  ) {
    return { reason: 'nested callback or closure' }
  }
  if (
    body.findAll({ rule: { kind: 'spread_element' } }).length > 0 ||
    body.findAll({ rule: { kind: 'shorthand_property_identifier' } }).length > 0 ||
    body.findAll({ rule: { kind: 'method_definition' } }).length > 0
  ) {
    return { reason: 'dynamic schema factory expression' }
  }
  const identifiers = body.findAll({ rule: { kind: 'identifier' } })
  if (!identifiers.length) {
    return { reason: 'factory does not use its Zod parameter' }
  }
  for (const id of identifiers) {
    const parent = id.parent()
    if (
      id.text() !== name ||
      !parent?.is('member_expression') ||
      parent.field('object').range().start.index !== id.range().start.index
    ) {
      return { reason: 'schema factory references a closure or unsupported identifier' }
    }
  }
  for (const access of body.findAll({ rule: { kind: 'member_expression' } })) {
    const name = member(access)?.name
    if (!name || !zodMethods.has(name)) {
      return { reason: 'unsupported Zod method or computed member' }
    }
  }
  const edits = identifiers.map((id) => id.replace(binding))
  return { text: body.commitEdits(edits) }
}

function migrateSchema(schema: Node, binding: string): { text?: string; reason?: string } {
  if (!schema.is('object')) {
    return { reason: 'schema is not an inline object' }
  }
  const pairs = schema.children().filter((child) => child.is('pair'))
  if (
    schema
      .children()
      .some((child) => ['spread_element', 'shorthand_property_identifier', 'method_definition'].includes(child.kind()))
  ) {
    return { reason: 'mixed or spread schema values' }
  }
  if (!pairs.length) {
    return { reason: 'empty or unknown schema' }
  }
  const edits: Edit[] = []
  for (const pair of pairs) {
    const value = pair.field('value')
    const lifted = liftCallback(value, binding)
    if (!lifted.text) {
      return { reason: lifted.reason }
    }
    edits.push(value.replace(lifted.text))
  }
  return { text: schema.commitEdits(edits) }
}

function withRemovedSchema(config: Node, schema: Node): string | undefined {
  const pairs = config.children().filter((child) => child.is('pair'))
  if (pairs.length === 1) {
    return undefined
  }
  const start = schema.range().start.index - config.range().start.index
  const end = schema.range().end.index - config.range().start.index
  const text = config.text()
  const after = text.slice(end)
  const before = text.slice(0, start)
  // Preserve all other properties; remove just the schema pair and one adjacent comma.
  const without = /^\s*,/.test(after)
    ? before.replace(/\s*$/, '') + after.replace(/^(\s*),/, '$1')
    : before.replace(/,\s*$/, '') + after
  return without
}

const transform: Codemod<TSX> = async (root) => {
  const ast = root.root()
  const api = importedNames(ast, API)
  if (!api.named.size && !api.namespace) {
    return null
  }
  const shadows = shadowed(ast)
  const blueprints = new Set<string>()
  for (const [name, local] of api.named) {
    if (name.endsWith('Blueprint') && !shadows.has(local)) {
      blueprints.add(local)
    }
  }
  for (const declaration of ast.findAll({ rule: { kind: 'variable_declarator' } })) {
    const value = declaration.field('value')
    const local = declaration.field('name')
    const callee = value?.is('call_expression') ? value.field('function') : undefined
    if (
      callee &&
      directCall(callee, api, shadows) &&
      local?.is('identifier') &&
      unambiguousBlueprintBinding(ast, declaration, local.text())
    ) {
      blueprints.add(local.text())
    }
  }
  const calls = ast
    .findAll({ rule: { kind: 'call_expression' } })
    .filter((call) => isExtensionCall(call, api, blueprints, shadows))
  if (!calls.length) {
    return null
  }
  const zod = importedNames(ast, 'zod/v4')
  const used = new Set(ast.findAll({ rule: { kind: 'identifier' } }).map((id) => id.text()))
  const existingBinding = zod.named.get('z') ?? zod.namespace
  const existing = existingBinding && !shadows.has(existingBinding) ? existingBinding : undefined
  let binding = existing ?? (used.has('z') ? 'backstageZodV4' : 'z')
  if (!existing && used.has(binding)) {
    let suffix = 2
    while (used.has(`backstageZodV4${suffix}`)) {
      suffix++
    }
    binding = `backstageZodV4${suffix}`
  }
  const edits: Edit[] = []
  let importNeeded = false
  const compatible = zodV4Available(root.relativeFilename())
  for (const call of calls) {
    const args = call.field('arguments')
    const options = args?.children().find((child) => child.is('object'))
    if (!options || args?.children().filter((child) => child.is('object')).length !== 1) {
      continue
    }
    const config = property(options, 'config')
    const wrapper = config?.field('value')
    if (!config || !wrapper?.is('object')) {
      continue
    }
    const schema = property(wrapper, 'schema')
    if (!schema) {
      continue
    }
    let reason: string | undefined
    if (
      property(options, 'configSchema') ||
      options
        .children()
        .some(
          (child) =>
            child.is('spread_element') ||
            (child.is('shorthand_property_identifier') && child.text() === 'configSchema'),
        ) ||
      options.children().filter((child) => child.is('pair') && child.field('key').text() === 'config').length !== 1 ||
      wrapper.children().filter((child) => child.is('pair') && child.field('key').text() === 'schema').length !== 1
    ) {
      reason = 'existing or potentially spread configSchema'
    } else if (!compatible) {
      reason = 'package-local Zod v4 dependency not confirmed'
    } else if (
      wrapper
        .children()
        .some((child) =>
          ['spread_element', 'shorthand_property_identifier', 'method_definition'].includes(child.kind()),
        )
    ) {
      reason = 'dynamic config wrapper'
    }
    // Replacing the config pair would discard comments between its key and value.
    else if (/\/\*|\/\//.test(config.text().slice(0, wrapper.range().start.index - config.range().start.index))) {
      reason = 'comment on config pair'
    } else if (
      /\/\*|\/\//.test(
        wrapper.text().slice(0, schema.range().start.index - wrapper.range().start.index) +
          wrapper.text().slice(schema.range().end.index - wrapper.range().start.index),
      )
    ) {
      reason = 'comment on config wrapper'
    }
    const schemaValue = schema.field('value')
    const migrated = reason || !schemaValue ? undefined : migrateSchema(schemaValue, binding)
    reason ??= migrated?.reason
    if (reason || !migrated?.text) {
      const start = config.range().start.index
      if (!/\/\* TODO\(backstage-codemod\):[^*]*\*\/\s*$/.test(ast.text().slice(Math.max(0, start - 200), start))) {
        edits.push({
          startPos: start,
          endPos: start,
          insertedText: `/* ${TODO}: ${reason ?? 'unsupported schema'}; migrate to Standard Schema manually */ `,
        })
      }
      continue
    }
    const remaining = withRemovedSchema(wrapper, schema)
    edits.push(config.replace(`${remaining ? `config: ${remaining}, ` : ''}configSchema: ${migrated.text}`))
    importNeeded ||= !existing
  }
  if (importNeeded) {
    const imports = ast.children().filter((child) => child.is('import_statement'))
    const last = imports.at(-1)
    const position = last?.range().end.index ?? 0
    edits.push({
      startPos: position,
      endPos: position,
      insertedText: `${last ? '\n' : ''}import { z as ${binding} } from 'zod/v4';${last ? '' : '\n'}`.replace(
        `z as z }`,
        'z }',
      ),
    })
  }
  if (!edits.length) {
    return null
  }
  const result = await Promise.resolve(ast.commitEdits(edits))
  return result
}

export const getSelector: GetSelector<TSX> = () => ({
  rule: {
    kind: 'import_statement',
    has: { kind: 'string', has: { kind: 'string_fragment', regex: '^@backstage/frontend-plugin-api$' } },
  },
})

export default transform
