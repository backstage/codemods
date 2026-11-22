import { importBindingOf } from '@jssg/utils/javascript/bindings'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

import {
  blueprintParams,
  property,
  todoCollector,
  value,
} from './migrate-router-blueprint-to-app-root-wrapper-helpers.ts'

const metric = useMetricAtom('wrap-icon-bundle-icons-in-elements')
const TODO = 'TODO(backstage-codemod): IconBundleBlueprint icons must be elements, e.g. { user: <MyIcon /> }'
type Node = SgNode<TSX>

function isElement(node: Node): boolean {
  if (node.is('jsx_element') || node.is('jsx_self_closing_element')) {
    return true
  }
  if (node.is('parenthesized_expression')) {
    return node.children().some(isElement)
  }
  if (!node.is('call_expression')) {
    return false
  }
  const fn: Node = node.field('function')
  return (
    (fn.is('identifier') && fn.text() === 'createElement') ||
    (fn.is('member_expression') &&
      fn.field('object').text() === 'React' &&
      fn.field('property').text() === 'createElement')
  )
}

const transform: Codemod<TSX> = (root) => {
  const program = root.root()
  const source = program.text()
  if (!source.includes('@backstage/plugin-app-react')) {
    return Promise.resolve(null)
  }
  const edits: Edit[] = []
  const todos = todoCollector(source, () => metric.increment({ action: 'manual-review' }))
  for (const call of program.findAll({ rule: { kind: 'call_expression' } })) {
    const fn = call.field('function')
    if (!fn?.is('member_expression') || !['make', 'makeWithOverrides'].includes(fn.field('property').text())) {
      continue
    }
    const base = fn.field('object')
    if (!base.is('identifier')) {
      continue
    }
    const binding = importBindingOf(base)
    if (binding?.source !== '@backstage/plugin-app-react' || binding.importedName !== 'IconBundleBlueprint') {
      continue
    }
    const resolved = blueprintParams(call)
    if (resolved.unresolved) {
      todos.add(call, TODO, null, true)
    }
    for (const params of resolved.params) {
      const pair = property(params, 'icons')
      const icons = value(pair)
      if (!icons) {
        if (params.children().some((n) => n.is('spread_element'))) {
          todos.add(call, TODO, null, true)
        }
        continue
      }
      if (!icons.is('object')) {
        todos.add(call, TODO, pair, true)
        continue
      }
      for (const entry of icons.children()) {
        if (entry.is('pair')) {
          const icon = entry.field('value')
          if (isElement(icon)) {
            continue
          }
          if (!icon.is('identifier') || /^[a-z]/.test(icon.text()) || root.filename().endsWith('.ts')) {
            todos.add(call, TODO, pair, true)
            continue
          }
          const iconImport = importBindingOf(icon)
          const mui =
            iconImport &&
            (iconImport.source.startsWith('@material-ui/icons') || iconImport.source.startsWith('@mui/icons-material'))
          edits.push(icon.replace(`<${icon.text()}${mui ? ' fontSize="inherit"' : ''} />`))
          metric.increment({ action: 'icon-wrapped' })
        } else if (entry.is('shorthand_property_identifier')) {
          if (/^[a-z]/.test(entry.text()) || root.filename().endsWith('.ts')) {
            todos.add(call, TODO, pair, true)
            continue
          }
          const iconImport = importBindingOf(entry)
          const mui =
            iconImport &&
            (iconImport.source.startsWith('@material-ui/icons') || iconImport.source.startsWith('@mui/icons-material'))
          edits.push(entry.replace(`${entry.text()}: <${entry.text()}${mui ? ' fontSize="inherit"' : ''} />`))
          metric.increment({ action: 'icon-wrapped' })
        } else if (entry.isNamed() && !entry.is('comment')) {
          todos.add(call, TODO, pair, true)
        }
      }
    }
  }
  edits.push(...todos.edits())
  return Promise.resolve(edits.length ? program.commitEdits(edits) : null)
}

export default transform
