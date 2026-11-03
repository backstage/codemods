import { addImport, listImports, removeImport } from '@jssg/utils/javascript/imports'
import { parse } from 'codemod:ast-grep'
import type { Codemod, Edit, SgNode, SgRoot } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const TSX_LANG = 'tsx'

function parseTsx(source: string): SgRoot<TSX> {
  return parse<TSX>(TSX_LANG, source)
}

const migrationMetric = useMetricAtom('humanize-entity-ref-to-presentation')

type Context = 'jsx' | 'react-component' | 'utility'

const SOURCE_PKG = '@backstage/plugin-catalog-react'

function escapeRegex(str: string): string {
  return `^${str.replaceAll(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`
}

interface DeprecatedImportInfo {
  importedName: string
  alias: string
}

/**
 * List ESM import statements from a specific source via @jssg/utils.
 */
function listImportStatementsFrom(rootNode: SgNode<TSX, 'program'>) {
  return listImports(rootNode, { from: SOURCE_PKG }).filter((item) => item.node.is('import_statement'))
}

/**
 * Check if a call site is inside a conditional, loop, or other construct
 * that would violate React's Rules of Hooks.
 *
 * Note: This is slightly over-broad since `inside()` doesn't support `stopBy`
 * as a method parameter. In practice this is safe — false positives default to
 * `entityPresentationSnapshot` which works everywhere.
 */
function isInsideConditionalOrLoop(callNode: SgNode<TSX>): boolean {
  return callNode.inside({
    rule: {
      any: [
        { kind: 'if_statement' },
        { kind: 'for_statement' },
        { kind: 'for_in_statement' },
        { kind: 'while_statement' },
        { kind: 'do_statement' },
        { kind: 'switch_statement' },
        { kind: 'ternary_expression' },
        { kind: 'catch_clause' },
      ],
    },
  })
}

/**
 * Check if a call node is inside a template literal (template_string / template_substitution).
 * When inside a template literal, the result must be a string, not JSX.
 */
function isInsideTemplateLiteral(callNode: SgNode<TSX>): boolean {
  return callNode.inside({
    rule: {
      any: [{ kind: 'template_string' }, { kind: 'template_substitution' }],
    },
  })
}

/**
 * Check if a jsx_expression node is the value of a `key` prop.
 * The `key` prop requires a string/number value, not a JSX element.
 */
function isKeyPropValue(jsxExprNode: SgNode<TSX>): boolean {
  const parent = jsxExprNode.parent()
  if (parent?.kind() !== 'jsx_attribute') {
    return false
  }
  const attrName = parent.find({ rule: { kind: 'property_identifier' } })
  return attrName?.text() === 'key'
}

/**
 * Determine the call-site context for a call_expression node.
 */
function determineContext(callNode: SgNode<TSX>): Context {
  for (const ancestor of callNode.ancestors()) {
    const kind = ancestor.kind()

    // If we hit a jsx_expression before a function boundary, it's JSX context —
    // BUT if the call is inside a template literal within that JSX expression,
    // a string value is needed, not a JSX component. Use entityPresentationSnapshot
    // (utility) since it's the lightest-weight synchronous string getter.
    // Also, if the jsx_expression is the value of a `key` prop, React requires
    // a string/number — not a JSX element — so use utility context instead.
    if (kind === 'jsx_expression') {
      if (isInsideTemplateLiteral(callNode)) {
        return 'utility'
      }
      if (isKeyPropValue(ancestor)) {
        return 'utility'
      }
      return 'jsx'
    }

    // If we hit a function boundary, check if it's a React component
    if (
      kind === 'function_declaration' ||
      kind === 'arrow_function' ||
      kind === 'function_expression' ||
      kind === 'method_definition'
    ) {
      if (isReactComponent(ancestor)) {
        // Even though we're in a React component, if the call is inside
        // a conditional or loop, using a hook would violate Rules of Hooks.
        // Fall back to entityPresentationSnapshot (utility context) instead.
        if (isInsideConditionalOrLoop(callNode)) {
          return 'utility'
        }
        return 'react-component'
      }
      return 'utility'
    }
  }

  return 'utility'
}

/**
 * Check if a function node is a React component by looking for JSX in its body.
 */
function isReactComponent(fnNode: SgNode<TSX>): boolean {
  const hasJsx = fnNode.find({
    rule: {
      any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
    },
  })
  return hasJsx !== null
}

/**
 * Check if an options node contains `defaultKind` or `defaultNamespace` keys,
 * which are NOT supported as props on `EntityDisplayName`.
 */
