import type { Codemod, Edit } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('header-main-class-rename')

const OLD_CLASS_NAME = 'bui-Header'
const NEW_CLASS_NAME = 'bui-HeaderContent'
const OLD_PROPERTY = 'root'
const NEW_PROPERTY = 'content'

const OLD_CLASS_PATTERN = new RegExp(`\\b${OLD_CLASS_NAME}\\b`, 'g')

const TODO_COMMENT = '/* TODO(backstage-codemod): Header root class removed — review selector intent */'

function containsExactHeaderClass(text: string): boolean {
  return new RegExp(`\\b${OLD_CLASS_NAME}\\b`).test(text)
}

/**
 * Checks whether a string value contains a child or descendant combinator
 * after `bui-Header`, indicating a selector that may break because the root
 * Header DOM element was removed in Backstage 1.51.0.
 */
function hasDescendantOrChildCombinator(value: string): boolean {
  const pattern = /\bbui-Header\b\s*(?:>|\s+(?!\s*[{,'"`]))\s*\S/
  return pattern.test(value)
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  // 1. Find all string_fragment nodes containing bui-Header (exact root class only)
  const stringFragments = rootNode.findAll({
    rule: {
      kind: 'string_fragment',
      regex: OLD_CLASS_NAME,
    },
  })

  for (const fragment of stringFragments) {
    const text = fragment.text()

    if (!containsExactHeaderClass(text)) {
      continue
    }

    const newText = text.replaceAll(OLD_CLASS_PATTERN, NEW_CLASS_NAME)

    if (hasDescendantOrChildCombinator(text)) {
      const commentTarget = fragment.ancestors().find((a) => a.is('pair'))

      if (commentTarget) {
        const startPos = commentTarget.range().start.index
        const fullText = rootNode.text()
        let lineStart = startPos
        while (lineStart > 0 && fullText[lineStart - 1] !== '\n') {
          lineStart--
        }
        const indent = fullText.slice(lineStart, startPos)

        edits.push({
          startPos,
          endPos: startPos,
          insertedText: `${TODO_COMMENT}\n${indent}`,
        })
      }

      migrationMetric.increment({
        type: 'descendant-selector',
        action: 'renamed-with-todo',
      })
    } else {
      migrationMetric.increment({
        type: 'class-name',
        action: 'renamed',
      })
    }

    edits.push(fragment.replace(newText))
  }

  // 2. Rename HeaderDefinition/HeaderPageDefinition classNames.root to classNames.content
  const classNameAccesses = rootNode.findAll({
    rule: {
      any: [{ pattern: 'HeaderDefinition.classNames.root' }, { pattern: 'HeaderPageDefinition.classNames.root' }],
    },
  })

  const handledPropIds = new Set<number>()

  for (const match of classNameAccesses) {
    const propNode = match.find({
      rule: {
        kind: 'property_identifier',
        regex: `^${OLD_PROPERTY}$`,
      },
    })

    if (propNode && !handledPropIds.has(propNode.id())) {
      handledPropIds.add(propNode.id())
      edits.push(propNode.replace(NEW_PROPERTY))
      migrationMetric.increment({
        type: 'property-access',
        action: 'renamed',
      })
    }
  }

  // 3. Rename object keys `root:` when the value targets the removed Header class
  const rootKeys = rootNode.findAll({
    rule: {
      kind: 'property_identifier',
      regex: `^${OLD_PROPERTY}$`,
      inside: {
        kind: 'pair',
        stopBy: 'end',
      },
    },
  })

  for (const key of rootKeys) {
    const pair = key.parent()
    const valueNode = pair?.field('value')

    if (!valueNode || handledPropIds.has(key.id())) {
      continue
    }

    if (valueNode.kind() !== 'string' && valueNode.kind() !== 'template_string') {
      continue
    }

    const valueText = valueNode.text()
    if (containsExactHeaderClass(valueText)) {
      handledPropIds.add(key.id())
      edits.push(key.replace(NEW_PROPERTY))
      migrationMetric.increment({
        type: 'object-key',
        action: 'renamed',
      })
    }
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
