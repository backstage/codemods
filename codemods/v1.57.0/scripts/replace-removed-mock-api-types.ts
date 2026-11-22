import { importBindingOf } from '@jssg/utils/javascript/bindings'
import { listImports } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

import {
  importsFrom,
  references,
  renderImports,
  todoWriter,
} from './replace-removed-frontend-plugin-api-types-common.ts'
import type { Node } from './replace-removed-frontend-plugin-api-types-common.ts'

const SOURCE = '@backstage/frontend-test-utils'
const METHODS: Record<string, string> = {
  MockAlertApi: 'alert',
  MockAnalyticsApi: 'analytics',
  MockConfigApi: 'config',
  MockErrorApi: 'error',
  MockFeatureFlagsApi: 'featureFlags',
  MockFetchApi: 'fetch',
  MockPermissionApi: 'permission',
  MockStorageApi: 'storage',
  MockTranslationApi: 'translation',
  MockErrorApiOptions: 'error',
  MockFetchApiOptions: 'fetch',
  MockFeatureFlagsApiOptions: 'featureFlags',
  ErrorWithContext: 'error',
}
const REMOVED = new Set(Object.keys(METHODS))
const metric = useMetricAtom('replace-removed-mock-api-types')

function replacement(name: string, method: string, mockApis: string): string {
  if (name === 'ErrorWithContext') {
    return `ReturnType<ReturnType<typeof ${mockApis}.error>['getErrors']>[number]`
  }
  if (name.endsWith('Options')) {
    return `NonNullable<Parameters<typeof ${mockApis}.${method}>[0]>`
  }
  return `ReturnType<typeof ${mockApis}.${method}>`
}

function reexportTodo(name: string): string {
  const method = METHODS[name] ?? ''
  return `TODO(backstage-codemod): ${name} was removed from @backstage/frontend-test-utils in 1.57; export type ${name} = ${replacement(name, method, 'mockApis')} instead.`
}

function requiredUtilities(name: string): string[] {
  if (name.endsWith('Options')) {
    return ['NonNullable', 'Parameters']
  }
  return ['ReturnType']
}

