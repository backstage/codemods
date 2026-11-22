import { importBindingOf } from '@jssg/utils/javascript/bindings'
import type { Codemod, Edit } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

import {
  importsFrom,
  references,
  renderImports,
  todoWriter,
  utf16IndexAtByte,
} from './replace-removed-frontend-plugin-api-types-common.ts'
import type { ImportState, Node, Specifier } from './replace-removed-frontend-plugin-api-types-common.ts'

const MAIN = '@backstage/frontend-plugin-api'
const SOURCES = [MAIN, `${MAIN}/alpha`]
const RENAMES: Record<string, string> = {
  PageTab: 'PageLayoutTab',
  PluginOptions: 'CreateFrontendPluginOptions',
  AnyApiRef: 'ApiRef',
  AnyApiFactory: 'ApiFactory',
}
const REMOVED = new Set([...Object.keys(RENAMES), 'ExtensionAttachTo', 'ProgressProps', 'IconComponent'])
const ICON_TODO =
  'TODO(backstage-codemod): IconComponent was removed from @backstage/frontend-plugin-api in 1.57. Use IconElement and pass <MyIcon /> instead of MyIcon (legacy code can import IconComponent from @backstage/core-plugin-api).'
const REEXPORT_REPLACEMENTS: Record<string, string> = {
  PageTab: 'PageLayoutTab',
  PluginOptions: 'CreateFrontendPluginOptions',
  ExtensionAttachTo: "Extension<unknown>['attachTo']",
  ProgressProps: '{}',
}
const REEXPORT_NAMES = new Set(Object.keys(REEXPORT_REPLACEMENTS))

function reexportTodo(name: string): string | null {
  if (name === 'IconComponent') {
    return ICON_TODO
  }
  const target = REEXPORT_NAMES.has(name) ? REEXPORT_REPLACEMENTS[name] : undefined
  return target
    ? `TODO(backstage-codemod): ${name} was removed from @backstage/frontend-plugin-api in 1.57; re-export ${target} instead.`
    : null
}

function heritageEntry(ref: Node): Node | null {
  const parent = ref.parent()
  const entry =
    parent?.is('generic_type') &&
    parent
      .children()
      .find((child) => child.isNamed())
      ?.id() === ref.id()
      ? parent
      : ref
  const clause = entry.parent()
  return clause && ['extends_type_clause', 'implements_clause', 'extends_clause'].includes(clause.kind()) ? entry : null
}

const metric = useMetricAtom('replace-removed-frontend-plugin-api-types')

function bindingNode(spec: Specifier): Node | null {
  return spec.node.field('alias') ?? spec.node.field('name')
}

function genericReplacement(ref: Node, replacement: string, removeArguments: boolean): Edit | null {
  const parent = ref.parent()
  if (
    removeArguments &&
    parent?.is('generic_type') &&
    parent
      .children()
      .find((child) => child.isNamed())
      ?.id() === ref.id()
  ) {
    return parent.replace(replacement)
  }
  return ref.text() === replacement ? null : ref.replace(replacement)
}

