import type { Codemod, Edit } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const OLD_KEY = 'EXPERIMENTAL_formDecorators'
const NEW_KEY = 'formDecorators'

const renames = useMetricAtom('form-decorators-key-renames')

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []
  const keyRegex = `^${escapeRegex(OLD_KEY)}$`

  const propertyKeys = rootNode.findAll({
    rule: {
      kind: 'property_identifier',
      regex: keyRegex,
      inside: {
        kind: 'pair',
        stopBy: 'end',
      },
    },
  })

  for (const key of propertyKeys) {
    renames.increment()
    edits.push(key.replace(NEW_KEY))
  }

  const quotedKeys = rootNode.findAll({
    rule: {
      kind: 'string_fragment',
      regex: keyRegex,
      inside: {
        kind: 'pair',
        stopBy: 'end',
      },
    },
  })

  for (const key of quotedKeys) {
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
