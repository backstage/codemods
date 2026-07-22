import { parse, type Codemod, type Edit, type SgNode } from 'codemod:ast-grep'
import type CSS from 'codemod:ast-grep/langs/css'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-styles-to-bui-css-modules')

function parseCssRoot(source: string): SgNode<CSS> {
  return parse<CSS>('css', source).root()
}

/**
 * Map JSS camelCase property names to CSS kebab-case.
 */
function camelToKebab(str: string): string {
  return str.replaceAll(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}

/**
 * Map common MUI theme token expressions to BUI CSS variables.
 */
const THEME_TOKEN_MAP: Record<string, string> = {
  'theme.spacing(1)': 'var(--bui-space-2)',
  'theme.spacing(2)': 'var(--bui-space-4)',
  'theme.spacing(3)': 'var(--bui-space-6)',
  'theme.spacing(4)': 'var(--bui-space-8)',
  'theme.spacing(0.5)': 'var(--bui-space-1)',
  'theme.spacing(0)': '0',
  'theme.palette.background.paper': 'var(--bui-bg-neutral-1)',
  'theme.palette.background.default': 'var(--bui-bg-neutral-0)',
  'theme.palette.text.primary': 'var(--bui-color-text-primary)',
  'theme.palette.text.secondary': 'var(--bui-color-text-secondary)',
  'theme.palette.text.disabled': 'var(--bui-color-text-disabled)',
  'theme.palette.divider': 'var(--bui-color-border-default)',
  'theme.palette.primary.main': 'var(--bui-color-primary)',
  'theme.palette.secondary.main': 'var(--bui-color-secondary)',
  'theme.palette.error.main': 'var(--bui-color-danger)',
  'theme.palette.warning.main': 'var(--bui-color-warning)',
  'theme.palette.info.main': 'var(--bui-color-info)',
  'theme.palette.success.main': 'var(--bui-color-success)',
  'theme.shape.borderRadius': 'var(--bui-radius-2)',
}

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

interface StylesImportInfo {
  makeStylesLocal: string | null
  withStylesLocal: string | null
  importNodesToRemove: SgNode<TSX>[]
}

function collectStylesImports(rootNode: SgNode<TSX>): StylesImportInfo {
  let makeStylesLocal: string | null = null
  let withStylesLocal: string | null = null
  const importNodesToRemove: SgNode<TSX>[] = []

  const sources = ['@material-ui/core/styles', '@material-ui/core', '@material-ui/styles']

  for (const source of sources) {
    for (const imp of findImportStatementsFrom(rootNode, source)) {
      const ms = getNamedImportLocalName(imp, 'makeStyles')
      const cs = getNamedImportLocalName(imp, 'createStyles')
      const ws = getNamedImportLocalName(imp, 'withStyles')

      if (ms) {
        makeStylesLocal = ms
      }
      if (ws) {
        withStylesLocal = ws
      }

      if (ms || cs || ws) {
        if (getDefaultImportName(imp)) {
          continue
        }

        const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
        const targetCount = (ms ? 1 : 0) + (cs ? 1 : 0) + (ws ? 1 : 0)
        if (targetCount >= allSpecifiers.length) {
          importNodesToRemove.push(imp)
        }
      }
    }
  }

  return { makeStylesLocal, withStylesLocal, importNodesToRemove }
}

/**
 * Try to convert a JSS property value to a CSS value.
 * Returns null if the value is dynamic / unmappable.
 */
function tryMapJssValue(valueNode: SgNode<TSX>): string | null {
  const text = valueNode.text().trim()

  // Direct theme token mapping
  const mapped = THEME_TOKEN_MAP[text]
  if (mapped) {
    return mapped
  }

  // String literal → use raw value
  if (valueNode.kind() === 'string') {
    const frag = valueNode.find({ rule: { kind: 'string_fragment' } })
    return frag?.text() ?? null
  }

  // Number literal → append px (except 0)
  if (valueNode.kind() === 'number') {
    return text === '0' ? '0' : `${text}px`
  }

  // If it starts with theme. but isn't in our map, it's unmappable
  if (text.startsWith('theme.')) {
    return null
  }

  return null
}

interface CssRule {
  className: string
  properties: { prop: string; value: string }[]
}

/**
 * Extract static CSS rules from a makeStyles object.
 */
function extractCssRules(styleObjNode: SgNode<TSX>): { rules: CssRule[]; hasDynamic: boolean } {
  const rules: CssRule[] = []
  let hasDynamic = false

  for (const child of styleObjNode.children()) {
    if (child.kind() !== 'pair') {
      continue
    }

    const keyNode = child.find({ rule: { any: [{ kind: 'property_identifier' }, { kind: 'string' }] } })
    if (!keyNode) {
      continue
    }

    const className =
      keyNode.kind() === 'string'
        ? (keyNode.find({ rule: { kind: 'string_fragment' } })?.text() ?? keyNode.text())
        : keyNode.text()

    // Get the value — skip key and colon
    const valueNode = child
      .children()
      .find((c) => c.kind() !== 'property_identifier' && c.kind() !== ':' && c.kind() !== 'string' && c.kind() !== ',')

    if (!valueNode) {
      continue
    }

    // Dynamic rule: value is a function
    if (
      valueNode.kind() === 'arrow_function' ||
      valueNode.kind() === 'function_expression' ||
      valueNode.kind() === 'function'
    ) {
      hasDynamic = true
      continue
    }

    if (valueNode.kind() !== 'object') {
      hasDynamic = true
      continue
    }

    const properties: { prop: string; value: string }[] = []
    let ruleHasDynamic = false

    for (const propPair of valueNode.children()) {
      if (propPair.kind() !== 'pair') {
        continue
      }

      const propKeyNode = propPair.find({
        rule: { any: [{ kind: 'property_identifier' }, { kind: 'string' }] },
      })
      if (!propKeyNode) {
        continue
      }

      const propName =
        propKeyNode.kind() === 'string'
          ? (propKeyNode.find({ rule: { kind: 'string_fragment' } })?.text() ?? propKeyNode.text())
          : propKeyNode.text()

      const propValueNode = propPair
        .children()
        .find(
          (c) =>
            c.kind() !== 'property_identifier' &&
            c.kind() !== ':' &&
            c.kind() !== 'string' &&
            c.kind() !== ',' &&
            c.kind() !== propKeyNode.kind(),
        )

      if (!propValueNode) {
        ruleHasDynamic = true
        continue
      }

      const cssValue = tryMapJssValue(propValueNode)
      if (cssValue === null) {
        ruleHasDynamic = true
        continue
      }

      properties.push({ prop: camelToKebab(propName), value: cssValue })
    }

    if (ruleHasDynamic) {
      hasDynamic = true
      continue
    }

    if (properties.length > 0) {
      rules.push({ className, properties })
    }
  }

  return { rules, hasDynamic }
}

/**
 * Generate CSS module content from extracted rules.
 */
function generateCssModule(rules: CssRule[]): string {
  const lines: string[] = ['@layer components {']

  for (const rule of rules) {
    lines.push(`  .${rule.className} {`)
    for (const prop of rule.properties) {
      lines.push(`    ${prop.prop}: ${prop.value};`)
    }
    lines.push('  }')
  }

  lines.push('}')
  return lines.join('\n')
}

/**
 * Normalize file paths from the codemod runner (handles Windows long paths).
 */
function normalizeFilePath(filename: string): string {
  return filename.replace(/^\\\\\?\\/, '').replaceAll('\\', '/')
}

/**
 * Derive the CSS module import path relative to the source file.
 */
function deriveCssModuleImportPath(filename: string): string {
  const normalized = normalizeFilePath(filename)
  const base =
    normalized
      .replace(/\.[^.]+$/, '')
      .split('/')
      .pop() ?? 'styles'
  return `./${base}.module.css`
}

/**
 * Derive the CSS module file path adjacent to the source file.
 */
function deriveCssModuleFilePath(filename: string): string {
  const normalized = normalizeFilePath(filename)
  return normalized.replace(/\.[^.]+$/, '.module.css')
}

function hasCssModuleImport(rootNode: SgNode<TSX>, cssModuleImportPath: string): boolean {
  const imports = rootNode.findAll({ rule: { kind: 'import_statement' } })
  for (const imp of imports) {
    const stringFrag = imp.find({ rule: { kind: 'string_fragment' } })
    if (stringFrag?.text() === cssModuleImportPath) {
      return true
    }
  }
  return false
}

function getRuleSetClassName(ruleSet: SgNode<CSS>): string | null {
  const classSelector = ruleSet.find({ rule: { kind: 'class_selector' } })
  if (!classSelector) {
    return null
  }
  const classNameNode = classSelector.find({ rule: { kind: 'class_name' } })
  const ident = classNameNode?.find({ rule: { kind: 'identifier' } })
  return ident?.text() ?? null
}

function getRuleSetBody(ruleSet: SgNode<CSS>): string | null {
  const block = ruleSet.find({ rule: { kind: 'block' } })
  if (!block) {
    return null
  }
  const blockText = block.text()
  if (blockText.length < 2) {
    return null
  }
  return blockText.slice(1, -1).trim()
}

function extractClassNamesFromCss(cssContent: string): Set<string> {
  const classNames = new Set<string>()
  const cssRoot = parseCssRoot(cssContent)
  for (const ruleSet of cssRoot.findAll({ rule: { kind: 'rule_set' } })) {
    const className = getRuleSetClassName(ruleSet)
    if (className) {
      classNames.add(className)
    }
  }
  return classNames
}

function extractCssModuleRuleBlocks(cssContent: string): { className: string; body: string }[] {
  const rules: { className: string; body: string }[] = []
  const cssRoot = parseCssRoot(cssContent)
  for (const ruleSet of cssRoot.findAll({ rule: { kind: 'rule_set' } })) {
    const className = getRuleSetClassName(ruleSet)
    if (!className) {
      continue
    }
    const body = getRuleSetBody(ruleSet)
    if (body === null) {
      continue
    }
    rules.push({ className, body })
  }
  return rules
}

function findComponentsLayerBlock(cssRoot: SgNode<CSS>): SgNode<CSS> | null {
  for (const atRule of cssRoot.findAll({ rule: { kind: 'at_rule' } })) {
    const atKeyword = atRule.find({ rule: { kind: 'at_keyword' } })
    if (atKeyword?.text() !== '@layer') {
      continue
    }
    const keywordQuery = atRule.find({ rule: { kind: 'keyword_query' } })
    if (keywordQuery?.text() !== 'components') {
      continue
    }
    return atRule.find({ rule: { kind: 'block' } })
  }
  return null
}

function formatLayerRules(rules: { className: string; body: string }[]): string {
  return rules
    .map((rule) => {
      const props = rule.body
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `    ${line}`)
        .join('\n')
      return `  .${rule.className} {\n${props}\n  }`
    })
    .join('\n')
}

