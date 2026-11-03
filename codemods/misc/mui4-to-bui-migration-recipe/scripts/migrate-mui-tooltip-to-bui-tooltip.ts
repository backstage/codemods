import { addImport, getAllImports, getImport, listImports, removeImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-tooltip-to-bui-tooltip')

const BUI_SOURCE = '@backstage/ui'
const MUI_BARREL_SOURCE = '@material-ui/core'

const TODO_PROPS = new Set([
  'leaveDelay',
  'enterDelay',
  'enterTouchDelay',
  'leaveTouchDelay',
  'interactive',
  'TransitionComponent',
  'TransitionProps',
  'PopperProps',
  'classes',
])

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function collectTooltipImports(rootNode: SgNode<TSX, 'program'>): string | null {
  let tooltipLocalName: string | null = null

  // Default import: import Tooltip from '@material-ui/core/Tooltip'
  const deepImport = getImport(rootNode, { type: 'default', from: '@material-ui/core/Tooltip' })
  if (deepImport) {
    tooltipLocalName = deepImport.alias
  }

  // Named import from barrel: import { Tooltip } from '@material-ui/core'
  for (const named of getAllImports(rootNode, { type: 'named', name: 'Tooltip', from: MUI_BARREL_SOURCE })) {
    tooltipLocalName = named.alias
  }

  return tooltipLocalName
}

function withTodoComment(comment: string, elementText: string): string {
  return `<>
  ${comment}
  ${elementText}
</>`
}

function getElementName(opening: SgNode<TSX>): string | null {
  for (const child of opening.children()) {
    if (child.is('identifier') || child.is('member_expression')) {
      return child.text()
    }
  }
  return null
}

function hasProp(opening: SgNode<TSX>, propName: string): boolean {
  return (
    opening.find({
      rule: {
        kind: 'jsx_attribute',
        has: {
          kind: 'property_identifier',
          regex: `^${escapeRegex(propName)}$`,
        },
      },
    }) !== null
  )
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

function isPropDynamic(opening: SgNode<TSX>, propName: string): boolean {
  const attr = getPropAttr(opening, propName)
  if (!attr) {
    return false
  }
  return attr.find({ rule: { kind: 'jsx_expression' } }) !== null
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

function getSimpleHandlerFromProp(opening: SgNode<TSX>, propName: string): string | null {
  const attr = getPropAttr(opening, propName)
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

function buildControlledTooltipProps(opening: SgNode<TSX>): string[] {
  const props: string[] = []

  const openValue = getPropRawValue(opening, 'open')
  if (openValue) {
    props.push(`isOpen=${openValue}`)
  }

  const closeHandler = getSimpleHandlerFromProp(opening, 'onClose')
  const openHandler = getSimpleHandlerFromProp(opening, 'onOpen')

  if (closeHandler) {
    props.push(`onOpenChange={open => !open && ${closeHandler}()}`)
    migrationMetric.increment({ action: 'onClose-rewritten' })
  } else if (openHandler) {
    props.push(`onOpenChange={open => open && ${openHandler}()}`)
    migrationMetric.increment({ action: 'onOpen-rewritten' })
  } else if (hasProp(opening, 'onClose') || hasProp(opening, 'onOpen')) {
    return []
  }

  return props
}

function getJsxChildren(element: SgNode<TSX>): SgNode<TSX>[] {
  const children: SgNode<TSX>[] = []
  for (const child of element.children()) {
    const kind = child.kind()
    if (kind === 'jsx_opening_element' || kind === 'jsx_closing_element') {
      continue
    }
    if (kind === 'jsx_text') {
      if (child.text().trim().length === 0) {
        continue
      }
    }
    children.push(child)
  }
  return children
}

function transformTooltipElements(rootNode: SgNode<TSX>, tooltipLocalName: string, edits: Edit[]): boolean {
  let migrated = false
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
    if (name !== tooltipLocalName) {
      continue
    }

    let needsTodo = false
    for (const prop of TODO_PROPS) {
      if (hasProp(opening, prop)) {
        needsTodo = true
        break
      }
    }

    const controlledProps = buildControlledTooltipProps(opening)
    if (
      (hasProp(opening, 'onClose') || hasProp(opening, 'onOpen')) &&
      controlledProps.length === 0 &&
      !getPropRawValue(opening, 'open')
    ) {
      needsTodo = true
    } else if (
      (hasProp(opening, 'onClose') || hasProp(opening, 'onOpen')) &&
      controlledProps.length === 0 &&
      getPropRawValue(opening, 'open')
    ) {
      needsTodo = true
    }

    if (needsTodo) {
      edits.push(
        el.replace(withTodoComment('{/* TODO(backstage-codemod): finish tooltip migration manually */}', el.text())),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-props' })
      continue
    }

    const titleStr = getPropStringValue(opening, 'title')
    const titleDynamic = isPropDynamic(opening, 'title')
    const titleRaw = getPropRawValue(opening, 'title')

    if (!titleStr && !titleDynamic) {
      edits.push(
        el.replace(withTodoComment('{/* TODO(backstage-codemod): finish tooltip migration manually */}', el.text())),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: 'no-title' })
      continue
    }

    if (isSelfClosing) {
      edits.push(
        el.replace(withTodoComment('{/* TODO(backstage-codemod): finish tooltip migration manually */}', el.text())),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: 'no-children' })
      continue
    }

    const children = getJsxChildren(el)
    if (children.length !== 1) {
      edits.push(
        el.replace(withTodoComment('{/* TODO(backstage-codemod): finish tooltip migration manually */}', el.text())),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: 'multiple-children' })
      continue
    }

    const [child] = children
    if (!child) {
      continue
    }
    const childText = child.text()

    let tooltipContent: string
    if (titleStr !== null) {
      tooltipContent = titleStr
    } else if (titleRaw !== null) {
      tooltipContent = titleRaw
    } else {
      tooltipContent = ''
    }

    const placementValue = getPropStringValue(opening, 'placement')
    const placementDynamic = isPropDynamic(opening, 'placement')
    const needsPlacementTodo = Boolean(placementValue ?? placementDynamic)
    if (needsPlacementTodo) {
      migrationMetric.increment({ action: 'placement-dropped', value: placementValue ?? 'dynamic' })
    }

    const tooltipEl = `<Tooltip>${tooltipContent}</Tooltip>`
    const triggerProps = controlledProps.length > 0 ? ` ${controlledProps.join(' ')}` : ''
    const migratedElement = `<TooltipTrigger${triggerProps}>\n  ${childText}\n  ${tooltipEl}\n</TooltipTrigger>`

    edits.push(
      el.replace(
        needsPlacementTodo
          ? withTodoComment(
              '{/* TODO(backstage-codemod): verify Tooltip placement mapping manually */}',
              migratedElement,
            )
          : migratedElement,
      ),
    )
    migrationMetric.increment({ action: 'tooltip-migrated' })
    migrated = true
  }

  return migrated
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const tooltipLocalName = collectTooltipImports(rootNode)

  if (!tooltipLocalName) {
    return null
  }

  const migrated = transformTooltipElements(rootNode, tooltipLocalName, edits)

  if (!migrated) {
    const early = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
    return early
  }

  const addEdit = addImport(rootNode, {
    type: 'named',
    specifiers: [{ name: 'Tooltip' }, { name: 'TooltipTrigger' }],
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

  const deepEdit = removeImport(rootNode, { type: 'default', from: '@material-ui/core/Tooltip' })
  if (deepEdit) {
    edits.push(...deepEdit)
    migrationMetric.increment({ action: 'import-removed' })
  }
  for (const item of listImports(rootNode, { from: MUI_BARREL_SOURCE })) {
    const hasTooltip = item.specifiers.some((spec) => spec.importedName === 'Tooltip')
    if (!hasTooltip) {
      continue
    }
    const edit = removeImport(rootNode, {
      type: 'named',
      specifiers: ['Tooltip'],
      from: MUI_BARREL_SOURCE,
    })
    if (edit) {
      edits.push(...edit)
      migrationMetric.increment({ action: 'import-removed' })
    }
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
