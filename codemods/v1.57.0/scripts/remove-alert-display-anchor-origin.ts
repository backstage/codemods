import type { Codemod } from 'codemod:ast-grep'
import type YAML from 'codemod:ast-grep/langs/yaml'
import { useMetricAtom } from 'codemod:metrics'

import { key, pairs, removeLines, topLevel } from './remove-dynamic-client-registration-config-helpers.ts'

const metric = useMetricAtom('remove-alert-display-anchor-origin')
const extensionId = 'app-root-element:app/alert-display'

const transform: Codemod<YAML> = (root) => {
  const document = root.root()
  const source = document.text()
  if (!source.includes(extensionId) || !source.includes('anchorOrigin')) {
    return Promise.resolve(null)
  }
  const edits = []
  for (const app of document.findAll({ rule: { kind: 'block_mapping_pair' } })) {
    if (key(app) !== 'app' || !topLevel(app)) {
      continue
    }
    const extensions = pairs(app)?.find((pair) => key(pair) === 'extensions')
    // A missing extensions key or value must remain a no-op, including malformed YAML.
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    const sequence = extensions
      ?.field('value')
      ?.children()
      .find((node) => node.kind() === 'block_sequence')
    if (!sequence) {
      continue
    }
    for (const item of sequence.children().filter((node) => node.kind() === 'block_sequence_item')) {
      const mapping = item
        .children()
        .find((node) => node.kind() === 'block_node')
        ?.children()
        .find((node) => node.kind() === 'block_mapping')
      const entries = mapping?.children().filter((node) => node.kind() === 'block_mapping_pair') ?? []
      const extension = entries.find((pair) => key(pair) === extensionId)
      if (!extension) {
        continue
      }
      const settings = pairs(extension)
      const config = settings?.find((pair) => key(pair) === 'config')
      const configFields = config ? pairs(config) : null
      const anchor = configFields?.find((pair) => key(pair) === 'anchorOrigin')
      if (!anchor || !config || !configFields || !settings) {
        continue
      }
      if (configFields.length > 1) {
        edits.push(removeLines(source, anchor))
      } else if (settings.length > 1) {
        edits.push(removeLines(source, config))
      } else if (entries.length === 1) {
        const indent = source.split('\n')[item.range().start.line]?.match(/^[ \t]*/)?.[0] ?? ''
        edits.push(removeLines(source, item, `${indent}- ${extensionId}\n`, false))
      } else {
        continue
      }
      metric.increment({ action: 'anchor-removed' })
    }
  }
  return Promise.resolve(edits.length ? document.commitEdits(edits) : null)
}

export default transform