function mergeCssModuleContent(existing: string, generated: string): string {
  const trimmedExisting = existing.trimEnd()
  const generatedTrimmed = generated.trimEnd()
  if (!trimmedExisting) {
    return `${generatedTrimmed}\n`
  }

  const existingRoot = parseCssRoot(trimmedExisting)
  const existingClassNames = extractClassNamesFromCss(trimmedExisting)
  const newRules = extractCssModuleRuleBlocks(generatedTrimmed).filter(
    (rule) => !existingClassNames.has(rule.className),
  )
  if (newRules.length === 0) {
    return `${trimmedExisting}\n`
  }

  const layerBlock = findComponentsLayerBlock(existingRoot)
  if (layerBlock) {
    const newRulesText = formatLayerRules(newRules)
    const insertPos = layerBlock.range().end.index - 1
    return `${trimmedExisting.slice(0, insertPos)}\n${newRulesText}\n${trimmedExisting.slice(insertPos)}\n`
  }

  // Existing file has no @layer block — append the generated module as-is.
  return `${trimmedExisting}\n\n${generatedTrimmed}\n`
}

interface NodeFs {
  mkdirSync: (dir: string, opts: { recursive: boolean }) => void
  readFileSync: (file: string, encoding: string) => string
  writeFileSync: (file: string, data: string) => void
}