function hasUnsupportedJsxOptions(optionsNode: SgNode<TSX>): boolean {
  const pairs = optionsNode.findAll({ rule: { kind: 'pair' } })
  for (const pair of pairs) {
    const keyNode = pair.field('key')
    if (!keyNode) {
      continue
    }
    const key = keyNode.text()
    if (key === 'defaultKind' || key === 'defaultNamespace') {
      return true
    }
  }
  return false
}

/**
 * Build the replacement text for a call expression based on context.
 * Returns both the replacement text and the effective context (which may differ
 * from the input context when JSX falls back to react-component due to options).
 */
function buildReplacement(
  context: Context,
  entityArg: string,
  optionsNode: SgNode<TSX> | null,
  isHumanizeEntity: boolean,
): { text: string; effectiveContext: Context } {
  // For humanizeEntity, the 2nd arg is a fallback name, which the Presentation API handles
  const contextNode = isHumanizeEntity ? null : optionsNode

  // In JSX context, if options include defaultKind/defaultNamespace (not supported
  // as EntityDisplayName props), fall back to useEntityPresentation hook
  if (context === 'jsx' && contextNode && hasUnsupportedJsxOptions(contextNode)) {
    const optText = contextNode.text()
    const args = `${entityArg}, ${optText}`
    return {
      text: `useEntityPresentation(${args}).primaryTitle`,
      effectiveContext: 'react-component',
    }
  }

  switch (context) {
    case 'jsx': {
      let props = `entityRef={${entityArg}}`
      if (contextNode) {
        const jsxProps = optionsToJsxProps(contextNode)
        if (jsxProps) {
          props += ` ${jsxProps}`
        }
      }
      return { text: `<EntityDisplayName ${props} />`, effectiveContext: 'jsx' }
    }
    case 'react-component': {
      const optText = contextNode?.text() ?? null
      const args = optText ? `${entityArg}, ${optText}` : entityArg
      return { text: `useEntityPresentation(${args}).primaryTitle`, effectiveContext: 'react-component' }
    }
    case 'utility': {
      const optText = contextNode?.text() ?? null
      const args = optText ? `${entityArg}, ${optText}` : entityArg
      return { text: `entityPresentationSnapshot(${args}).primaryTitle`, effectiveContext: 'utility' }
    }
  }
}

/**
 * Convert an options AST node like `{ defaultKind: 'Component' }` into JSX props.
 * Walks `pair` children via the AST so all value types (strings, variables,
 * numbers, booleans, expressions) are handled — no regex needed.
 */
function optionsToJsxProps(optionsNode: SgNode<TSX>): string | null {
  const pairs = optionsNode.findAll({ rule: { kind: 'pair' } })
  if (pairs.length === 0) {
    return null
  }

  const props: string[] = []
  for (const pair of pairs) {
    const keyNode = pair.field('key')
    const valueNode = pair.field('value')
    if (!keyNode || !valueNode) {
      continue
    }

    const key = keyNode.text()
    const valueKind = valueNode.kind()

    if (valueKind === 'string') {
      // String literal — extract the inner string_fragment to strip quotes
      const fragment = valueNode.find({ rule: { kind: 'string_fragment' } })
      const raw = fragment ? fragment.text() : valueNode.text()
      props.push(`${key}="${raw}"`)
    } else {
      // Identifiers, numbers, booleans, template literals, expressions, etc.
      props.push(`${key}={${valueNode.text()}}`)
    }
  }

  return props.length > 0 ? props.join(' ') : null
}

/**
 * Build a named import/export statement. Used for re-exports (no util
 * equivalent) and the no-imports fallback header in the transform below.
 */
function buildNamedStatement(
  keyword: 'import' | 'export',
  specTexts: string[],
  source: string,
  typeOnly: boolean,
): string {
  const typeKw = typeOnly ? 'type ' : ''
  if (specTexts.length <= 3) {
    return `${keyword} ${typeKw}{ ${specTexts.join(', ')} } from '${source}';`
  }
  return `${keyword} ${typeKw}{\n  ${specTexts.join(',\n  ')},\n} from '${source}';`
}

/**
 * Replace a deprecated call expression with the appropriate Presentation API.
 * Works for both direct calls (identifier) and namespace calls (member_expression).
 * Returns the context used, or null if the call could not be processed.
 */
