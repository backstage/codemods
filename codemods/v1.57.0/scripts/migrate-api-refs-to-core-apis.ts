import { importBindingOf, renameReferences } from '@jssg/utils/javascript/bindings'
import { addImport, listImports, removeImport } from '@jssg/utils/javascript/imports'
import { getLineIndent } from '@jssg/utils/javascript/style'
import { parse } from 'codemod:ast-grep'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const SOURCE = '@backstage/frontend-plugin-api'
const SOURCES = [SOURCE, `${SOURCE}/alpha`]
const metric = useMetricAtom('migrate-api-refs-to-core-apis')
const REFS: Record<string, string> = {
  analyticsApiRef: 'analytics',
  appLanguageApiRef: 'appLanguage',
  appThemeApiRef: 'appTheme',
  appTreeApiRef: 'appTree',
  configApiRef: 'config',
  dialogApiRef: 'dialog',
  discoveryApiRef: 'discovery',
  errorApiRef: 'error',
  featureFlagsApiRef: 'featureFlags',
  fetchApiRef: 'fetch',
  iconsApiRef: 'icons',
  identityApiRef: 'identity',
  routeResolutionApiRef: 'routeResolution',
  storageApiRef: 'storage',
  toastApiRef: 'toast',
  translationApiRef: 'translation',
  appLifecycleApiRef: 'internal.appLifecycle',
  oauthRequestApiRef: 'internal.oauthRequest',
  pluginHeaderActionsApiRef: 'internal.pluginHeaderActions',
  pluginWrapperApiRef: 'internal.pluginWrapper',
  swappableComponentsApiRef: 'internal.swappableComponents',
}
function refTarget(name: string): string | undefined {
  return REFS[name]
}

const SHADOW_TODO =
  '// TODO(backstage-codemod): migrate deprecated API refs to coreApis manually because the coreApis binding is shadowed.'
const EXPORT_TODO = '// TODO(backstage-codemod): migrate this deprecated API ref re-export to coreApis manually.'

function todo(root: SgNode<TSX, 'program'>, node: SgNode<TSX>, message: string): Edit | null {
  const source = root.text()
  const { line, column } = node.range().start
  if (source.split('\n')[line - 1]?.trim() === message) {
    return null
  }
  const indent = getLineIndent(source, node)
  const inline = column > indent.length
  let trailing = 0
  if (inline) {
    // Columns are UTF-8 bytes, not JS string indexes.
    let bytes = 0
    let before = ''
    for (const char of source.split('\n')[line] ?? '') {
      if (bytes >= column) {
        break
      }
      const point = char.codePointAt(0) ?? 0
      bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4
      before += char
    }
    trailing = before.match(/[ \t]*$/)?.[0].length ?? 0
  }
  metric.increment({ action: 'todo' })
  return {
    startPos: node.range().start.index - trailing,
    endPos: node.range().start.index,
    insertedText: `${inline ? '\n' : ''}${message}\n${indent}`,
  }
}

// ponytail: skip even unrelated scopes; restore scope analysis if this blocks common files.
function binds(node: SgNode<TSX> | null, name: string): boolean {
  if (!node) {
    return false
  }
  if (node.is('identifier') || node.is('type_identifier') || node.is('shorthand_property_identifier_pattern')) {
    return node.text() === name
  }
  if (node.is('pair_pattern')) {
    return binds(node.field('value'), name)
  }
  if (node.is('assignment_pattern')) {
    return binds(node.field('left'), name)
  }
  return node.children().some((child) => binds(child, name))
}

function hasLocalBinding(program: SgNode<TSX, 'program'>, name: string): boolean {
  return program
    .findAll({
      rule: {
        any: [
          { kind: 'variable_declarator' },
          { kind: 'required_parameter' },
          { kind: 'optional_parameter' },
          { kind: 'arrow_function' },
          { kind: 'function_declaration' },
          { kind: 'class_declaration' },
        ],
      },
    })
    .some((node) => binds(node.field('name') ?? node.field('pattern') ?? node.field('parameter'), name))
}

