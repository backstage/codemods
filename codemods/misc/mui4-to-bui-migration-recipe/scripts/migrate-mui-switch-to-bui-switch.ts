import { addImport, getAllImports, getImport, listImports, removeImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-switch-to-bui-switch')

const BUI_SOURCE = '@backstage/ui'
const MUI_BARREL_SOURCE = '@material-ui/core'

const PROP_RENAMES: Record<string, string> = {
  checked: 'isSelected',
  defaultChecked: 'defaultSelected',
  disabled: 'isDisabled',
}

const PASSTHROUGH_PROPS = new Set([
  'name',
  'value',
  'id',
  'className',
  'style',
  'onChange',
  'onFocus',
  'onBlur',
  'autoFocus',
  'required',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
])

const TODO_PROPS = new Set([
  'color',
  'size',
  'edge',
  'classes',
  'inputProps',
  'inputRef',
  'icon',
  'checkedIcon',
  'disableRipple',
  'focusVisibleClassName',
  'centerRipple',
  'disableTouchRipple',
  'disableFocusRipple',
  'TouchRippleProps',
  'type',
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

function collectSwitchImports(rootNode: SgNode<TSX, 'program'>): {
  switchLocalName: string | null
  fclLocalName: string | null
  defaultSources: string[]
  barrelNames: string[]
} {
  let switchLocalName: string | null = null
  let fclLocalName: string | null = null
  const defaultSources: string[] = []
  const barrelNames: string[] = []

  const switchDefault = getImport(rootNode, { type: 'default', from: '@material-ui/core/Switch' })
  if (switchDefault) {
    switchLocalName = switchDefault.alias
    defaultSources.push('@material-ui/core/Switch')
  }
  const fclDefault = getImport(rootNode, { type: 'default', from: '@material-ui/core/FormControlLabel' })
  if (fclDefault) {
    fclLocalName = fclDefault.alias
    defaultSources.push('@material-ui/core/FormControlLabel')
  }

  for (const named of getAllImports(rootNode, { type: 'named', name: 'Switch', from: MUI_BARREL_SOURCE })) {
    switchLocalName = named.alias
    if (!barrelNames.includes('Switch')) {
      barrelNames.push('Switch')
    }
  }
  for (const named of getAllImports(rootNode, { type: 'named', name: 'FormControlLabel', from: MUI_BARREL_SOURCE })) {
    fclLocalName = named.alias
    if (!barrelNames.includes('FormControlLabel')) {
      barrelNames.push('FormControlLabel')
    }
  }

  return { switchLocalName, fclLocalName, defaultSources, barrelNames }
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
  // Boolean prop with no value
  return ''
}

function collectTodoProps(opening: SgNode<TSX>): string[] {
  const reasons: string[] = []
  for (const prop of TODO_PROPS) {
    if (hasProp(opening, prop)) {
      reasons.push(prop)
    }
  }
  return reasons
}

function buildSwitchPropsFromOpening(opening: SgNode<TSX>, extraProps: string[] = []): string[] {
  const newProps: string[] = [...extraProps]

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
      if (PASSTHROUGH_PROPS.has(propName) || propName.startsWith('aria-') || propName.startsWith('data-')) {
        newProps.push(child.text())
        continue
      }
      // Unknown non-TODO props: passthrough cautiously
      if (!TODO_PROPS.has(propName)) {
        newProps.push(child.text())
      }
    } else if (kind === 'jsx_expression' && child.text().startsWith('{...')) {
      newProps.push(child.text())
    }
  }

  return newProps
}

function extractControlSwitch(fclOpening: SgNode<TSX>, switchLocalName: string): SgNode<TSX> | null {
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
  if (controlName !== switchLocalName) {
    return null
  }
  return selfClosing
}

function transformElements(
  rootNode: SgNode<TSX, 'program'>,
  switchLocalName: string,
  fclLocalName: string | null,
  edits: Edit[],
): { preserveImport: boolean; migrated: boolean; consumedSwitchIds: Set<number> } {
  let preserveImport = false
  let migrated = false
  const consumedSwitchIds = new Set<number>()

  const jsxElements = rootNode.findAll({
    rule: {
      any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
    },
  })

  // First pass: FormControlLabel wrapping Switch
  if (fclLocalName) {
    for (const el of jsxElements) {
      const isSelfClosing = el.is('jsx_self_closing_element')
      const opening = isSelfClosing ? el : el.child(0)
      if (!opening) {
        continue
      }
      const name = getElementName(opening)
      if (name !== fclLocalName) {
        continue
      }

      const controlSwitch = extractControlSwitch(opening, switchLocalName)
      if (!controlSwitch) {
        continue
      }

      const todoReasons = [
        ...collectTodoProps(controlSwitch),
        ...collectTodoProps(opening).filter((p) => p !== 'control'),
      ]
      if (hasProp(opening, 'labelPlacement')) {
        todoReasons.push('labelPlacement')
      }

      const labelString = getPropStringValue(opening, 'label')
      const labelRaw = getPropRawValue(opening, 'label')
      if (labelString === null) {
        // Dynamic / JSX / missing label
        todoReasons.push(labelRaw !== null ? 'complex-label' : 'missing-label')
      }

      if (todoReasons.length > 0) {
        preserveImport = true
        edits.push(
          el.replace(
            withTodoComment(
              `{/* TODO(backstage-codemod): finish switch migration manually (${todoReasons.join(', ')}) */}`,
              el.text(),
            ),
          ),
        )
        migrationMetric.increment({ action: 'todo-inserted', reason: todoReasons.join(', ') })
        consumedSwitchIds.add(controlSwitch.id())
        continue
      }

      const extraProps: string[] = [`label="${labelString}"`]
      if (hasProp(opening, 'disabled') && !hasProp(controlSwitch, 'disabled')) {
        extraProps.push('isDisabled')
        migrationMetric.increment({ action: 'prop-renamed', from: 'disabled', to: 'isDisabled' })
      }

      const newProps = buildSwitchPropsFromOpening(controlSwitch, extraProps)
      const propsStr = newProps.length > 0 ? ` ${newProps.join(' ')}` : ''
      edits.push(el.replace(`<Switch${propsStr} />`))
      consumedSwitchIds.add(controlSwitch.id())
      migrated = true
      migrationMetric.increment({ action: 'switch-migrated', via: 'form-control-label' })
    }
  }

  // Second pass: standalone Switch
  for (const el of jsxElements) {
    const isSelfClosing = el.is('jsx_self_closing_element')
    const opening = isSelfClosing ? el : el.child(0)
    if (!opening) {
      continue
    }

    const name = getElementName(opening)
    if (name !== switchLocalName) {
      continue
    }

    if (consumedSwitchIds.has(el.id()) || consumedSwitchIds.has(opening.id())) {
      continue
    }

    // Skip Switch nodes that live inside a FormControlLabel control= we already handled
    const ancestors = el.ancestors()
    const insideHandledFcl = ancestors.some((a) => {
      if (!fclLocalName) {
        return false
      }
      if (!a.is('jsx_self_closing_element') && !a.is('jsx_element')) {
        return false
      }
      const aOpening = a.is('jsx_self_closing_element') ? a : a.child(0)
      if (!aOpening) {
        return false
      }
      return getElementName(aOpening) === fclLocalName
    })
    if (insideHandledFcl) {
      continue
    }

    const todoReasons = collectTodoProps(opening)
    if (todoReasons.length > 0) {
      preserveImport = true
      edits.push(
        el.replace(
          withTodoComment(
            `{/* TODO(backstage-codemod): finish switch migration manually (${todoReasons.join(', ')}) */}`,
            el.text(),
          ),
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: todoReasons.join(', ') })
      continue
    }

    const newProps = buildSwitchPropsFromOpening(opening)
    const propsStr = newProps.length > 0 ? ` ${newProps.join(' ')}` : ''

    if (isSelfClosing) {
      edits.push(el.replace(`<Switch${propsStr} />`))
    } else {
      const children = el
        .children()
        .filter((c) => c.kind() !== 'jsx_opening_element' && c.kind() !== 'jsx_closing_element')
        .map((c) => c.text())
        .join('')
      edits.push(el.replace(`<Switch${propsStr}>${children}</Switch>`))
    }

    migrated = true
    migrationMetric.increment({ action: 'switch-migrated' })
  }

  return { preserveImport, migrated, consumedSwitchIds }
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { switchLocalName, fclLocalName, defaultSources, barrelNames } = collectSwitchImports(rootNode)

  if (!switchLocalName) {
    return Promise.resolve(null)
  }

  const { preserveImport, migrated } = transformElements(rootNode, switchLocalName, fclLocalName, edits)

  if (migrated) {
    const addEdit = addImport(rootNode, {
      type: 'named',
      specifiers: [{ name: 'Switch' }],
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
