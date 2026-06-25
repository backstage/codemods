import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-slider-to-bui-slider')

const BUI_SOURCE = '@backstage/ui'

/** Props that rename mechanically. */
const PROP_RENAMES: Record<string, string> = {
  min: 'minValue',
  max: 'maxValue',
  disabled: 'isDisabled',
}

/** Props that pass through unchanged. */
const PASSTHROUGH_PROPS = new Set([
  'step',
  'value',
  'defaultValue',
  'name',
  'id',
  'className',
  'style',
  'aria-label',
  'aria-labelledby',
  'aria-valuetext',
])

/** Props that trigger a TODO — not mechanically migratable. */
const TODO_PROPS = new Set([
  'marks',
  'track',
  'orientation',
  'scale',
  'getAriaLabel',
  'getAriaValueText',
  'valueLabelDisplay',
  'valueLabelFormat',
  'ValueLabelComponent',
  'ThumbComponent',
  'classes',
  'color',
])

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findImportStatementsFrom(rootNode: SgNode<TSX>, source: string): SgNode<TSX>[] {
  return rootNode.findAll({
    rule: {
      kind: 'import_statement',
      has: {
        kind: 'string',
        has: {
          kind: 'string_fragment',
          regex: `^${escapeRegex(source)}$`,
        },
      },
    },
  })
}

function getDefaultImportName(imp: SgNode<TSX>): string | null {
  const clause = imp.find({ rule: { kind: 'import_clause' } })
  if (!clause) {
    return null
  }
  for (const child of clause.children()) {
    if (child.is('identifier')) {
      return child.text()
    }
  }
  return null
}

function getNamedImportLocalName(imp: SgNode<TSX>, targetName: string): string | null {
  for (const spec of imp.findAll({ rule: { kind: 'import_specifier' } })) {
    const identifiers = spec.findAll({
      rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
    })
    const [importedNameNode] = identifiers
    if (importedNameNode?.text() === targetName) {
      const localNameNode = identifiers[1] ?? importedNameNode
      return localNameNode.text()
    }
  }
  return null
}

function collectSliderImports(rootNode: SgNode<TSX>): {
  sliderLocalName: string | null
  importNodesToRemove: SgNode<TSX>[]
} {
  let sliderLocalName: string | null = null
  const importNodesToRemove: SgNode<TSX>[] = []

  // Default import: import Slider from '@material-ui/core/Slider'
  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core/Slider')) {
    sliderLocalName = getDefaultImportName(imp)
    importNodesToRemove.push(imp)
  }

  // Named import from barrel: import { Slider } from '@material-ui/core'
  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core')) {
    const localName = getNamedImportLocalName(imp, 'Slider')
    if (localName) {
      sliderLocalName = localName
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (allSpecifiers.length <= 1) {
        importNodesToRemove.push(imp)
      }
    }
  }

  return { sliderLocalName, importNodesToRemove }
}

function addSliderToBuiImport(rootNode: SgNode<TSX>, edits: Edit[]): void {
  const existingImports = findImportStatementsFrom(rootNode, BUI_SOURCE)
  const existingImport = existingImports[0] ?? null

  if (existingImport) {
    const namedImports = existingImport.find({ rule: { kind: 'named_imports' } })
    if (namedImports) {
      const text = namedImports.text()
      const inner = text.slice(1, -1).trim()
      const names = inner
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
      if (!names.includes('Slider')) {
        names.push('Slider')
      }
      names.sort()
      edits.push(namedImports.replace(`{ ${names.join(', ')} }`))
      migrationMetric.increment({ action: 'import-merged' })
    }
  } else {
    const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
    if (allImports.length > 0) {
      const lastImport = allImports.at(-1)
      if (lastImport) {
        edits.push(lastImport.replace(`${lastImport.text()}\nimport { Slider } from '${BUI_SOURCE}';`))
      }
    }
    migrationMetric.increment({ action: 'import-added' })
  }
}

function getElementName(opening: SgNode<TSX>): string | null {
  for (const child of opening.children()) {
    if (child.is('identifier') || child.is('member_expression')) {
      return child.text()
    }
  }
  return null
}

function getPropAttr(opening: SgNode<TSX>, propName: string): SgNode<TSX> | null {
  return opening.find({
    rule: {
      kind: 'jsx_attribute',
      has: {
        kind: 'property_identifier',
        regex: `^${escapeRegex(propName)}$`,
      },
    },
  })
}

function hasProp(opening: SgNode<TSX>, propName: string): boolean {
  return getPropAttr(opening, propName) !== null
}

/**
 * Check if the onChange handler is a trivial arrow `(_e, val) => ...`
 * where the event param is unused (starts with _).
 * Returns the rewritten handler text without the event param, or null if complex.
 */
function tryRewriteOnChangeHandler(attr: SgNode<TSX>): string | null {
  const expr = attr.find({ rule: { kind: 'jsx_expression' } })
  if (!expr) {
    return null
  }

  // Look for arrow function: (_e, val) => body
  const arrow = expr.find({ rule: { kind: 'arrow_function' } })
  if (!arrow) {
    return null
  }

  const params = arrow.field('parameters')
  if (!params) {
    return null
  }

  // Must be a formal_parameters node with exactly 2 params
  if (params.kind() !== 'formal_parameters') {
    return null
  }

  const paramChildren: SgNode<TSX>[] = []
  for (const child of params.children()) {
    if (child.is('required_parameter') || child.is('identifier')) {
      paramChildren.push(child)
    }
  }

  if (paramChildren.length !== 2) {
    return null
  }

  const eventParam = paramChildren[0]!
  const valueParam = paramChildren[1]!

  // Event param must start with _ to indicate unused
  const eventName = eventParam.text()
  if (!eventName.startsWith('_')) {
    return null
  }

  const valueText = valueParam.text()
  const body = arrow.field('body')
  if (!body) {
    return null
  }

  const bodyText = body.text()
  return `{${valueText} => ${bodyText}}`
}

