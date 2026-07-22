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

function collectSwitchImports(rootNode: SgNode<TSX>): {
  switchLocalName: string | null
  fclLocalName: string | null
  importNodesToRemove: SgNode<TSX>[]
  barrelImportsToPrune: { imp: SgNode<TSX>; namesToRemove: Set<string> }[]
} {
  let switchLocalName: string | null = null
  let fclLocalName: string | null = null
  const importNodesToRemove: SgNode<TSX>[] = []
  const barrelImportsToPrune: { imp: SgNode<TSX>; namesToRemove: Set<string> }[] = []

  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core/Switch')) {
    switchLocalName = getDefaultImportName(imp)
    importNodesToRemove.push(imp)
  }

  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core/FormControlLabel')) {
    fclLocalName = getDefaultImportName(imp)
    importNodesToRemove.push(imp)
  }

  for (const imp of findImportStatementsFrom(rootNode, MUI_BARREL_SOURCE)) {
    const foundNames = new Set<string>()
    const switchName = getNamedImportLocalName(imp, 'Switch')
    if (switchName) {
      switchLocalName = switchName
      foundNames.add('Switch')
    }
    const fclName = getNamedImportLocalName(imp, 'FormControlLabel')
    if (fclName) {
      fclLocalName = fclName
      foundNames.add('FormControlLabel')
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

  return { switchLocalName, fclLocalName, importNodesToRemove, barrelImportsToPrune }
}

function addBuiImport(
  rootNode: SgNode<TSX>,
  importNodesToRemove: SgNode<TSX>[],
  barrelImportsToPrune: { imp: SgNode<TSX>; namesToRemove: Set<string> }[],
  edits: Edit[],
  handledBarrelIds: Set<number>,
): boolean {
  const existingImports = findImportStatementsFrom(rootNode, BUI_SOURCE)
  const existingImport = existingImports[0] ?? null

  if (existingImport) {
    const alreadyImported = getNamedImportLocalName(existingImport, 'Switch') !== null
    if (!alreadyImported) {
      const namedImports = existingImport.find({ rule: { kind: 'named_imports' } })
      if (namedImports) {
        const text = namedImports.text()
        const inner = text.slice(1, -1).trim()
        const names = inner
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean)
        names.push('Switch')
        names.sort()
        edits.push(namedImports.replace(`{ ${names.join(', ')} }`))
        migrationMetric.increment({ action: 'import-merged' })
      } else {
        edits.push(existingImport.replace(`${existingImport.text()}\nimport { Switch } from '${BUI_SOURCE}';`))
        migrationMetric.increment({ action: 'import-added' })
      }
    }
    return false
  }

  const skipIds = new Set([
    ...importNodesToRemove.map((imp) => imp.id()),
    ...barrelImportsToPrune.map(({ imp }) => imp.id()),
  ])
  const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
  const anchorImport = [...allImports].reverse().find((imp) => !skipIds.has(imp.id())) ?? null
  const buiImport = `import { Switch } from '${BUI_SOURCE}';`

  if (anchorImport) {
    edits.push(anchorImport.replace(`${anchorImport.text()}\n${buiImport}`))
    migrationMetric.increment({ action: 'import-added' })
    return false
  }

  const [barrelToFold] = barrelImportsToPrune
  if (barrelToFold) {
    const pruned = rebuildImportWithout(barrelToFold.imp, barrelToFold.namesToRemove)
    edits.push(barrelToFold.imp.replace(pruned.length > 0 ? `${pruned}\n${buiImport}` : buiImport))
    handledBarrelIds.add(barrelToFold.imp.id())
    migrationMetric.increment({ action: 'import-added' })
    migrationMetric.increment({ action: 'import-pruned' })
    return false
  }

  if (importNodesToRemove.length >= 1) {
    const [importNode] = importNodesToRemove
    if (importNode) {
      edits.push(importNode.replace(buiImport))
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
  rootNode: SgNode<TSX>,
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

  const { switchLocalName, fclLocalName, importNodesToRemove, barrelImportsToPrune } = collectSwitchImports(rootNode)

  if (!switchLocalName) {
    return Promise.resolve(null)
  }

  const { preserveImport, migrated } = transformElements(rootNode, switchLocalName, fclLocalName, edits)

  let replacedImport = false
  const handledBarrelIds = new Set<number>()
  if (migrated) {
    replacedImport = addBuiImport(rootNode, importNodesToRemove, barrelImportsToPrune, edits, handledBarrelIds)
  }

  if (!preserveImport) {
    for (const { imp, namesToRemove } of barrelImportsToPrune) {
      if (handledBarrelIds.has(imp.id())) {
        continue
      }
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
