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

function getImportedName(spec: SgNode<TSX>): string | null {
  const identifiers = spec.findAll({
    rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
  })
  return identifiers[0]?.text() ?? null
}

function collectTextFieldImports(rootNode: SgNode<TSX>): {
  textFieldLocalName: string | null
  importNodesToRemove: SgNode<TSX>[]
  barrelImportsToPrune: { imp: SgNode<TSX>; namesToRemove: Set<string> }[]
} {
  let textFieldLocalName: string | null = null
  const importNodesToRemove: SgNode<TSX>[] = []
  const barrelImportsToPrune: { imp: SgNode<TSX>; namesToRemove: Set<string> }[] = []

  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core/TextField')) {
    textFieldLocalName = getDefaultImportName(imp)
    importNodesToRemove.push(imp)
  }

  for (const imp of findImportStatementsFrom(rootNode, MUI_BARREL_SOURCE)) {
    const localName = getNamedImportLocalName(imp, 'TextField')
    if (localName) {
      textFieldLocalName = localName
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (allSpecifiers.length <= 1) {
        importNodesToRemove.push(imp)
      } else {
        barrelImportsToPrune.push({ imp, namesToRemove: new Set(['TextField']) })
      }
    }
  }

  return { textFieldLocalName, importNodesToRemove, barrelImportsToPrune }
}

function addBuiImport(
  rootNode: SgNode<TSX>,
  names: string[],
  importNodesToRemove: SgNode<TSX>[],
  barrelImportsToPrune: { imp: SgNode<TSX>; namesToRemove: Set<string> }[],
  edits: Edit[],
  handledBarrelIds: Set<number>,
): boolean {
  const existingImports = findImportStatementsFrom(rootNode, BUI_SOURCE)
  const existingImport = existingImports[0] ?? null
  const sortedNames = [...names].sort()
  const buiImport = `import { ${sortedNames.join(', ')} } from '${BUI_SOURCE}';`

  if (existingImport) {
    const namedImports = existingImport.find({ rule: { kind: 'named_imports' } })
    if (namedImports) {
      const specifiers = existingImport.findAll({ rule: { kind: 'import_specifier' } })
      const existingImported = new Set<string>()
      const existingTexts: string[] = []
      for (const spec of specifiers) {
        const imported = getImportedName(spec)
        if (imported) {
          existingImported.add(imported)
        }
        existingTexts.push(spec.text())
      }
      for (const name of names) {
        if (!existingImported.has(name)) {
          existingTexts.push(name)
          existingImported.add(name)
        }
      }
      existingTexts.sort()
      edits.push(namedImports.replace(`{ ${existingTexts.join(', ')} }`))
      migrationMetric.increment({ action: 'import-merged' })
    } else {
      edits.push(existingImport.replace(`${existingImport.text()}\n${buiImport}`))
      migrationMetric.increment({ action: 'import-added' })
    }
    return false
  }

  const skipIds = new Set([
    ...importNodesToRemove.map((imp) => imp.id()),
    ...barrelImportsToPrune.map(({ imp }) => imp.id()),
  ])
  const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
  const anchorImport = [...allImports].reverse().find((imp) => !skipIds.has(imp.id())) ?? null

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
  rootNode: SgNode<TSX>,
  textFieldLocalName: string,
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

    const isMultiline = hasProp(opening, 'multiline')
    let needsTodo = false
    const todoReasons: string[] = []

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
        newProps.push(child.text())
      } else if (kind === 'jsx_expression' && child.text().startsWith('{...')) {
        newProps.push(child.text())
      }
    }

    if (handlerTodo) {
      continue
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

  const { textFieldLocalName, importNodesToRemove, barrelImportsToPrune } = collectTextFieldImports(rootNode)

  if (!textFieldLocalName) {
    return Promise.resolve(null)
  }

  const { preserveImport, migrated, buiNames } = transformTextFieldElements(rootNode, textFieldLocalName, edits)

  let replacedImport = false
  const handledBarrelIds = new Set<number>()
  if (migrated) {
    replacedImport = addBuiImport(
      rootNode,
      [...buiNames],
      importNodesToRemove,
      barrelImportsToPrune,
      edits,
      handledBarrelIds,
    )
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
