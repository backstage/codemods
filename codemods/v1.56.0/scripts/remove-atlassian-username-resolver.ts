import { importBindingOf } from '@jssg/utils/javascript/bindings'
import { addImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('remove-atlassian-username-resolver')

const ATLASSIAN_SOURCE = '@backstage/plugin-auth-backend-module-atlassian-provider'
const REMOVED_RESOLVER = 'usernameMatchingUserEntityName'
const REMOVED_NAMESPACE = 'atlassianSignInResolvers'
const REPLACEMENT_RESOLVER = 'emailLocalPartMatchingUserEntityName'

const TODO_MARKER = 'TODO(backstage-codemod)'
const TODO_LINE = `// ${TODO_MARKER}: consider emailMatchingUserEntityProfileEmail instead`

/**
 * The removed resolver collection reaches adopter code in two import shapes:
 * `import { atlassianSignInResolvers } from '...'` (named export) and
 * `import * as atlassianSignInResolvers from '...'` (namespace).
 */
interface NamespaceBinding {
  localName: string
  form: 'named' | 'namespace'
}

function namespaceBindingOf(node: SgNode<TSX>): NamespaceBinding | null {
  if (!node.is('identifier')) {
    return null
  }

  const binding = importBindingOf(node)
  if (!binding || binding.source !== ATLASSIAN_SOURCE) {
    return null
  }

  if (binding.importedName === REMOVED_NAMESPACE) {
    return { localName: binding.localName, form: 'named' }
  }

  if (binding.importedName === '*') {
    return { localName: binding.localName, form: 'namespace' }
  }

  return null
}

function namedBindingOf(node: SgNode<TSX>): { localName: string } | null {
  if (!node.is('identifier')) {
    return null
  }

  const binding = importBindingOf(node)
  if (!binding || binding.source !== ATLASSIAN_SOURCE || binding.importedName !== REMOVED_RESOLVER) {
    return null
  }

  return { localName: binding.localName }
}

function lineStartOf(source: string, index: number): number {
  return source.lastIndexOf('\n', index - 1) + 1
}

function lineIndentOf(source: string, index: number): string {
  const line = source.slice(lineStartOf(source, index), index)
  const match = line.match(/^[ \t]*/)
  return match?.[0] ?? ''
}

function insertTodoAbove(node: SgNode<TSX>, source: string, edits: Edit[]): void {
  const start = node.range().start.index
  const lineStart = lineStartOf(source, start)

  // Idempotency: skip when the previous non-empty line already carries the marker.
  const previousLineEnd = source.lastIndexOf('\n', Math.max(lineStart - 2, 0))
  const previousLine = source.slice(previousLineEnd + 1, lineStart)
  if (previousLine.includes(TODO_MARKER)) {
    return
  }

  const indent = lineIndentOf(source, start)
  edits.push({
    startPos: lineStart,
    endPos: lineStart,
    insertedText: `${indent}${TODO_LINE}\n`,
  })
}

function isInsideImport(node: SgNode<TSX>): boolean {
  return node.ancestors().some((ancestor) => ancestor.is('import_statement'))
}

/** Member expressions `atlassianSignInResolvers.usernameMatchingUserEntityName`. */
function findNamespaceResolverUses(rootNode: SgNode<TSX>): SgNode<TSX>[] {
  const uses: SgNode<TSX>[] = []

  for (const member of rootNode.findAll({ rule: { kind: 'member_expression' } })) {
    if (member.field('property')?.text() !== REMOVED_RESOLVER) {
      continue
    }

    const objectNode = member.field('object')
    if (objectNode && namespaceBindingOf(objectNode)) {
      uses.push(member)
    }
  }

  return uses
}

/** Reference sites of a directly-named `usernameMatchingUserEntityName` import. */
function findNamedResolverReferences(rootNode: SgNode<TSX>): SgNode<TSX>[] {
  const references: SgNode<TSX>[] = []

  for (const identifier of rootNode.findAll({ rule: { kind: 'identifier' } })) {
    if (identifier.text() !== REMOVED_RESOLVER || isInsideImport(identifier)) {
      continue
    }

    if (namedBindingOf(identifier)) {
      references.push(identifier)
    }
  }

  return references
}

interface ImportStatement {
  source: string
  statement: SgNode<TSX>
}

function findImportStatementsFrom(rootNode: SgNode<TSX>, source: string): ImportStatement[] {
  const statements: ImportStatement[] = []

  for (const statement of rootNode.findAll({ rule: { kind: 'import_statement' } })) {
    const sourceNode = statement.find({ rule: { kind: 'string_fragment' } })
    if (sourceNode?.text() === source) {
      statements.push({ source, statement })
    }
  }

  return statements
}

/** The import_specifier that imports `usernameMatchingUserEntityName` by name. */
function findRemovedNamedSpecifier(rootNode: SgNode<TSX>): SgNode<TSX> | null {
  for (const { statement } of findImportStatementsFrom(rootNode, ATLASSIAN_SOURCE)) {
    for (const specifier of statement.findAll({ rule: { kind: 'import_specifier' } })) {
      if (specifier.field('name')?.text() === REMOVED_RESOLVER) {
        return specifier
      }
    }
  }

  return null
}

/** The import_specifier that imports `atlassianSignInResolvers` by name. */
function findNamespaceCollectionSpecifier(rootNode: SgNode<TSX>): SgNode<TSX> | null {
  for (const { statement } of findImportStatementsFrom(rootNode, ATLASSIAN_SOURCE)) {
    for (const specifier of statement.findAll({ rule: { kind: 'import_specifier' } })) {
      if (specifier.field('name')?.text() === REMOVED_NAMESPACE) {
        return specifier
      }
    }
  }

  return null
}

/**
 * True when `localName` has no remaining uses outside import statements and
 * the member expressions this codemod already rewrites.
 */
function isLocalNameUnused(rootNode: SgNode<TSX>, localName: string, replacedObjectIds: Set<number>): boolean {
  for (const identifier of rootNode.findAll({ rule: { kind: 'identifier' } })) {
    if (identifier.text() !== localName || isInsideImport(identifier)) {
      continue
    }

    if (replacedObjectIds.has(identifier.id())) {
      continue
    }

    return false
  }

  return true
}

/** The namespace_import node (`* as ns`) for the given local name. */
function findNamespaceImportNode(rootNode: SgNode<TSX>, localName: string): SgNode<TSX> | null {
  for (const { statement } of findImportStatementsFrom(rootNode, ATLASSIAN_SOURCE)) {
    for (const candidate of statement.findAll({ rule: { kind: 'namespace_import' } })) {
      const identifier = candidate.children().find((child) => child.is('identifier'))
      if (identifier?.text() === localName) {
        return candidate
      }
    }
  }

  return null
}

function removeNamespaceImportEdit(namespaceImport: SgNode<TSX>): Edit | null {
  const statement = namespaceImport.ancestors().find((ancestor) => ancestor.is('import_statement'))
  if (!statement) {
    return null
  }

  const clause = namespaceImport.ancestors().find((ancestor) => ancestor.is('import_clause'))
  if (!clause) {
    return statement.replace('')
  }

  // `import def, * as ns from '...'` keeps the default import.
  const defaultIdentifier = clause
    .children()
    .find((child) => child.is('identifier') && child.range().start.index < namespaceImport.range().start.index)
  if (defaultIdentifier) {
    return {
      startPos: defaultIdentifier.range().end.index,
      endPos: namespaceImport.range().end.index,
      insertedText: '',
    }
  }

  return statement.replace('')
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const source = rootNode.text()
  const edits: Edit[] = []
  const replacedObjectIds = new Set<number>()
  const usedLocalNames = new Set<string>()
  let needsReplacementImport = false

  // 1. Replace `atlassianSignInResolvers.usernameMatchingUserEntityName` uses.
  const namespaceUses = findNamespaceResolverUses(rootNode)
  for (const use of namespaceUses) {
    edits.push(use.replace(REPLACEMENT_RESOLVER))
    insertTodoAbove(use, source, edits)

    const objectNode = use.field('object')
    const binding = objectNode ? namespaceBindingOf(objectNode) : null
    if (objectNode && binding) {
      replacedObjectIds.add(objectNode.id())
      usedLocalNames.add(binding.localName)
    }

    migrationMetric.increment({ action: 'resolver-replaced', form: 'namespace' })
  }

  // 2. Rename references of a directly-named import.
  const namedReferences = findNamedResolverReferences(rootNode)
  for (const reference of namedReferences) {
    edits.push(reference.replace(REPLACEMENT_RESOLVER))
    insertTodoAbove(reference, source, edits)
    migrationMetric.increment({ action: 'resolver-replaced', form: 'named' })
  }

  // 3. Rewrite the directly-named import specifier itself.
  const specifier = findRemovedNamedSpecifier(rootNode)
  if (specifier) {
    const aliasNode = specifier.field('alias')
    const replacementText = aliasNode ? `${REPLACEMENT_RESOLVER} as ${aliasNode.text()}` : REPLACEMENT_RESOLVER
    edits.push(specifier.replace(replacementText))
    migrationMetric.increment({ action: 'import-rewritten', form: 'named' })
  }

  // 4. Fix up the import of the removed resolver collection.
  for (const localName of usedLocalNames) {
    if (!isLocalNameUnused(rootNode, localName, replacedObjectIds)) {
      // Other members of the collection are still referenced: keep the import
      // and add the replacement resolver as its own named import.
      needsReplacementImport = true
      migrationMetric.increment({ action: 'collection-import-kept' })
      continue
    }

    const namespaceImport = findNamespaceImportNode(rootNode, localName)
    if (namespaceImport) {
      const removal = removeNamespaceImportEdit(namespaceImport)
      if (removal) {
        edits.push(removal)
        migrationMetric.increment({ action: 'namespace-import-removed' })
      }
      needsReplacementImport = true
      continue
    }

    // Named import of the collection: swap the specifier for the replacement.
    const collectionSpecifier = findNamespaceCollectionSpecifier(rootNode)
    if (collectionSpecifier) {
      const aliasNode = collectionSpecifier.field('alias')
      const replacementText = aliasNode ? `${REPLACEMENT_RESOLVER} as ${aliasNode.text()}` : REPLACEMENT_RESOLVER
      edits.push(collectionSpecifier.replace(replacementText))
      migrationMetric.increment({ action: 'import-rewritten', form: 'collection' })
    }
  }

  // 5. Ensure the replacement resolver is imported when we added references.
  if (needsReplacementImport) {
    const importEdit = addImport(rootNode, {
      type: 'named',
      specifiers: [{ name: REPLACEMENT_RESOLVER }],
      from: ATLASSIAN_SOURCE,
    })
    if (importEdit) {
      edits.push(importEdit)
    }
  }

  if (edits.length === 0) {
    return null
  }

  const result = await Promise.resolve(rootNode.commitEdits(edits))
  return result
}

export default transform
