import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'

const URL_TYPES = new Set([
  'aws-codecommit',
  'aws-s3',
  'azure',
  'azure-blob-storage',
  'bitbucket-cloud',
  'bitbucket-server',
  'gerrit',
  'gitea',
  'github',
  'gitlab',
  'google-gcs',
  'harness',
])
const TODO = '/* TODO(backstage-codemod): review ConnectionsService.find query for this connection type */ '

type Node = SgNode<TSX>

function directPairs(object: Node): Node[] {
  return object.children().filter((child) => child.kind() === 'pair')
}

function property(node: Node, key: string): boolean {
  const name = node.field(node.kind() === 'method_definition' ? 'name' : 'key')
  return (
    (name?.kind() === 'property_identifier' && name.text() === key) ||
    (name?.kind() === 'string' && (name.text() === `'${key}'` || name.text() === `"${key}"`)) ||
    (name?.kind() === 'computed_property_name' &&
      (name.text().replaceAll(/\s/g, '') === `['${key}']` || name.text().replaceAll(/\s/g, '') === `["${key}"]`))
  )
}

function localImports(root: Node, source: string, imported: string): Map<string, Node> {
  const names = new Map<string, Node>()
  for (const statement of root.findAll({ rule: { kind: 'import_statement' } })) {
    if (statement.field('source')?.text().slice(1, -1) !== source) {
      continue
    }
    for (const spec of statement.findAll({ rule: { kind: 'import_specifier' } })) {
      const identifiers = spec.children().filter((child) => child.kind() === 'identifier')
      if (identifiers[0]?.text() === imported) {
        const local = identifiers.at(-1)
        if (local) {
          names.set(local.text(), local)
        }
      }
    }
  }
  return names
}

function sameDefinition(reference: Node, declaration: Node): boolean {
  const definition = reference.definition()?.node
  return definition !== undefined && definition.range().start.index === declaration.range().start.index
}

function receiverBindings(root: Node): Node[] {
  const bindings: Node[] = []
  const serviceTypes = localImports(root, '@backstage/connections', 'ConnectionsService')
  if (serviceTypes.size) {
    for (const node of root.findAll({ rule: { kind: 'required_parameter' } })) {
      const name = node.field('pattern')
      const typeName = node
        .field('type')
        ?.children()
        .find((child) => child.kind() === 'type_identifier')
      const importedType = typeName && serviceTypes.get(typeName.text())
      if (name?.kind() === 'identifier' && typeName && importedType && sameDefinition(typeName, importedType)) {
        bindings.push(name)
      }
    }
    for (const node of root.findAll({ rule: { kind: 'variable_declarator' } })) {
      const name = node.field('name')
      const typeName = node
        .field('type')
        ?.children()
        .find((child) => child.kind() === 'type_identifier')
      const importedType = typeName && serviceTypes.get(typeName.text())
      if (name?.kind() === 'identifier' && typeName && importedType && sameDefinition(typeName, importedType)) {
        bindings.push(name)
      }
    }
  }

  const refs = new Map([
    ...localImports(root, '@backstage/connections-node', 'connectionsServiceRef'),
    ...localImports(root, '@backstage/connections', 'connectionsServiceRef'),
  ])
  if (!refs.size) {
    return bindings
  }

  for (const config of root.findAll({ rule: { kind: 'object' } })) {
    const deps = directPairs(config)
      .find((pair) => property(pair, 'deps'))
      ?.field('value')
    if (deps?.kind() !== 'object') {
      continue
    }
    const dependencyNames = new Set<string>()
    for (const pair of directPairs(deps)) {
      const key = pair.field('key')
      const value = pair.field('value')
      const importedRef = value && refs.get(value.text())
      if (
        key?.kind() === 'property_identifier' &&
        value?.kind() === 'identifier' &&
        importedRef &&
        sameDefinition(value, importedRef)
      ) {
        dependencyNames.add(key.text())
      }
    }
    if (!dependencyNames.size) {
      continue
    }
    const factories = [
      ...config.children().filter((child) => child.kind() === 'method_definition' && property(child, 'factory')),
      ...directPairs(config)
        .filter((pair) => property(pair, 'factory'))
        .map((pair) => pair.field('value'))
        .filter((value): value is Node => value?.kind() === 'arrow_function'),
    ]
    for (const factory of factories) {
      const first = factory
        .find({ rule: { kind: 'formal_parameters' } })
        ?.children()
        .find((child) => child.kind() === 'required_parameter')
      const pattern = first?.field('pattern')
      if (pattern?.kind() !== 'object_pattern') {
        continue
      }
      for (const name of pattern.children()) {
        if (name.kind() === 'shorthand_property_identifier_pattern' && dependencyNames.has(name.text())) {
          bindings.push(name)
        }
      }
    }
  }
  return bindings
}

