import { addImport, getImport, removeImport } from '@jssg/utils/javascript/imports'
import { parse } from 'codemod:ast-grep'
import type { Edit, SgNode, SgRoot, Codemod } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const TSX_LANG = 'tsx'

function parseTsx(source: string): SgRoot<TSX> {
  return parse<TSX>(TSX_LANG, source)
}

const PERMISSION_REACT = '@backstage/plugin-permission-react'
const REACT_ROUTER_DOM = 'react-router-dom'

const routesMigrated = useMetricAtom('permissioned-routes-migrated')

function collapseExtraBlankLines(source: string): string {
  return source.replaceAll(/\n{3,}/g, '\n\n')
}

/**
 * Clean up specifier whitespace after `removeImport` + `addImport` merges, handling
 * both the single-line case (`{ a,b }`) and the multi-line merge that `addImport`
 * produces when it inserts before the closing brace of an existing multi-line block
 * (`...Last,\n, NewSpec}` -> `...Last,\n  NewSpec,\n}`).
 */
function tidyImportStatements(source: string): string {
  let out = source.replaceAll(/;(?=import\s)/g, ';\n')

  out = out.replaceAll(
    /(\n)([ \t]+)([^\n{}]*?,)(\n),\s*([^\n{}]+?)\s*\}/g,
    (_m, nl1: string, indent: string, prevLine: string, nl2: string, spec: string) =>
      `${nl1}${indent}${prevLine}${nl2}${indent}${spec.trim()},${nl2}}`,
  )

  const lines = out.split('\n')
  const next: string[] = []
  for (const line of lines) {
    const trimmed = line.trimStart()
    if (
      trimmed.startsWith('import ') &&
      !trimmed.startsWith('import type ') &&
      trimmed.includes(' from ') &&
      /\{[^}]*\}/.test(trimmed)
    ) {
      const formatted = line.replace(/import\s*\{([^}]*)\}\s*from/, (_m, inner: string) => {
        const parts = inner
          .split(',')
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0)
        return `import { ${parts.join(', ')} } from`
      })
      next.push(formatted)
    } else {
      next.push(line)
    }
  }
  return next.join('\n')
}

function finalizeSource(source: string): string {
  return collapseExtraBlankLines(tidyImportStatements(source))
}

function getJsxComponentNameNode(el: SgNode<TSX>): SgNode<TSX> | null {
  if (el.is('jsx_self_closing_element')) {
    const n = el.child(1)
    return n ?? null
  }
  if (el.is('jsx_element')) {
    const open = el.child(0)
    if (!open?.is('jsx_opening_element')) {
      return null
    }
    const n = open.child(1)
    return n ?? null
  }
  return null
}

function getJsxComponentName(el: SgNode<TSX>): string | null {
  const n = getJsxComponentNameNode(el)
  return n?.is('identifier') ? n.text() : null
}

function getOpeningForAttrs(el: SgNode<TSX>): SgNode<TSX> | null {
  if (el.is('jsx_self_closing_element')) {
    return el
  }
  if (el.is('jsx_element')) {
    const o = el.child(0)
    return o?.is('jsx_opening_element') ? o : null
  }
  return null
}

function parseJsxAttributes(opening: SgNode<TSX>): Map<string, SgNode<TSX>> {
  const map = new Map<string, SgNode<TSX>>()
  for (const child of opening.children()) {
    if (!child.is('jsx_attribute')) {
      continue
    }
    const nameNode = child.find({ rule: { kind: 'property_identifier' } })
    if (!nameNode) {
      continue
    }
    map.set(nameNode.text(), child)
  }
  return map
}

function getElementExpressionInner(elementAttr: SgNode<TSX>): SgNode<TSX> | null {
  const jsxExpr = elementAttr.find({ rule: { kind: 'jsx_expression' } })
  if (!jsxExpr) {
    return null
  }
  for (const c of jsxExpr.children()) {
    const k = c.kind()
    if (k === '{' || k === '}') {
      continue
    }
    return c
  }
  return null
}

function normalizeAttrText(attr: SgNode<TSX>): string {
  return attr.text().replaceAll(/\s+/g, ' ').trim()
}