interface NodePath {
  dirname: (file: string) => string
}

function getNodeBuiltins(): { fs: NodeFs; path: NodePath } {
  const nodeRequire = (globalThis as unknown as { require?: (id: string) => unknown }).require
  if (typeof nodeRequire !== 'function') {
    throw new Error('Node builtins unavailable: require() is not defined in this runtime')
  }
  return {
    fs: nodeRequire('fs') as NodeFs,
    path: nodeRequire('path') as NodePath,
  }
}

function readCssModuleFile(cssFilePath: string): string | null {
  try {
    const { fs } = getNodeBuiltins()
    const text = fs.readFileSync(cssFilePath, 'utf8')
    return text.trim() ? text : null
  } catch {
    return null
  }
}

/**
 * jssg fixture runs execute the transform against `tests/<case>/input.tsx` and
 * still grant fs access. Skip sidecar writes there so fixtures stay pristine;
 * `scripts/assert-css-goldens.sh` validates CSS output via a real workflow run.
 */
function shouldPersistCssModule(sourceFilename: string): boolean {
  const normalized = normalizeFilePath(sourceFilename)
  return !(normalized.includes('/tests/') && /\/input\.[^.]+$/.test(normalized))
}

function writeCssModuleFile(cssFilePath: string, content: string, sourceFilename: string, dryRun: boolean): void {
  const existing = readCssModuleFile(cssFilePath)
  const mergedContent = existing ? mergeCssModuleContent(existing, content) : content
  const output = mergedContent.endsWith('\n') ? mergedContent : `${mergedContent}\n`
  if (dryRun || !shouldPersistCssModule(sourceFilename)) {
    return
  }
  const { fs, path } = getNodeBuiltins()
  fs.mkdirSync(path.dirname(cssFilePath), { recursive: true })
  fs.writeFileSync(cssFilePath, output)
}

