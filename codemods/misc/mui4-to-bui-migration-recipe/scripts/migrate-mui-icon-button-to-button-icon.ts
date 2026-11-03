import { addImport, getImport, removeImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-icon-button-to-button-icon')

const BUI_SOURCE = '@backstage/ui'

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

function formatIconProp(iconChild: SgNode<TSX>): string {
  const iconText = iconChild.text()
  if (iconChild.kind() === 'jsx_expression') {
    return `icon={${iconText.slice(1, -1)}}`
  }
  return `icon={${iconText}}`
}

function isSingleIconChild(child: SgNode<TSX>): boolean {
  const kind = child.kind()
  return kind === 'jsx_self_closing_element' || kind === 'jsx_element' || kind === 'jsx_expression'
}

/** Props that are dropped silently (MUI-specific, no BUI equivalent). */
const DROPPED_PROPS = new Set(['edge', 'disableRipple', 'disableFocusRipple'])

/** MUI IconButton color → BUI ButtonIcon variant. Absent/default/inherit → tertiary. */
const COLOR_TO_VARIANT: Record<string, string> = {
  primary: 'primary',
  secondary: 'secondary',
  default: 'tertiary',
  inherit: 'tertiary',
}

function getAttrStringValue(
  opening: SgNode<TSX>,
  propName: string,
): { value: string | null; isDynamic: boolean; attrNode: SgNode<TSX> | null } {
  const attr = getPropAttr(opening, propName)
  if (!attr) {
    return { value: null, isDynamic: false, attrNode: null }
  }

  const stringNode = attr.find({ rule: { kind: 'string' } })
  if (stringNode) {
    const frag = stringNode.find({ rule: { kind: 'string_fragment' } })
    return { value: frag?.text() ?? null, isDynamic: false, attrNode: attr }
  }

  const exprNode = attr.find({ rule: { kind: 'jsx_expression' } })
  if (exprNode) {
    return { value: exprNode.text(), isDynamic: true, attrNode: attr }
  }

  return { value: '', isDynamic: false, attrNode: attr }
}

function mapColorToVariant(colorValue: string | null, isDynamic: boolean): string | null {
  if (isDynamic) {
    return null
  }
  if (colorValue === null || colorValue === '') {
    return 'tertiary'
  }
  return COLOR_TO_VARIANT[colorValue] ?? null
}

function transformIconButtonElements(
  rootNode: SgNode<TSX>,
  iconButtonLocalName: string,
  edits: Edit[],
): { preserveImport: boolean; migrated: boolean } {
  let preserveImport = false
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
    if (name !== iconButtonLocalName) {
      continue
    }

    const insertTodo = (reason: string) => {
      preserveImport = true
      edits.push(
        el.replace(
          withTodoComment('{/* TODO(backstage-codemod): verify ButtonIcon accessibility manually */}', el.text()),
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason })
    }

    if (isSelfClosing) {
      insertTodo('no-children')
      continue
    }

    const children = getJsxChildren(el)
    const [iconChild] = children
    if (children.length !== 1 || !iconChild || !isSingleIconChild(iconChild)) {
      insertTodo('complex-children')
      continue
    }

    const hasAriaLabel = hasProp(opening, 'aria-label')
    if (!hasAriaLabel) {
      insertTodo('missing-aria-label')
      continue
    }

    const { value: colorValue, isDynamic: colorDynamic } = getAttrStringValue(opening, 'color')
    const buiVariant = mapColorToVariant(colorValue, colorDynamic)
    if (buiVariant === null) {
      insertTodo(colorDynamic ? 'dynamic-color' : `unmapped-color-${colorValue}`)
      continue
    }

    const { value: sizeValue, isDynamic: sizeDynamic } = getAttrStringValue(opening, 'size')
    if (sizeDynamic) {
      insertTodo('dynamic-size')
      continue
    }

    // Build new props
    const newProps: string[] = []

    // icon prop from child
    newProps.push(formatIconProp(iconChild))
    newProps.push(`variant="${buiVariant}"`)

    // Map size — preserve MUI medium default when BUI defaults to small
    if (sizeValue === null || sizeValue === '') {
      newProps.push('size="medium"')
      migrationMetric.increment({ action: 'size-defaulted-to-medium' })
    } else if (sizeValue === 'small') {
      newProps.push('size="small"')
      migrationMetric.increment({ action: 'size-mapped', size: 'small' })
    } else if (sizeValue === 'medium') {
      newProps.push('size="medium"')
      migrationMetric.increment({ action: 'size-mapped', size: 'medium' })
    } else if (sizeValue === 'large') {
      newProps.push('size="medium"')
      migrationMetric.increment({ action: 'size-large-to-medium' })
    } else {
      insertTodo('unknown-size')
      continue
    }

    // Map props from opening element
    const allAttrs = opening.findAll({ rule: { kind: 'jsx_attribute' } })
    for (const attr of allAttrs) {
      const propIdent = attr.find({ rule: { kind: 'property_identifier' } })
      if (!propIdent) {
        continue
      }
      const propName = propIdent.text()

      if (propName === 'color' || propName === 'size') {
        if (propName === 'color') {
          migrationMetric.increment({ action: 'prop-dropped', prop: 'color' })
        }
        continue
      }

      if (propName === 'disabled') {
        // Map disabled → isDisabled
        const exprNode = attr.find({ rule: { kind: 'jsx_expression' } })
        if (exprNode) {
          newProps.push(`isDisabled=${exprNode.text()}`)
        } else {
          newProps.push('isDisabled')
        }
        continue
      }

      if (propName === 'onClick') {
        // Map onClick → onPress
        const exprNode = attr.find({ rule: { kind: 'jsx_expression' } })
        if (exprNode) {
          newProps.push(`onPress=${exprNode.text()}`)
        }
        continue
      }

      if (DROPPED_PROPS.has(propName)) {
        migrationMetric.increment({ action: 'prop-dropped', prop: propName })
        continue
      }

      // Preserve all other props (aria-label, className, data-*, etc.)
      newProps.push(attr.text())
    }

    // Preserve spread attributes
    const spreadAttrs = opening.findAll({ rule: { kind: 'jsx_expression' } })
    for (const spread of spreadAttrs) {
      if (spread.text().startsWith('{...')) {
        newProps.push(spread.text())
      }
    }

    const propsStr = newProps.length > 0 ? ` ${newProps.join(' ')}` : ''
    edits.push(el.replace(`<ButtonIcon${propsStr} />`))
    migrated = true
    migrationMetric.increment({ action: 'icon-button-migrated' })
  }

  return { preserveImport, migrated }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const iconButtonDefault = getImport(rootNode, { type: 'default', from: '@material-ui/core/IconButton' })
  const iconButtonBarrelNamed = getImport(rootNode, { type: 'named', name: 'IconButton', from: '@material-ui/core' })
  const iconButtonLocalName = iconButtonBarrelNamed?.alias ?? iconButtonDefault?.alias ?? null

  if (!iconButtonLocalName) {
    return null
  }

  const { preserveImport, migrated } = transformIconButtonElements(rootNode, iconButtonLocalName, edits)

  if (migrated) {
    const addEdit = addImport(rootNode, {
      type: 'named',
      specifiers: [{ name: 'ButtonIcon' }],
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
    if (iconButtonBarrelNamed) {
      const edit = removeImport(rootNode, { type: 'named', specifiers: ['IconButton'], from: '@material-ui/core' })
      if (edit) {
        edits.push(...edit)
        migrationMetric.increment({ action: 'import-removed' })
      }
    }
    if (iconButtonDefault) {
      const edit = removeImport(rootNode, { type: 'default', from: '@material-ui/core/IconButton' })
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
