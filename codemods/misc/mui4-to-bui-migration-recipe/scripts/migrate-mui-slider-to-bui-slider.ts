import { addImport, getAllImports, getImport, listImports, removeImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-slider-to-bui-slider')

const BUI_SOURCE = '@backstage/ui'
const MUI_BARREL_SOURCE = '@material-ui/core'

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

function withTodoComment(comment: string, elementText: string): string {
  return `<>
  ${comment}
  ${elementText}
</>`
}

function collectSliderImports(rootNode: SgNode<TSX, 'program'>): string | null {
  let sliderLocalName: string | null = null

  // Default import: import Slider from '@material-ui/core/Slider'
  const deepImport = getImport(rootNode, { type: 'default', from: '@material-ui/core/Slider' })
  if (deepImport) {
    sliderLocalName = deepImport.alias
  }

  // Named import from barrel: import { Slider } from '@material-ui/core'
  for (const named of getAllImports(rootNode, { type: 'named', name: 'Slider', from: MUI_BARREL_SOURCE })) {
    sliderLocalName = named.alias
  }

  return sliderLocalName
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

function getParamName(paramNode: SgNode<TSX>): string {
  const ident = paramNode.find({ rule: { kind: 'identifier' } })
  return ident?.text() ?? paramNode.text().replace(/:.*$/, '').trim()
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

  const [eventParam, valueParam] = paramChildren
  if (!eventParam || !valueParam) {
    return null
  }

  // Event param must start with _ to indicate unused
  const eventName = getParamName(eventParam)
  if (!eventName.startsWith('_')) {
    return null
  }

  const valueText = getParamName(valueParam)
  const body = arrow.field('body')
  if (!body) {
    return null
  }

  const bodyText = body.text()
  return `{${valueText} => ${bodyText}}`
}

function transformSliderElements(
  rootNode: SgNode<TSX>,
  sliderLocalName: string,
  edits: Edit[],
): { preserveImport: boolean; migrated: boolean } {
  let preserveImport = false
  let migrated = false
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
      preserveImport = true
      edits.push(
        el.replace(
          withTodoComment(
            `{/* TODO(backstage-codemod): finish slider migration manually (${todoReasons.join(', ')}) */}`,
            el.text(),
          ),
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: todoReasons.join(', ') })
      continue
    }

    const newProps: string[] = []
    let handlerTodo = false

    for (const child of opening.children()) {
      const kind = child.kind()
      if (kind === 'jsx_attribute') {
        const propIdent = child.find({ rule: { kind: 'property_identifier' } })
        if (!propIdent) {
          continue
        }
        const propName = propIdent.text()
        const renamed = PROP_RENAMES[propName]
        if (renamed) {
          let valuePart: string | null = null
          for (const attrChild of child.children()) {
            const attrKind = attrChild.kind()
            if (attrKind === 'string' || attrKind === 'jsx_expression') {
              valuePart = attrChild.text()
              break
            }
          }
          newProps.push(valuePart !== null ? `${renamed}=${valuePart}` : renamed)
          migrationMetric.increment({ action: 'prop-renamed', from: propName, to: renamed })
          continue
        }
        if (propName === 'onChange') {
          const rewritten = tryRewriteOnChangeHandler(child)
          if (rewritten !== null) {
            newProps.push(`onChange=${rewritten}`)
            migrationMetric.increment({ action: 'onChange-rewritten' })
          } else {
            preserveImport = true
            edits.push(
              el.replace(
                withTodoComment(
                  `{/* TODO(backstage-codemod): finish slider migration manually (complex-onChange) */}`,
                  el.text(),
                ),
              ),
            )
            migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-onChange' })
            handlerTodo = true
            break
          }
          continue
        }
        if (propName === 'onChangeCommitted') {
          const rewritten = tryRewriteOnChangeHandler(child)
          if (rewritten !== null) {
            newProps.push(`onChangeEnd=${rewritten}`)
            migrationMetric.increment({ action: 'onChangeCommitted-rewritten' })
          } else {
            preserveImport = true
            edits.push(
              el.replace(
                withTodoComment(
                  `{/* TODO(backstage-codemod): finish slider migration manually (onChangeCommitted) */}`,
                  el.text(),
                ),
              ),
            )
            migrationMetric.increment({ action: 'todo-inserted', reason: 'onChangeCommitted' })
            handlerTodo = true
          }
          continue
        }
        if (PASSTHROUGH_PROPS.has(propName)) {
          newProps.push(child.text())
          continue
        }
        newProps.push(child.text())
      } else if (kind === 'jsx_expression' && child.text().startsWith('{...')) {
        newProps.push(child.text())
      }
    }

    if (handlerTodo) {
      continue
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

    migrated = true
    migrationMetric.increment({ action: 'slider-migrated' })
  }

  return { preserveImport, migrated }
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const sliderLocalName = collectSliderImports(rootNode)

  if (!sliderLocalName) {
    return Promise.resolve(null)
  }

  const { preserveImport, migrated } = transformSliderElements(rootNode, sliderLocalName, edits)

  if (migrated) {
    const addEdit = addImport(rootNode, {
      type: 'named',
      specifiers: [{ name: 'Slider' }],
      from: BUI_SOURCE,
    })
    if (addEdit) {
      edits.push(addEdit)
      const hasBuiNamedImport =
        rootNode.find({
          rule: {
            kind: 'import_statement',
            all: [
              {
                has: {
                  kind: 'string',
                  has: { kind: 'string_fragment', regex: `^${escapeRegex(BUI_SOURCE)}$` },
                },
              },
              { has: { kind: 'import_clause', has: { kind: 'named_imports' } } },
            ],
          },
        }) !== null
      migrationMetric.increment({ action: hasBuiNamedImport ? 'import-merged' : 'import-added' })
    }
  }

  if (!preserveImport) {
    const deepEdit = removeImport(rootNode, { type: 'default', from: '@material-ui/core/Slider' })
    if (deepEdit) {
      edits.push(...deepEdit)
      migrationMetric.increment({ action: 'import-removed' })
    }
    for (const item of listImports(rootNode, { from: MUI_BARREL_SOURCE })) {
      const hasSlider = item.specifiers.some((spec) => spec.importedName === 'Slider')
      if (!hasSlider) {
        continue
      }
      const edit = removeImport(rootNode, {
        type: 'named',
        specifiers: ['Slider'],
        from: MUI_BARREL_SOURCE,
      })
      if (edit) {
        edits.push(...edit)
        migrationMetric.increment({
          action: item.specifiers.length > 1 ? 'import-pruned' : 'import-removed',
        })
      }
    }
  }

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
