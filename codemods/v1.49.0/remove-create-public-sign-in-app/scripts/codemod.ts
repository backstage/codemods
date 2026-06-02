import { getImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const FRONTEND_DEFAULTS = '@backstage/frontend-defaults'
const PLUGIN_APP_ALPHA = '@backstage/plugin-app/alpha'
const OLD_NAME = 'createPublicSignInApp'
const NEW_NAME = 'createApp'
const MODULE_NAME = 'appModulePublicSignIn'

const TODO_DEPENDENCY = '// TODO(backstage-codemod): Add @backstage/plugin-app as a dependency to your package.json'

const migrationMetric = useMetricAtom('create-public-sign-in-app-replacements')

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()

  const imp = getImport(rootNode, {
    type: 'named',
    name: OLD_NAME,
    from: FRONTEND_DEFAULTS,
  })
  if (!imp || imp.isNamespace || imp.moduleType !== 'esm') {
    return null
  }

  const edits: Edit[] = []

  // 1. Rename import specifier: createPublicSignInApp -> createApp
  const specifier = imp.node.parent()
  if (!specifier || !specifier.is('import_specifier')) {
    return null
  }

  const identifiers = specifier.children().filter((c) => c.is('identifier'))
  const importedNameNode = identifiers[0] as SgNode<TSX> | undefined
  if (!importedNameNode) {
    return null
  }

  // Check if createApp is already imported
  const existingCreateApp = getImport(rootNode, {
    type: 'named',
    name: NEW_NAME,
    from: FRONTEND_DEFAULTS,
  })

  if (existingCreateApp) {
    // createApp is already imported — remove the createPublicSignInApp specifier
    // Rebuild the parent named_imports node without the removed specifier
    const namedImports = specifier.parent()
    if (namedImports) {
      const allSpecs = namedImports.findAll({ rule: { kind: 'import_specifier' } })
      const remaining = allSpecs.filter((s) => s.id() !== specifier.id())

      if (remaining.length === 0) {
        const importStmt = specifier.ancestors().find((a) => a.is('import_statement'))
        if (importStmt) {
          edits.push(importStmt.replace(''))
        }
      } else {
        edits.push(namedImports.replace(`{ ${remaining.map((s) => s.text()).join(', ')} }`))
      }
    }
  } else {
    edits.push(importedNameNode.replace(NEW_NAME))
  }

  // 2. Add import for appModulePublicSignIn from @backstage/plugin-app/alpha
  const existingModuleImport = getImport(rootNode, {
    type: 'named',
    name: MODULE_NAME,
    from: PLUGIN_APP_ALPHA,
  })

  if (!existingModuleImport) {
    // Find the import statement containing our createPublicSignInApp import
    // and add the new import after it
    const importStmt = specifier.ancestors().find((a) => a.is('import_statement'))
    if (importStmt) {
      const importEnd = importStmt.range().end.index
      const newImport = `\nimport { ${MODULE_NAME} } from '${PLUGIN_APP_ALPHA}';`
      // Also add the TODO comment about adding the dependency
      const todoLine = `\n${TODO_DEPENDENCY}`
      edits.push({
        startPos: importEnd,
        endPos: importEnd,
        insertedText: newImport + todoLine,
      })
    }
  }

  // 3. Rename all call sites: createPublicSignInApp(...) -> createApp(...)
  //    and add modules: [appModulePublicSignIn] to the options
  const localNameNode = (identifiers[1] as SgNode<TSX> | undefined) ?? importedNameNode

  // Rename function references
  if (imp.alias !== OLD_NAME) {
    // Aliased import: only rename the imported name, not the local references
  } else {
    for (const refGroup of localNameNode.references()) {
      if (refGroup.root.filename() !== root.filename()) {
        continue
      }
      for (const refNode of refGroup.nodes) {
        if (refNode.id() === localNameNode.id()) {
          continue
        }

        // Check if this is a call expression
        const parent = refNode.parent()
        if (parent?.kind() === 'call_expression') {
          // This is a call site — rename the function and modify the arguments
          edits.push(refNode.replace(NEW_NAME))

          // Find the arguments object and add modules
          const argsNode = parent.field('arguments')
          if (argsNode) {
            // Find the object literal in the arguments
            const objLiteral = argsNode.children().find((c) => c.kind() === 'object')
            if (objLiteral) {
              // Check if there's already a modules property
              let hasModules = false
              let modulesValueNode: SgNode<TSX> | null = null

              for (const child of objLiteral.children()) {
                if (child.kind() === 'pair') {
                  const key = child.children().find((c) => c.kind() === 'property_identifier')
                  if (key?.text() === 'modules') {
                    hasModules = true
                    // Find the array in the value
                    modulesValueNode = child.children().find((c) => c.kind() === 'array') ?? null
                    break
                  }
                }
              }

              if (hasModules && modulesValueNode) {
                // Append to existing modules array
                const lastBracket = modulesValueNode.range().end.index - 1
                const arrayContent = modulesValueNode.text()
                const hasItems = arrayContent.trim() !== '[]'
                const separator = hasItems ? ', ' : ''
                edits.push({
                  startPos: lastBracket,
                  endPos: lastBracket,
                  insertedText: `${separator}${MODULE_NAME}`,
                })
              } else if (!hasModules) {
                // Add modules property after the last existing property
                const propertyKinds = new Set([
                  'pair',
                  'shorthand_property_identifier',
                  'spread_element',
                  'method_definition',
                ])
                const allProps = objLiteral.children().filter((c) => propertyKinds.has(c.kind()))
                const lastProp = allProps.at(-1)

                if (lastProp) {
                  const afterProp = lastProp.next()
                  const hasTrailingComma = afterProp?.text() === ','
                  const insertAfter = hasTrailingComma ? afterProp : lastProp
                  const prefix = hasTrailingComma ? ' ' : ', '
                  edits.push({
                    startPos: insertAfter.range().end.index,
                    endPos: insertAfter.range().end.index,
                    insertedText: `${prefix}modules: [${MODULE_NAME}]`,
                  })
                } else {
                  edits.push(objLiteral.replace(`{ modules: [${MODULE_NAME}] }`))
                }
              }
            } else {
              // No arguments — replace empty call with options containing modules
              edits.push(argsNode.replace(`({ modules: [${MODULE_NAME}] })`))
            }
          }
        } else {
          // Not a call site — just rename
          edits.push(refNode.replace(NEW_NAME))
        }
      }
    }
  }

  migrationMetric.increment({ action: 'replaced' })

  if (edits.length === 0) {
    return null
  }
  const result = await Promise.resolve(rootNode.commitEdits(edits))
  return result
}

export default transform
