import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'

const SOURCE = '@backstage/connections'
const OLD = 'RootConnectionAuth'
const NEW = 'ConfiguredConnectionAuth'

function isConnectionsStatement(node: SgNode<TSX>): boolean {
  return (
    node
      .children()
      .find((child) => child.is('string'))
      ?.find({ rule: { kind: 'string_fragment' } })
      ?.text() === SOURCE
  )
}

function removeStatementPreservingComments(statement: SgNode<TSX>, source: string): Edit {
  const comments = statement.findAll({ rule: { kind: 'comment' } }).map((comment) => comment.text())
  if (comments.length) {
    return statement.replace(comments.join('\n'))
  }
  const { start, end } = statement.range()
  const lineStart = source.lastIndexOf('\n', start.index - 1) + 1
  const lineEnd = source.slice(end.index).match(/^[ \t]*\r?\n/)
  if (lineEnd && !source.slice(lineStart, start.index).trim()) {
    return { startPos: lineStart, endPos: end.index + lineEnd[0].length, insertedText: '' }
  }
  return statement.replace('')
}

function removeSpecifier(spec: SgNode<TSX>, siblings: SgNode<TSX>[], source: string): Edit {
  const index = siblings.findIndex((sibling) => sibling.id() === spec.id())
  const next = siblings[index + 1]
  const previous = siblings[index - 1]
  const start = next ? spec.range().start.index : previous?.range().end.index
  if (start === undefined) {
    throw new Error('Cannot remove the only specifier from a named import')
  }
  const end = next ? next.range().start.index : spec.range().end.index
  const comma = spec
    .parent()
    ?.children()
    .find((child) => child.text() === ',' && child.range().start.index >= start && child.range().end.index <= end)
  if (!comma) {
    throw new Error('Cannot locate the specifier separator')
  }
  // Preserve comments between specifiers; remove only whitespace and the obsolete specifier.
  const before = source.slice(next ? spec.range().end.index : start, comma.range().start.index)
  const after = source.slice(comma.range().end.index, next ? end : spec.range().start.index)
  const retained = before + after
  return { startPos: start, endPos: end, insertedText: retained.trim() ? retained : '' }
}

const transform: Codemod<TSX> = async (root) => {
  const source = root.source()
  if (!source.includes(OLD) || !source.includes(SOURCE)) {
    return null
  }
  const tree = root.root()
  const edits: Edit[] = []
  const imports = tree.findAll({ rule: { kind: 'import_statement' } }).filter(isConnectionsStatement)
  let alreadyImported = imports.some((statement) =>
    statement.findAll({ rule: { kind: 'import_specifier' } }).some((spec) => {
      const ids = spec.children().filter((child) => child.is('identifier'))
      return ids.length === 1 && ids[0]?.text() === NEW
    }),
  )

  for (const statement of imports) {
    const specs = statement.findAll({ rule: { kind: 'import_specifier' } })
    for (const spec of specs) {
      const identifiers = spec.children().filter((child) => child.is('identifier'))
      const [imported] = identifiers
      if (imported?.text() !== OLD) {
        continue
      }

      const unaliased = identifiers.length === 1
      if (unaliased && alreadyImported) {
        if (specs.length > 1) {
          edits.push(removeSpecifier(spec, specs, source))
        } else {
          const clause = statement.find({ rule: { kind: 'import_clause' } })
          const defaultImport = clause?.children().find((child) => child.is('identifier'))
          const named = clause?.find({ rule: { kind: 'named_imports' } })
          edits.push(
            defaultImport && named
              ? {
                  startPos: defaultImport.range().end.index,
                  endPos: named.range().end.index,
                  insertedText: '',
                }
              : removeStatementPreservingComments(statement, source),
          )
        }
      } else {
        edits.push(imported.replace(NEW))
        if (unaliased) {
          alreadyImported = true
        }
      }
      // An explicit alias is the local binding; only the imported name changes.
      if (!unaliased) {
        continue
      }

      for (const group of imported.references()) {
        if (group.root.filename() !== root.filename()) {
          continue
        }
        for (const ref of group.nodes) {
          if (ref.id() === imported.id()) {
            continue
          }
          if (ref.kind() === 'type_identifier' || ref.parent()?.kind() === 'export_specifier') {
            edits.push(ref.replace(NEW))
          }
        }
      }
    }

    const namespace = statement.find({ rule: { kind: 'namespace_import' } })
    const alias = namespace?.find({ rule: { kind: 'identifier' } })
    if (!alias) {
      continue
    }

    // Only references to this import binding: a same-spelled local namespace must not change.
    for (const group of alias.references()) {
      if (group.root.filename() !== root.filename()) {
        continue
      }
      for (const ref of group.nodes) {
        if (ref.id() === alias.id()) {
          continue
        }
        const parent = ref.parent()
        if (parent?.kind() !== 'nested_type_identifier') {
          continue
        }
        const member = parent.field('name') ?? parent.children().find((child) => child.is('type_identifier'))
        if (member?.text() === OLD) {
          edits.push(member.replace(NEW))
        }
      }
    }
  }

  const exports = tree.findAll({ rule: { kind: 'export_statement' } }).filter(isConnectionsStatement)
  let alreadyExported = exports.some((statement) =>
    statement.findAll({ rule: { kind: 'export_specifier' } }).some((spec) => {
      const ids = spec.children().filter((child) => child.is('identifier'))
      return ids.length === 1 && ids[0]?.text() === NEW
    }),
  )
  for (const statement of exports) {
    const specs = statement.findAll({ rule: { kind: 'export_specifier' } })
    for (const spec of specs) {
      const ids = spec.children().filter((child) => child.is('identifier'))
      const [imported] = ids
      if (imported?.text() !== OLD) {
        continue
      }
      if (ids.length === 1 && alreadyExported) {
        edits.push(
          specs.length > 1
            ? removeSpecifier(spec, specs, source)
            : removeStatementPreservingComments(statement, source),
        )
      } else {
        edits.push(imported.replace(NEW))
        if (ids.length === 1) {
          alreadyExported = true
        }
      }
    }
  }

  for (const member of tree.findAll({ rule: { kind: 'member_expression' } })) {
    const property = member.children().find((child) => child.is('property_identifier'))
    const call = member.children().find((child) => child.is('call_expression'))
    const args = call?.children().find((child) => child.is('arguments'))
    if (
      property?.text() !== OLD ||
      !call?.children().some((child) => child.is('import')) ||
      args
        ?.children()
        .find((child) => child.is('string'))
        ?.find({ rule: { kind: 'string_fragment' } })
        ?.text() !== SOURCE
    ) {
      continue
    }
    // Tree-sitter represents TS inline import types as member expressions (even before generic arguments).
    let context = member.parent()
    while (
      context &&
      context.kind() !== 'program' &&
      context.kind() !== 'type_alias_declaration' &&
      context.kind() !== 'type_annotation'
    ) {
      if (context.kind() === 'lexical_declaration' || context.kind() === 'expression_statement') {
        break
      }
      context = context.parent()
    }
    if (context?.kind() === 'type_alias_declaration' || context?.kind() === 'type_annotation') {
      edits.push(property.replace(NEW))
    }
  }

  return edits.length ? Promise.resolve(tree.commitEdits(edits)) : null
}

export default transform
