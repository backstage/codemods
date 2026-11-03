import { addImport, getAllImports, getImport, listImports, removeImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-typography-to-text')

// MUI Typography variant → BUI Text variant
const VARIANT_MAP: Record<string, string> = {
  h1: 'title-large',
  h2: 'title-medium',
  h3: 'title-small',
  h4: 'title-x-small',
  h5: 'title-x-small',
  h6: 'title-small',
  subtitle1: 'title-x-small',
  subtitle2: 'body-medium',
  body1: 'body-medium',
  body2: 'body-small',
  caption: 'body-x-small',
  overline: 'body-x-small',
  button: 'body-medium',
}

/** MUI default rendered element for each variant (when `component` is omitted). */
const AS_FROM_VARIANT: Record<string, string> = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  subtitle1: 'h6',
  subtitle2: 'h6',
  body1: 'p',
  body2: 'p',
  caption: 'span',
  overline: 'span',
  button: 'span',
}

// MUI color prop → BUI Text color prop
const COLOR_MAP: Record<string, string> = {
  textPrimary: 'primary',
  textSecondary: 'secondary',
  primary: 'primary',
  secondary: 'secondary',
  error: 'danger',
  inherit: 'inherit',
}

const BUI_SOURCE = '@backstage/ui'

// Component names we target
const TARGET_COMPONENTS = new Set(['Typography', 'DialogContentText'])

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface ImportCollectionResult {
  localNames: Map<string, string>
  defaultSources: string[]
  barrelNames: string[]
}

function collectTypographyImports(rootNode: SgNode<TSX, 'program'>): ImportCollectionResult {
  const localNames = new Map<string, string>()
  const defaultSources: string[] = []
  const barrelNames: string[] = []

  // Default import: import Typography from '@material-ui/core/Typography'
  const typographyDefault = getImport(rootNode, { type: 'default', from: '@material-ui/core/Typography' })
  if (typographyDefault) {
    localNames.set(typographyDefault.alias, 'Typography')
    defaultSources.push('@material-ui/core/Typography')
  }

  // Default import: import DialogContentText from '@material-ui/core/DialogContentText'
  const dialogContentTextDefault = getImport(rootNode, {
    type: 'default',
    from: '@material-ui/core/DialogContentText',
  })
  if (dialogContentTextDefault) {
    localNames.set(dialogContentTextDefault.alias, 'DialogContentText')
    defaultSources.push('@material-ui/core/DialogContentText')
  }

  // Named imports from barrel: import { Typography, DialogContentText } from '@material-ui/core'
  for (const componentName of TARGET_COMPONENTS) {
    for (const named of getAllImports(rootNode, { type: 'named', name: componentName, from: '@material-ui/core' })) {
      localNames.set(named.alias, componentName)
      if (!barrelNames.includes(componentName)) {
        barrelNames.push(componentName)
      }
    }
  }

  return { localNames, defaultSources, barrelNames }
}

function getAttrStringValue(
  opening: SgNode<TSX>,
  propName: string,
): { value: string | null; isDynamic: boolean; attrNode: SgNode<TSX> | null } {
  const attr = opening.find({
    rule: {
      kind: 'jsx_attribute',
      has: {
        kind: 'property_identifier',
        regex: `^${escapeRegex(propName)}$`,
      },
    },
  })

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

  // Boolean attribute (e.g. gutterBottom without value)
  return { value: '', isDynamic: false, attrNode: attr }
}

function withTodoComment(comment: string, elementText: string): string {
  return `<>
  ${comment}
  ${elementText}
</>`
}

function getOpeningElement(el: SgNode<TSX>): SgNode<TSX> | null {
  if (el.is('jsx_self_closing_element')) {
    return el
  }
  return el.child(0)
}

function getElementName(opening: SgNode<TSX>): string | null {
  // The tag name is the first named child that is an identifier
  for (const child of opening.children()) {
    if (child.is('identifier') || child.is('member_expression')) {
      return child.text()
    }
  }
  return null
}

function resolveAsFromVariant(variantValue: string | null): string | null {
  if (variantValue) {
    return AS_FROM_VARIANT[variantValue] ?? null
  }
  // MUI Typography default variant is body1 → <p>
  return 'p'
}

function buildPartialTextProps(
  opening: SgNode<TSX>,
  buiVariant: string | null,
  buiColor: string | null,
  componentValue: string | null,
  componentDynamic: boolean,
  asFromVariant: string | null,
): string[] {
  const newProps: string[] = []
  if (buiVariant) {
    newProps.push(`variant="${buiVariant}"`)
  }
  if (buiColor) {
    newProps.push(`color="${buiColor}"`)
  }
  if (componentValue && !componentDynamic) {
    newProps.push(`as="${componentValue}"`)
  } else if (componentDynamic && componentValue) {
    newProps.push(`as={${componentValue.slice(1, -1)}}`)
  } else if (asFromVariant) {
    newProps.push(`as="${asFromVariant}"`)
    migrationMetric.increment({ action: 'as-from-variant', as: asFromVariant })
  }

  const handledProps = new Set(['variant', 'color', 'component', 'gutterBottom'])
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

  return newProps
}