function replaceDeprecatedCall(
  call: SgNode<TSX>,
  importedName: string,
  edits: Edit[],
  neededImports: Set<string>,
  metricReason: string,
): Context | null {
  const isHumanizeEntity = importedName === 'humanizeEntity'
  const context = determineContext(call)

  // Extract arguments
  const args = call.find({ rule: { kind: 'arguments' } })
  if (!args) {
    return null
  }

  const argChildren: SgNode<TSX>[] = []
  for (const child of args.children()) {
    if (child.isNamed()) {
      argChildren.push(child)
    }
  }

  const entityArg = argChildren[0]?.text() ?? ''
  const optionsNode = argChildren[1] ?? null

  const { text: replacement, effectiveContext } = buildReplacement(context, entityArg, optionsNode, isHumanizeEntity)

  if (effectiveContext === 'jsx') {
    // Check if this call is inside a jsx_expression (for JSX context replacements)
    const jsxExpr = call.ancestors().find((a) => a.kind() === 'jsx_expression')
    if (jsxExpr) {
      // Only strip the {} when the jsx_expression is a direct child of a JSX element
      // (i.e., a text child position like <Typography>{humanizeEntityRef(...)}</Typography>).
      // When it's inside a jsx_attribute (prop value like label={...}), keep the {}
      // to produce valid JSX: label={<EntityDisplayName .../>}
      const jsxExprParent = jsxExpr.parent()
      const isInsideAttribute = jsxExprParent?.kind() === 'jsx_attribute'

      if (isInsideAttribute) {
        // Replace just the call expression, keeping the surrounding { }
        edits.push(call.replace(replacement))
      } else {
        // Text child position — strip the {} braces by replacing the entire jsx_expression
        edits.push(jsxExpr.replace(replacement))
      }
    } else {
      edits.push(call.replace(replacement))
    }
  } else {
    // For react-component and utility contexts, replace just the call expression
    edits.push(call.replace(replacement))
  }

  // Track which imports we need based on the effective context
  switch (effectiveContext) {
    case 'jsx': {
      neededImports.add('EntityDisplayName')
      break
    }
    case 'react-component': {
      neededImports.add('useEntityPresentation')
      break
    }
    case 'utility': {
      neededImports.add('entityPresentationSnapshot')
      break
    }
  }

  migrationMetric.increment({
    outcome: 'auto-migrated',
    function: importedName,
    context: effectiveContext,
    reason: metricReason,
  })

  return effectiveContext
}

