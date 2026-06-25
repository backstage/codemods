import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-select-family-to-bui-select')

const BUI_SOURCE = '@backstage/ui'

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

interface SelectImports {
  localNames: Map<string, string>
  importNodesToRemove: SgNode<TSX>[]
}

function collectSelectImports(rootNode: SgNode<TSX>): SelectImports {
  const localNames = new Map<string, string>()
  const importNodesToRemove: SgNode<TSX>[] = []

  for (const componentName of MUI_SELECT_COMPONENTS) {
    for (const imp of findImportStatementsFrom(rootNode, `@material-ui/core/${componentName}`)) {
      const name = getDefaultImportName(imp)
      if (name) {
        localNames.set(name, componentName)
      }
      importNodesToRemove.push(imp)
    }
  }

  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core')) {
    let foundCount = 0
    for (const componentName of MUI_SELECT_COMPONENTS) {
      const localName = getNamedImportLocalName(imp, componentName)
      if (localName) {
        localNames.set(localName, componentName)
        foundCount++
      }
    }
    if (foundCount > 0) {
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (foundCount >= allSpecifiers.length) {
        importNodesToRemove.push(imp)
      }
    }
  }

  return { localNames, importNodesToRemove }
}

function addBuiImport(rootNode: SgNode<TSX>, names: string[], edits: Edit[]): void {
  const existingImports = findImportStatementsFrom(rootNode, BUI_SOURCE)
  const existingImport = existingImports[0] ?? null

  if (existingImport) {
    const namedImports = existingImport.find({ rule: { kind: 'named_imports' } })
    if (namedImports) {
      const text = namedImports.text()
      const inner = text.slice(1, -1).trim()
      const existing = inner
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
      for (const name of names) {
        if (!existing.includes(name)) {
          existing.push(name)
        }
      }
      existing.sort()
      edits.push(namedImports.replace(`{ ${existing.join(', ')} }`))
      migrationMetric.increment({ action: 'import-merged' })
    }
  } else {
    const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
    const sortedNames = [...names].sort()
    if (allImports.length > 0) {
      const lastImport = allImports.at(-1)
      if (lastImport) {
        edits.push(
          lastImport.replace(`${lastImport.text()}\nimport { ${sortedNames.join(', ')} } from '${BUI_SOURCE}';`),
        )
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

function getPropStringValue(opening: SgNode<TSX>, propName: string): string | null {
  const attr = getPropAttr(opening, propName)
  if (!attr) {
    return null
  }
  const stringNode = attr.find({ rule: { kind: 'string' } })
  if (stringNode) {
    const frag = stringNode.find({ rule: { kind: 'string_fragment' } })
    return frag?.text() ?? null
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

  const rewrittenBody = bodyText.replace(targetValuePattern(eventName), 'key')
  return `{key => ${rewrittenBody}}`
}

function escapeSingleQuotes(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")
}

function formatOption(option: OptionInfo): string {
  return `{ id: '${escapeSingleQuotes(option.id)}', label: '${escapeSingleQuotes(option.label)}' }`
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

function transformSelectPatterns(rootNode: SgNode<TSX>, localNames: Map<string, string>, edits: Edit[]): void {
  const formControlLocal = [...localNames.entries()].find(([, v]) => v === 'FormControl')?.[0] ?? null
  const selectLocal = [...localNames.entries()].find(([, v]) => v === 'Select')?.[0] ?? null
  const menuItemLocal = [...localNames.entries()].find(([, v]) => v === 'MenuItem')?.[0] ?? null

  if (!selectLocal) {
    return
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
        edits.push(el.replace(`{/* TODO(backstage-codemod): finish Select migration manually */}\n${el.text()}`))
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
        edits.push(el.replace(`{/* TODO(backstage-codemod): finish Select migration manually */}\n${el.text()}`))
        migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-select-props' })
        continue
      }

      let options: OptionInfo[] | null = null
      if (menuItemLocal && !selectEl.is('jsx_self_closing_element')) {
        options = extractMenuItemOptions(selectEl, menuItemLocal)
      }

      if (!options) {
        edits.push(el.replace(`{/* TODO(backstage-codemod): finish Select migration manually */}\n${el.text()}`))
        migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-options' })
        continue
      }

      const newProps: string[] = []

      if (label) {
        newProps.push(`label="${label}"`)
      }

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
          edits.push(el.replace(`{/* TODO(backstage-codemod): finish Select migration manually */}\n${el.text()}`))
          migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-onChange' })
          continue
        }
      }

      const optionsStr = options.map(formatOption).join(', ')
      newProps.push(`options={[${optionsStr}]}`)

      const propsStr = newProps.join(' ')
      edits.push(el.replace(`<Select ${propsStr} />`))
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
        edits.push(el.replace(`{/* TODO(backstage-codemod): finish Select migration manually */}\n${el.text()}`))
        migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-select-props' })
        continue
      }

      let options: OptionInfo[] | null = null
      if (menuItemLocal && !isSelfClosing) {
        options = extractMenuItemOptions(el, menuItemLocal)
      }

      if (!options) {
        edits.push(el.replace(`{/* TODO(backstage-codemod): finish Select migration manually */}\n${el.text()}`))
        migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-options' })
        continue
      }

      const newProps: string[] = []

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
          edits.push(el.replace(`{/* TODO(backstage-codemod): finish Select migration manually */}\n${el.text()}`))
          migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-onChange' })
          continue
        }
      }

      const optionsStr = options.map(formatOption).join(', ')
      newProps.push(`options={[${optionsStr}]}`)

      const propsStr = newProps.join(' ')
      edits.push(el.replace(`<Select ${propsStr} />`))
      migrationMetric.increment({ action: 'select-migrated' })
      continue
    }
  }
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames, importNodesToRemove } = collectSelectImports(rootNode)

  const hasSelect = [...localNames.values()].includes('Select')
  if (!hasSelect) {
    return Promise.resolve(null)
  }

  for (const imp of importNodesToRemove) {
    edits.push(imp.replace(''))
    migrationMetric.increment({ action: 'import-removed' })
  }

  addBuiImport(rootNode, ['Select'], edits)
  transformSelectPatterns(rootNode, localNames, edits)

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
