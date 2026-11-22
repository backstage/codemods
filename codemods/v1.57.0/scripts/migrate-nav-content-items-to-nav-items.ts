import { importBindingOf } from '@jssg/utils/javascript/bindings'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

import {
  blueprintParams,
  functionFor,
  property,
  removeListItem,
  todoCollector,
  value,
} from './migrate-router-blueprint-to-app-root-wrapper-helpers.ts'

const metric = useMetricAtom('migrate-nav-content-items-to-nav-items')
const TODO =
  'TODO(backstage-codemod): items was removed; use navItems.rest() (item.href, item.title, item.icon is an element).'
type Node = SgNode<TSX>
const ITERATORS = new Set([
  'map',
  'flatMap',
  'forEach',
  'filter',
  'find',
  'findIndex',
  'some',
  'every',
  'reduce',
  'sort',
  'toSorted',
])

function fromImport(node: Node | null, name: string, source: string): boolean {
  if (!node) {
    return false
  }
  const found = importBindingOf(node)
  return found?.source === source && found.importedName === name
}

function firstParameter(fn: Node): Node | null {
  if (fn.is('arrow_function') && fn.field('parameter')) {
    return fn.field('parameter')
  }
  const params =
    fn.is('arrow_function') || fn.is('function_expression') || fn.is('function_declaration')
      ? fn.children().find((n) => n.is('formal_parameters'))
      : null
  const first = params?.children().find((n) => n.is('required_parameter') || n.is('optional_parameter'))
  return first?.field('pattern') ?? null
}

function hasDefinition(node: Node): boolean {
  try {
    return !!node.definition({ resolveExternal: false })
  } catch {
    return false
  }
}

function references(node: Node, scope: Node, filename: string): Node[] {
  try {
    return node
      .references()
      .filter((file) => file.root.filename() === filename)
      .flatMap((file) => file.nodes)
      .filter(
        (ref) =>
          ref.range().start.index >= scope.range().start.index && ref.range().end.index <= scope.range().end.index,
      )
  } catch {
    return []
  }
}

function isWritten(node: Node): boolean {
  for (const ancestor of node.ancestors()) {
    if (ancestor.is('assignment_expression')) {
      const left = ancestor.field('left')
      if (left.range().start.index <= node.range().start.index && left.range().end.index >= node.range().end.index) {
        return true
      }
    }
    if (ancestor.is('update_expression') || ancestor.is('type_query')) {
      return true
    }
    if (ancestor.is('arrow_function') || ancestor.is('function_declaration') || ancestor.is('function_expression')) {
      break
    }
  }
  return false
}

function patternEntry(pattern: Node, key: string): Node | null {
  return (
    pattern
      .children()
      .find(
        (n) =>
          (n.is('shorthand_property_identifier_pattern') && n.text() === key) ||
          (n.is('pair_pattern') && n.field('key').text() === key) ||
          (n.is('object_assignment_pattern') && n.child(0)?.text() === key),
      ) ?? null
  )
}

function localBinding(entry: Node): Node | null {
  if (entry.is('shorthand_property_identifier_pattern')) {
    return entry
  }
  if (entry.is('pair_pattern')) {
    const v = entry.field('value')
    return v.is('identifier') ? v : null
  }
  return null
}

function iterationSource(node: Node, itemSources: Set<number>): boolean {
  if (itemSources.has(node.id())) {
    return true
  }
  if (!node.is('call_expression')) {
    return false
  }
  const fn: Node = node.field('function')
  if (
    !fn.is('member_expression') ||
    !['filter', 'slice', 'sort', 'toSorted', 'reverse', 'toReversed'].includes(fn.field('property').text())
  ) {
    return false
  }
  return iterationSource(fn.field('object'), itemSources)
}

function callbackParameters(callback: Node, method: string): Node[] {
  if (!['reduce', 'sort', 'toSorted'].includes(method)) {
    const first = firstParameter(callback)
    return first ? [first] : []
  }
  const parameters = callback.children().find((n) => n.is('formal_parameters'))
  const params = parameters?.children().filter((n) => n.is('required_parameter') || n.is('optional_parameter')) ?? []
  const selected = method === 'reduce' ? params.slice(1, 2) : params.slice(0, 2)
  return selected.flatMap((p) => {
    const pattern = p.field('pattern')
    return pattern ? [pattern] : []
  })
}