function innerIsSkippedRequirePermission(
  elementAttr: SgNode<TSX> | undefined,
  permissionAttr: SgNode<TSX> | undefined,
  resourceRefAttr: SgNode<TSX> | undefined,
  requirePermissionAlias: string,
): boolean {
  if (!elementAttr || !permissionAttr) {
    return false
  }
  const innerRoot = getElementExpressionInner(elementAttr)
  if (!innerRoot) {
    return false
  }

  const innerOpening =
    innerRoot.is('jsx_self_closing_element') || innerRoot.is('jsx_element') ? getOpeningForAttrs(innerRoot) : null
  if (!innerOpening) {
    return false
  }

  const innerName = getJsxComponentName(innerRoot)
  if (innerName !== requirePermissionAlias) {
    return false
  }

  const innerAttrs = parseJsxAttributes(innerOpening)
  const innerPerm = innerAttrs.get('permission')
  const innerRef = innerAttrs.get('resourceRef')
  if (!innerPerm) {
    return false
  }

  if (normalizeAttrText(innerPerm) !== normalizeAttrText(permissionAttr)) {
    return false
  }

  const outerHasRef = Boolean(resourceRefAttr)
  const innerHasRef = Boolean(innerRef)
  if (outerHasRef !== innerHasRef) {
    return false
  }
  if (outerHasRef && innerRef && resourceRefAttr) {
    if (normalizeAttrText(innerRef) !== normalizeAttrText(resourceRefAttr)) {
      return false
    }
  }

  return true
}

function buildRequirePermissionChildrenInner(elementAttr: SgNode<TSX>): string | null {
  const inner = getElementExpressionInner(elementAttr)
  return inner?.text() ?? null
}

function collectRouteBodySlice(jsxEl: SgNode<TSX>, fullSource: string): string {
  const children = jsxEl.children()
  if (children.length < 3) {
    return ''
  }
  const [opening] = children
  const closing = children.at(-1)
  if (!opening?.is('jsx_opening_element') || !closing?.is('jsx_closing_element')) {
    return ''
  }
  return fullSource.slice(opening.range().end.index, closing.range().start.index)
}

