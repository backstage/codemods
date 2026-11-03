import type { Codemod, Edit } from 'codemod:ast-grep'
import type CSS from 'codemod:ast-grep/langs/css'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('header-main-class-rename')

const OLD_CLASS_NAME = 'bui-Header'
const NEW_CLASS_NAME = 'bui-HeaderContent'

const TODO_COMMENT = '/* TODO(backstage-codemod): Header root class removed — review selector intent */'

const transform: Codemod<CSS> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  // Exact match only — avoids renaming bui-HeaderTop, bui-HeaderContent, etc.
  const classNames = rootNode.findAll({
    rule: {
      kind: 'identifier',
      regex: `^${OLD_CLASS_NAME}$`,
      inside: {
        kind: 'class_name',
        inside: {
          kind: 'class_selector',
          stopBy: 'neighbor',
        },
        stopBy: 'neighbor',
      },
    },
  })

  const handledRuleSetIds = new Set<number>()

  for (const className of classNames) {
    edits.push(className.replace(NEW_CLASS_NAME))

    const classSelector = className.ancestors().find((a) => a.is('class_selector'))

    if (!classSelector) {
      continue
    }

    const parentSelector = classSelector.ancestors().find((a) => a.is('child_selector') || a.is('descendant_selector'))

    if (parentSelector) {
      const firstChild = parentSelector.child(0)
      const isAncestorSide = classSelector.id() === firstChild?.id()

      if (isAncestorSide) {
        const ruleSet = parentSelector.ancestors().find((a) => a.is('rule_set'))

        if (ruleSet && !handledRuleSetIds.has(ruleSet.id())) {
          handledRuleSetIds.add(ruleSet.id())

          const startPos = ruleSet.range().start.index
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

          migrationMetric.increment({
            type: 'css-descendant-selector',
            action: 'renamed-with-todo',
          })
          continue
        }
      }
    }

    migrationMetric.increment({
      type: 'css-class-name',
      action: 'renamed',
    })
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