const transform: Codemod<TSX> = async (root) => {
  const program = root.root()
  if (!program.text().includes(MAIN) || ![...REMOVED].some((name) => program.text().includes(name))) {
    return null
  }
  const states = importsFrom(program, SOURCES)
  const identifiers = program.findAll({
    rule: {
      any: [{ kind: 'identifier' }, { kind: 'type_identifier' }, { kind: 'shorthand_property_identifier_pattern' }],
    },
  })
  const usedNames = new Set(identifiers.map((node) => node.text()))
  const edits: Edit[] = []
  const todos = todoWriter(program)
  const heritageRemovals = new Map<number, { clause: Node; entries: Set<number> }>()

  function safeBinding(local: string, imported: string, source: string): boolean {
    return !identifiers.some((identifier) => {
      if (identifier.text() !== local) {
        return false
      }
      const specifier = identifier.ancestors().find((node) => node.is('import_specifier'))
      if (specifier) {
        const statement = specifier.ancestors().find((node) => node.is('import_statement'))
        const moduleName = statement ? (statement as Node).field('source')?.text().slice(1, -1) : undefined
        const localNode = specifier.field('alias') ?? specifier.field('name')
        return moduleName !== source || specifier.field('name').text() !== imported || localNode.text() !== local
      }
      if (identifier.ancestors().some((node) => node.is('import_statement'))) {
        return true
      }
      const binding = importBindingOf(identifier)
      return binding?.source !== source || binding.importedName !== imported
    })
  }

  function uniqueName(base: string): string {
    let name = `Backstage${base}`
    let suffix = 2
    while (usedNames.has(name)) {
      name = `Backstage${base}${suffix++}`
    }
    usedNames.add(name)
    return name
  }

  function existingTarget(source: string, name: string): Specifier | undefined {
    return states
      .filter((state) => state.source === source)
      .flatMap((state) => state.specifiers)
      .find((spec) => !spec.removed && spec.importedName === name && safeBinding(spec.localName, name, source))
  }

  function specText(state: ImportState, origin: Specifier, imported: string, local: string): string {
    const prefix = !state.typeOnly && origin.isTypeOnly ? 'type ' : ''
    return `${prefix}${imported}${local === imported ? '' : ` as ${local}`}`
  }

  function addTarget(state: ImportState, origin: Specifier, imported: string): string {
    const existing = existingTarget(state.source, imported)
    if (existing) {
      return existing.localName
    }
    const local = safeBinding(imported, imported, state.source) ? imported : uniqueName(imported)
    state.specifiers.push({
      node: state.named,
      importedName: imported,
      localName: local,
      isTypeOnly: origin.isTypeOnly,
      text: specText(state, origin, imported, local),
      removed: false,
    })
    state.changed = true
    return local
  }

  for (const state of states) {
    // New replacement specifiers are appended while processing the original bindings.
    const originalSpecifiers = [...state.specifiers]
    for (const spec of originalSpecifiers) {
      const oldName = spec.importedName
      if (!REMOVED.has(oldName)) {
        continue
      }
      const binding = bindingNode(spec)
      if (!binding) {
        continue
      }
      const refs = references(binding, root.filename())
      const reexports = refs.map((ref) =>
        ref.is('export_specifier') ? ref : ref.ancestors().find((node) => node.is('export_specifier')),
      )
      const exportMessage = reexportTodo(oldName)
      for (const reexport of reexports) {
        if (reexport && exportMessage && todos.add(reexport, exportMessage)) {
          metric.increment({ action: 'reexport-todo' })
        }
      }
      if (oldName === 'IconComponent') {
        const firstUse = refs.find((_, index) => !reexports[index]) ?? (refs.length ? undefined : state.node)
        if (firstUse && todos.add(firstUse, ICON_TODO)) {
          metric.increment({ action: 'icon-todo' })
        }
        continue
      }
      const heritage = refs.map((ref) => heritageEntry(ref))
      for (const entry of heritage) {
        const clause = entry?.parent()
        if (oldName === 'ProgressProps' && entry && clause && !clause.children().some((child) => child.is('comment'))) {
          const group = heritageRemovals.get(clause.id()) ?? { clause, entries: new Set<number>() }
          group.entries.add(entry.id())
          heritageRemovals.set(clause.id(), group)
        }
      }
      const typeRefs = refs.filter(
        (ref, index) =>
          ref.is('type_identifier') &&
          !(heritage[index] && (oldName === 'ProgressProps' || oldName === 'ExtensionAttachTo')),
      )
      const hasValue =
        refs.some((ref, index) => !ref.is('type_identifier') && !heritage[index]) ||
        ((oldName === 'ExtensionAttachTo' || oldName === 'ProgressProps') &&
          heritage.some((entry) => entry && !heritageRemovals.has(entry.parent()?.id() ?? -1)))
      if (
        hasValue &&
        typeRefs.length === 0 &&
        !heritage.some((entry) => entry && heritageRemovals.has(entry.parent()?.id() ?? -1))
      ) {
        continue
      }
      let replacement = ''
      if (oldName === 'ProgressProps') {
        replacement = '{}'
        if (!hasValue) {
          spec.removed = true
        }
      } else if (oldName === 'ExtensionAttachTo') {
        const local = addTarget(state, spec, 'Extension')
        replacement = `${local}<unknown>['attachTo']`
        if (!hasValue) {
          spec.removed = true
        }
      } else {
        const target = RENAMES[oldName]
        if (!target) {
          continue
        }
        const existing = existingTarget(state.source, target)
        if (hasValue) {
          replacement = existing?.localName ?? addTarget(state, spec, target)
        } else if (existing) {
          replacement = existing.localName
          spec.removed = true
        } else {
          const alias =
            spec.localName !== oldName || !safeBinding(target, target, state.source) ? spec.localName : target
          replacement = alias
          spec.importedName = target
          spec.localName = alias
          spec.text = specText(state, spec, target, alias)
        }
      }
      state.changed = true
      for (const ref of typeRefs) {
        const edit = genericReplacement(
          ref,
          replacement,
          oldName === 'AnyApiRef' ||
            oldName === 'AnyApiFactory' ||
            oldName === 'ProgressProps' ||
            oldName === 'ExtensionAttachTo',
        )
        if (edit) {
          edits.push(edit)
        }
      }
      metric.increment({ action: 'type-migrated', name: oldName })
    }
  }

  for (const node of program.findAll({ rule: { kind: 'export_statement' } })) {
    const source = node.field('source')?.text().slice(1, -1)
    if (!source || !SOURCES.includes(source)) {
      continue
    }
    for (const spec of node.findAll({ rule: { kind: 'export_specifier' } })) {
      const message = reexportTodo(spec.field('name')?.text() ?? '')
      if (message && todos.add(node, message)) {
        metric.increment({ action: 'reexport-todo' })
      }
    }
  }
  for (const { clause, entries } of heritageRemovals.values()) {
    const children = clause.children().filter((child) => child.isNamed() && !child.is('comment'))
    const remaining = children.filter((child) => !entries.has(child.id()))
    if (!remaining.length) {
      const start = clause.range().start.index
      const source = program.text()
      const before = source.slice(0, utf16IndexAtByte(source, start))
      const whitespace = before.match(/[ \t]+$/)?.[0].length ?? 0
      edits.push({ startPos: start - whitespace, endPos: clause.range().end.index, insertedText: '' })
    } else {
      const keyword = clause.is('implements_clause') ? 'implements' : 'extends'
      edits.push(clause.replace(`${keyword} ${remaining.map((child) => child.text()).join(', ')}`))
    }
  }
  edits.push(...renderImports(program, states), ...todos.edits())
  return Promise.resolve(edits.length ? program.commitEdits(edits) : null)
}

export default transform