const transform: Codemod<TSX> = async (root) => {
  const program = root.root()
  if (!program.text().includes(SOURCE)) {
    return null
  }
  const states = importsFrom(program, [SOURCE])
  const identifiers = program.findAll({
    rule: {
      any: [
        { kind: 'identifier' },
        { kind: 'type_identifier' },
        { kind: 'shorthand_property_identifier_pattern' },
        { kind: 'shorthand_property_identifier' },
      ],
    },
  })
  const usedNames = new Set(identifiers.map((node) => node.text()))
  const utilities = new Set<string>()
  for (const kind of [
    'type_alias_declaration',
    'interface_declaration',
    'class_declaration',
    'type_parameter',
    'enum_declaration',
  ] as const) {
    for (const node of program.findAll({ rule: { kind } })) {
      const name = node
        .children()
        .find((child) => child.is('identifier') || child.is('type_identifier'))
        ?.text()
      if (name && ['ReturnType', 'Parameters', 'NonNullable'].includes(name)) {
        utilities.add(name)
      }
    }
  }
  for (const node of program.findAll({ rule: { kind: 'import_specifier' } })) {
    const local = node.field('alias') ?? node.field('name')
    if (local && ['ReturnType', 'Parameters', 'NonNullable'].includes(local.text())) {
      utilities.add(local.text())
    }
  }

  function safeBinding(local: string): boolean {
    return !identifiers.some((identifier) => {
      if (identifier.text() !== local) {
        return false
      }
      const specifier = identifier.ancestors().find((node) => node.is('import_specifier'))
      if (specifier) {
        const statement = specifier.ancestors().find((node) => node.is('import_statement'))
        const source = statement ? (statement as Node).field('source')?.text().slice(1, -1) : undefined
        const name = specifier.field('name')
        const alias = specifier.field('alias') ?? name
        return source !== SOURCE || name.text() !== 'mockApis' || alias.text() !== local
      }
      if (identifier.ancestors().some((node) => node.is('import_statement'))) {
        return true
      }
      const binding = importBindingOf(identifier)
      return binding?.source !== SOURCE || binding.importedName !== 'mockApis'
    })
  }

  const existing = listImports(program, { from: SOURCE })
    .filter((item) => item.moduleType === 'esm')
    .flatMap((item) => item.specifiers)
    .find((spec) => spec.importedName === 'mockApis' && safeBinding(spec.localName))
  let mockApis = existing?.localName ?? 'mockApis'
  if (!existing && !safeBinding(mockApis)) {
    mockApis = 'backstageMockApis'
    let suffix = 2
    while (usedNames.has(mockApis)) {
      mockApis = `backstageMockApis${suffix++}`
    }
  }
  const todos = todoWriter(program)
  const edits: Edit[] = []
  let needsMockApis = false
  const origins = new Set<number>()
  for (const state of states) {
    for (const spec of state.specifiers) {
      const method = METHODS[spec.importedName]
      if (!REMOVED.has(spec.importedName) || !method) {
        continue
      }
      const binding = spec.node.field('alias') ?? spec.node.field('name')
      if (!binding) {
        continue
      }
      const refs = references(binding, root.filename())
      const types = refs.filter((ref) => ref.is('type_identifier'))
      const other = refs.filter((ref) => !ref.is('type_identifier'))
      for (const ref of other) {
        const reexport = ref.is('export_specifier') ? ref : ref.ancestors().find((node) => node.is('export_specifier'))
        const message = reexport ? reexportTodo(spec.importedName) : `TODO(backstage-codemod): use mockApis.${method}()`
        if (todos.add(reexport ?? ref, message)) {
          metric.increment({ action: reexport ? 'reexport-todo' : 'value-todo', name: spec.importedName })
        }
      }
      if (types.length && requiredUtilities(spec.importedName).some((name) => utilities.has(name))) {
        continue
      }
      if (types.length) {
        needsMockApis = true
        origins.add(state.node.id())
        const replacementText = replacement(spec.importedName, method, mockApis)
        for (const ref of types) {
          const parent = ref.parent()
          const target =
            parent?.is('generic_type') &&
            parent
              .children()
              .find((child) => child.isNamed())
              ?.id() === ref.id()
              ? parent
              : ref
          edits.push(target.replace(replacementText))
        }
      }
      if (!other.length) {
        spec.removed = true
        state.changed = true
      }
      if (types.length || !other.length) {
        metric.increment({ action: 'type-migrated', name: spec.importedName })
      }
    }
  }
  for (const node of program.findAll({ rule: { kind: 'export_statement' } })) {
    const source = node.field('source')?.text().slice(1, -1)
    if (source !== SOURCE) {
      continue
    }
    for (const spec of node.findAll({ rule: { kind: 'export_specifier' } })) {
      const name = spec.field('name')?.text() ?? ''
      if (REMOVED.has(name) && todos.add(node, reexportTodo(name))) {
        metric.increment({ action: 'reexport-todo', name })
      }
    }
  }
  if (needsMockApis && !existing) {
    const removed = states.flatMap((state) => state.specifiers.filter((spec) => spec.removed))
    const onlyType = removed.length > 0 && removed.every((spec) => spec.isTypeOnly)
    const originStates = states.filter((state) => origins.has(state.node.id()))
    const state = (!onlyType ? originStates.find((item) => !item.typeOnly) : undefined) ?? originStates[0]
    if (state) {
      const remaining = state.specifiers.filter((spec) => !spec.removed)
      if (onlyType && !remaining.length && !state.defaultName && !state.typeOnly) {
        // Replace an emptied inline-type declaration in place with `import type`.
        const importToken = state.node.children().find((child) => child.kind() === 'import')
        if (importToken) {
          const position = importToken.range().end.index
          edits.push({ startPos: position, endPos: position, insertedText: ' type' })
          state.typeOnly = true
        }
      }
      const typePrefix = onlyType && !state.typeOnly ? 'type ' : ''
      const alias = mockApis === 'mockApis' ? '' : ` as ${mockApis}`
      state.specifiers.push({
        node: state.named,
        importedName: 'mockApis',
        localName: mockApis,
        isTypeOnly: onlyType,
        text: `${typePrefix}mockApis${alias}`,
        removed: false,
      })
      state.changed = true
    }
  }
  edits.push(...renderImports(program, states), ...todos.edits())
  // An invalid generic such as MockFetchApi<MockConfigApi> can select nested
  // type nodes; the outer replacement subsumes the inner edit.
  const ordered = edits.sort((a, b) => a.startPos - b.startPos || b.endPos - a.endPos)
  const nonoverlapping: Edit[] = []
  for (const edit of ordered) {
    const previous = nonoverlapping.at(-1)
    if (previous && edit.startPos < previous.endPos) {
      continue
    }
    nonoverlapping.push(edit)
  }
  return Promise.resolve(nonoverlapping.length ? program.commitEdits(nonoverlapping) : null)
}

export default transform