const DEPRECATED_FUNCTIONS = new Set(['humanizeEntityRef', 'humanizeEntity'])

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  // Track which replacement APIs we need to import
  const neededImports = new Set<string>()

  // List all import statements from the source package via @jssg/utils
  const sourceImports = listImportStatementsFrom(rootNode)

  // Collect deprecated import info (named imports)
  const deprecatedImports: DeprecatedImportInfo[] = []

  // Deprecated specifier names to remove from import statements
  const deprecatedNames = new Set<string>()

  // Track namespace import aliases that reference deprecated functions
  const namespaceImportAliases: string[] = []

  for (const importStmt of sourceImports) {
    // Handle namespace imports: extract alias for later call-site resolution
    if (importStmt.namespaceName) {
      namespaceImportAliases.push(importStmt.namespaceName)
      continue
    }

    for (const spec of importStmt.specifiers) {
      if (spec.importedName === 'humanizeEntityRef' || spec.importedName === 'humanizeEntity') {
        deprecatedNames.add(spec.importedName)
        deprecatedImports.push({
          importedName: spec.importedName,
          alias: spec.localName,
        })
      }
    }
  }

  // Handle namespace import call sites: find CatalogReact.humanizeEntityRef(...) patterns
  let hasNamespaceMigrations = false
  for (const alias of namespaceImportAliases) {
    const deprecatedCalls = rootNode.findAll({
      rule: {
        kind: 'call_expression',
        has: {
          field: 'function',
          kind: 'member_expression',
          has: {
            field: 'object',
            kind: 'identifier',
            regex: escapeRegex(alias),
          },
        },
      },
    })

    for (const call of deprecatedCalls) {
      // Get the property name from the member_expression
      const memberExpr = call.find({
        rule: {
          kind: 'member_expression',
          has: {
            field: 'object',
            kind: 'identifier',
            regex: escapeRegex(alias),
          },
        },
      })
      if (!memberExpr) {
        continue
      }

      const propertyNode = memberExpr.find({
        rule: { kind: 'property_identifier' },
      })
      if (!propertyNode) {
        continue
      }

      const propertyName = propertyNode.text()
      if (!DEPRECATED_FUNCTIONS.has(propertyName)) {
        continue
      }

      const result = replaceDeprecatedCall(call, propertyName, edits, neededImports, 'namespace-call-replaced')
      if (result !== null) {
        hasNamespaceMigrations = true
      }
    }
  }

  // Handle re-exports
  const reExports = rootNode.findAll({
    rule: {
      kind: 'export_statement',
      has: {
        kind: 'string',
        has: {
          kind: 'string_fragment',
          regex: escapeRegex(SOURCE_PKG),
        },
      },
    },
  })

  for (const reExport of reExports) {
    const exportSpecs = reExport.findAll({
      rule: { kind: 'export_specifier' },
    })

    const deprecatedSpecs: SgNode<TSX>[] = []
    const keptSpecs: SgNode<TSX>[] = []

    for (const spec of exportSpecs) {
      const identifiers = spec.findAll({
        rule: {
          any: [{ kind: 'identifier' }, { kind: 'type_identifier' }],
        },
      })
      const exportedName = identifiers[0]?.text()
      if (exportedName === 'humanizeEntityRef' || exportedName === 'humanizeEntity') {
        deprecatedSpecs.push(spec)
        migrationMetric.increment({
          outcome: 'auto-migrated',
          function: exportedName,
          reason: 're-export-replaced',
        })
      } else {
        keptSpecs.push(spec)
      }
    }

    if (deprecatedSpecs.length > 0) {
      const newExports = ['EntityDisplayName', 'useEntityPresentation', 'entityPresentationSnapshot']

      const deprecatedNames = deprecatedSpecs
        .map((spec) => {
          const ids = spec.findAll({
            rule: {
              any: [{ kind: 'identifier' }, { kind: 'type_identifier' }],
            },
          })
          return ids[0]?.text() ?? ''
        })
        .filter(Boolean)

      const keptTexts = keptSpecs.map((s) => s.text())
      const allSpecs = [...keptTexts, ...newExports]

      const todoComment = `// TODO(backstage-codemod): ${deprecatedNames.join(', ')} were re-exported here. Consumers should pick the appropriate replacement:\n//   - EntityDisplayName: for JSX rendering\n//   - useEntityPresentation: for React component hooks\n//   - entityPresentationSnapshot: for non-React utilities\n`
      const exportStatement = buildNamedStatement('export', allSpecs, SOURCE_PKG, false)
      edits.push(reExport.replace(`${todoComment}${exportStatement}`))
    }
  }

  // If no deprecated imports, namespace migrations, or re-exports, bail
  if (deprecatedImports.length === 0 && !hasNamespaceMigrations && edits.length === 0) {
    return null
  }

  // Find and replace all call expressions for each named deprecated import
  for (const { alias, importedName } of deprecatedImports) {
    const calls = rootNode.findAll({
      rule: {
        kind: 'call_expression',
        has: {
          field: 'function',
          kind: 'identifier',
          regex: escapeRegex(alias),
        },
      },
    })

    for (const call of calls) {
      replaceDeprecatedCall(call, importedName, edits, neededImports, 'call-replaced')
    }
  }

  // Phase 1 result: call sites rewritten; import statements untouched so the
  // next phase can merge replacement specifiers into the surviving clauses
  // in place (preserving each statement's original position in the file).
  const phase1Source = edits.length > 0 ? rootNode.commitEdits(edits) : rootNode.text()

  let out = phase1Source

  // Phase 2: add the needed replacement imports. addImport merges into the
  // existing source-package clause in place, or appends a new statement after
  // the last import.
  if (neededImports.size > 0) {
    const specifiers = [...neededImports].map((name) => ({ name }))
    /**
     * `addImport` against a freshly parsed program that contains no imports
     * AND has leading whitespace tickles a quickjs-level crash inside
     * `@jssg/utils`. When the file has no import or require statements, skip
     * the util-based add step and prepend the new statement verbatim.
     */
    const phase2HasImports = /^\s*(?:import\s|const\s+[^=]+=\s*require\b)/m.test(phase1Source)

    if (phase2HasImports) {
      const phase2Root = parseTsx(phase1Source).root()
      const addEdit = addImport(phase2Root, {
        type: 'named',
        specifiers,
        from: SOURCE_PKG,
      })
      out = addEdit ? phase2Root.commitEdits([addEdit]) : phase1Source
    } else {
      out = `${buildNamedStatement('import', [...neededImports], SOURCE_PKG, false)}\n${phase1Source.replace(/^\s+/, '')}`
    }
  }

  // Phase 3: drop the deprecated specifiers (removeImport removes ONE
  // specifier per call, so loop) on a fresh parse of the post-add source.
  // When a statement keeps only deprecated specifiers and none were needed,
  // this removes the whole statement including its trailing newline.
  if (deprecatedNames.size > 0) {
    const phase3Root = parseTsx(out).root()
    const removeEdits: Edit[] = []
    for (const name of deprecatedNames) {
      const edit = removeImport(phase3Root, {
        type: 'named',
        specifiers: [name],
        from: SOURCE_PKG,
      })
      if (edit) {
        removeEdits.push(...edit)
      }
    }
    if (removeEdits.length > 0) {
      out = phase3Root.commitEdits(removeEdits)
    }
  }

  const result = await Promise.resolve(out)
  return result
}

export default transform
