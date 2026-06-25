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

function wrapWithTodo(todoComment: string, elementText: string): string {
  return `<>
${todoComment}
${elementText}
</>`
}

function rebuildImportWithout(importStmt: SgNode<TSX>, specifiersToRemove: Set<string>): string {
  const specifiers = importStmt.findAll({ rule: { kind: 'import_specifier' } })
  const remaining: string[] = []
  for (const spec of specifiers) {
    const identifiers = spec.findAll({
      rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
    })
    const importedName = identifiers[0]?.text()
    if (importedName && !specifiersToRemove.has(importedName)) {
      remaining.push(spec.text())
    }
  }

  if (remaining.length === 0) {
    return ''
  }

  const sourceNode = importStmt.find({ rule: { kind: 'string' } })
  const sourceText = sourceNode?.text() ?? `'${MUI_BARREL_SOURCE}'`

  if (remaining.length <= 2) {
    return `import { ${remaining.join(', ')} } from ${sourceText};`
  }
  return `import {\n  ${remaining.join(',\n  ')},\n} from ${sourceText};`
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
  barrelImportsToPrune: { imp: SgNode<TSX>; namesToRemove: Set<string> }[]
} {
  let sliderLocalName: string | null = null
  const importNodesToRemove: SgNode<TSX>[] = []
  const barrelImportsToPrune: { imp: SgNode<TSX>; namesToRemove: Set<string> }[] = []

  // Default import: import Slider from '@material-ui/core/Slider'
  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core/Slider')) {
    sliderLocalName = getDefaultImportName(imp)
    importNodesToRemove.push(imp)
  }

  // Named import from barrel: import { Slider } from '@material-ui/core'
  for (const imp of findImportStatementsFrom(rootNode, MUI_BARREL_SOURCE)) {
    const localName = getNamedImportLocalName(imp, 'Slider')
    if (localName) {
      sliderLocalName = localName
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (allSpecifiers.length <= 1) {
        importNodesToRemove.push(imp)
      } else {
        barrelImportsToPrune.push({ imp, namesToRemove: new Set(['Slider']) })
      }
    }
  }

  return { sliderLocalName, importNodesToRemove, barrelImportsToPrune }
}

function addSliderToBuiImport(rootNode: SgNode<TSX>, importNodesToRemove: SgNode<TSX>[], edits: Edit[]): boolean {
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
    return false
  }

  const removableIds = new Set(importNodesToRemove.map((imp) => imp.id()))
  const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
  const anchorImport = [...allImports].reverse().find((imp) => !removableIds.has(imp.id())) ?? null

  if (anchorImport) {
    edits.push(anchorImport.replace(`${anchorImport.text()}\nimport { Slider } from '${BUI_SOURCE}';`))
  } else if (importNodesToRemove.length === 1) {
    const [importNode] = importNodesToRemove
    if (importNode) {
      edits.push(importNode.replace(`import { Slider } from '${BUI_SOURCE}';`))
      migrationMetric.increment({ action: 'import-added' })
      return true
    }
  } else if (allImports.length > 0) {
    const lastImport = allImports.at(-1)
    if (lastImport) {
      edits.push(lastImport.replace(`${lastImport.text()}\nimport { Slider } from '${BUI_SOURCE}';`))
    }
  }

  migrationMetric.increment({ action: 'import-added' })
  return false
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

  const [eventParam, valueParam] = paramChildren
  if (!eventParam || !valueParam) {
    return null
  }

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
          wrapWithTodo(
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
                wrapWithTodo(
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
                wrapWithTodo(
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

  const { sliderLocalName, importNodesToRemove, barrelImportsToPrune } = collectSliderImports(rootNode)

  if (!sliderLocalName) {
    return Promise.resolve(null)
  }

  const { preserveImport, migrated } = transformSliderElements(rootNode, sliderLocalName, edits)

  let replacedImport = false
  if (migrated) {
    replacedImport = addSliderToBuiImport(rootNode, importNodesToRemove, edits)
  }

  if (!preserveImport) {
    for (const { imp, namesToRemove } of barrelImportsToPrune) {
      edits.push(imp.replace(rebuildImportWithout(imp, namesToRemove)))
      migrationMetric.increment({ action: 'import-pruned' })
    }
    for (const imp of importNodesToRemove) {
      if (replacedImport && imp.id() === importNodesToRemove[0]?.id()) {
        migrationMetric.increment({ action: 'import-removed' })
        continue
      }
      edits.push(imp.replace(''))
      migrationMetric.increment({ action: 'import-removed' })
    }
  }

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
