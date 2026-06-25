import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-radio-checkbox-to-bui')

const BUI_SOURCE = '@backstage/ui'
const MUI_BARREL_SOURCE = '@material-ui/core'

const MUI_COMPONENTS = ['RadioGroup', 'Radio', 'Checkbox', 'FormControlLabel', 'FormGroup', 'FormControl', 'FormLabel']

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

interface GroupImports {
  localNames: Map<string, string>
  importNodesToRemove: SgNode<TSX>[]
  barrelImportsToPrune: { imp: SgNode<TSX>; namesToRemove: Set<string> }[]
}

function collectGroupImports(rootNode: SgNode<TSX>): GroupImports {
  const localNames = new Map<string, string>()
  const importNodesToRemove: SgNode<TSX>[] = []
  const barrelImportsToPrune: { imp: SgNode<TSX>; namesToRemove: Set<string> }[] = []

  for (const componentName of MUI_COMPONENTS) {
    for (const imp of findImportStatementsFrom(rootNode, `@material-ui/core/${componentName}`)) {
      const name = getDefaultImportName(imp)
      if (name) {
        localNames.set(name, componentName)
      }
      importNodesToRemove.push(imp)
    }
  }

  for (const imp of findImportStatementsFrom(rootNode, MUI_BARREL_SOURCE)) {
    const foundNames = new Set<string>()
    for (const componentName of MUI_COMPONENTS) {
      const localName = getNamedImportLocalName(imp, componentName)
      if (localName) {
        localNames.set(localName, componentName)
        foundNames.add(componentName)
      }
    }
    if (foundNames.size > 0) {
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (foundNames.size >= allSpecifiers.length) {
        importNodesToRemove.push(imp)
      } else {
        barrelImportsToPrune.push({ imp, namesToRemove: foundNames })
      }
    }
  }

  return { localNames, importNodesToRemove, barrelImportsToPrune }
}