const transform: Codemod<TSX> = (root) => {
  const program = root.root()
  const source = program.text()
  if (!source.includes('@backstage/plugin-app-react')) {
    return Promise.resolve(null)
  }
  const filename = root.filename()
  const edits: Edit[] = []
  const todos = todoCollector(source, () => metric.increment({ action: 'manual-review' }))
  const functions = new Map<number, Node>()
  for (const call of program.findAll({ rule: { kind: 'call_expression' } })) {
    const callee = call.field('function')
    if (
      !callee?.is('member_expression') ||
      !['make', 'makeWithOverrides'].includes(callee.field('property').text()) ||
      !fromImport(callee.field('object'), 'NavContentBlueprint', '@backstage/plugin-app-react')
    ) {
      continue
    }
    const resolved = blueprintParams(call)
    if (resolved.unresolved) {
      todos.add(call, TODO, null, true)
    }
    for (const params of resolved.params) {
      const component = value(property(params, 'component'))
      const fn = functionFor(component, filename)
      if (fn) {
        functions.set(fn.id(), fn)
      } else if (callee.field('property').text() === 'makeWithOverrides') {
        todos.add(call, TODO, null, true)
      }
    }
  }
  for (const fn of program.findAll({
    rule: { any: [{ kind: 'arrow_function' }, { kind: 'function_expression' }, { kind: 'function_declaration' }] },
  })) {
    const params = fn.children().find((n) => n.is('formal_parameters'))
    const parent = fn.parent()
    const declaredType = parent?.is('variable_declarator') ? parent.field('type') : null
    if (
      [params, declaredType].some((n) =>
        n
          ?.findAll({ rule: { kind: 'type_identifier' } })
          .some((id) => fromImport(id, 'NavContentComponentProps', '@backstage/plugin-app-react')),
      )
    ) {
      functions.set(fn.id(), fn)
    }
  }
  const touched = new Set<number>()
  function replace(node: Node, text: string, action: string): void {
    if (touched.has(node.id())) {
      return
    }
    touched.add(node.id())
    edits.push(node.replace(text))
    metric.increment({ action })
  }
  for (const fn of functions.values()) {
    if (!fn.text().includes('items')) {
      continue
    }
    const param = firstParameter(fn)
    if (!param) {
      continue
    }
    if (param.is('identifier') && !hasDefinition(param)) {
      todos.add(fn, TODO)
      continue
    }
    const paramRefs = param.is('identifier') ? references(param, fn, filename) : []
    const readsItems =
      (param.is('object_pattern') && !!patternEntry(param, 'items')) ||
      paramRefs.some((ref) => {
        const p = ref.parent()
        return (
          p !== null &&
          ((p.is('member_expression') &&
            p.field('object').id() === ref.id() &&
            p.field('property').text() === 'items') ||
            (p.is('variable_declarator') &&
              p.field('value')?.id() === ref.id() &&
              p.field('name').is('object_pattern') &&
              !!patternEntry(p.field('name'), 'items')))
        )
      })
    if (!readsItems) {
      continue
    }
    const writesItems = paramRefs.some((ref) => {
      const member = ref.parent()
      if (
        !member?.is('member_expression') ||
        member.field('object').id() !== ref.id() ||
        member.field('property').text() !== 'items'
      ) {
        return false
      }
      return isWritten(member)
    })
    if (writesItems) {
      todos.add(fn, TODO)
      continue
    }
    const shadowedNav =
      fn.findAll({ rule: { kind: 'variable_declarator' } }).some((d) => {
        const name = d.field('name')
        if (!name) {
          return false
        }
        return (
          (name.is('identifier') && name.text() === 'navItems') ||
          (name.is('object_pattern') && !!patternEntry(name, 'navItems'))
        )
      }) ||
      fn.findAll({ rule: { any: [{ kind: 'required_parameter' }, { kind: 'optional_parameter' }] } }).some((p) => {
        const pattern = p.field('pattern')
        return (
          pattern &&
          pattern.id() !== param.id() &&
          ((pattern.is('identifier') && pattern.text() === 'navItems') ||
            (pattern.is('object_pattern') && !!patternEntry(pattern, 'navItems')))
        )
      })
    if (shadowedNav) {
      todos.add(fn, TODO)
      continue
    }
    const patterns: Node[] = []
    const itemSources = new Set<number>()
    if (param.is('object_pattern')) {
      patterns.push(param)
    }
    if (param.is('identifier')) {
      for (const ref of paramRefs) {
        const parent = ref.parent()
        if (
          parent?.is('member_expression') &&
          parent.field('object').id() === ref.id() &&
          parent.field('property').text() === 'items'
        ) {
          itemSources.add(parent.id())
          const separator = parent.children().some((child) => child.is('optional_chain')) ? '?.' : '.'
          replace(parent, `${ref.text()}${separator}navItems.rest()`, 'items-reference-migrated')
        } else if (parent?.is('variable_declarator') && parent.field('value')?.id() === ref.id()) {
          const name = parent.field('name')
          if (name.is('object_pattern')) {
            patterns.push(name)
          }
        }
      }
    }
    for (const pattern of patterns) {
      const items = patternEntry(pattern, 'items')
      if (!items) {
        continue
      }
      const itemBinding = localBinding(items)
      if (!itemBinding || !hasDefinition(itemBinding)) {
        todos.add(fn, TODO)
        continue
      }
      const itemRefs = references(itemBinding, fn, filename)
      if (itemRefs.some(isWritten)) {
        todos.add(fn, TODO)
        continue
      }
      const nav = patternEntry(pattern, 'navItems')
      const navBinding = nav && localBinding(nav)
      if (nav && !navBinding) {
        todos.add(fn, TODO)
        continue
      }
      const local = navBinding?.text() ?? (items.is('pair_pattern') ? itemBinding.text() : 'navItems')
      if (nav) {
        edits.push(removeListItem(items, source))
      } else if (items.is('pair_pattern')) {
        replace(items.field('key'), 'navItems', 'items-parameter-migrated')
      } else {
        replace(items, 'navItems', 'items-parameter-migrated')
      }
      for (const ref of itemRefs) {
        itemSources.add(ref.id())
        if (ref.is('shorthand_property_identifier')) {
          replace(ref, `${ref.text()}: ${local}.rest()`, 'items-reference-migrated')
          todos.add(fn, TODO)
        } else {
          replace(ref, `${local}.rest()`, 'items-reference-migrated')
        }
      }
    }
    if (!itemSources.size) {
      continue
    }
    for (const node of fn.findAll({ rule: { any: [{ kind: 'identifier' }, { kind: 'member_expression' }] } })) {
      if (!itemSources.has(node.id())) {
        continue
      }
      const parent = node.parent()
      if (!parent?.is('member_expression') || parent.field('object').id() !== node.id()) {
        todos.add(fn, TODO)
      }
    }
    for (const call of fn.findAll({ rule: { kind: 'call_expression' } })) {
      const callee = call.field('function')
      if (!callee?.is('member_expression')) {
        continue
      }
      const method = callee.field('property').text()
      const receiver = callee.field('object')
      const args = call.field('arguments')?.children() ?? []
      const callback = args.find((n) => n.is('arrow_function') || n.is('function_expression'))
      if (!iterationSource(receiver, itemSources)) {
        if (
          ITERATORS.has(method) &&
          receiver
            .findAll({ rule: { any: [{ kind: 'identifier' }, { kind: 'member_expression' }] } })
            .some((n) => itemSources.has(n.id()))
        ) {
          todos.add(fn, TODO)
        }
        continue
      }
      if (!ITERATORS.has(method)) {
        if (callback) {
          todos.add(fn, TODO)
        }
        continue
      }
      if (!callback) {
        if (!(['sort', 'toSorted'].includes(method) && !args.some((n) => n.isNamed()))) {
          todos.add(fn, TODO)
        }
        continue
      }
      const items = callbackParameters(callback, method)
      if (!items.length || items.some((item) => !item.is('identifier'))) {
        todos.add(fn, TODO)
        continue
      }
      for (const item of items) {
        for (const ref of references(item, callback, filename)) {
          const parent = ref.parent()
          if (parent?.is('member_expression') && parent.field('object').id() === ref.id()) {
            const prop = parent.field('property')
            if (prop.text() === 'to' || prop.text() === 'text') {
              replace(prop, prop.text() === 'to' ? 'href' : 'title', 'item-field-migrated')
            }
            if (prop.text() !== 'icon') {
              continue
            }
            const container = parent.parent()
            if (
              container?.is('jsx_expression') &&
              container.parent()?.is('jsx_attribute') &&
              container.parent()?.child(0)?.text() === 'icon'
            ) {
              replace(container, `{() => ${parent.text()}}`, 'item-icon-migrated')
            } else if (container?.is('jsx_self_closing_element') && container.child(1)?.id() === parent.id()) {
              const attrs = container.children().filter((n) => n.is('jsx_attribute') || n.is('jsx_expression'))
              if (attrs.length) {
                todos.add(fn, TODO)
                continue
              }
              replace(
                container,
                container.parent()?.is('jsx_element') ? `{${parent.text()}}` : parent.text(),
                'item-icon-migrated',
              )
            }
          } else if (parent?.is('spread_element') && parent.parent()?.is('jsx_expression')) {
            const expression = parent.parent()
            if (!expression) {
              todos.add(fn, TODO)
              continue
            }
            const tag = expression.parent()
            const name = tag?.child(1) ?? null
            if (tag && fromImport(name, 'SidebarItem', '@backstage/core-components')) {
              const hasConflictingAttrs = tag
                .children()
                .some((n) => n.is('jsx_attribute') && ['icon', 'to', 'text'].includes(n.child(0)?.text() ?? ''))
              if (hasConflictingAttrs) {
                todos.add(fn, TODO)
                continue
              }
              replace(
                expression,
                `icon={() => ${ref.text()}.icon} to={${ref.text()}.href} text={${ref.text()}.title}`,
                'sidebar-spread-migrated',
              )
            } else {
              todos.add(fn, TODO)
            }
          } else {
            todos.add(fn, TODO)
          }
        }
      }
    }
  }
  edits.push(...todos.edits())
  return Promise.resolve(edits.length ? program.commitEdits(edits) : null)
}

export default transform
