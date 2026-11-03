import { addImport, getAllImports, getImport, listImports, removeImport } from '@jssg/utils/javascript/imports'
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

function withTodoComment(comment: string, elementText: string): string {
  return `<>
  ${comment}
  ${elementText}
</>`
}

interface GroupImports {
  localNames: Map<string, string>
  defaultSources: string[]
  barrelNames: string[]
}

function collectGroupImports(rootNode: SgNode<TSX, 'program'>): GroupImports {
  const localNames = new Map<string, string>()
  const defaultSources: string[] = []
  const barrelNames: string[] = []

  for (const componentName of MUI_COMPONENTS) {
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
        if (hasProp(controlEl, 'checked')) {
          const checkedRaw = getPropRawValue(controlEl, 'checked')
          if (checkedRaw !== null && checkedRaw !== '') {
            props.push(`isSelected=${checkedRaw}`)
          } else {
            props.push('isSelected')
          }
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

function isInsideChoiceGroup(
  element: SgNode<TSX>,
  radioGroupLocal: string | null,
  formGroupLocal: string | null,
): boolean {
  for (const ancestor of element.ancestors()) {
    if (ancestor.kind() !== 'jsx_element') {
      continue
    }
    const opening = ancestor.child(0)
    if (!opening) {
      continue
    }
    const ancestorName = getElementName(opening)
    if (ancestorName && (ancestorName === radioGroupLocal || ancestorName === formGroupLocal)) {
      return true
    }
  }
  return false
}

function buildStandaloneCheckboxProps(controlEl: SgNode<TSX>, fclOpening?: SgNode<TSX>): string[] {
  const props: string[] = []
  if (hasProp(controlEl, 'checked')) {
    const checkedRaw = getPropRawValue(controlEl, 'checked')
    if (checkedRaw !== null && checkedRaw !== '') {
      props.push(`isSelected=${checkedRaw}`)
    } else {
      props.push('isSelected')
    }
  }
  const onChangeRaw = getPropRawValue(controlEl, 'onChange')
  if (onChangeRaw !== null) {
    props.push(`onChange=${onChangeRaw}`)
  }
  const nameRaw = getPropRawValue(controlEl, 'name')
  if (nameRaw !== null) {
    props.push(`name=${nameRaw}`)
  }
  if (hasProp(controlEl, 'disabled') || (fclOpening && hasProp(fclOpening, 'disabled'))) {
    props.push('isDisabled')
  }

  // Preserve remaining safe props from the Checkbox itself
  const handled = new Set(['checked', 'onChange', 'name', 'disabled', 'color', 'size', 'indeterminate'])
  for (const attr of controlEl.findAll({ rule: { kind: 'jsx_attribute' } })) {
    const propIdent = attr.find({ rule: { kind: 'property_identifier' } })
    if (!propIdent) {
      continue
    }
    const propName = propIdent.text()
    if (handled.has(propName)) {
      continue
    }
    props.push(attr.text())
  }

  return props
}

function tryTransformStandaloneFormControlLabel(el: SgNode<TSX>, localNames: Map<string, string>): string | null {
  const controlType = detectControlType(el, localNames)
  if (controlType !== 'Checkbox') {
    return null
  }
  const label = getPropStringValue(el, 'label')
  if (!label) {
    return null
  }
  const controlEl = extractControlProps(el)
  if (!controlEl) {
    return null
  }
  const props = buildStandaloneCheckboxProps(controlEl, el)
  const propsStr = props.length > 0 ? ` ${props.join(' ')}` : ''
  return `<Checkbox${propsStr}>${label}</Checkbox>`
}

function tryTransformStandaloneCheckbox(el: SgNode<TSX>): string | null {
  const isSelfClosing = el.is('jsx_self_closing_element')
  const opening = isSelfClosing ? el : el.child(0)
  if (!opening) {
    return null
  }

  // Skip checkboxes that are nested inside FormControlLabel control={...}
  for (const ancestor of el.ancestors()) {
    if (ancestor.kind() === 'jsx_attribute') {
      const propIdent = ancestor.find({ rule: { kind: 'property_identifier' } })
      if (propIdent?.text() === 'control') {
        return null
      }
    }
  }

  const props = buildStandaloneCheckboxProps(opening)
  const propsStr = props.length > 0 ? ` ${props.join(' ')}` : ''

  if (isSelfClosing) {
    return `<Checkbox${propsStr} />`
  }

  const children = getJsxChildren(el)
    .map((c) => c.text())
    .join('')
  return `<Checkbox${propsStr}>${children}</Checkbox>`
}

function transformGroupElements(
  rootNode: SgNode<TSX, 'program'>,
  localNames: Map<string, string>,
  edits: Edit[],
): { usedBuiNames: Set<string>; preserveImport: boolean } {
  const usedBuiNames = new Set<string>()
  let preserveImport = false
  const radioGroupLocal = [...localNames.entries()].find(([, v]) => v === 'RadioGroup')?.[0] ?? null
  const formGroupLocal = [...localNames.entries()].find(([, v]) => v === 'FormGroup')?.[0] ?? null
  const fclLocal = [...localNames.entries()].find(([, v]) => v === 'FormControlLabel')?.[0] ?? null
  const checkboxLocal = [...localNames.entries()].find(([, v]) => v === 'Checkbox')?.[0] ?? null

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
            withTodoComment(`{/* TODO(backstage-codemod): finish choice-group migration manually */}`, el.text()),
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
            withTodoComment(`{/* TODO(backstage-codemod): finish choice-group migration manually */}`, el.text()),
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
            withTodoComment(`{/* TODO(backstage-codemod): finish choice-group migration manually */}`, el.text()),
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

    // Standalone FormControlLabel + Checkbox (not inside a choice group)
    if (name === fclLocal && isSelfClosing && !isInsideChoiceGroup(el, radioGroupLocal, formGroupLocal)) {
      const output = tryTransformStandaloneFormControlLabel(el, localNames)
      if (output === null) {
        preserveImport = true
        edits.push(
          el.replace(
            withTodoComment(
              `{/* TODO(backstage-codemod): finish standalone checkbox migration manually */}`,
              el.text(),
            ),
          ),
        )
        migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-standalone-fcl' })
        continue
      }
      edits.push(el.replace(output))
      usedBuiNames.add('Checkbox')
      migrationMetric.increment({ action: 'standalone-checkbox-migrated', via: 'FormControlLabel' })
      continue
    }

    // Standalone Checkbox (not inside FormGroup / RadioGroup / FormControlLabel control)
    if (name === checkboxLocal && !isInsideChoiceGroup(el, radioGroupLocal, formGroupLocal)) {
      const output = tryTransformStandaloneCheckbox(el)
      if (output === null) {
        continue
      }
      edits.push(el.replace(output))
      usedBuiNames.add('Checkbox')
      migrationMetric.increment({ action: 'standalone-checkbox-migrated', via: 'Checkbox' })
    }
  }

  return { usedBuiNames, preserveImport }
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames, defaultSources, barrelNames } = collectGroupImports(rootNode)

  const hasTarget = [...localNames.values()].some(
    (v) => v === 'RadioGroup' || v === 'FormGroup' || v === 'FormControlLabel' || v === 'Checkbox',
  )
  if (!hasTarget) {
    return Promise.resolve(null)
  }

  const { usedBuiNames, preserveImport } = transformGroupElements(rootNode, localNames, edits)

  if (usedBuiNames.size > 0) {
    const addEdit = addImport(rootNode, {
      type: 'named',
      specifiers: [...usedBuiNames].sort().map((name) => ({ name })),
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
