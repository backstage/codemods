import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'

const COMMON = '@backstage/connections'
const BACKEND = '@backstage/connections-backend'
const BACKEND_EXPORTS = new Set([
  'connectionsServiceRef',
  'connectionsServiceFactory',
  'DefaultConnectionsService',
  'declareConnection',
])
const REMOVED_TYPES = new Set(['RootConnection', 'AnyRootConnection'])
const REVIEW =
  '// TODO(backstage-codemod): Review Connections namespace/dynamic accesses and migrate backend members manually.\n'
const REMOVED_REVIEW =
  '// TODO(backstage-codemod): RootConnection/AnyRootConnection have no automatic replacement; review manually.\n'
const COMMENT_REVIEW =
  '// TODO(backstage-codemod): Review commented Connections declarations before splitting this declaration.\n'

type Statement = SgNode<TSX, 'import_statement' | 'export_statement'>

interface Move {
  text: string
  typeOnly: boolean
}

interface Destination {
  node: Statement
  moves: Move[]
}

function sourceOf(node: Statement): string | null {
  return (
    node
      .field('source')
      ?.find({ rule: { kind: 'string_fragment' } })
      ?.text() ?? null
  )
}

function hasTrailingComment(node: Statement, source: string): boolean {
  const afterStatement = source.slice(node.range().end.index).split('\n', 1)[0]?.trimStart() ?? ''
  return /^(\/\/|\/\*)/.test(afterStatement)
}

function specifiers(node: Statement): SgNode<TSX>[] {
  const kind = node.kind() === 'import_statement' ? 'import_specifier' : 'export_specifier'
  return node.findAll({ rule: { kind } })
}

function nameOf(specifier: SgNode<TSX>): string | null {
  return specifier.find({ rule: { kind: 'identifier' } })?.text() ?? null
}

function isTypeOnly(node: Statement): boolean {
  return node.children().some((child) => child.text() === 'type')
}

function isTypeSpecifier(specifier: SgNode<TSX>): boolean {
  return specifier.children().some((child) => child.text() === 'type')
}

function quoteOf(node: Statement): string {
  return node.field('source')?.text().startsWith('"') ? '"' : "'"
}

function statementText(
  node: Statement,
  specs: Move[],
  packageName: string,
  typeOnly: boolean,
  includeDefault = true,
): string {
  const keyword = node.kind() === 'import_statement' ? 'import' : 'export'
  const defaultImport =
    keyword === 'import'
      ? node
          .find({ rule: { kind: 'import_clause' } })
          ?.children()
          .find((child) => child.kind() === 'identifier')
          ?.text()
      : null
  const statementType = typeOnly || (specs.every((spec) => spec.typeOnly) && !(includeDefault && defaultImport))
  const rendered = specs.map((spec) => {
    if (statementType) {
      return spec.text.replace(/^type\s+/, '')
    }
    return spec.typeOnly && !spec.text.startsWith('type ') ? `type ${spec.text}` : spec.text
  })
  const prefix = includeDefault && defaultImport ? `${defaultImport}, ` : ''
  return `${keyword} ${statementType ? 'type ' : ''}${prefix}{ ${rendered.join(', ')} } from ${quoteOf(node)}${packageName}${quoteOf(node)};`
}

function commentBefore(node: Statement, source: string, comment: string): string {
  const before = source.slice(0, node.range().start.index)
  return before.trimEnd().endsWith(comment.trim()) ? '' : comment
}

