import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-textfield-to-bui-textfield')

const BUI_SOURCE = '@backstage/ui'

/** Props that trigger a TODO — not mechanically migratable. */
const TODO_PROPS = new Set([
  'multiline',
  'rows',
  'rowsMax',
  'minRows',
  'maxRows',
  'select',
  'SelectProps',
  'InputProps',
  'inputProps',
  'InputLabelProps',
  'FormHelperTextProps',
  'helperText',
  'error',
  'variant',
  'margin',
  'size',
  'color',
  'classes',
  'inputRef',
  'InputAdornment',
])

/** Props that rename mechanically. */
const PROP_RENAMES: Record<string, string> = {
  required: 'isRequired',
  disabled: 'isDisabled',
}

/** Props that pass through unchanged (documented for manual review). */
const _PASSTHROUGH_PROPS = new Set([
  'label',
  'value',
  'defaultValue',
  'placeholder',
  'name',
  'id',
  'type',
  'autoFocus',
  'autoComplete',
  'className',
  'style',
  'aria-label',
  'aria-labelledby',
  'data-testid',
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

function collectTextFieldImports(rootNode: SgNode<TSX>): {
  textFieldLocalName: string | null
  importNodesToRemove: SgNode<TSX>[]
} {
  let textFieldLocalName: string | null = null
  const importNodesToRemove: SgNode<TSX>[] = []

  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core/TextField')) {
    textFieldLocalName = getDefaultImportName(imp)
    importNodesToRemove.push(imp)
  }

  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core')) {
    const localName = getNamedImportLocalName(imp, 'TextField')
    if (localName) {
      textFieldLocalName = localName
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (allSpecifiers.length <= 1) {
        importNodesToRemove.push(imp)
      }
    }
  }

  return { textFieldLocalName, importNodesToRemove }
}

function addTextFieldToBuiImport(rootNode: SgNode<TSX>, importNodesToRemove: SgNode<TSX>[], edits: Edit[]): boolean {
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
      if (!names.includes('TextField')) {
        names.push('TextField')
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
    edits.push(anchorImport.replace(`${anchorImport.text()}\nimport { TextField } from '${BUI_SOURCE}';`))
  } else if (importNodesToRemove.length >= 1) {
    const [importNode] = importNodesToRemove
    if (importNode) {
      edits.push(importNode.replace(`import { TextField } from '${BUI_SOURCE}';`))
      migrationMetric.increment({ action: 'import-added' })
      return true
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

function getParamName(paramNode: SgNode<TSX>): string {
  const ident = paramNode.find({ rule: { kind: 'identifier' } })
  return ident?.text() ?? paramNode.text().replace(/:.*$/, '').trim()
}

function getArrowSingleParamName(arrow: SgNode<TSX>): string | null {
  const parameter = arrow.field('parameter')
  if (parameter) {
    return getParamName(parameter)
  }

  const params = arrow.field('parameters')
  if (!params) {
    return null
  }

  if (params.is('identifier')) {
    return params.text()
  }

  if (params.kind() !== 'formal_parameters') {
    return null
  }

  const paramChildren: SgNode<TSX>[] = []
  for (const child of params.children()) {
    if (child.is('required_parameter') || child.is('identifier')) {
      paramChildren.push(child)
    }
  }

  if (paramChildren.length !== 1) {
    return null
  }

  const [param] = paramChildren
  if (!param) {
    return null
  }

  return getParamName(param)
}

function targetValuePattern(eventName: string): RegExp {
  return new RegExp(`${escapeRegex(eventName)}\\.target\\.value`, 'g')
}

function tryRewriteOnChangeHandler(attr: SgNode<TSX>): string | null {
  const expr = attr.find({ rule: { kind: 'jsx_expression' } })
  if (!expr) {
    return null
  }

  const arrow = expr.find({ rule: { kind: 'arrow_function' } })
  if (!arrow) {
    return null
  }

  const eventName = getArrowSingleParamName(arrow)
  if (!eventName) {
    return null
  }

  const body = arrow.field('body')
  if (!body) {
    return null
  }

  const bodyText = body.text()
  const pattern = targetValuePattern(eventName)
  if (!pattern.test(bodyText)) {
    return null
  }

  const rewrittenBody = bodyText.replace(targetValuePattern(eventName), 'newValue')
  const eventRefPattern = new RegExp(`\\b${escapeRegex(eventName)}\\b`)
  if (eventRefPattern.test(rewrittenBody)) {
    return null
  }
  return `{newValue => ${rewrittenBody}}`
}

function transformTextFieldElements(
  rootNode: SgNode<TSX>,
  textFieldLocalName: string,
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
    if (name !== textFieldLocalName) {
      continue
    }

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
            `{/* TODO(backstage-codemod): finish TextField migration manually (${todoReasons.join(', ')}) */}`,
            el.text(),
          ),
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: todoReasons.join(', ') })
      continue
    }

    const newProps: string[] = []
    let handlerTodo = false
    let droppedFullWidth = false

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
          const exprNode = child.find({ rule: { kind: 'jsx_expression' } })
          const strNode = child.find({ rule: { kind: 'string' } })
          if (exprNode) {
            newProps.push(`${renamed}=${exprNode.text()}`)
          } else if (strNode) {
            newProps.push(`${renamed}=${strNode.text()}`)
          } else {
            newProps.push(renamed)
          }
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
                  `{/* TODO(backstage-codemod): finish TextField migration manually (complex-onChange) */}`,
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
        if (propName === 'fullWidth') {
          droppedFullWidth = true
          migrationMetric.increment({ action: 'prop-dropped', prop: 'fullWidth' })
          migrationMetric.increment({ action: 'todo-inserted', reason: 'fullWidth' })
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
      if (droppedFullWidth) {
        edits.push(
          el.replace(
            wrapWithTodo(
              '{/* TODO(backstage-codemod): finish TextField migration manually (fullWidth) */}',
              `<TextField${propsStr} />`,
            ),
          ),
        )
      } else {
        edits.push(el.replace(`<TextField${propsStr} />`))
      }
    } else {
      const children = el
        .children()
        .filter((c) => c.kind() !== 'jsx_opening_element' && c.kind() !== 'jsx_closing_element')
        .map((c) => c.text())
        .join('')
      if (droppedFullWidth) {
        edits.push(
          el.replace(
            wrapWithTodo(
              '{/* TODO(backstage-codemod): finish TextField migration manually (fullWidth) */}',
              `<TextField${propsStr}>${children}</TextField>`,
            ),
          ),
        )
      } else {
        edits.push(el.replace(`<TextField${propsStr}>${children}</TextField>`))
      }
    }

    migrated = true
    migrationMetric.increment({ action: 'textfield-migrated' })
  }

  return { preserveImport, migrated }
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { textFieldLocalName, importNodesToRemove } = collectTextFieldImports(rootNode)

  if (!textFieldLocalName) {
    return Promise.resolve(null)
  }

  const { preserveImport, migrated } = transformTextFieldElements(rootNode, textFieldLocalName, edits)

  let replacedImport = false
  if (migrated) {
    replacedImport = addTextFieldToBuiImport(rootNode, importNodesToRemove, edits)
  }

  if (!preserveImport) {
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
