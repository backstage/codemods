import { importBindingOf, resolveDefinition } from '@jssg/utils/javascript/bindings'
import { getAllImports } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'

const SERVICE_TYPE = 'ConnectionsService'
const SERVICE_TYPE_SOURCE = '@backstage/connections'
const SERVICE_REF = 'connectionsServiceRef'
const SERVICE_REF_SOURCES = ['@backstage/connections-node', '@backstage/connections']

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
type Program = SgNode<TSX, 'program'>

function directPairs(object: Node): Node[] {
  return object.children().filter((child) => child.kind() === 'pair')
}

function property(node: Node, key: string): boolean {
  const name = node.field(node.kind() === 'method_definition' ? 'name' : 'key')
  return (
    (name?.kind() === 'property_identifier' && name.text() === key) ||
    (name?.kind() === 'string' && (name.text() === `'${key}'` || name.text() === `"${key}"`)) ||
    (name?.kind() === 'computed_property_name' &&
      name
        .children()
        .some((child) => child.kind() === 'string' && (child.text() === `'${key}'` || child.text() === `"${key}"`)))
  )
}

function escapedKey(node: Node): boolean {
  const name = node.field(node.kind() === 'method_definition' ? 'name' : 'key')
  return (
    ((name?.kind() === 'string' || name?.kind() === 'property_identifier') && name.text().includes('\\')) ||
    (name?.kind() === 'computed_property_name' &&
      name.children().some((child) => child.kind() === 'string' && child.text().includes('\\')))
  )
}

/** True when `node` is a use of `importedName` imported from one of `sources`. */
function isImportOf(node: Node, importedName: string, sources: readonly string[]): boolean {
  const binding = importBindingOf(node)
  return binding?.importedName === importedName && sources.includes(binding.source)
}

function isLocalBinding(reference: Node, declaration: Node): boolean {
  const definition = resolveDefinition(reference)
  return definition?.range().start.index === declaration.range().start.index
}

function fileHasServiceTypeImport(root: Program): boolean {
  return getAllImports(root, { type: 'named', name: SERVICE_TYPE, from: SERVICE_TYPE_SOURCE }).some(
    (item) => !item.isNamespace,
  )
}

function receiverBindings(root: Program): Node[] {
  const bindings: Node[] = []
  if (fileHasServiceTypeImport(root)) {
    for (const node of root.findAll({ rule: { kind: 'required_parameter' } })) {
      const name = node.field('pattern')
      const typeName = node
        .field('type')
        ?.children()
        .find((child) => child.kind() === 'type_identifier')
      if (name?.kind() === 'identifier' && typeName && isImportOf(typeName, SERVICE_TYPE, [SERVICE_TYPE_SOURCE])) {
        bindings.push(name)
      }
    }
    for (const node of root.findAll({ rule: { kind: 'variable_declarator' } })) {
      const name = node.field('name')
      const typeName = node
        .field('type')
        ?.children()
        .find((child) => child.kind() === 'type_identifier')
      if (name?.kind() === 'identifier' && typeName && isImportOf(typeName, SERVICE_TYPE, [SERVICE_TYPE_SOURCE])) {
        bindings.push(name)
      }
    }
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
      if (
        key?.kind() === 'property_identifier' &&
        value?.kind() === 'identifier' &&
        isImportOf(value, SERVICE_REF, SERVICE_REF_SOURCES)
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
        .filter(
          (value): value is Node => value?.kind() === 'arrow_function' || value?.kind() === 'function_expression',
        ),
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
        } else if (name.kind() === 'pair_pattern' && dependencyNames.has(name.field('key')?.text() ?? '')) {
          const local = name.field('value')
          if (local?.kind() === 'identifier') {
            bindings.push(local)
          }
        }
      }
    }
  }
  return bindings
}

function typedClassField(receiver: Node): boolean {
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
      if (field.kind() === 'method_definition' && field.field('name')?.text() === 'constructor') {
        return (
          field
            .children()
            .find((child) => child.kind() === 'formal_parameters')
            ?.children()
            .some((parameter) => {
              if (
                parameter.kind() !== 'required_parameter' ||
                parameter.field('pattern')?.text() !== name ||
                !parameter
                  .children()
                  .some((child) => child.kind() === 'accessibility_modifier' || child.kind() === 'readonly')
              ) {
                return false
              }
              const typeName = parameter
                .field('type')
                ?.children()
                .find((child) => child.kind() === 'type_identifier')
              return !!(typeName && isImportOf(typeName, SERVICE_TYPE, [SERVICE_TYPE_SOURCE]))
            }) ?? false
        )
      }
      if (field.kind() !== 'public_field_definition' || field.field('name')?.text() !== name) {
        return false
      }
      const typeName = field
        .field('type')
        ?.children()
        .find((child) => child.kind() === 'type_identifier')
      return !!(typeName && isImportOf(typeName, SERVICE_TYPE, [SERVICE_TYPE_SOURCE]))
    }) ?? false
  )
}

const transform: Codemod<TSX> = async (root) => {
  const ast = root.root()
  const source = ast.text()
  const bindings = receiverBindings(ast)
  if (!bindings.length && !fileHasServiceTypeImport(ast)) {
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
        (receiver.kind() === 'identifier' && bindings.some((binding) => isLocalBinding(receiver, binding))) ||
        typedClassField(receiver)
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
    const hasEscapedKey = options
      .children()
      .some(
        (child) =>
          ((child.kind() === 'pair' || child.kind() === 'method_definition') && escapedKey(child)) ||
          (child.kind() === 'shorthand_property_identifier' && child.text().includes('\\')),
      )
    if (urls.length + shorthandUrls.length === 0 && !hasEscapedKey) {
      continue
    }
    const types = pairs.filter((pair) => property(pair, 'type'))
    const type = types[0]?.field('value')
    const literalType = type?.kind() === 'string' ? type.text().slice(1, -1) : undefined
    const safe =
      types.length === 1 &&
      URL_TYPES.has(literalType ?? '') &&
      urls.length + shorthandUrls.length === 1 &&
      !hasEscapedKey &&
      !options
        .children()
        .some(
          (child) =>
            child.kind() === 'spread_element' ||
            (child.kind() === 'pair' && child.field('key')?.kind() === 'computed_property_name') ||
            (child.kind() === 'method_definition' &&
              (property(child, 'url') || child.field('name')?.kind() === 'computed_property_name')),
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
