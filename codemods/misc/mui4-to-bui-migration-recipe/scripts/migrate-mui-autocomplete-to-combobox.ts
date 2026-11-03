import { addImport, getImport, listImports, removeImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-autocomplete-to-combobox')

const BUI_SOURCE = '@backstage/ui'
const MUI_LAB_BARREL = '@material-ui/lab'
const MUI_LAB_AUTOCOMPLETE = '@material-ui/lab/Autocomplete'
const MUI_TEXT_FIELD = '@material-ui/core/TextField'
const MUI_CORE_BARREL = '@material-ui/core'

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function withTodoComment(comment: string, elementText: string): string {
  return `<>
  ${comment}
  ${elementText}
</>`
}

function isInsideElementIds(node: SgNode<TSX>, elementIds: Set<number>): boolean {
  let current: SgNode<TSX> | null = node
  while (current) {
    if (elementIds.has(current.id())) {
      return true
    }
    current = current.parent()
  }
  return false
}

function textFieldUsedOutsideMigrated(
  rootNode: SgNode<TSX>,
  textFieldLocalName: string,
  migratedElementIds: Set<number>,
): boolean {
  for (const el of rootNode.findAll({
    rule: {
      any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
    },
  })) {
    const opening = el.is('jsx_self_closing_element') ? el : el.child(0)
    if (!opening || getElementName(opening) !== textFieldLocalName) {
      continue
    }
    if (!isInsideElementIds(el, migratedElementIds)) {
      return true
    }
  }
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

function getDirectPropAttr(opening: SgNode<TSX>, propName: string): SgNode<TSX> | null {
  for (const child of opening.children()) {
    if (!child.is('jsx_attribute')) {
      continue
    }
    const propId = child.find({ rule: { kind: 'property_identifier' } })
    if (propId?.text() === propName) {
      return child
    }
  }
  return null
}

function getDirectPropStringValue(opening: SgNode<TSX>, propName: string): string | null {
  const attr = getDirectPropAttr(opening, propName)
  if (!attr) {
    return null
  }
  // Only accept a direct string child (size="small"). Nested strings inside
  // expressions like size={cond ? 'small' : 'medium'} are dynamic, not static.
  for (const child of attr.children()) {
    if (child.kind() === 'string') {
      const frag = child.find({ rule: { kind: 'string_fragment' } })
      return frag?.text() ?? null
    }
  }
  return null
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
  // boolean prop
  return 'true'
}

function getPropStringValue(opening: SgNode<TSX>, propName: string): string | null {
  const attr = getPropAttr(opening, propName)
  if (!attr) {
    return null
  }
  // Only accept a direct string child (size="small"). Nested strings inside
  // expressions like size={cond ? 'small' : 'medium'} are dynamic, not static.
  for (const child of attr.children()) {
    if (child.kind() === 'string') {
      const frag = child.find({ rule: { kind: 'string_fragment' } })
      return frag?.text() ?? null
    }
  }
  return null
}

function unwrapJsxExpression(raw: string): string {
  if (raw.startsWith('{') && raw.endsWith('}')) {
    return raw.slice(1, -1).trim()
  }
  return raw
}

function getJsxExpressionFromAttr(attr: SgNode<TSX>): SgNode<TSX> | null {
  return attr.find({ rule: { kind: 'jsx_expression' } })
}

function getJsxExpressionInnerNode(expr: SgNode<TSX>): SgNode<TSX> | null {
  const children: SgNode<TSX>[] = []
  for (const child of expr.children()) {
    if (child.kind() !== '{' && child.kind() !== '}') {
      children.push(child)
    }
  }
  const [onlyChild] = children
  return children.length === 1 ? (onlyChild ?? null) : null
}

function getParamName(paramNode: SgNode<TSX>): string {
  const ident = paramNode.find({ rule: { kind: 'identifier' } })
  return ident?.text() ?? paramNode.text()
}

function getCallExpressionFromArrowBody(body: SgNode<TSX>): SgNode<TSX> | null {
  if (body.is('call_expression')) {
    return body
  }
  if (!body.is('statement_block')) {
    return null
  }
  const statements = body.children().filter((child) => child.kind() !== '{' && child.kind() !== '}')
  if (statements.length !== 1) {
    return null
  }
  const [statement] = statements
  if (!statement?.is('expression_statement')) {
    return null
  }
  return statement.find({ rule: { kind: 'call_expression' } })
}

function simplifySecondArgCallbackFromAttr(attr: SgNode<TSX>): string | null {
  const expr = getJsxExpressionFromAttr(attr)
  if (!expr) {
    return null
  }
  const inner = getJsxExpressionInnerNode(expr)
  if (!inner) {
    return null
  }

  if (inner.is('identifier')) {
    return inner.text()
  }

  if (!inner.is('arrow_function')) {
    return null
  }

  const params = inner.field('parameters')
  if (params?.kind() !== 'formal_parameters') {
    return null
  }

  const paramChildren: SgNode<TSX>[] = []
  for (const child of params.children()) {
    if (child.is('required_parameter') || child.is('identifier')) {
      paramChildren.push(child)
    }
  }
  if (paramChildren.length !== 2) {
    return null
  }

  const [, secondParam] = paramChildren
  if (!secondParam) {
    return null
  }
  const secondParamName = getParamName(secondParam)

  const callExpr = getCallExpressionFromArrowBody(inner.field('body'))
  if (!callExpr) {
    return null
  }

  const callee = callExpr.field('function')
  if (!callee?.is('identifier')) {
    return null
  }

  const args = callExpr.field('arguments')
  if (!args) {
    return null
  }

  const argChildren: SgNode<TSX>[] = []
  for (const child of args.children()) {
    if (child.kind() !== '(' && child.kind() !== ')' && child.kind() !== ',') {
      argChildren.push(child)
    }
  }
  if (argChildren.length !== 1) {
    return null
  }

  const [onlyArg] = argChildren
  if (!onlyArg?.is('identifier') || onlyArg.text() !== secondParamName) {
    return null
  }

  return callee.text()
}

function flattenStringOptionsFromAttr(attr: SgNode<TSX>): string | null {
  const expr = getJsxExpressionFromAttr(attr)
  if (!expr) {
    return null
  }
  const inner = getJsxExpressionInnerNode(expr)
  if (!inner?.is('array')) {
    return null
  }

  const strings: string[] = []
  for (const child of inner.children()) {
    if (child.kind() === '[' || child.kind() === ']' || child.kind() === ',') {
      continue
    }
    if (!child.is('string')) {
      return null
    }
    const frag = child.find({ rule: { kind: 'string_fragment' } })
    if (!frag) {
      return null
    }
    strings.push(frag.text())
  }

  if (strings.length === 0) {
    return '[]'
  }

  const objects = strings.map((value) => `{ value: '${value}', label: '${value}' }`)
  return `[${objects.join(', ')}]`
}

function looksLikeSearchText(text: string | null): boolean {
  if (!text) {
    return false
  }
  // Word-boundary allowlist — avoid false positives like "Research" / "Searchable".
  return /\b(search|find|filter)\b/i.test(text)
}

function extractRenderInputFieldProp(opening: SgNode<TSX>, propName: 'label' | 'placeholder' | 'size'): string | null {
  const attr = getPropAttr(opening, 'renderInput')
  if (!attr) {
    return null
  }
  const stringAttr = attr.find({
    rule: {
      kind: 'jsx_attribute',
      has: {
        kind: 'property_identifier',
        regex: `^${escapeRegex(propName)}$`,
      },
    },
  })
  if (!stringAttr) {
    return null
  }
  for (const child of stringAttr.children()) {
    if (child.kind() === 'string') {
      const frag = child.find({ rule: { kind: 'string_fragment' } })
      return frag?.text() ?? null
    }
  }
  return null
}

function isDynamicSizeProp(opening: SgNode<TSX>): boolean {
  return getDirectPropAttr(opening, 'size') !== null && getDirectPropStringValue(opening, 'size') === null
}

function addMappedSizeProp(opening: SgNode<TSX>, props: string[]): void {
  const autocompleteSize = getDirectPropStringValue(opening, 'size')
  if (autocompleteSize !== null) {
    mapStaticSizeValue(autocompleteSize, false, props)
    return
  }

  const renderInputSize = extractRenderInputFieldProp(opening, 'size')
  if (renderInputSize !== null) {
    mapStaticSizeValue(renderInputSize, true, props)
    return
  }

  props.push('size="medium"')
  migrationMetric.increment({ action: 'size-defaulted-to-medium' })
}

function mapStaticSizeValue(muiSize: string, fromRenderInput: boolean, props: string[]): void {
  if (fromRenderInput) {
    migrationMetric.increment({ action: 'size-from-render-input' })
  }

  if (muiSize === 'small') {
    props.push('size="small"')
    migrationMetric.increment({ action: 'size-mapped', size: 'small' })
    return
  }
  if (muiSize === 'medium') {
    props.push('size="medium"')
    migrationMetric.increment({ action: 'size-mapped', size: 'medium' })
    return
  }
  if (muiSize === 'large') {
    props.push('size="medium"')
    migrationMetric.increment({ action: 'size-large-to-medium' })
    return
  }

  props.push('size="medium"')
  migrationMetric.increment({ action: 'size-defaulted-to-medium' })
}

type AutocompleteKind = 'combobox' | 'search' | 'todo'

function classifyAutocomplete(opening: SgNode<TSX>): AutocompleteKind {
  const hasOptions = hasProp(opening, 'options')
  const hasGetOptionLabel = hasProp(opening, 'getOptionLabel')
  const hasValue = hasProp(opening, 'value')
  const hasOnChange = hasProp(opening, 'onChange')
  const hasOnInputChange = hasProp(opening, 'onInputChange')
  const hasFreeSolo = hasProp(opening, 'freeSolo')
  const hasRenderOption = hasProp(opening, 'renderOption')
  const hasMultiple = hasProp(opening, 'multiple')

  const placeholder = extractRenderInputFieldProp(opening, 'placeholder')
  const label = extractRenderInputFieldProp(opening, 'label')
  const searchLike = looksLikeSearchText(placeholder) || looksLikeSearchText(label)

  if (hasRenderOption || hasMultiple) {
    return 'todo'
  }

  // Clear free-text search: onInputChange + search cue, no selection value binding.
  if (hasOnInputChange && searchLike && !hasValue && !hasOnChange) {
    return 'search'
  }

  // Ambiguous: both selection and free-text input handlers.
  if (hasOnInputChange && (hasValue || hasOnChange)) {
    return 'todo'
  }

  // freeSolo outside the clear search path is too risky for Combobox.
  if (hasFreeSolo) {
    return 'todo'
  }

  // Form-like option picker → Combobox only when options are a string[] literal
  // we can reshape to `{ value, label }`. Object options + getOptionLabel are unsafe.
  if (hasOptions && (hasGetOptionLabel || hasValue || hasOnChange)) {
    const optionsAttr = getPropAttr(opening, 'options')
    if (optionsAttr && flattenStringOptionsFromAttr(optionsAttr)) {
      return 'combobox'
    }
    return 'todo'
  }

  return 'todo'
}

function buildComboboxReplacement(opening: SgNode<TSX>): string | null {
  const optionsAttr = getPropAttr(opening, 'options')
  if (!optionsAttr) {
    return null
  }

  const flattened = flattenStringOptionsFromAttr(optionsAttr)
  const optionsRaw = getPropRawValue(opening, 'options')
  const optionsExpr = flattened ?? (optionsRaw ? unwrapJsxExpression(optionsRaw) : null)
  if (!optionsExpr) {
    return null
  }

  const props: string[] = [`options={${optionsExpr}}`]

  const valueRaw = getPropRawValue(opening, 'value')
  if (valueRaw && valueRaw !== 'true') {
    props.push(`value={${unwrapJsxExpression(valueRaw)}}`)
  }

  const onChangeAttr = getPropAttr(opening, 'onChange')
  if (onChangeAttr) {
    const onChangeRaw = getPropRawValue(opening, 'onChange')
    if (onChangeRaw && onChangeRaw !== 'true') {
      const simplified = simplifySecondArgCallbackFromAttr(onChangeAttr)
      if (!simplified) {
        return null
      }
      props.push(`onSelectionChange={${simplified}}`)
    }
  }

  const label = extractRenderInputFieldProp(opening, 'label')
  if (label) {
    props.push(`label="${label}"`)
  }

  const placeholder = extractRenderInputFieldProp(opening, 'placeholder')
  if (placeholder) {
    props.push(`placeholder="${placeholder}"`)
  }

  const nameStr = getPropStringValue(opening, 'name')
  if (nameStr) {
    props.push(`name="${nameStr}"`)
  }

  addMappedSizeProp(opening, props)

  return `<Combobox ${props.join(' ')} />`
}

function buildSearchReplacement(opening: SgNode<TSX>): string | null {
  const props: string[] = []

  const inputValueRaw = getPropRawValue(opening, 'inputValue')
  if (inputValueRaw && inputValueRaw !== 'true') {
    props.push(`inputValue={${unwrapJsxExpression(inputValueRaw)}}`)
  }

  const onInputChangeAttr = getPropAttr(opening, 'onInputChange')
  if (onInputChangeAttr) {
    const onInputChangeRaw = getPropRawValue(opening, 'onInputChange')
    if (onInputChangeRaw && onInputChangeRaw !== 'true') {
      const simplified = simplifySecondArgCallbackFromAttr(onInputChangeAttr)
      if (!simplified) {
        return null
      }
      props.push(`onInputChange={${simplified}}`)
    }
  }

  const placeholder = extractRenderInputFieldProp(opening, 'placeholder')
  if (placeholder) {
    props.push(`placeholder="${placeholder}"`)
  }

  addMappedSizeProp(opening, props)

  return `<SearchAutocomplete ${props.join(' ')} />`
}

function transformAutocompleteElements(
  rootNode: SgNode<TSX>,
  localName: string,
  edits: Edit[],
  buiNames: Set<string>,
): { migrated: boolean; preserveImport: boolean; migratedElementIds: Set<number> } {
  let migrated = false
  let preserveImport = false
  const migratedElementIds = new Set<number>()

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
    if (getElementName(opening) !== localName) {
      continue
    }

    const kind = classifyAutocomplete(opening)
    if (kind === 'todo') {
      edits.push(
        el.replace(
          withTodoComment(
            `{/* TODO(backstage-codemod): verify Autocomplete migration manually — ambiguous Combobox vs SearchAutocomplete */}`,
            el.text(),
          ),
        ),
      )
      preserveImport = true
      migrationMetric.increment({ action: 'todo-inserted', reason: 'ambiguous-autocomplete' })
      continue
    }

    if (isDynamicSizeProp(opening)) {
      edits.push(
        el.replace(
          withTodoComment(
            `{/* TODO(backstage-codemod): verify Autocomplete migration manually — ambiguous Combobox vs SearchAutocomplete */}`,
            el.text(),
          ),
        ),
      )
      preserveImport = true
      migrationMetric.increment({ action: 'todo-inserted', reason: 'size' })
      continue
    }

    if (kind === 'combobox') {
      const replacement = buildComboboxReplacement(opening)
      if (!replacement) {
        edits.push(
          el.replace(
            withTodoComment(
              `{/* TODO(backstage-codemod): verify Autocomplete migration manually — ambiguous Combobox vs SearchAutocomplete */}`,
              el.text(),
            ),
          ),
        )
        preserveImport = true
        migrationMetric.increment({ action: 'todo-inserted', reason: 'combobox-unmapped' })
        continue
      }
      edits.push(el.replace(replacement))
      buiNames.add('Combobox')
      migrated = true
      migratedElementIds.add(el.id())
      migrationMetric.increment({ action: 'autocomplete-to-combobox' })
      continue
    }

    const replacement = buildSearchReplacement(opening)
    if (!replacement) {
      edits.push(
        el.replace(
          withTodoComment(
            `{/* TODO(backstage-codemod): verify Autocomplete migration manually — ambiguous Combobox vs SearchAutocomplete */}`,
            el.text(),
          ),
        ),
      )
      preserveImport = true
      migrationMetric.increment({ action: 'todo-inserted', reason: 'search-unmapped' })
      continue
    }
    edits.push(el.replace(replacement))
    buiNames.add('SearchAutocomplete')
    migrated = true
    migratedElementIds.add(el.id())
    migrationMetric.increment({ action: 'autocomplete-to-search' })
  }

  return { migrated, preserveImport, migratedElementIds }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const autocompleteDefault = getImport(rootNode, { type: 'default', from: MUI_LAB_AUTOCOMPLETE })
  const autocompleteBarrelNamed = getImport(rootNode, { type: 'named', name: 'Autocomplete', from: MUI_LAB_BARREL })
  const localName = autocompleteBarrelNamed?.alias ?? autocompleteDefault?.alias ?? null
  if (!localName) {
    return null
  }

  const buiNames = new Set<string>()
  const { migrated, preserveImport, migratedElementIds } = transformAutocompleteElements(
    rootNode,
    localName,
    edits,
    buiNames,
  )

  // Fold unused TextField imports into the same removal pass so the BUI import
  // does not merge onto a TextField import that we later delete.
  let removeTextField = false
  if (migratedElementIds.size > 0) {
    const textFieldDefault = getImport(rootNode, { type: 'default', from: MUI_TEXT_FIELD })
    const textFieldBarrelNamed = getImport(rootNode, { type: 'named', name: 'TextField', from: MUI_CORE_BARREL })
    const textFieldLocalName = textFieldBarrelNamed?.alias ?? textFieldDefault?.alias ?? null
    if (textFieldLocalName && !textFieldUsedOutsideMigrated(rootNode, textFieldLocalName, migratedElementIds)) {
      removeTextField = true
    }
  }

  if (migrated && buiNames.size > 0) {
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
    if (autocompleteBarrelNamed) {
      for (const item of listImports(rootNode, { from: MUI_LAB_BARREL })) {
        if (item.specifiers.some((spec) => spec.importedName === 'Autocomplete')) {
          migrationMetric.increment({ action: 'import-removed' })
        }
      }
      const edit = removeImport(rootNode, { type: 'named', specifiers: ['Autocomplete'], from: MUI_LAB_BARREL })
      if (edit) {
        edits.push(...edit)
      }
    }
    if (removeTextField) {
      for (const item of listImports(rootNode, { from: MUI_CORE_BARREL })) {
        if (item.specifiers.some((spec) => spec.importedName === 'TextField')) {
          migrationMetric.increment({ action: 'import-removed' })
        }
      }
      const edit = removeImport(rootNode, { type: 'named', specifiers: ['TextField'], from: MUI_CORE_BARREL })
      if (edit) {
        edits.push(...edit)
      }
    }
    if (autocompleteDefault) {
      const edit = removeImport(rootNode, { type: 'default', from: MUI_LAB_AUTOCOMPLETE })
      if (edit) {
        edits.push(...edit)
        migrationMetric.increment({ action: 'import-removed' })
      }
    }
    if (removeTextField) {
      const edit = removeImport(rootNode, { type: 'default', from: MUI_TEXT_FIELD })
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
