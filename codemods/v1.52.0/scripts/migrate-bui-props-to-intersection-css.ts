import type { Codemod, Edit } from 'codemod:ast-grep'
import type CSS from 'codemod:ast-grep/langs/css'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-bui-props-to-intersection')

const TODO_COMMENT =
  '/* TODO(backstage-codemod): Select popover DOM structure changed — list content is now inside .bui-PopoverContent wrapper */'

const transform: Codemod<CSS> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  // Find all rule_set nodes (CSS rulesets) and check their selectors
  const rulesets = rootNode.findAll({
    rule: {
      kind: 'rule_set',
    },
  })

  for (const ruleset of rulesets) {
    const selectors = ruleset.find({
      rule: { kind: 'selectors' },
    })
    if (!selectors) {
      continue
    }

    const selectorText = selectors.text()

    // Check if selector contains .bui-SelectPopover followed by > (direct child combinator)
    if (!/\.bui-SelectPopover\s*>/.test(selectorText)) {
      continue
    }

    // Prepend the TODO comment at the same indentation as the rule set
    const rulesetText = ruleset.text()
    const indentMatch = rulesetText.match(/^(\s*)/)
    const indent = indentMatch ? indentMatch[1] : ''
    edits.push(ruleset.replace(`${indent}${TODO_COMMENT}\n${rulesetText}`))
    migrationMetric.increment({ action: 'css-selector-todo-added' })
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
