import { addImport, getAllImports, getImport, listImports, removeImport } from '@jssg/utils/javascript/imports'
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

const MUI_DIALOG_COMPONENTS = ['Dialog', 'DialogTitle', 'DialogContent', 'DialogActions']

interface DialogImports {
  localNames: Map<string, string>
  defaultSources: string[]
  barrelNames: string[]
}

function withTodoComment(comment: string, elementText: string): string {
  return `<>
  ${comment}
  ${elementText}
</>`
}

function collectDialogImports(rootNode: SgNode<TSX, 'program'>): DialogImports {
  const localNames = new Map<string, string>()
  const defaultSources: string[] = []
  const barrelNames: string[] = []

  for (const componentName of MUI_DIALOG_COMPONENTS) {
    const defaultImport = getImport(rootNode, { type: 'default', from: `@material-ui/core/${componentName}` })
    if (defaultImport) {
      localNames.set(defaultImport.alias, componentName)
      defaultSources.push(`@material-ui/core/${componentName}`)
    }
    for (const named of getAllImports(rootNode, { type: 'named', name: componentName, from: '@material-ui/core' })) {
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

function getSimpleOnClickHandler(opening: SgNode<TSX>): string | null {
  const attr = getPropAttr(opening, 'onClick')
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

function isCloseFooterButton(element: SgNode<TSX>, closeHandler: string): boolean {
  const isSelfClosing = element.is('jsx_self_closing_element')
  const opening = isSelfClosing ? element : element.child(0)
  if (!opening) {
    return false
  }
  if (getElementName(opening) !== 'button') {
    return false
  }
  return getSimpleOnClickHandler(opening) === closeHandler
}

function transformFooterCloseButton(element: SgNode<TSX>, closeHandler: string): string {
  const isSelfClosing = element.is('jsx_self_closing_element')
  const opening = isSelfClosing ? element : element.child(0)
  if (!opening) {
    return element.text()
  }

  const extraAttrs: string[] = []
  for (const attr of opening.findAll({ rule: { kind: 'jsx_attribute' } })) {
    const propIdent = attr.find({ rule: { kind: 'property_identifier' } })
    if (!propIdent || propIdent.text() === 'onClick') {
      continue
    }
    extraAttrs.push(attr.text())
  }

  const attrStr = extraAttrs.length > 0 ? ` ${extraAttrs.join(' ')}` : ''
  migrationMetric.increment({ action: 'footer-close-button-migrated' })

  if (isSelfClosing) {
    return `<Button slot="close" onPress={${closeHandler}}${attrStr} />`
  }

  return `<Button slot="close" onPress={${closeHandler}}${attrStr}>${getChildContent(element)}</Button>`
}

function transformDialogActionsContent(actionsElement: SgNode<TSX>, closeHandler: string | null): string {
  const parts: string[] = []

  for (const child of getJsxChildren(actionsElement)) {
    const kind = child.kind()
    if (
      closeHandler &&
      (kind === 'jsx_element' || kind === 'jsx_self_closing_element') &&
      isCloseFooterButton(child, closeHandler)
    ) {
      parts.push(transformFooterCloseButton(child, closeHandler))
      continue
    }
    parts.push(child.text())
  }

  return parts.join('')
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
            const innerContent =
              muiName === 'DialogActions' ? transformDialogActionsContent(child, closeHandler) : getChildContent(child)
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
  rootNode: SgNode<TSX, 'program'>,
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
          withTodoComment(
            `{/* TODO(backstage-codemod): verify dialog width, dismiss behavior, or custom close logic manually (${todoReasons.join(', ')}) */}`,
            el.text(),
          ),
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
          withTodoComment(
            `{/* TODO(backstage-codemod): verify dialog width, dismiss behavior, or custom close logic manually (complex-onClose) */}`,
            el.text(),
          ),
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
          for (const child of getJsxChildren(actionsEl)) {
            const kind = child.kind()
            if (
              (kind === 'jsx_element' || kind === 'jsx_self_closing_element') &&
              isCloseFooterButton(child, simpleHandler)
            ) {
              usesFooterCloseButton = true
              break
            }
          }
          if (usesFooterCloseButton) {
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

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames, defaultSources, barrelNames } = collectDialogImports(rootNode)

  if (localNames.size === 0) {
    return null
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
    if (barrelNames.length > 0) {
      const removedNames = new Set(barrelNames)
      for (const item of listImports(rootNode, { from: '@material-ui/core' })) {
        const matching = item.specifiers.filter((spec) => removedNames.has(spec.importedName))
        if (matching.length === 0) {
          continue
        }
        if (matching.length > 0) {
          migrationMetric.increment({ action: 'import-removed' })
        }
      }
      const edit = removeImport(rootNode, { type: 'named', specifiers: barrelNames, from: '@material-ui/core' })
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

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
