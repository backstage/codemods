import type { Codemod, Edit } from 'codemod:ast-grep'
import type CSS from 'codemod:ast-grep/langs/css'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('plugin-header-toolbar-rename')

const OLD_CLASS_NAME = 'bui-PluginHeaderToolbarWrapper'
const NEW_CLASS_NAME = 'bui-PluginHeaderToolbar'

const TODO_COMMENT = '/* TODO(backstage-codemod): wrapper element was removed — review child/descendant selectors */'

const transform: Codemod<CSS> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  // Find all class_selector identifiers matching bui-PluginHeaderToolbarWrapper
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

    // Check if this class_selector is the ANCESTOR side (first child) of a
    // child_selector or descendant_selector. The wrapper element was removed,
    // so selectors like `.bui-PluginHeaderToolbarWrapper > button` need review.
    // But `.parent .bui-PluginHeaderToolbarWrapper` does NOT need a TODO -- the
    // wrapper class is just being targeted, not acting as a parent.
    const classSelector = className.ancestors().find((a) => a.is('class_selector'))

    if (!classSelector) {
      continue
    }

    const parentSelector = classSelector.ancestors().find((a) => a.is('child_selector') || a.is('descendant_selector'))

    if (parentSelector) {
      // Check if the class_selector is the first child (ancestor side)
      // In child_selector: first-child > second-child
      // In descendant_selector: first-child second-child
      const firstChild = parentSelector.child(0)
      const isAncestorSide = classSelector.id() === firstChild?.id()

      if (isAncestorSide) {
        // Find the enclosing rule_set to add TODO comment before it
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
