import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type YAML from 'codemod:ast-grep/langs/yaml'
import { useMetricAtom } from 'codemod:metrics'

const OLD_KEY = 'EXPERIMENTAL_formDecorators'
const NEW_KEY = 'formDecorators'

const renames = useMetricAtom('form-decorators-key-renames')

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isMappingKey(node: SgNode<YAML>): boolean {
  const pair = node.ancestors().find((a) => a.is('block_mapping_pair') || a.is('flow_pair'))
  if (!pair) {
    return false
  }

  const keyNode = pair.field('key')
  if (!keyNode) {
    return false
  }

  return node.id() === keyNode.id() || node.ancestors().some((a) => a.id() === keyNode.id())
}

const transform: Codemod<YAML> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const keys = rootNode.findAll({
    rule: {
      kind: 'string_scalar',
      regex: `^${escapeRegex(OLD_KEY)}$`,
    },
  })

  for (const key of keys) {
    if (!isMappingKey(key)) {
      continue
    }

    renames.increment()
    edits.push(key.replace(NEW_KEY))
  }

  if (edits.length === 0) {
    return null
  }
  const result = await Promise.resolve(rootNode.commitEdits(edits))
  return result
}

export default transform
