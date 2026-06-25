import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-dialog-to-bui-dialog')

const BUI_SOURCE = '@backstage/ui'

const COMPONENT_MAP: Record<string, string> = {
  DialogTitle: 'DialogHeader',
  DialogContent: 'DialogBody',
  DialogActions: 'DialogFooter',
}

const TODO_PROPS = new Set([
  'maxWidth',
  'fullWidth',
  'fullScreen',
  'scroll',
  'TransitionComponent',
  'TransitionProps',
  'transitionDuration',
  'PaperComponent',
  'PaperProps',
  'BackdropComponent',
  'BackdropProps',
  'classes',
  'disableEscapeKeyDown',
  'disableBackdropClick',
  'keepMounted',
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

const MUI_DIALOG_COMPONENTS = ['Dialog', 'DialogTitle', 'DialogContent', 'DialogActions']

interface DialogImports {
  localNames: Map<string, string>
  importNodesToRemove: SgNode<TSX>[]
}

function collectDialogImports(rootNode: SgNode<TSX>): DialogImports {
  const localNames = new Map<string, string>()
  const importNodesToRemove: SgNode<TSX>[] = []

  for (const componentName of MUI_DIALOG_COMPONENTS) {
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
    for (const componentName of MUI_DIALOG_COMPONENTS) {
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

function addBuiImport(
  rootNode: SgNode<TSX>,
  names: string[],
  importNodesToRemove: SgNode<TSX>[],
  edits: Edit[],
): boolean {
  const existingImports = findImportStatementsFrom(rootNode, BUI_SOURCE)
  const existingImport = existingImports[0] ?? null
  const sortedNames = [...names].sort()

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
  } else if (importNodesToRemove.length > 0) {
    const [importNode] = importNodesToRemove
    if (importNode) {
      edits.push(importNode.replace(`import { ${sortedNames.join(', ')} } from '${BUI_SOURCE}';`))
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

function getSimpleOnCloseHandler(opening: SgNode<TSX>): string | null {
  const attr = getPropAttr(opening, 'onClose')
  if (!attr) {
    return null
  }
  const expr = attr.find({ rule: { kind: 'jsx_expression' } })
  if (!expr) {
    return null
  }
  const children: SgNode<TSX>[] = []
  for (const child of expr.children()) {
    if (child.kind() !== '{' && child.kind() !== '}') {
      children.push(child)
    }
  }
  const [onlyChild] = children
  if (children.length === 1 && onlyChild?.is('identifier')) {
    return onlyChild.text()
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

function getChildContent(element: SgNode<TSX>): string {
  return element
    .children()
    .filter((child) => child.kind() !== 'jsx_opening_element' && child.kind() !== 'jsx_closing_element')
    .map((child) => child.text())
    .join('')
}

function transformFooterCloseButtons(content: string, closeHandler: string | null): string {
  if (!closeHandler) {
    return content
  }

  const buttonPattern = /<button\s+([^>]*)>([\s\S]*?)<\/button>/g
  const onClickPattern = new RegExp(`onClick=\\{${escapeRegex(closeHandler)}\\}`)

  return content.replace(buttonPattern, (match: string, attrs: string, label: string) => {
    if (!onClickPattern.test(attrs)) {
      return match
    }
    migrationMetric.increment({ action: 'footer-close-button-migrated' })
    const extraAttrs = attrs.replace(onClickPattern, '').trim()
    const attrStr = extraAttrs.length > 0 ? ` ${extraAttrs}` : ''
    return `<Button slot="close" onPress={${closeHandler}}${attrStr}>${label}</Button>`
  })
}

function transformDialogChildren(
  dialogElement: SgNode<TSX>,
  localNames: Map<string, string>,
  closeHandler: string | null,
): string {
  const children = getJsxChildren(dialogElement)
  const parts: string[] = []

  for (const child of children) {
    const kind = child.kind()

    if (kind === 'jsx_text') {
      parts.push(child.text())
      continue
    }

    if (kind === 'jsx_element') {
      const childOpening = child.child(0)
      if (childOpening) {
        const childName = getElementName(childOpening)
        if (childName && localNames.has(childName)) {
          const muiName = localNames.get(childName)
          if (!muiName) {
            continue
          }
          const buiName = COMPONENT_MAP[muiName]
          if (buiName) {
            let innerContent = getChildContent(child)
            if (muiName === 'DialogActions') {
              innerContent = transformFooterCloseButtons(innerContent, closeHandler)
            }
            parts.push(`<${buiName}>${innerContent}</${buiName}>`)
            migrationMetric.increment({ action: 'child-renamed', from: muiName, to: buiName })
            continue
          }
        }
      }
    }

    parts.push(child.text())
  }

  return parts.join('')
}

function transformDialogElements(
  rootNode: SgNode<TSX>,
  localNames: Map<string, string>,
  edits: Edit[],
  buiNames: Set<string>,
): { preserveImport: boolean; migrated: boolean } {
  let preserveImport = false
  let migrated = false
  const dialogLocalName = [...localNames.entries()].find(([, v]) => v === 'Dialog')?.[0]
  if (!dialogLocalName) {
    return { preserveImport, migrated }
  }

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
    if (name !== dialogLocalName) {
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
          `<>{/* TODO(backstage-codemod): verify dialog width, dismiss behavior, or custom close logic manually (${todoReasons.join(', ')}) */}\n${el.text()}</>`,
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: todoReasons.join(', ') })
      continue
    }

    const newProps: string[] = []

    const openValue = getPropRawValue(opening, 'open')
    if (openValue) {
      newProps.push(`isOpen=${openValue}`)
    }

    const simpleHandler = getSimpleOnCloseHandler(opening)
    let usesFooterCloseButton = false
    if (simpleHandler) {
      newProps.push(`onOpenChange={isOpen => !isOpen && ${simpleHandler}()}`)
      migrationMetric.increment({ action: 'onClose-rewritten' })
    } else if (hasProp(opening, 'onClose')) {
      preserveImport = true
      edits.push(
        el.replace(
          `<>{/* TODO(backstage-codemod): verify dialog width, dismiss behavior, or custom close logic manually (complex-onClose) */}\n${el.text()}</>`,
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-onClose' })
      continue
    }

    const handledProps = new Set(['open', 'onClose'])
    const allAttrs = opening.findAll({ rule: { kind: 'jsx_attribute' } })
    for (const attr of allAttrs) {
      const propIdent = attr.find({ rule: { kind: 'property_identifier' } })
      if (!propIdent) {
        continue
      }
      const propName = propIdent.text()
      if (handledProps.has(propName)) {
        continue
      }
      newProps.push(attr.text())
    }

    const spreadAttrs = opening.findAll({ rule: { kind: 'jsx_expression' } })
    for (const spread of spreadAttrs) {
      if (spread.text().startsWith('{...')) {
        newProps.push(spread.text())
      }
    }

    const propsStr = newProps.length > 0 ? ` ${newProps.join(' ')}` : ''

    if (isSelfClosing) {
      edits.push(el.replace(`<Dialog${propsStr} />`))
    } else {
      const dialogActionsLocal = [...localNames.entries()].find(([, v]) => v === 'DialogActions')?.[0]
      if (simpleHandler && dialogActionsLocal) {
        const actionsElements = el.findAll({
          rule: {
            kind: 'jsx_element',
            has: {
              kind: 'jsx_opening_element',
              has: {
                kind: 'identifier',
                regex: `^${escapeRegex(dialogActionsLocal)}$`,
              },
            },
          },
        })
        for (const actionsEl of actionsElements) {
          const actionsContent = getChildContent(actionsEl)
          if (actionsContent.includes(`onClick={${simpleHandler}}`)) {
            usesFooterCloseButton = true
            break
          }
        }
      }

      const transformedChildren = transformDialogChildren(el, localNames, simpleHandler)
      edits.push(el.replace(`<Dialog${propsStr}>${transformedChildren}</Dialog>`))

      if (usesFooterCloseButton) {
        buiNames.add('Button')
      }
    }

    migrationMetric.increment({ action: 'dialog-migrated' })
    migrated = true
  }

  return { preserveImport, migrated }
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames, importNodesToRemove } = collectDialogImports(rootNode)

  if (localNames.size === 0) {
    return Promise.resolve(null)
  }

  const buiNames = new Set<string>()
  buiNames.add('Dialog')
  for (const [, muiName] of localNames) {
    const buiName = COMPONENT_MAP[muiName]
    if (buiName) {
      buiNames.add(buiName)
    }
  }

  const { preserveImport, migrated } = transformDialogElements(rootNode, localNames, edits, buiNames)

  let replacedImport = false
  if (migrated) {
    replacedImport = addBuiImport(rootNode, [...buiNames], importNodesToRemove, edits)
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
