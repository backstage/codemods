import type { Codemod } from 'codemod:ast-grep'
import type YAML from 'codemod:ast-grep/langs/yaml'
import { useMetricAtom } from 'codemod:metrics'

import { flowPairs, key, pairs, removeLines, topLevel } from './remove-dynamic-client-registration-config-helpers.ts'

const metric = useMetricAtom('remove-dynamic-client-registration-config')
const todo =
  '# TODO(backstage-codemod): Dynamic Client Registration was removed in 1.57. Configure auth.clientIdMetadataDocuments or auth.staticClients.'

const transform: Codemod<YAML> = (root) => {
  const document = root.root()
  const source = document.text()
  if (!source.includes('experimentalDynamicClientRegistration')) {
    return Promise.resolve(null)
  }
  const edits = []
  const lines = source.split('\n')
  for (const auth of document.findAll({ rule: { kind: 'block_mapping_pair' } })) {
    if (key(auth) !== 'auth' || !topLevel(auth)) {
      continue
    }
    const children = pairs(auth)
    const removed = children?.find((child) => key(child) === 'experimentalDynamicClientRegistration')
    if (!removed || !children) {
      continue
    }
    const remaining = children.filter((child) => child.id() !== removed.id())
    const enabled = (pairs(removed) ?? flowPairs(removed) ?? []).some((child) => {
      if (key(child) !== 'enabled') {
        return false
      }
      let value = child.field('value')?.text().trim() ?? ''
      if (/\$\{[^}]+\}/.test(value)) {
        return true
      }
      if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
        value = value.slice(1, -1)
      }
      return /^(?:y|yes|true|1|on)$/i.test(value)
    })
    const hasAlternative = remaining.some((child) =>
      ['clientIdMetadataDocuments', 'experimentalClientIdMetadataDocuments', 'staticClients'].includes(key(child)),
    )
    const indent = lines[removed.range().start.line]?.match(/^[ \t]*/)?.[0] ?? '  '
    // Deeper markers inside the removed value disappear; same-indent markers
    // before or after it are retained by removeLines.
    const hasTodoOutsideRemoved = auth
      .text()
      .split('\n')
      .some((line) => line.includes(todo) && (line.match(/^[ \t]*/)?.[0].length ?? 0) <= indent.length)
    const needsTodo = enabled && !hasAlternative && !hasTodoOutsideRemoved
    let addedTodo = needsTodo
    if (remaining.length === 0) {
      addedTodo = needsTodo || auth.text().includes(todo)
      edits.push(removeLines(source, auth, addedTodo ? `${todo}\n` : '', false))
    } else {
      edits.push(removeLines(source, removed, needsTodo ? `${indent}${todo}\n` : ''))
    }
    if (addedTodo) {
      metric.increment({ action: 'todo-added' })
    }
    metric.increment({ action: 'config-removed' })
  }
  return Promise.resolve(edits.length ? document.commitEdits(edits) : null)
}

export default transform