const transform: Codemod<TSX> = async (root) => {
  const program = root.root()
  if (!program.text().includes(SOURCE)) {
    return null
  }
  const imports = listImports(program, { from: SOURCES }).filter((item) => item.node.is('import_statement'))
  const allNamed = imports.flatMap((imp) =>
    imp.specifiers.filter((spec) => refTarget(spec.importedName)).map((spec) => ({ imp, spec })),
  )
  const blocked = new Set<string>()
  const exportTodos: Edit[] = []
  for (const statement of program.findAll({ rule: { kind: 'export_statement' } })) {
    const source = statement.field('source')?.text().slice(1, -1)
    let unsafe = false
    for (const spec of statement.findAll({ rule: { kind: 'export_specifier' } })) {
      const name = spec.field('name')?.text()
      if (!name) {
        continue
      }
      if (source !== undefined) {
        unsafe ||= SOURCES.includes(source) && Boolean(refTarget(name))
      } else if (allNamed.some(({ spec: imported }) => imported.localName === name)) {
        blocked.add(name)
        unsafe = true
      }
    }
    if (unsafe) {
      const edit = todo(program, statement, EXPORT_TODO)
      if (edit) {
        exportTodos.push(edit)
      }
    }
  }
  const named = allNamed.filter(({ spec }) => !blocked.has(spec.localName))

  const [current] = imports.flatMap((imp) =>
    imp.source === SOURCE ? imp.specifiers.filter((spec) => spec.importedName === 'coreApis') : [],
  )
  const local = current?.localName ?? 'coreApis'
  const [firstNamed] = named
  if (firstNamed) {
    const otherImport = listImports(program).some(
      (imp) =>
        imp.defaultName === local ||
        imp.namespaceName === local ||
        imp.specifiers.some(
          (spec) =>
            spec.localName === local &&
            spec.node.id() !== current?.node.id() &&
            !named.some((item) => item.spec.node.id() === spec.node.id()),
        ),
    )
    if (otherImport || hasLocalBinding(program, local)) {
      const edit = todo(program, firstNamed.imp.node, SHADOW_TODO)
      if (edit) {
        exportTodos.push(edit)
      }
      return exportTodos.length ? program.commitEdits(exportTodos) : null
    }
  }
  const edits: Edit[] = [...exportTodos]
  const refs = named.length
    ? program.findAll({ rule: { any: [{ kind: 'identifier' }, { kind: 'shorthand_property_identifier' }] } })
    : []
  const refsByPosition = new Map(refs.map((node) => [node.range().start.index, node]))
  for (const { spec } of named) {
    const binding = spec.node.field('alias') ?? spec.node.field('name')
    if (!binding) {
      continue
    }
    const replacement = `${local}.${refTarget(spec.importedName)}`
    for (const edit of renameReferences(binding, replacement, root.filename())) {
      // Shorthand keys must keep their original property name.
      const site = refsByPosition.get(edit.startPos)
      if (site?.is('shorthand_property_identifier')) {
        edit.insertedText = `${spec.localName}: ${replacement}`
      }
      edits.push(edit)
    }
  }
  for (const member of program.findAll({ rule: { kind: 'member_expression' } })) {
    const object = member.field('object')
    const property = member.field('property')
    if (!object?.is('identifier') || !property || !refTarget(property.text())) {
      continue
    }
    const binding = importBindingOf(object)
    if (binding?.importedName !== '*' || !SOURCES.includes(binding.source)) {
      continue
    }
    edits.push(property.replace(`coreApis.${refTarget(property.text())}`))
    metric.increment({ action: 'reference-migrated' })
  }
  const lines = program.text().split('\n')
  const mainImports = imports.filter((imp) => imp.source === SOURCE)
  let insertedInPlace = false
  for (const imp of imports) {
    const specs = named.filter((item) => item.imp.node.id() === imp.node.id()).map(({ spec }) => spec)
    if (!specs.length) {
      continue
    }
    for (const spec of specs) {
      metric.increment({ action: 'import-migrated', name: spec.importedName })
    }

    const clause = specs[0]?.node.parent()
    const comments = clause?.findAll({ rule: { kind: 'comment' } }) ?? []
    const emptied = specs.length === imp.specifiers.length && !imp.defaultName && !imp.namespaceName
    const inPlace =
      !current &&
      !insertedInPlace &&
      emptied &&
      ((imp.source === SOURCE && mainImports.length === 1) || (imp.source !== SOURCE && mainImports.length === 0))
    if (inPlace) {
      const commentText = comments.map((comment) => `${comment.text()}\n`).join('')
      edits.push(
        imp.node.replace(
          `${commentText}import { coreApis } from ${imp.quote}${SOURCE}${imp.quote}${imp.hasSemicolon ? ';' : ''}`,
        ),
      )
      insertedInPlace = true
      continue
    }
    if (clause && specs.length === imp.specifiers.length && comments.length) {
      // Preserve comments even when deleting the last specifier/declaration.
      const text = comments.map((comment) => comment.text()).join('\n')
      if (imp.defaultName) {
        edits.push({
          startPos: imp.node.range().start.index,
          endPos: imp.node.range().start.index,
          insertedText: `${text}\n`,
        })
        const comma = clause
          .parent()
          ?.children()
          .find((child) => child.is(','))
        if (comma) {
          edits.push({ startPos: comma.range().start.index, endPos: clause.range().end.index, insertedText: '' })
        } else {
          edits.push(clause.replace(''))
        }
      } else {
        edits.push(imp.node.replace(text))
      }
      continue
    }

    // removeImport slices JS strings with byte offsets for partial removals. For a
    // non-ASCII clause, delete AST nodes instead until the helper supports UTF-8.
    if (clause && specs.length < imp.specifiers.length && /[^\p{ASCII}]/u.test(imp.node.text())) {
      const children = clause.children()
      const used = new Set<number>()
      for (const spec of specs) {
        const index = children.findIndex((child) => child.id() === spec.node.id())
        const comma =
          children.slice(index + 1).find((child) => child.is(',') && !used.has(child.id())) ??
          children
            .slice(0, index)
            .reverse()
            .find((child) => child.is(',') && !used.has(child.id()))
        if (comma) {
          used.add(comma.id())
          edits.push(comma.replace(''))
        }
        edits.push(spec.node.replace(''))
      }
    } else {
      // Isolating the statement keeps CJS imports and preceding UTF-8 out of the helper's edits.
      const isolated = parse<TSX>('tsx', imp.node.text()).root()
      const removals =
        removeImport(isolated, {
          type: 'named',
          from: imp.source,
          specifiers: specs.map((spec) => ({ name: spec.importedName, alias: spec.localName })),
        }) ?? []
      for (const edit of removals) {
        const fullStatement =
          edit.startPos === 0 &&
          edit.endPos === imp.node.range().end.index - imp.node.range().start.index &&
          !edit.insertedText
        const line = lines[imp.node.range().end.line]
        const last = imp.node.text().split('\n').at(-1)
        const extra = fullStatement && imp.node.range().end.line < lines.length - 1 && line === last ? 1 : 0
        edits.push({
          ...edit,
          startPos: edit.startPos + imp.node.range().start.index,
          endPos: edit.endPos + imp.node.range().start.index + extra,
        })
      }
    }
  }
  if (!edits.length) {
    return null
  }
  const changed = await Promise.resolve(program.commitEdits(edits))
  if (!named.length) {
    return changed
  }
  // Reparse after removing imports so addImport can safely merge without overlapping edits.
  const updated = parse<TSX>('tsx', changed).root()
  const addition = addImport(updated, {
    type: 'named',
    from: SOURCE,
    specifiers: [{ name: 'coreApis', alias: local === 'coreApis' ? undefined : local }],
  })
  if (!addition) {
    return changed
  }
  // A parsed program can start after leading whitespace; inserting at byte zero
  // through commitEdits would fall outside that node's range.
  return addition.startPos === 0 && addition.endPos === 0
    ? addition.insertedText + changed
    : updated.commitEdits([addition])
}

export default transform
