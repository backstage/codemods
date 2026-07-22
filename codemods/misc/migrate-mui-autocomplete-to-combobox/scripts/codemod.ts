import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-autocomplete-to-combobox')

const BUI_SOURCE = '@backstage/ui'
const MUI_LAB_BARREL = '@material-ui/lab'
const MUI_LAB_AUTOCOMPLETE = '@material-ui/lab/Autocomplete'

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function withTodoComment(comment: string, elementText: string): string {
  return `<>
  ${comment}
  ${elementText}
</>`
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

function getPrunedBarrelImportText(imp: SgNode<TSX>, namesToRemove: string[], source: string): string {
  const remainingSpecs = imp.findAll({ rule: { kind: 'import_specifier' } }).filter((spec) => {
    const importedName = getImportedName(spec)
    return importedName !== null && !namesToRemove.includes(importedName)
  })

  if (remainingSpecs.length === 0) {
    return ''
  }

  const typeOnly = imp.text().trimStart().startsWith('import type')
  const isMultiline = imp.text().includes('\n')
  const specTexts = remainingSpecs.map((spec) => spec.text())
  const typeKw = typeOnly ? 'type ' : ''

  return isMultiline
    ? `import ${typeKw}{\n  ${specTexts.join(',\n  ')},\n} from '${source}';`
    : `import ${typeKw}{ ${specTexts.join(', ')} } from '${source}';`
}

function collectAutocompleteImports(rootNode: SgNode<TSX>): {
  localName: string | null
  importNodesToRemove: SgNode<TSX>[]
  importSpecifiersToRemove: Map<SgNode<TSX>, { source: string; names: string[] }>
} {
  let localName: string | null = null
  const importNodesToRemove: SgNode<TSX>[] = []
  const importSpecifiersToRemove = new Map<SgNode<TSX>, { source: string; names: string[] }>()

  for (const imp of findImportStatementsFrom(rootNode, MUI_LAB_AUTOCOMPLETE)) {
    localName = getDefaultImportName(imp)
    importNodesToRemove.push(imp)
  }

  for (const imp of findImportStatementsFrom(rootNode, MUI_LAB_BARREL)) {
    const name = getNamedImportLocalName(imp, 'Autocomplete')
    if (name) {
      localName = name
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (allSpecifiers.length <= 1) {
        importNodesToRemove.push(imp)
      } else {
        importSpecifiersToRemove.set(imp, { source: MUI_LAB_BARREL, names: ['Autocomplete'] })
      }
    }
  }

  return { localName, importNodesToRemove, importSpecifiersToRemove }
}

const MUI_TEXT_FIELD = '@material-ui/core/TextField'
const MUI_CORE_BARREL = '@material-ui/core'

function collectTextFieldImports(rootNode: SgNode<TSX>): {
  localName: string | null
  importNodesToRemove: SgNode<TSX>[]
  importSpecifiersToRemove: Map<SgNode<TSX>, { source: string; names: string[] }>
} {
  let localName: string | null = null
  const importNodesToRemove: SgNode<TSX>[] = []
  const importSpecifiersToRemove = new Map<SgNode<TSX>, { source: string; names: string[] }>()

  for (const imp of findImportStatementsFrom(rootNode, MUI_TEXT_FIELD)) {
    localName = getDefaultImportName(imp)
    importNodesToRemove.push(imp)
  }

  for (const imp of findImportStatementsFrom(rootNode, MUI_CORE_BARREL)) {
    const name = getNamedImportLocalName(imp, 'TextField')
    if (name) {
      localName = name
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (allSpecifiers.length <= 1) {
        importNodesToRemove.push(imp)
      } else {
        importSpecifiersToRemove.set(imp, { source: MUI_CORE_BARREL, names: ['TextField'] })
      }
    }
  }

  return { localName, importNodesToRemove, importSpecifiersToRemove }
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

function addBuiImport(
  rootNode: SgNode<TSX>,
  names: string[],
  importNodesToRemove: SgNode<TSX>[],
  importSpecifiersToRemove: Map<SgNode<TSX>, { source: string; names: string[] }>,
  edits: Edit[],
  handledBarrelIds: Set<number>,
  replacedDeepImportIds: Set<number>,
): void {
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
    }
    return
  }

  const skipIds = new Set([
    ...importNodesToRemove.map((imp) => imp.id()),
    ...[...importSpecifiersToRemove.keys()].map((imp) => imp.id()),
  ])
  const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
  const anchorImport = [...allImports].reverse().find((imp) => !skipIds.has(imp.id())) ?? null

  if (anchorImport) {
    edits.push(anchorImport.replace(`${anchorImport.text()}\n${buiImport}`))
    migrationMetric.increment({ action: 'import-added' })
    return
  }

  const [barrelToFold] = [...importSpecifiersToRemove.entries()]
  if (barrelToFold) {
    const [imp, { source, names: namesToRemove }] = barrelToFold
    const pruned = getPrunedBarrelImportText(imp, namesToRemove, source)
    edits.push(imp.replace(pruned.length > 0 ? `${pruned}\n${buiImport}` : buiImport))
    handledBarrelIds.add(imp.id())
    migrationMetric.increment({ action: 'import-added' })
    migrationMetric.increment({ action: 'import-removed' })
    return
  }

  const [deep] = importNodesToRemove
  if (deep) {
    edits.push(deep.replace(buiImport))
    replacedDeepImportIds.add(deep.id())
    migrationMetric.increment({ action: 'import-added' })
  }
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

  const { localName, importNodesToRemove, importSpecifiersToRemove } = collectAutocompleteImports(rootNode)
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

  // Fold unused TextField imports into the same removal pass so addBuiImport
  // does not append onto a TextField import that we later delete.
  if (migratedElementIds.size > 0) {
    const textFieldImports = collectTextFieldImports(rootNode)
    if (
      textFieldImports.localName &&
      !textFieldUsedOutsideMigrated(rootNode, textFieldImports.localName, migratedElementIds)
    ) {
      importNodesToRemove.push(...textFieldImports.importNodesToRemove)
      for (const [imp, info] of textFieldImports.importSpecifiersToRemove) {
        const existing = importSpecifiersToRemove.get(imp)
        if (existing) {
          existing.names.push(...info.names)
        } else {
          importSpecifiersToRemove.set(imp, info)
        }
      }
    }
  }

  const handledBarrelIds = new Set<number>()
  const replacedDeepImportIds = new Set<number>()

  if (migrated && buiNames.size > 0) {
    addBuiImport(
      rootNode,
      [...buiNames],
      importNodesToRemove,
      importSpecifiersToRemove,
      edits,
      handledBarrelIds,
      replacedDeepImportIds,
    )
  }

  if (!preserveImport) {
    for (const [imp, { source, names }] of importSpecifiersToRemove) {
      if (handledBarrelIds.has(imp.id())) {
        continue
      }
      edits.push(imp.replace(getPrunedBarrelImportText(imp, names, source)))
      migrationMetric.increment({ action: 'import-removed' })
    }
    for (const imp of importNodesToRemove) {
      if (replacedDeepImportIds.has(imp.id())) {
        migrationMetric.increment({ action: 'import-removed' })
        continue
      }
      edits.push(imp.replace(''))
      migrationMetric.increment({ action: 'import-removed' })
    }
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