const transform: Codemod<TSX> = (root, options) => {
  const rootNode = root.root()
  const edits: Edit[] = []
  const dryRun = Boolean(options.dryRun)

  const { makeStylesLocal, withStylesLocal, importNodesToRemove } = collectStylesImports(rootNode)

  if (!makeStylesLocal && !withStylesLocal) {
    return Promise.resolve(null)
  }

  // withStyles is always a TODO — too complex for deterministic migration
  if (withStylesLocal) {
    const withStylesCalls = rootNode.findAll({
      rule: {
        kind: 'call_expression',
        has: {
          field: 'function',
          kind: 'identifier',
          regex: `^${escapeRegex(withStylesLocal)}$`,
        },
      },
    })

    for (const call of withStylesCalls) {
      const stmt = call
        .ancestors()
        .find(
          (a) =>
            a.kind() === 'lexical_declaration' ||
            a.kind() === 'expression_statement' ||
            a.kind() === 'export_statement',
        )
      const target = stmt ?? call
      edits.push(
        target.replace(`// TODO(backstage-codemod): migrate withStyles to CSS Modules manually\n${target.text()}`),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: 'withStyles' })
    }

    if (!makeStylesLocal) {
      return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
    }
  }

  if (!makeStylesLocal) {
    return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  }

  const makeStylesPattern = escapeRegex(makeStylesLocal)

  // Find the makeStyles call: const useStyles = makeStyles(...)
  const makeStylesDeclarations = rootNode.findAll({
    rule: {
      kind: 'lexical_declaration',
      has: {
        kind: 'variable_declarator',
        has: {
          kind: 'call_expression',
          has: {
            field: 'function',
            kind: 'identifier',
            regex: `^${makeStylesPattern}$`,
          },
        },
      },
    },
  })

  if (makeStylesDeclarations.length === 0) {
    return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  }

  for (const decl of makeStylesDeclarations) {
    const declarator = decl.find({ rule: { kind: 'variable_declarator' } })
    if (!declarator) {
      continue
    }

    const hookName = declarator.field('name')?.text()
    if (!hookName) {
      continue
    }

    const callExpr = declarator.find({
      rule: {
        kind: 'call_expression',
        has: {
          field: 'function',
          kind: 'identifier',
          regex: `^${makeStylesPattern}$`,
        },
      },
    })

    if (!callExpr) {
      continue
    }

    const args = callExpr.find({ rule: { kind: 'arguments' } })
    if (!args) {
      continue
    }

    // Find the style object (may be inside an arrow function or direct object)
    let styleObj: SgNode<TSX> | null = null
    let isDynamicFactory = false

    const arrowFn = args.find({ rule: { kind: 'arrow_function' } })
    if (arrowFn) {
      const body = arrowFn.field('body')
      if (body) {
        if (body.kind() === 'parenthesized_expression') {
          styleObj = body.find({ rule: { kind: 'object' } })
        } else if (body.kind() === 'object') {
          styleObj = body
        } else {
          isDynamicFactory = true
        }
      }
    } else {
      styleObj = args.find({ rule: { kind: 'object' } })
    }

    if (isDynamicFactory || !styleObj) {
      edits.push(
        decl.replace(`// TODO(backstage-codemod): migrate dynamic JSS rule to CSS Modules manually\n${decl.text()}`),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: 'dynamic-factory' })
      continue
    }

    const { rules, hasDynamic } = extractCssRules(styleObj)

    if (hasDynamic || rules.length === 0) {
      edits.push(
        decl.replace(`// TODO(backstage-codemod): migrate dynamic JSS rule to CSS Modules manually\n${decl.text()}`),
      )
      migrationMetric.increment({
        action: 'todo-inserted',
        reason: hasDynamic ? 'dynamic-rules' : 'empty-rules',
      })
      continue
    }

    // Generate CSS and write the adjacent module file
    const cssContent = generateCssModule(rules)
    const cssModuleImportPath = deriveCssModuleImportPath(root.filename())
    const cssModuleFilePath = deriveCssModuleFilePath(root.filename())
    writeCssModuleFile(cssModuleFilePath, `${cssContent}\n`, root.filename(), dryRun)

    // Remove the makeStyles declaration
    edits.push(decl.replace(''))
    migrationMetric.increment({ action: 'makeStyles-removed' })

    // Add CSS module import after existing imports (avoid mutating imports slated for removal)
    const importsToRemoveIds = new Set(importNodesToRemove.map((imp) => imp.id()))
    const survivingImports = rootNode
      .findAll({ rule: { kind: 'import_statement' } })
      .filter((imp) => !importsToRemoveIds.has(imp.id()))
    const cssImportLine = `import styles from '${cssModuleImportPath}';`

    if (!hasCssModuleImport(rootNode, cssModuleImportPath)) {
      if (survivingImports.length > 0) {
        const lastSurvivingImport = survivingImports.at(-1)
        if (lastSurvivingImport) {
          const insertAt = lastSurvivingImport.range().end.index
          edits.push({
            startPos: insertAt,
            endPos: insertAt,
            insertedText: `\n${cssImportLine}`,
          })
        }
      } else {
        const [firstNode] = rootNode.children()
        if (firstNode) {
          edits.push({
            startPos: firstNode.range().start.index,
            endPos: firstNode.range().start.index,
            insertedText: `${cssImportLine}\n`,
          })
        }
      }
      migrationMetric.increment({ action: 'css-module-import-added' })
    }
    migrationMetric.increment({ action: 'css-module-file-written' })

    // Find and remove the useStyles() hook call
    const hookCalls = rootNode.findAll({
      rule: {
        kind: 'lexical_declaration',
        has: {
          kind: 'variable_declarator',
          has: {
            kind: 'call_expression',
            has: {
              field: 'function',
              kind: 'identifier',
              regex: `^${escapeRegex(hookName)}$`,
            },
          },
        },
      },
    })

    for (const hookCall of hookCalls) {
      const hookDeclarator = hookCall.find({ rule: { kind: 'variable_declarator' } })
      if (!hookDeclarator) {
        continue
      }
      const classesName = hookDeclarator.field('name')?.text()

      if (classesName) {
        // Replace all classes.X references with styles.X
        const memberExprs = rootNode.findAll({
          rule: {
            kind: 'member_expression',
            has: {
              field: 'object',
              kind: 'identifier',
              regex: `^${escapeRegex(classesName)}$`,
            },
          },
        })

        for (const memberExpr of memberExprs) {
          const prop = memberExpr.field('property')
          if (prop) {
            edits.push(memberExpr.replace(`styles.${prop.text()}`))
            migrationMetric.increment({ action: 'classes-ref-replaced' })
          }
        }
      }

      edits.push(hookCall.replace(''))
      migrationMetric.increment({ action: 'hook-call-removed' })
    }
  }

  // Remove the MUI styles imports
  for (const imp of importNodesToRemove) {
    edits.push(imp.replace(''))
    migrationMetric.increment({ action: 'import-removed' })
  }

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