function buildReplacement(
  attrs: Map<string, SgNode<TSX>>,
  mode: 'self-closing' | 'with-children',
  bodySlice: string,
  routeName: string,
  requirePermissionName: string,
  skipInnerRequirePermission: boolean,
): string | null {
  const pathAttr = attrs.get('path')
  const caseSensitiveAttr = attrs.get('caseSensitive')
  const permissionAttr = attrs.get('permission')
  const resourceRefAttr = attrs.get('resourceRef')
  const errorComponentAttr = attrs.get('errorComponent')
  const elementAttr = attrs.get('element')

  if (!pathAttr) {
    return null
  }
  if (!permissionAttr && !resourceRefAttr) {
    return null
  }
  if (!elementAttr) {
    return null
  }

  const innerPage = buildRequirePermissionChildrenInner(elementAttr)
  if (!innerPage) {
    return null
  }

  let reqInner: string
  if (skipInnerRequirePermission) {
    reqInner = innerPage
  } else {
    const reqProps: string[] = []
    if (permissionAttr) {
      reqProps.push(permissionAttr.text())
    }
    if (resourceRefAttr) {
      reqProps.push(resourceRefAttr.text())
    }
    if (errorComponentAttr) {
      const ec = errorComponentAttr.find({ rule: { kind: 'jsx_expression' } })
      const ecVal = ec?.text() ?? 'null'
      reqProps.push(`errorPage=${ecVal}`)
    }
    const propsJoined = reqProps.length > 0 ? ` ${reqProps.join(' ')}` : ''
    reqInner = `<${requirePermissionName}${propsJoined}>${innerPage}</${requirePermissionName}>`
  }

  const pathPart = pathAttr.text()
  const casePart = caseSensitiveAttr ? ` ${caseSensitiveAttr.text()}` : ''

  if (mode === 'self-closing') {
    return `<${routeName} ${pathPart}${casePart} element={${reqInner}} />`
  }

  const trimmedBody = bodySlice.trim()
  const innerBlock = trimmedBody.length > 0 ? bodySlice : '\n'
  return `<${routeName} ${pathPart}${casePart} element={${reqInner}}>${innerBlock}</${routeName}>`
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const fullSource = rootNode.text()

  const permImport = getImport(rootNode, {
    type: 'named',
    name: 'PermissionedRoute',
    from: PERMISSION_REACT,
  })
  if (!permImport) {
    return null
  }

  const localPermissionedRoute = permImport.alias

  const requirePermissionExisting = getImport(rootNode, {
    type: 'named',
    name: 'RequirePermission',
    from: PERMISSION_REACT,
  })
  const requirePermissionAlias = requirePermissionExisting?.alias ?? 'RequirePermission'

  const candidates: SgNode<TSX>[] = []
  for (const kind of ['jsx_self_closing_element', 'jsx_element'] as const) {
    for (const n of rootNode.findAll({ rule: { kind } })) {
      const name = getJsxComponentName(n)
      if (name === localPermissionedRoute) {
        candidates.push(n)
      }
    }
  }
  if (candidates.length === 0) {
    return null
  }

  const routeImp = getImport(rootNode, {
    type: 'named',
    name: 'Route',
    from: REACT_ROUTER_DOM,
  })
  const routeName = routeImp?.alias ?? 'Route'

  const edits: Edit[] = []

  for (const node of candidates) {
    const opening = getOpeningForAttrs(node)
    if (!opening) {
      continue
    }

    const attrs = parseJsxAttributes(opening)
    const skipInner = innerIsSkippedRequirePermission(
      attrs.get('element'),
      attrs.get('permission'),
      attrs.get('resourceRef'),
      requirePermissionAlias,
    )

    const bodySlice = node.is('jsx_element') ? collectRouteBodySlice(node, fullSource) : ''
    const mode = node.is('jsx_self_closing_element') ? 'self-closing' : 'with-children'

    const replacement = buildReplacement(attrs, mode, bodySlice, routeName, requirePermissionAlias, skipInner)
    if (!replacement) {
      continue
    }

    routesMigrated.increment({ pattern: mode })
    edits.push(node.replace(replacement))
  }

  if (edits.length === 0) {
    return null
  }

  /**
   * Phase 1: apply JSX rewrites and drop `PermissionedRoute` from its import
   * together. Committing removal first guarantees that Phase 2's addImport
   * calls compute insertion points from the post-removal source - otherwise
   * a merge target that was just deleted would be silently clobbered.
   */
  const removePermissionedRouteEdit = removeImport(rootNode, {
    type: 'named',
    specifiers: ['PermissionedRoute'],
    from: PERMISSION_REACT,
  })
  if (removePermissionedRouteEdit) {
    edits.push(removePermissionedRouteEdit)
  }

  const phase1Source = rootNode.commitEdits(edits)

  /**
   * `addImport` against a freshly parsed program that contains no imports AND
   * has leading whitespace tickles a quickjs-level crash inside `@jssg/utils`.
   * When Phase 1 removed the only import from the file, skip the util-based
   * add step and prepend the two new statements verbatim - the output order
   * and blank-line separator are deterministic this way too.
   */
  const phase2HasImports = /^\s*(?:import\s|const\s+[^=]+=\s*require\b)/m.test(phase1Source)

  let out: string
  if (phase2HasImports) {
    const phase2Root = parseTsx(phase1Source).root()
    const addEdits: Edit[] = []

    const addRequirePermissionEdit = addImport(phase2Root, {
      type: 'named',
      specifiers: [{ name: 'RequirePermission' }],
      from: PERMISSION_REACT,
      moduleType: permImport.moduleType,
    })
    if (addRequirePermissionEdit) {
      addEdits.push(addRequirePermissionEdit)
    }

    const addRouteEdit = addImport(phase2Root, {
      type: 'named',
      specifiers: [{ name: 'Route' }],
      from: REACT_ROUTER_DOM,
      moduleType: routeImp?.moduleType ?? 'esm',
    })
    if (addRouteEdit) {
      addEdits.push(addRouteEdit)
    }

    out = addEdits.length > 0 ? phase2Root.commitEdits(addEdits) : phase1Source
  } else {
    const header = [
      `import { RequirePermission } from '${PERMISSION_REACT}';`,
      `import { Route } from '${REACT_ROUTER_DOM}';`,
    ].join('\n')
    out = `${header}\n\n${phase1Source.replace(/^\s+/, '')}`
  }

  const result = await Promise.resolve(finalizeSource(out))
  return result
}

export default transform