function typedClassField(receiver: Node, serviceTypes: Map<string, Node>): boolean {
  if (receiver.kind() !== 'member_expression' || receiver.field('object')?.kind() !== 'this') {
    return false
  }
  const name = receiver.field('property')?.text()
  if (!name) {
    return false
  }
  let ancestor = receiver.parent()
  while (ancestor && ancestor.kind() !== 'class_declaration' && ancestor.kind() !== 'class') {
    if (
      ancestor.kind() === 'function_declaration' ||
      ancestor.kind() === 'function_expression' ||
      (ancestor.kind() === 'method_definition' &&
        (ancestor.parent()?.kind() !== 'class_body' ||
          ancestor.children().some((child) => child.kind() === 'static'))) ||
      (ancestor.kind() === 'public_field_definition' && ancestor.children().some((child) => child.kind() === 'static'))
    ) {
      return false
    }
    ancestor = ancestor.parent()
  }
  const body = ancestor?.children().find((child) => child.kind() === 'class_body')
  return (
    body?.children().some((field) => {
      if (field.kind() !== 'public_field_definition' || field.field('name')?.text() !== name) {
        return false
      }
      const typeName = field
        .field('type')
        ?.children()
        .find((child) => child.kind() === 'type_identifier')
      const importedType = typeName && serviceTypes.get(typeName.text())
      return !!(typeName && importedType && sameDefinition(typeName, importedType))
    }) ?? false
  )
}

const transform: Codemod<TSX> = async (root) => {
  const ast = root.root()
  const source = ast.text()
  const bindings = receiverBindings(ast)
  const serviceTypes = localImports(ast, '@backstage/connections', 'ConnectionsService')
  if (!bindings.length && !serviceTypes.size) {
    return null
  }
  const edits: Edit[] = []

  for (const call of ast.findAll({ rule: { kind: 'call_expression' } })) {
    const member = call.field('function')
    if (member?.kind() !== 'member_expression' || member.field('property')?.text() !== 'find') {
      continue
    }
    const receiver = member.field('object')
    if (
      !receiver ||
      !(
        (receiver.kind() === 'identifier' && bindings.some((binding) => sameDefinition(receiver, binding))) ||
        typedClassField(receiver, serviceTypes)
      )
    ) {
      continue
    }
    const args =
      call
        .field('arguments')
        ?.children()
        .filter((child) => child.isNamed()) ?? []
    const options = args.length === 1 ? args[0] : undefined
    if (options?.kind() !== 'object') {
      continue
    }
    const pairs = directPairs(options)
    if (
      pairs.some((pair) => property(pair, 'query')) ||
      options
        .children()
        .some(
          (child) =>
            (child.kind() === 'shorthand_property_identifier' && child.text() === 'query') ||
            (child.kind() === 'method_definition' && property(child, 'query')),
        )
    ) {
      continue
    }
    const urls = pairs.filter((pair) => property(pair, 'url'))
    const shorthandUrls = options
      .children()
      .filter((child) => child.kind() === 'shorthand_property_identifier' && child.text() === 'url')
    if (urls.length + shorthandUrls.length === 0) {
      continue
    }
    const types = pairs.filter((pair) => property(pair, 'type'))
    const type = types[0]?.field('value')
    const literalType = type?.kind() === 'string' ? type.text().slice(1, -1) : undefined
    const safe =
      types.length === 1 &&
      URL_TYPES.has(literalType ?? '') &&
      urls.length + shorthandUrls.length === 1 &&
      !options
        .children()
        .some(
          (child) =>
            child.kind() === 'spread_element' ||
            (child.kind() === 'pair' && child.field('key')?.kind() === 'computed_property_name') ||
            (child.kind() === 'method_definition' && property(child, 'url')),
        )

    if (safe) {
      const url = urls[0] ?? shorthandUrls[0]
      if (url) {
        edits.push(url.replace(`query: { ${url.text()} }`))
      }
    } else if (!source.slice(0, call.range().start.index).trimEnd().endsWith(TODO.trimEnd())) {
      edits.push({ startPos: call.range().start.index, endPos: call.range().start.index, insertedText: TODO })
    }
  }
  if (!edits.length) {
    return null
  }
  const result = await Promise.resolve(ast.commitEdits(edits))
  return result
}

export default transform