function transformSliderElements(rootNode: SgNode<TSX>, sliderLocalName: string, edits: Edit[]): void {
  const jsxElements = rootNode.findAll({
    rule: {
      any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
    },
  })

  for (const el of jsxElements) {
    const isSelfClosing = el.is('jsx_self_closing_element')
    const opening = isSelfClosing ? el : el.child(0)
    if (!opening) {
      continue
    }

    const name = getElementName(opening)
    if (name !== sliderLocalName) {
      continue
    }

    // Check for TODO-triggering props
    let needsTodo = false
    const todoReasons: string[] = []

    for (const prop of TODO_PROPS) {
      if (hasProp(opening, prop)) {
        needsTodo = true
        todoReasons.push(prop)
      }
    }

    if (needsTodo) {
      edits.push(
        el.replace(
          `{/* TODO(backstage-codemod): finish slider migration manually (${todoReasons.join(', ')}) */}\n${el.text()}`,
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: todoReasons.join(', ') })
      continue
    }

    // Build new props
    const newProps: string[] = []
    let handlerTodo = false

    const allAttrs = opening.findAll({ rule: { kind: 'jsx_attribute' } })
    for (const attr of allAttrs) {
      const propIdent = attr.find({ rule: { kind: 'property_identifier' } })
      if (!propIdent) {
        continue
      }
      const propName = propIdent.text()

      // Rename props
      const renamed = PROP_RENAMES[propName]
      if (renamed) {
        let valuePart: string | null = null
        for (const child of attr.children()) {
          const kind = child.kind()
          if (kind === 'string' || kind === 'jsx_expression') {
            valuePart = child.text()
            break
          }
        }
        if (valuePart !== null) {
          newProps.push(`${renamed}=${valuePart}`)
        } else {
          newProps.push(renamed)
        }
        migrationMetric.increment({ action: 'prop-renamed', from: propName, to: renamed })
        continue
      }

      // Handle onChange
      if (propName === 'onChange') {
        const rewritten = tryRewriteOnChangeHandler(attr)
        if (rewritten !== null) {
          newProps.push(`onChange=${rewritten}`)
          migrationMetric.increment({ action: 'onChange-rewritten' })
        } else {
          // Non-trivial handler — insert TODO for whole element
          edits.push(
            el.replace(
              `{/* TODO(backstage-codemod): finish slider migration manually (complex-onChange) */}\n${el.text()}`,
            ),
          )
          migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-onChange' })
          handlerTodo = true
          break
        }
        continue
      }

      // Handle onChangeCommitted → onChangeEnd when handler is trivial
      if (propName === 'onChangeCommitted') {
        const rewritten = tryRewriteOnChangeHandler(attr)
        if (rewritten !== null) {
          newProps.push(`onChangeEnd=${rewritten}`)
          migrationMetric.increment({ action: 'onChangeCommitted-rewritten' })
        } else {
          edits.push(
            el.replace(
              `{/* TODO(backstage-codemod): finish slider migration manually (onChangeCommitted) */}\n${el.text()}`,
            ),
          )
          migrationMetric.increment({ action: 'todo-inserted', reason: 'onChangeCommitted' })
          handlerTodo = true
        }
        continue
      }

      // Passthrough props
      if (PASSTHROUGH_PROPS.has(propName)) {
        newProps.push(attr.text())
        continue
      }

      // Unknown prop — preserve as-is
      newProps.push(attr.text())
    }

    if (handlerTodo) {
      continue
    }

    // Preserve spread attributes
    const spreadAttrs = opening.findAll({ rule: { kind: 'jsx_expression' } })
    for (const spread of spreadAttrs) {
      if (spread.text().startsWith('{...')) {
        newProps.push(spread.text())
      }
    }

    const propsStr = newProps.length > 0 ? ` ${newProps.join(' ')}` : ''

    if (isSelfClosing) {
      edits.push(el.replace(`<Slider${propsStr} />`))
    } else {
      // Preserve children via AST traversal
      const children = el
        .children()
        .filter((c) => c.kind() !== 'jsx_opening_element' && c.kind() !== 'jsx_closing_element')
        .map((c) => c.text())
        .join('')
      edits.push(el.replace(`<Slider${propsStr}>${children}</Slider>`))
    }

    migrationMetric.increment({ action: 'slider-migrated' })
  }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { sliderLocalName, importNodesToRemove } = collectSliderImports(rootNode)

  if (!sliderLocalName) {
    return null
  }

  // Remove MUI imports
  for (const imp of importNodesToRemove) {
    edits.push(imp.replace(''))
    migrationMetric.increment({ action: 'import-removed' })
  }

  // Add BUI import
  addSliderToBuiImport(rootNode, edits)

  // Transform JSX elements
  transformSliderElements(rootNode, sliderLocalName, edits)

  return edits.length > 0 ? rootNode.commitEdits(edits) : null
}

export default transform