const transform: Codemod<TSX> = async (root) => {
  const program = root.root()
  const source = program.text()
  const statements = program.findAll({
    rule: { any: [{ kind: 'import_statement' }, { kind: 'export_statement' }] },
  }) as Statement[]
  const destinations: Destination[] = []
  const edits: Edit[] = []
  let migrated = false
  const backendImports = statements.filter(
    (node) => node.kind() === 'import_statement' && sourceOf(node) === BACKEND && specifiers(node).length > 0,
  )

  for (const node of statements) {
    if (sourceOf(node) !== COMMON) {
      continue
    }
    const named = specifiers(node)
    const hasNamespace =
      node.find({ rule: { kind: 'namespace_import' } }) !== null ||
      node.find({ rule: { kind: 'namespace_export' } }) !== null
    if (hasNamespace) {
      const comment = commentBefore(node, source, REVIEW)
      if (comment) {
        edits.push(node.replace(comment + node.text()))
      }
      continue
    }
    const removed = named.some((spec) => REMOVED_TYPES.has(nameOf(spec) ?? ''))
    const moved = named.filter((spec) => BACKEND_EXPORTS.has(nameOf(spec) ?? ''))
    if (!moved.length && !removed) {
      continue
    }
    if (node.findAll({ rule: { kind: 'comment' } }).length > 0 || hasTrailingComment(node, source)) {
      const comment = commentBefore(node, source, COMMENT_REVIEW)
      if (comment) {
        edits.push(node.replace(comment + node.text()))
      }
      continue
    }

    const typeOnly = isTypeOnly(node)
    const keep = named.filter((spec) => !BACKEND_EXPORTS.has(nameOf(spec) ?? ''))
    const review = removed ? commentBefore(node, source, REMOVED_REVIEW) : ''
    if (!moved.length) {
      if (review) {
        edits.push(node.replace(review + node.text()))
      }
      continue
    }

    const moving = moved.map((spec) => ({ text: spec.text(), typeOnly: typeOnly || isTypeSpecifier(spec) }))
    const remaining = keep.map((spec) => ({ text: spec.text(), typeOnly: typeOnly || isTypeSpecifier(spec) }))
    const defaultImport =
      node.kind() === 'import_statement' &&
      node
        .find({ rule: { kind: 'import_clause' } })
        ?.children()
        .some((child) => child.kind() === 'identifier')
    const retained = remaining.length
      ? statementText(node, remaining, COMMON, typeOnly)
      : defaultImport
        ? `import ${typeOnly ? 'type ' : ''}${node
            .find({ rule: { kind: 'import_clause' } })
            ?.children()
            .find((child) => child.kind() === 'identifier')
            ?.text()} from ${quoteOf(node)}${COMMON}${quoteOf(node)};`
        : ''

    const destination =
      node.kind() === 'import_statement'
        ? backendImports.find(
            (candidate) =>
              candidate !== node &&
              (moving.every((spec) => spec.typeOnly) || !isTypeOnly(candidate)) &&
              candidate.find({ rule: { kind: 'namespace_import' } }) === null &&
              candidate.find({ rule: { kind: 'comment' } }) === null &&
              !hasTrailingComment(candidate, source),
          )
        : undefined
    if (destination) {
      let entry = destinations.find((item) => item.node === destination)
      if (!entry) {
        entry = { node: destination, moves: [] }
        destinations.push(entry)
      }
      entry.moves.push(...moving)
      edits.push(node.replace(review + retained))
    } else {
      const added = statementText(node, moving, BACKEND, typeOnly, false)
      edits.push(node.replace(review + (retained ? `${retained}\n${added}` : added)))
    }
    migrated = true
  }

  if (migrated) {
    console.log(
      `[move-connections-backend-imports] ${root.filename()}: Check that the owning package declares ${BACKEND} as a direct dependency; choose its version manually.`,
    )
  }
  for (const { node, moves } of destinations) {
    const existing = specifiers(node).map((spec) => ({
      text: spec.text(),
      typeOnly: isTypeOnly(node) || isTypeSpecifier(spec),
    }))
    const unique = moves.filter(
      (move) =>
        !existing.some(
          (spec) =>
            spec.text.replace(/^type\s+/, '') === move.text.replace(/^type\s+/, '') && spec.typeOnly === move.typeOnly,
        ),
    )
    if (unique.length) {
      edits.push(node.replace(statementText(node, [...existing, ...unique], BACKEND, isTypeOnly(node))))
    }
  }
  const result = await Promise.resolve(edits.length ? program.commitEdits(edits) : null)
  return result
}

export default transform
