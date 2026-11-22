import { importBindingOf, renameReferences, resolveDefinition } from '@jssg/utils/javascript/bindings'
import { listImports, updateImport } from '@jssg/utils/javascript/imports'
import { parse } from 'codemod:ast-grep'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

import { importsFrom, renderImports, todoWriter } from './replace-removed-frontend-plugin-api-types-common.ts'

const SOURCE = '@backstage/frontend-app-api'
const TODO =
  'TODO(backstage-codemod): advanced.apis was removed. Reuse a finalized app via advanced.sessionState, register custom APIs with ApiBlueprint, pass config via the top-level config option. For sign-in flows render the bootstrap app and use onFinalized() instead of finalize().'
const metric = useMetricAtom('replace-create-specialized-app')

function unwrap(node: SgNode<TSX>): SgNode<TSX> {
  let current = node
  while (['as_expression', 'satisfies_expression', 'parenthesized_expression'].includes(current.kind())) {
    const inner = current.children().find((child) => child.isNamed())
    if (!inner) {
      break
    }
    current = inner
  }
  return current
}

function uncertainMethod(node: SgNode<TSX>, property: string): boolean {
  return (
    node.is('method_definition') &&
    node
      .children()
      .some(
        (child) =>
          child.is('computed_property_name') ||
          ((child.is('property_identifier') || child.is('string')) &&
            child.text().replaceAll(/['"]/g, '') === property),
      )
  )
}

function uncertainOptions(argument: SgNode<TSX> | undefined): boolean {
  if (!argument) {
    return false
  }
  let object = unwrap(argument)
  if (object.is('identifier')) {
    const definition = resolveDefinition(object)
    if (!definition || definition.getRoot().filename() !== object.getRoot().filename()) {
      return true
    }
    const declarator = definition.is('variable_declarator') ? definition : definition.parent()
    if (!declarator?.is('variable_declarator')) {
      return true
    }
    const declaration = declarator.parent()
    if (!declaration?.is('lexical_declaration') || !declaration.text().startsWith('const ')) {
      return true
    }
    const value = declarator.field('value')
    if (!value) {
      return true
    }
    object = unwrap(value)
  }
  if (!object.is('object')) {
    return true
  }
  if (object.children().some((child) => child.is('spread_element'))) {
    return true
  }
  for (const pair of object.children().filter((child) => child.is('pair'))) {
    if (pair.field('key').text().replaceAll(/['"]/g, '') !== 'advanced') {
      continue
    }
    const value = unwrap(pair.field('value'))
    if (!value.is('object')) {
      return true
    }
    if (value.children().some((child) => child.is('spread_element'))) {
      return true
    }
    if (
      value
        .children()
        .some(
          (child) =>
            (child.is('pair') && child.field('key').text().replaceAll(/['"]/g, '') === 'apis') ||
            (child.is('shorthand_property_identifier') && child.text() === 'apis') ||
            uncertainMethod(child, 'apis'),
        )
    ) {
      return true
    }
    if (value.children().some((child) => child.is('pair') && child.field('key').is('computed_property_name'))) {
      return true
    }
  }
  // Shorthand or computed `advanced` cannot be inspected safely.
  return object
    .children()
    .some(
      (child) =>
        (child.is('shorthand_property_identifier') && child.text() === 'advanced') ||
        (child.is('pair') && child.field('key').is('computed_property_name')) ||
        uncertainMethod(child, 'advanced'),
    )
}

const transform: Codemod<TSX> = async (root) => {
  const program = root.root()
  if (!program.text().includes(SOURCE)) {
    return null
  }
  const imports = listImports(program, { from: SOURCE })
  const renames = [
    { name: 'createSpecializedApp', to: 'prepareSpecializedApp' },
    { name: 'CreateSpecializedAppOptions', to: 'PrepareSpecializedAppOptions' },
  ]
  const edits: Edit[] = []
  const todos = todoWriter(program)
  const removals: { name: string; alias?: string }[] = []
  const specs = imports.filter((item) => item.moduleType === 'esm').flatMap((item) => item.specifiers)
  const importRenames: { name: string; to: string; local: string; alias?: string }[] = []
  const identifiers = program.findAll({ rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] } })
  for (const spec of specs) {
    const rename = renames.find((entry) => entry.name === spec.importedName)
    const binding = spec.node.field('alias') ?? spec.node.field('name')
    if (!rename || !binding) {
      continue
    }
    metric.increment({ action: 'import-renamed', name: spec.importedName })
    // Keep an explicit old alias. Otherwise reuse an existing replacement binding.
    const existing =
      spec.localName === spec.importedName
        ? specs.find((candidate) => candidate.importedName === rename.to && candidate.isTypeOnly === spec.isTypeOnly)
        : undefined
    const newLocal = existing?.localName ?? rename.to
    const collision =
      spec.localName === spec.importedName &&
      identifiers.some((identifier) => {
        if (
          identifier.text() !== newLocal ||
          identifier.ancestors().some((ancestor) => ancestor.is('import_statement'))
        ) {
          return false
        }
        const target = importBindingOf(identifier)
        return target?.source !== SOURCE || target.importedName !== rename.to
      })
    if (existing && !collision) {
      removals.push({ name: spec.importedName, alias: spec.localName })
      edits.push(...renameReferences(binding, existing.localName, root.filename()))
    } else {
      importRenames.push({ ...rename, local: spec.localName, alias: collision ? spec.localName : undefined })
      if (spec.localName === spec.importedName && !collision) {
        edits.push(...renameReferences(binding, rename.to, root.filename()))
      }
    }
  }
  if (removals.length) {
    // removeImport's separator scanner indexes the source with byte offsets;
    // render the ESM clauses from AST nodes so preceding Unicode stays safe.
    const states = importsFrom(program, [SOURCE])
    for (const state of states) {
      for (const spec of state.specifiers) {
        if (removals.some((item) => item.name === spec.importedName && item.alias === spec.localName)) {
          spec.removed = true
          state.changed = true
        }
      }
    }
    edits.push(...renderImports(program, states))
  }
  const source = program.text()
  for (const call of program.findAll({ rule: { kind: 'call_expression' } })) {
    const callee = call.field('function')
    if (!callee?.is('identifier')) {
      continue
    }
    const binding = importBindingOf(callee)
    if (binding?.source !== SOURCE || binding.importedName !== 'createSpecializedApp') {
      continue
    }
    const args =
      call
        .field('arguments')
        ?.children()
        .filter((child) => child.isNamed() && !child.is('comment')) ?? []
    edits.push({ startPos: call.range().end.index, endPos: call.range().end.index, insertedText: '.finalize()' })
    if (uncertainOptions(args[0]) && todos.add(call, TODO)) {
      metric.increment({ action: 'todo' })
    }
    metric.increment({ action: 'call-migrated' })
  }
  edits.push(...todos.edits())
  const intermediate = edits.length ? program.commitEdits(edits) : source
  // Import removal and renaming can affect the same clause, so apply them in
  // separate parses rather than committing overlapping edits.
  const next = parse<TSX>('tsx', intermediate).root()
  const nextImports = listImports(next, { from: SOURCE })
  // updateImport also rewrites require destructuring, which this step does not detect.
  const importEdits = nextImports.some((item) => item.moduleType === 'cjs')
    ? nextImports
        .filter((item) => item.moduleType === 'esm')
        .flatMap((item) =>
          item.specifiers.flatMap((spec) => {
            const rename = importRenames.find(
              (entry) => entry.name === spec.importedName && entry.local === spec.localName,
            )
            const name = spec.node.field('name')
            if (!rename || !name) {
              return []
            }
            if (rename.alias) {
              const prefix = spec.node.text().startsWith('type ') ? 'type ' : ''
              return [spec.node.replace(`${prefix}${rename.to} as ${rename.alias}`)]
            }
            return [name.replace(rename.to)]
          }),
        )
    : (updateImport(next, { type: 'named', from: SOURCE, specifiers: importRenames }) ?? [])
  const result = importEdits.length ? next.commitEdits(importEdits) : edits.length ? intermediate : null
  return Promise.resolve(result)
}

export default transform