function addBuiImport(
  rootNode: SgNode<TSX>,
  importNodesToRemove: SgNode<TSX>[],
  names: string[],
  edits: Edit[],
): boolean {
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
    return false
  }

  const sortedNames = [...names].sort()
  const removableIds = new Set(importNodesToRemove.map((imp) => imp.id()))
  const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
  const anchorImport = [...allImports].reverse().find((imp) => !removableIds.has(imp.id())) ?? null

  if (anchorImport) {
    edits.push(
      anchorImport.replace(`${anchorImport.text()}\nimport { ${sortedNames.join(', ')} } from '${BUI_SOURCE}';`),
    )
  } else if (importNodesToRemove.length === 1) {
    const [importNode] = importNodesToRemove
    if (importNode) {
      edits.push(importNode.replace(`import { ${sortedNames.join(', ')} } from '${BUI_SOURCE}';`))
      migrationMetric.increment({ action: 'import-added' })
      return true
    }
  } else if (allImports.length > 0) {
    const lastImport = allImports.at(-1)
    if (lastImport) {
      edits.push(lastImport.replace(`${lastImport.text()}\nimport { ${sortedNames.join(', ')} } from '${BUI_SOURCE}';`))
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

function getJsxChildren(element: SgNode<TSX>): SgNode<TSX>[] {
  const children: SgNode<TSX>[] = []
  for (const child of element.children()) {
    const kind = child.kind()
    if (kind === 'jsx_opening_element' || kind === 'jsx_closing_element') {
      continue
    }
    children.push(child)
  }
  return children
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

function detectControlType(fclOpening: SgNode<TSX>, localNames: Map<string, string>): 'Radio' | 'Checkbox' | null {
  const controlAttr = getPropAttr(fclOpening, 'control')
  if (!controlAttr) {
    return null
  }
  const expr = controlAttr.find({ rule: { kind: 'jsx_expression' } })
  if (!expr) {
    return null
  }
  const selfClosing = expr.find({ rule: { kind: 'jsx_self_closing_element' } })
  if (!selfClosing) {
    return null
  }
  const controlName = getElementName(selfClosing)
  if (!controlName) {
    return null
  }
  const muiName = localNames.get(controlName)
  if (muiName === 'Radio') {
    return 'Radio'
  }
  if (muiName === 'Checkbox') {
    return 'Checkbox'
  }
  return null
}

function extractControlProps(fclOpening: SgNode<TSX>): SgNode<TSX> | null {
  const controlAttr = getPropAttr(fclOpening, 'control')
  if (!controlAttr) {
    return null
  }
  const expr = controlAttr.find({ rule: { kind: 'jsx_expression' } })
  if (!expr) {
    return null
  }
  return expr.find({ rule: { kind: 'jsx_self_closing_element' } })
}

function transformRadioGroupChildren(groupElement: SgNode<TSX>, localNames: Map<string, string>): string | null {
  const fclLocalName = [...localNames.entries()].find(([, v]) => v === 'FormControlLabel')?.[0] ?? null
  const children = getJsxChildren(groupElement)
  const parts: string[] = []

  for (const child of children) {
    const kind = child.kind()
    if (kind === 'jsx_text') {
      parts.push(child.text())
      continue
    }
    if (kind === 'jsx_self_closing_element' && fclLocalName) {
      const childName = getElementName(child)
      if (childName === fclLocalName) {
        const controlType = detectControlType(child, localNames)
        if (controlType !== 'Radio') {
          return null
        }
        const label = getPropStringValue(child, 'label')
        if (!label) {
          return null
        }
        const valueStr = getPropStringValue(child, 'value')
        const valueRaw = getPropRawValue(child, 'value')
        const props: string[] = []
        if (valueStr !== null) {
          props.push(`value="${valueStr}"`)
        } else if (valueRaw !== null) {
          props.push(`value=${valueRaw}`)
        }
        if (hasProp(child, 'disabled')) {
          props.push('isDisabled')
        }
        const propsStr = props.length > 0 ? ` ${props.join(' ')}` : ''
        parts.push(`<Radio${propsStr}>${label}</Radio>`)
        migrationMetric.increment({ action: 'radio-option-migrated' })
        continue
      }
    }
    parts.push(child.text())
  }

  return parts.join('')
}

function transformCheckboxGroupChildren(groupElement: SgNode<TSX>, localNames: Map<string, string>): string | null {
  const fclLocalName = [...localNames.entries()].find(([, v]) => v === 'FormControlLabel')?.[0] ?? null
  const children = getJsxChildren(groupElement)
  const parts: string[] = []

  for (const child of children) {
    const kind = child.kind()
    if (kind === 'jsx_text') {
      parts.push(child.text())
      continue
    }
    if (kind === 'jsx_self_closing_element' && fclLocalName) {
      const childName = getElementName(child)
      if (childName === fclLocalName) {
        const controlType = detectControlType(child, localNames)
        if (controlType !== 'Checkbox') {
          return null
        }
        const label = getPropStringValue(child, 'label')
        if (!label) {
          return null
        }
        const controlEl = extractControlProps(child)
        if (!controlEl) {
          return null
        }
        const props: string[] = []
        const checkedRaw = getPropRawValue(controlEl, 'checked')
        if (checkedRaw !== null) {
          props.push(`isSelected=${checkedRaw}`)
        }
        const onChangeRaw = getPropRawValue(controlEl, 'onChange')
        if (onChangeRaw !== null) {
          props.push(`onChange=${onChangeRaw}`)
        }
        const nameRaw = getPropRawValue(controlEl, 'name')
        if (nameRaw !== null) {
          props.push(`name=${nameRaw}`)
        }
        if (hasProp(child, 'disabled') || hasProp(controlEl, 'disabled')) {
          props.push('isDisabled')
        }
        const propsStr = props.length > 0 ? ` ${props.join(' ')}` : ''
        parts.push(`<Checkbox${propsStr}>${label}</Checkbox>`)
        migrationMetric.increment({ action: 'checkbox-option-migrated' })
        continue
      }
    }
    parts.push(child.text())
  }

  return parts.join('')
}

function isCheckboxFormGroup(element: SgNode<TSX>, localNames: Map<string, string>): boolean {
  const fclLocalName = [...localNames.entries()].find(([, v]) => v === 'FormControlLabel')?.[0] ?? null
  if (!fclLocalName) {
    return false
  }
  const meaningfulChildren = getNonWhitespaceChildren(element)
  if (meaningfulChildren.length === 0) {
    return false
  }
  let hasCheckbox = false
  for (const child of meaningfulChildren) {
    if (!child.is('jsx_self_closing_element')) {
      return false
    }
    const childName = getElementName(child)
    if (childName !== fclLocalName) {
      return false
    }
    const controlType = detectControlType(child, localNames)
    if (controlType !== 'Checkbox') {
      return false
    }
    hasCheckbox = true
  }
  return hasCheckbox
}

function transformGroupElements(
  rootNode: SgNode<TSX>,
  localNames: Map<string, string>,
  edits: Edit[],
): { usedBuiNames: Set<string>; preserveImport: boolean } {
  const usedBuiNames = new Set<string>()
  let preserveImport = false
  const radioGroupLocal = [...localNames.entries()].find(([, v]) => v === 'RadioGroup')?.[0] ?? null
  const formGroupLocal = [...localNames.entries()].find(([, v]) => v === 'FormGroup')?.[0] ?? null

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
    if (!name) {
      continue
    }

    if (name === radioGroupLocal && !isSelfClosing) {
      const transformedChildren = transformRadioGroupChildren(el, localNames)
      if (transformedChildren === null) {
        preserveImport = true
        edits.push(
          el.replace(
            wrapWithTodo(`{/* TODO(backstage-codemod): finish choice-group migration manually */}`, el.text()),
          ),
        )
        migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-radio-group' })
        continue
      }
      const newProps: string[] = []
      const valueRaw = getPropRawValue(opening, 'value')
      if (valueRaw !== null) {
        newProps.push(`value=${valueRaw}`)
      }
      const onChangeRaw = getPropRawValue(opening, 'onChange')
      if (onChangeRaw !== null) {
        newProps.push(`onChange=${onChangeRaw}`)
      }
      const nameRaw = getPropRawValue(opening, 'name')
      if (nameRaw !== null) {
        newProps.push(`name=${nameRaw}`)
      }
      const propsStr = newProps.length > 0 ? ` ${newProps.join(' ')}` : ''
      edits.push(el.replace(`<RadioGroup${propsStr}>${transformedChildren}</RadioGroup>`))
      usedBuiNames.add('RadioGroup')
      usedBuiNames.add('Radio')
      migrationMetric.increment({ action: 'radio-group-migrated' })
      continue
    }

    if (name === formGroupLocal && !isSelfClosing) {
      if (!isCheckboxFormGroup(el, localNames)) {
        preserveImport = true
        edits.push(
          el.replace(
            wrapWithTodo(`{/* TODO(backstage-codemod): finish choice-group migration manually */}`, el.text()),
          ),
        )
        migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-form-group' })
        continue
      }
      const transformedChildren = transformCheckboxGroupChildren(el, localNames)
      if (transformedChildren === null) {
        preserveImport = true
        edits.push(
          el.replace(
            wrapWithTodo(`{/* TODO(backstage-codemod): finish choice-group migration manually */}`, el.text()),
          ),
        )
        migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-checkbox-group' })
        continue
      }
      edits.push(el.replace(`<CheckboxGroup>${transformedChildren}</CheckboxGroup>`))
      usedBuiNames.add('CheckboxGroup')
      usedBuiNames.add('Checkbox')
      migrationMetric.increment({ action: 'checkbox-group-migrated' })
      continue
    }
  }

  return { usedBuiNames, preserveImport }
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames, importNodesToRemove, barrelImportsToPrune } = collectGroupImports(rootNode)

  const hasTarget = [...localNames.values()].some(
    (v) => v === 'RadioGroup' || v === 'FormGroup' || v === 'FormControlLabel',
  )
  if (!hasTarget) {
    return Promise.resolve(null)
  }

  const { usedBuiNames, preserveImport } = transformGroupElements(rootNode, localNames, edits)

  let replacedImport = false
  if (usedBuiNames.size > 0) {
    replacedImport = addBuiImport(rootNode, importNodesToRemove, [...usedBuiNames], edits)
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
