import { addImport, getAllImports, getImport, listImports, removeImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-select-family-to-bui-select')

const BUI_SOURCE = '@backstage/ui'
const MUI_BARREL_SOURCE = '@material-ui/core'

const MUI_SELECT_COMPONENTS = ['FormControl', 'InputLabel', 'Select', 'MenuItem', 'FormHelperText']

/** Props on Select that trigger a TODO. */
const TODO_PROPS = new Set([
  'multiple',
  'native',
  'renderValue',
  'displayEmpty',
  'autoWidth',
  'MenuProps',
  'input',
  'inputProps',
  'variant',
  'classes',
  'IconComponent',
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

interface SelectImports {
  localNames: Map<string, string>
  defaultSources: string[]
  barrelNames: string[]
}

function collectSelectImports(rootNode: SgNode<TSX, 'program'>): SelectImports {
  const localNames = new Map<string, string>()
  const defaultSources: string[] = []
  const barrelNames: string[] = []

  for (const componentName of MUI_SELECT_COMPONENTS) {
    const defaultImport = getImport(rootNode, { type: 'default', from: `@material-ui/core/${componentName}` })
    if (defaultImport) {
      localNames.set(defaultImport.alias, componentName)
      defaultSources.push(`@material-ui/core/${componentName}`)
    }
    for (const named of getAllImports(rootNode, { type: 'named', name: componentName, from: MUI_BARREL_SOURCE })) {
      localNames.set(named.alias, componentName)
      if (!barrelNames.includes(componentName)) {
        barrelNames.push(componentName)
      }
    }
  }

  return { localNames, defaultSources, barrelNames }
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

function getNonWhitespaceChildren(element: SgNode<TSX>): SgNode<TSX>[] {
  const children: SgNode<TSX>[] = []
  for (const child of element.children()) {
    const kind = child.kind()
    if (kind === 'jsx_opening_element' || kind === 'jsx_closing_element') {
      continue
    }
    if (kind === 'jsx_text' && child.text().trim().length === 0) {
      continue
    }
    children.push(child)
  }
  return children
}

function getTextContent(element: SgNode<TSX>): string | null {
  const parts: string[] = []
  for (const child of element.children()) {
    if (child.kind() === 'jsx_opening_element' || child.kind() === 'jsx_closing_element') {
      continue
    }
    if (child.kind() === 'jsx_text') {
      const trimmed = child.text().trim()
      if (trimmed.length > 0) {
        parts.push(trimmed)
      }
    } else {
      return null
    }
  }
  return parts.length > 0 ? parts.join(' ') : null
}

interface OptionInfo {
  id: string
  label: string
}

function extractMenuItemOptions(selectElement: SgNode<TSX>, menuItemLocalName: string): OptionInfo[] | null {
  const options: OptionInfo[] = []
  const children = getNonWhitespaceChildren(selectElement)

  for (const child of children) {
    const kind = child.kind()

    if (kind === 'jsx_element') {
      const childOpening = child.child(0)
      if (!childOpening) {
        return null
      }
      const childName = getElementName(childOpening)
      if (childName !== menuItemLocalName) {
        return null
      }

      const valueStr = getPropStringValue(childOpening, 'value')
      if (!valueStr) {
        return null
      }

      const label = getTextContent(child)
      if (!label) {
        return null
      }

      options.push({ id: valueStr, label })
      continue
    }

    if (kind === 'jsx_self_closing_element') {
      const childName = getElementName(child)
      if (childName !== menuItemLocalName) {
        return null
      }
      const valueStr = getPropStringValue(child, 'value')
      if (!valueStr) {
        return null
      }
      options.push({ id: valueStr, label: valueStr })
      continue
    }

    if (kind !== 'jsx_text') {
      return null
    }
  }

  return options.length > 0 ? options : null
}

function getArrowSingleParamName(arrow: SgNode<TSX>): string | null {
  const paramNode = arrow.field('parameter')
  if (paramNode?.is('identifier')) {
    return paramNode.text()
  }

  const params = arrow.field('parameters')
  if (!params) {
    return null
  }

  if (params.is('identifier')) {
    return params.text()
  }

  const paramNames: string[] = []
  for (const child of params.children()) {
    if (child.is('identifier')) {
      paramNames.push(child.text())
    } else if (child.is('required_parameter')) {
      const ident = child.find({ rule: { kind: 'identifier' } })
      if (ident) {
        paramNames.push(ident.text())
      }
    }
  }

  if (paramNames.length !== 1) {
    return null
  }

  return paramNames[0] ?? null
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
    targetValueNodes.map((target) => ({ target, text: 'key' })),
  )
  return `{key => ${rewrittenBody}}`
}

function escapeSingleQuotes(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")
}

function formatOption(option: OptionInfo): string {
  return `{ id: '${escapeSingleQuotes(option.id)}', label: '${escapeSingleQuotes(option.label)}' }`
}

function isDynamicSizeProp(opening: SgNode<TSX>): boolean {
  return hasProp(opening, 'size') && getPropStringValue(opening, 'size') === null
}

function hasDynamicSizeOnAny(openings: SgNode<TSX>[]): boolean {
  return openings.some((opening) => isDynamicSizeProp(opening))
}

function appendSizeProp(openings: SgNode<TSX>[], newProps: string[]): void {
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

function findSelectInFormControl(
  formControlElement: SgNode<TSX>,
  localNames: Map<string, string>,
): {
  label: string | null
  selectEl: SgNode<TSX> | null
  selectOpening: SgNode<TSX> | null
  hasHelperText: boolean
} {
  const result = {
    label: null as string | null,
    selectEl: null as SgNode<TSX> | null,
    selectOpening: null as SgNode<TSX> | null,
    hasHelperText: false,
  }

  const inputLabelLocal = [...localNames.entries()].find(([, v]) => v === 'InputLabel')?.[0] ?? null
  const selectLocal = [...localNames.entries()].find(([, v]) => v === 'Select')?.[0] ?? null
  const helperTextLocal = [...localNames.entries()].find(([, v]) => v === 'FormHelperText')?.[0] ?? null

  const children = getNonWhitespaceChildren(formControlElement)

  for (const child of children) {
    const kind = child.kind()

    if (kind === 'jsx_element' || kind === 'jsx_self_closing_element') {
      const childOpening = kind === 'jsx_self_closing_element' ? child : child.child(0)
      if (!childOpening) {
        continue
      }
      const childName = getElementName(childOpening)

      if (childName && childName === inputLabelLocal) {
        if (kind === 'jsx_element') {
          result.label = getTextContent(child)
        }
        continue
      }

      if (childName && childName === selectLocal) {
        result.selectEl = child
        result.selectOpening = childOpening
        continue
      }

      if (childName && childName === helperTextLocal) {
        result.hasHelperText = true
        continue
      }
    }
  }

  return result
}

function transformSelectPatterns(
  rootNode: SgNode<TSX, 'program'>,
  localNames: Map<string, string>,
  edits: Edit[],
): { preserveImport: boolean; migrated: boolean } {
  let preserveImport = false
  let migrated = false
  const formControlLocal = [...localNames.entries()].find(([, v]) => v === 'FormControl')?.[0] ?? null
  const selectLocal = [...localNames.entries()].find(([, v]) => v === 'Select')?.[0] ?? null
  const menuItemLocal = [...localNames.entries()].find(([, v]) => v === 'MenuItem')?.[0] ?? null

  if (!selectLocal) {
    return { preserveImport: false, migrated: false }
  }

  const jsxElements = rootNode.findAll({
    rule: {
      any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
    },
  })

  const processedSelectIds = new Set<number>()

  for (const el of jsxElements) {
    const isSelfClosing = el.is('jsx_self_closing_element')
    const opening = isSelfClosing ? el : el.child(0)
    if (!opening) {
      continue
    }

    const name = getElementName(opening)
    if (!name) {
      continue
    }

    if (name === formControlLocal && !isSelfClosing) {
      const { label, selectEl, selectOpening, hasHelperText } = findSelectInFormControl(el, localNames)

      if (!selectEl || !selectOpening) {
        continue
      }

      processedSelectIds.add(selectEl.id())

      if (hasHelperText) {
        preserveImport = true
        edits.push(
          el.replace(withTodoComment(`{/* TODO(backstage-codemod): finish Select migration manually */}`, el.text())),
        )
        migrationMetric.increment({ action: 'todo-inserted', reason: 'helper-text' })
        continue
      }

      let needsTodo = false
      for (const prop of TODO_PROPS) {
        if (hasProp(selectOpening, prop)) {
          needsTodo = true
          break
        }
      }

      if (needsTodo) {
        preserveImport = true
        edits.push(
          el.replace(withTodoComment(`{/* TODO(backstage-codemod): finish Select migration manually */}`, el.text())),
        )
        migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-select-props' })
        continue
      }

      let options: OptionInfo[] | null = null
      if (menuItemLocal && !selectEl.is('jsx_self_closing_element')) {
        options = extractMenuItemOptions(selectEl, menuItemLocal)
      }

      if (!options) {
        preserveImport = true
        edits.push(
          el.replace(withTodoComment(`{/* TODO(backstage-codemod): finish Select migration manually */}`, el.text())),
        )
        migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-options' })
        continue
      }

      if (hasDynamicSizeOnAny([selectOpening, opening])) {
        preserveImport = true
        edits.push(
          el.replace(
            withTodoComment(
              `{/* TODO(backstage-codemod): finish Select migration manually (dynamic-size) */}`,
              el.text(),
            ),
          ),
        )
        migrationMetric.increment({ action: 'todo-inserted', reason: 'dynamic-size' })
        continue
      }

      const newProps: string[] = []

      if (label) {
        newProps.push(`label={${JSON.stringify(label)}}`)
      }

      appendSizeProp([selectOpening, opening], newProps)

      const valueRaw = getPropRawValue(selectOpening, 'value')
      if (valueRaw) {
        newProps.push(`selectedKey=${valueRaw}`)
      }

      const onChangeAttr = getPropAttr(selectOpening, 'onChange')
      if (onChangeAttr) {
        const rewritten = tryRewriteOnChangeHandler(onChangeAttr)
        if (rewritten) {
          newProps.push(`onSelectionChange=${rewritten}`)
          migrationMetric.increment({ action: 'onChange-rewritten' })
        } else {
          preserveImport = true
          edits.push(
            el.replace(withTodoComment(`{/* TODO(backstage-codemod): finish Select migration manually */}`, el.text())),
          )
          migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-onChange' })
          continue
        }
      }

      const optionsStr = options.map(formatOption).join(', ')
      newProps.push(`options={[${optionsStr}]}`)

      const propsStr = newProps.join(' ')
      edits.push(el.replace(`<Select ${propsStr} />`))
      migrated = true
      migrationMetric.increment({ action: 'select-migrated' })
      continue
    }

    if (name === selectLocal && !processedSelectIds.has(el.id())) {
      let needsTodo = false
      for (const prop of TODO_PROPS) {
        if (hasProp(opening, prop)) {
          needsTodo = true
          break
        }
      }

      if (needsTodo) {
        preserveImport = true
        edits.push(
          el.replace(withTodoComment(`{/* TODO(backstage-codemod): finish Select migration manually */}`, el.text())),
        )
        migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-select-props' })
        continue
      }

      let options: OptionInfo[] | null = null
      if (menuItemLocal && !isSelfClosing) {
        options = extractMenuItemOptions(el, menuItemLocal)
      }

      if (!options) {
        preserveImport = true
        edits.push(
          el.replace(withTodoComment(`{/* TODO(backstage-codemod): finish Select migration manually */}`, el.text())),
        )
        migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-options' })
        continue
      }

      if (isDynamicSizeProp(opening)) {
        preserveImport = true
        edits.push(
          el.replace(
            withTodoComment(
              `{/* TODO(backstage-codemod): finish Select migration manually (dynamic-size) */}`,
              el.text(),
            ),
          ),
        )
        migrationMetric.increment({ action: 'todo-inserted', reason: 'dynamic-size' })
        continue
      }

      const newProps: string[] = []

      appendSizeProp([opening], newProps)

      const valueRaw = getPropRawValue(opening, 'value')
      if (valueRaw) {
        newProps.push(`selectedKey=${valueRaw}`)
      }

      const onChangeAttr = getPropAttr(opening, 'onChange')
      if (onChangeAttr) {
        const rewritten = tryRewriteOnChangeHandler(onChangeAttr)
        if (rewritten) {
          newProps.push(`onSelectionChange=${rewritten}`)
          migrationMetric.increment({ action: 'onChange-rewritten' })
        } else {
          preserveImport = true
          edits.push(
            el.replace(withTodoComment(`{/* TODO(backstage-codemod): finish Select migration manually */}`, el.text())),
          )
          migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-onChange' })
          continue
        }
      }

      const optionsStr = options.map(formatOption).join(', ')
      newProps.push(`options={[${optionsStr}]}`)

      const propsStr = newProps.join(' ')
      edits.push(el.replace(`<Select ${propsStr} />`))
      migrated = true
      migrationMetric.increment({ action: 'select-migrated' })
      continue
    }
  }

  return { preserveImport, migrated }
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames, defaultSources, barrelNames } = collectSelectImports(rootNode)

  const hasSelect = [...localNames.values()].includes('Select')
  if (!hasSelect) {
    return Promise.resolve(null)
  }

  const { preserveImport, migrated } = transformSelectPatterns(rootNode, localNames, edits)

  if (migrated) {
    const addEdit = addImport(rootNode, {
      type: 'named',
      specifiers: [{ name: 'Select' }],
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
    if (barrelNames.length > 0) {
      const removedNames = new Set(barrelNames)
      for (const item of listImports(rootNode, { from: MUI_BARREL_SOURCE })) {
        const matching = item.specifiers.filter((spec) => removedNames.has(spec.importedName))
        if (matching.length === 0) {
          continue
        }
        if (matching.length >= item.specifiers.length) {
          migrationMetric.increment({ action: 'import-removed' })
        } else {
          migrationMetric.increment({ action: 'import-pruned' })
        }
      }
      const edit = removeImport(rootNode, { type: 'named', specifiers: barrelNames, from: MUI_BARREL_SOURCE })
      if (edit) {
        edits.push(...edit)
      }
    }
    for (const source of defaultSources) {
      const edit = removeImport(rootNode, { type: 'default', from: source })
      if (edit) {
        edits.push(...edit)
        migrationMetric.increment({ action: 'import-removed' })
      }
    }
  }

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