function buildTextElement(el: SgNode<TSX>, isSelfClosing: boolean, newProps: string[]): string {
  const propsStr = newProps.length > 0 ? ` ${newProps.join(' ')}` : ''
  if (isSelfClosing) {
    return `<Text${propsStr} />`
  }
  const children = el
    .children()
    .filter((c) => c.kind() !== 'jsx_opening_element' && c.kind() !== 'jsx_closing_element')
    .map((c) => c.text())
    .join('')
  return `<Text${propsStr}>${children}</Text>`
}

function transformTypographyElements(
  rootNode: SgNode<TSX, 'program'>,
  localNames: Map<string, string>,
  edits: Edit[],
): boolean {
  let migrated = false
  const jsxElements = rootNode.findAll({
    rule: {
      any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
    },
  })

  for (const el of jsxElements) {
    const isSelfClosing = el.is('jsx_self_closing_element')
    const opening = getOpeningElement(el)
    if (!opening) {
      continue
    }

    const componentLocalName = getElementName(opening)
    if (!componentLocalName || !localNames.has(componentLocalName)) {
      continue
    }

    // Collect props
    const { value: variantValue, isDynamic: variantDynamic } = getAttrStringValue(opening, 'variant')
    const { value: colorValue, isDynamic: colorDynamic } = getAttrStringValue(opening, 'color')
    const { value: componentValue, isDynamic: componentDynamic } = getAttrStringValue(opening, 'component')
    const { attrNode: gutterBottomAttr } = getAttrStringValue(opening, 'gutterBottom')

    const asFromVariant =
      !componentValue && !componentDynamic && !variantDynamic ? resolveAsFromVariant(variantValue) : null

    if (variantDynamic || colorDynamic) {
      const partialProps = buildPartialTextProps(opening, null, null, componentValue, componentDynamic, asFromVariant)
      const textElement = buildTextElement(el, isSelfClosing, partialProps)
      edits.push(
        el.replace(withTodoComment('{/* TODO(backstage-codemod): verify Text variant manually */}', textElement)),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: 'dynamic-props' })
      migrationMetric.increment({
        action: 'typography-migrated',
        component: localNames.get(componentLocalName) ?? componentLocalName,
      })
      migrated = true
      continue
    }

    // Map variant
    let buiVariant: string | null = null
    let needsTodo = false
    if (variantValue) {
      buiVariant = VARIANT_MAP[variantValue] ?? null
      if (!buiVariant) {
        needsTodo = true
      }
    }

    // Map color
    let buiColor: string | null = null
    if (colorValue) {
      buiColor = COLOR_MAP[colorValue] ?? null
      if (!buiColor) {
        needsTodo = true
      }
    }

    if (needsTodo) {
      const partialProps = buildPartialTextProps(
        opening,
        buiVariant,
        buiColor,
        componentValue,
        componentDynamic,
        asFromVariant,
      )
      const textElement = buildTextElement(el, isSelfClosing, partialProps)
      edits.push(
        el.replace(withTodoComment('{/* TODO(backstage-codemod): verify Text variant manually */}', textElement)),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: 'unmapped-variant-or-color' })
      migrationMetric.increment({
        action: 'typography-migrated',
        component: localNames.get(componentLocalName) ?? componentLocalName,
      })
      migrated = true
      continue
    }

    // Build new props
    const newProps = buildPartialTextProps(
      opening,
      buiVariant,
      buiColor,
      componentValue,
      componentDynamic,
      asFromVariant,
    )
    const propsStr = newProps.length > 0 ? ` ${newProps.join(' ')}` : ''
    const gutterBottomTodo = gutterBottomAttr
      ? '{/* TODO(backstage-codemod): verify Text variant manually (gutterBottom) */}'
      : null

    const wrapWithGutterBottomTodo = (content: string): string => {
      if (!gutterBottomTodo) {
        return content
      }
      return withTodoComment(gutterBottomTodo, content)
    }

    if (isSelfClosing) {
      edits.push(el.replace(wrapWithGutterBottomTodo(`<Text${propsStr} />`)))
    } else {
      const children = el
        .children()
        .filter((c) => c.kind() !== 'jsx_opening_element' && c.kind() !== 'jsx_closing_element')
        .map((c) => c.text())
        .join('')

      edits.push(el.replace(wrapWithGutterBottomTodo(`<Text${propsStr}>${children}</Text>`)))
    }

    if (gutterBottomAttr) {
      migrationMetric.increment({ action: 'todo-inserted', reason: 'gutterBottom' })
      migrationMetric.increment({ action: 'gutterBottom-dropped' })
    }
    migrated = true
    migrationMetric.increment({
      action: 'typography-migrated',
      component: localNames.get(componentLocalName) ?? componentLocalName,
    })
  }

  return migrated
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames, defaultSources, barrelNames } = collectTypographyImports(rootNode)

  if (localNames.size === 0) {
    return null
  }

  const migrated = transformTypographyElements(rootNode, localNames, edits)

  if (migrated) {
    const addEdit = addImport(rootNode, {
      type: 'named',
      specifiers: [{ name: 'Text' }],
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

  if (barrelNames.length > 0) {
    const removedNames = new Set(barrelNames)
    for (const item of listImports(rootNode, { from: '@material-ui/core' })) {
      const matching = item.specifiers.filter((spec) => removedNames.has(spec.importedName))
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

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
