import { addImport, getAllImports, getImport, listImports, removeImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-textfield-to-bui-textfield')

const BUI_SOURCE = '@backstage/ui'
const MUI_BARREL_SOURCE = '@material-ui/core'

/** Props that trigger a TODO — not mechanically migratable. */
const TODO_PROPS = new Set([
  'rowsMax',
  'minRows',
  'maxRows',
  'select',
  'SelectProps',
  'InputProps',
  'inputProps',
  'InputLabelProps',
  'FormHelperTextProps',
  'error',
  'variant',
  'margin',
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

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function withTodoComment(comment: string, elementText: string): string {
  return `<>
  ${comment}
  ${elementText}
</>`
}

function collectTextFieldImports(rootNode: SgNode<TSX, 'program'>): {
  textFieldLocalName: string | null
  hasDefaultImport: boolean
  hasBarrelImport: boolean
} {
  const textFieldDefault = getImport(rootNode, { type: 'default', from: '@material-ui/core/TextField' })
  const textFieldBarrelNamed = getImport(rootNode, { type: 'named', name: 'TextField', from: MUI_BARREL_SOURCE })

  return {
    textFieldLocalName: textFieldBarrelNamed?.alias ?? textFieldDefault?.alias ?? null,
    hasDefaultImport: textFieldDefault !== null,
    hasBarrelImport: textFieldBarrelNamed !== null,
  }
}

function collectFormControlLocalNames(rootNode: SgNode<TSX, 'program'>): Set<string> {
  const names = new Set<string>()

  const formControlDefault = getAllImports(rootNode, { type: 'default', from: '@material-ui/core/FormControl' })
  for (const imp of formControlDefault) {
    names.add(imp.alias)
  }

  for (const named of getAllImports(rootNode, { type: 'named', name: 'FormControl', from: MUI_BARREL_SOURCE })) {
    names.add(named.alias)
  }

  return names
}

function findParentFormControlOpening(el: SgNode<TSX>, formControlNames: Set<string>): SgNode<TSX> | null {
  if (formControlNames.size === 0) {
    return null
  }

  for (const ancestor of el.ancestors()) {
    if (ancestor.kind() !== 'jsx_element') {
      continue
    }
    const opening = ancestor.child(0)
    if (opening?.kind() !== 'jsx_opening_element') {
      continue
    }
    const name = getElementName(opening)
    if (name && formControlNames.has(name)) {
      return opening
    }
  }

  return null
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

function getPropStringValue(opening: SgNode<TSX>, propName: string): string | null {
  const attr = getPropAttr(opening, propName)
  if (!attr) {
    return null
  }
  // Only accept a direct string child (size="small"). Nested strings inside
  // expressions like size={cond ? 'small' : 'medium'} are dynamic, not static.
  for (const child of attr.children()) {
    if (child.kind() === 'string') {
      const frag = child.find({ rule: { kind: 'string_fragment' } })
      return frag?.text() ?? null
    }
  }
  return null
}

function getPropRawValue(opening: SgNode<TSX>, propName: string): string | null {
  const attr = getPropAttr(opening, propName)
  if (!attr) {
    return null
  }
  for (const child of attr.children()) {
    const kind = child.kind()
    if (kind === 'string' || kind === 'jsx_expression') {
      return child.text()
    }
  }
  return null
}

function isSimpleHelperText(attr: SgNode<TSX>): boolean {
  const stringNode = attr.find({ rule: { kind: 'string' } })
  if (stringNode && attr.find({ rule: { kind: 'jsx_expression' } }) === null) {
    return true
  }
  const expr = attr.find({ rule: { kind: 'jsx_expression' } })
  if (!expr) {
    return false
  }
  if (expr.find({ rule: { kind: 'jsx_element' } }) !== null) {
    return false
  }
  if (expr.find({ rule: { kind: 'jsx_self_closing_element' } }) !== null) {
    return false
  }
  // Fragments aren't a typed `kind` in jssg's TSX RuleConfig — detect via source.
  if (expr.text().includes('<>') || expr.text().includes('</>')) {
    return false
  }
  return true
}

function getParamName(paramNode: SgNode<TSX>): string {
  const ident = paramNode.find({ rule: { kind: 'identifier' } })
  return ident?.text() ?? paramNode.text()
}

function applyNodeTextReplacements(node: SgNode<TSX>, replacements: { target: SgNode<TSX>; text: string }[]): string {
  const base = node.range().start.index
  let text = node.text()
  const sorted = [...replacements].sort((a, b) => b.target.range().start.index - a.target.range().start.index)
  for (const { target, text: next } of sorted) {
    const start = target.range().start.index - base
    const end = target.range().end.index - base
    text = `${text.slice(0, start)}${next}${text.slice(end)}`
  }
  return text
}

function isEventTargetValueMember(node: SgNode<TSX>, eventName: string): boolean {
  // AST-selected member_expression whose source text is exactly `event.target.value`.
  return node.is('member_expression') && node.text() === `${eventName}.target.value`
}

function findEventTargetValueMembers(body: SgNode<TSX>, eventName: string): SgNode<TSX>[] {
  return body
    .findAll({ rule: { kind: 'member_expression' } })
    .filter((node) => isEventTargetValueMember(node, eventName))
}

function isDescendantOf(node: SgNode<TSX>, ancestor: SgNode<TSX>): boolean {
  let current = node.parent()
  while (current) {
    if (current.id() === ancestor.id()) {
      return true
    }
    current = current.parent()
  }
  return false
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

  const targetValueNodes = findEventTargetValueMembers(body, eventName)
  if (targetValueNodes.length === 0) {
    return null
  }

  for (const ident of body.findAll({
    rule: {
      kind: 'identifier',
      regex: `^${escapeRegex(eventName)}$`,
    },
  })) {
    const insideTargetValue = targetValueNodes.some((targetValue) => isDescendantOf(ident, targetValue))
    if (!insideTargetValue) {
      return null
    }
  }

  const rewrittenBody = applyNodeTextReplacements(
    body,
    targetValueNodes.map((target) => ({ target, text: 'newValue' })),
  )
  return `{newValue => ${rewrittenBody}}`
}

function isDynamicSizeProp(opening: SgNode<TSX>): boolean {
  return hasProp(opening, 'size') && getPropStringValue(opening, 'size') === null
}

function mapSizeProp(openings: SgNode<TSX>[], newProps: string[]): void {
  const [primary, ...fallbacks] = openings

  let sizeValue = primary ? getPropStringValue(primary, 'size') : null
  let fromFormControl = false

  if (sizeValue === null) {
    for (const fallback of fallbacks) {
      const fallbackSize = getPropStringValue(fallback, 'size')
      if (fallbackSize !== null) {
        sizeValue = fallbackSize
        fromFormControl = true
        break
      }
    }
  }

  if (fromFormControl) {
    migrationMetric.increment({ action: 'size-from-form-control' })
  }

  if (sizeValue === 'small') {
    newProps.push('size="small"')
    migrationMetric.increment({ action: 'size-mapped', size: 'small' })
    return
  }
  if (sizeValue === 'medium') {
    newProps.push('size="medium"')
    migrationMetric.increment({ action: 'size-mapped', size: 'medium' })
    return
  }
  if (sizeValue === 'large') {
    newProps.push('size="medium"')
    migrationMetric.increment({ action: 'size-large-to-medium' })
    return
  }
  newProps.push('size="medium"')
  migrationMetric.increment({ action: 'size-defaulted-to-medium' })
}

function resolveTargetComponent(opening: SgNode<TSX>): string {
  if (hasProp(opening, 'multiline')) {
    return 'TextAreaField'
  }
  const typeValue = getPropStringValue(opening, 'type')
  if (typeValue === 'password') {
    return 'PasswordField'
  }
  if (typeValue === 'number') {
    return 'NumberField'
  }
  return 'TextField'
}

function transformTextFieldElements(
  rootNode: SgNode<TSX, 'program'>,
  textFieldLocalName: string,
  formControlNames: Set<string>,
  edits: Edit[],
): { preserveImport: boolean; migrated: boolean; buiNames: Set<string> } {
  let preserveImport = false
  let migrated = false
  const buiNames = new Set<string>()
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

    const parentFormControl = findParentFormControlOpening(el, formControlNames)
    const sizeOpenings = parentFormControl ? [opening, parentFormControl] : [opening]

    const isMultiline = hasProp(opening, 'multiline')
    let needsTodo = false
    const todoReasons: string[] = []

    const textFieldHasStaticSize = getPropStringValue(opening, 'size') !== null
    if (
      isDynamicSizeProp(opening) ||
      (!textFieldHasStaticSize && parentFormControl !== null && isDynamicSizeProp(parentFormControl))
    ) {
      needsTodo = true
      todoReasons.push('size')
    }

    for (const prop of TODO_PROPS) {
      if (hasProp(opening, prop)) {
        needsTodo = true
        todoReasons.push(prop)
      }
    }

    // rows without multiline is not a BUI TextField concept
    if (hasProp(opening, 'rows') && !isMultiline) {
      needsTodo = true
      todoReasons.push('rows')
    }

    const helperTextAttr = getPropAttr(opening, 'helperText')
    if (helperTextAttr && !isSimpleHelperText(helperTextAttr)) {
      needsTodo = true
      todoReasons.push('helperText')
    }

    if (needsTodo) {
      preserveImport = true
      edits.push(
        el.replace(
          withTodoComment(
            `{/* TODO(backstage-codemod): finish TextField migration manually (${todoReasons.join(', ')}) */}`,
            el.text(),
          ),
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: todoReasons.join(', ') })
      continue
    }

    const componentName = resolveTargetComponent(opening)
    const newProps: string[] = []
    let handlerTodo = false
    let droppedFullWidth = false
    let sizeHandled = false

    for (const child of opening.children()) {
      const kind = child.kind()
      if (kind === 'jsx_attribute') {
        const propIdent = child.find({ rule: { kind: 'property_identifier' } })
        if (!propIdent) {
          continue
        }
        const propName = propIdent.text()

        if (propName === 'multiline') {
          migrationMetric.increment({ action: 'prop-dropped', prop: 'multiline' })
          continue
        }

        if (propName === 'type' && (componentName === 'PasswordField' || componentName === 'NumberField')) {
          migrationMetric.increment({ action: 'prop-dropped', prop: 'type' })
          continue
        }

        if (propName === 'rows' && componentName === 'TextAreaField') {
          const raw = getPropRawValue(opening, 'rows')
          if (raw) {
            newProps.push(`rows=${raw}`)
            migrationMetric.increment({ action: 'prop-mapped', from: 'rows', to: 'rows' })
          }
          continue
        }

        if (propName === 'helperText') {
          const raw = getPropRawValue(opening, 'helperText')
          if (raw) {
            newProps.push(`description=${raw}`)
            migrationMetric.increment({ action: 'prop-renamed', from: 'helperText', to: 'description' })
          }
          continue
        }

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
                withTodoComment(
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
        if (propName === 'size') {
          sizeHandled = true
          mapSizeProp(sizeOpenings, newProps)
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

    if (!sizeHandled) {
      mapSizeProp(sizeOpenings, newProps)
    }

    const propsStr = newProps.length > 0 ? ` ${newProps.join(' ')}` : ''
    let output: string

    if (isSelfClosing) {
      output = `<${componentName}${propsStr} />`
    } else {
      const children = el
        .children()
        .filter((c) => c.kind() !== 'jsx_opening_element' && c.kind() !== 'jsx_closing_element')
        .map((c) => c.text())
        .join('')
      output = `<${componentName}${propsStr}>${children}</${componentName}>`
    }

    if (droppedFullWidth) {
      edits.push(
        el.replace(
          withTodoComment('{/* TODO(backstage-codemod): finish TextField migration manually (fullWidth) */}', output),
        ),
      )
    } else {
      edits.push(el.replace(output))
    }

    buiNames.add(componentName)
    migrated = true
    migrationMetric.increment({ action: 'textfield-migrated', component: componentName })
  }

  return { preserveImport, migrated, buiNames }
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { textFieldLocalName, hasDefaultImport, hasBarrelImport } = collectTextFieldImports(rootNode)

  if (!textFieldLocalName) {
    return Promise.resolve(null)
  }

  const formControlNames = collectFormControlLocalNames(rootNode)
  const { preserveImport, migrated, buiNames } = transformTextFieldElements(
    rootNode,
    textFieldLocalName,
    formControlNames,
    edits,
  )

  if (migrated) {
    const addEdit = addImport(rootNode, {
      type: 'named',
      specifiers: [...buiNames].sort().map((name) => ({ name })),
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
    if (hasBarrelImport) {
      for (const item of listImports(rootNode, { from: MUI_BARREL_SOURCE })) {
        if (item.specifiers.some((spec) => spec.importedName === 'TextField')) {
          if (item.specifiers.length <= 1) {
            migrationMetric.increment({ action: 'import-removed' })
          } else {
            migrationMetric.increment({ action: 'import-pruned' })
          }
        }
      }
      const edit = removeImport(rootNode, { type: 'named', specifiers: ['TextField'], from: MUI_BARREL_SOURCE })
      if (edit) {
        edits.push(...edit)
      }
    }
    if (hasDefaultImport) {
      const edit = removeImport(rootNode, { type: 'default', from: '@material-ui/core/TextField' })
      if (edit) {
        edits.push(...edit)
        migrationMetric.increment({ action: 'import-removed' })
      }
    }
  }

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
