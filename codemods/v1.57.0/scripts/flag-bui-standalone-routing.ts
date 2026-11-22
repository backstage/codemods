import { importBindingOf } from '@jssg/utils/javascript/bindings'
import { getFileStyle, getLineIndent } from '@jssg/utils/javascript/style'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

import { linePrefix } from './migrate-router-blueprint-to-app-root-wrapper-helpers.ts'

const metric = useMetricAtom('flag-bui-standalone-routing')
const HREF_TODO =
  'TODO(backstage-codemod): since 1.57 javascript:/data:/vbscript: hrefs render as inert about:blank links. Use an onClick handler or a blob URL instead.'

function opening(element: SgNode<TSX>): SgNode<TSX> | null {
  return element.is('jsx_element') ? (element.children().find((n) => n.is('jsx_opening_element')) ?? null) : element
}

function insertTodo(node: SgNode<TSX>, source: string, edits: Edit[], handled: Set<number>): void {
  const jsxAnchor = [node, ...node.ancestors()].find(
    (n) => n.parent()?.is('jsx_element') && !n.is('jsx_opening_element') && !n.is('jsx_closing_element'),
  )
  const jsxChild = !!jsxAnchor
  let anchor = jsxAnchor ?? node
  if (!jsxChild && !getLineIndent(source, node)) {
    anchor =
      [node, ...node.ancestors()].find((n) =>
        ['program', 'statement_block', 'class_body', 'switch_case'].includes(n.parent()?.kind() ?? ''),
      ) ?? node
  }
  if (handled.has(anchor.id())) {
    return
  }
  handled.add(anchor.id())
  let previous = anchor.prev()
  while (previous?.is('jsx_text') && !previous.text().trim()) {
    previous = previous.prev()
  }
  if (previous?.text().includes(HREF_TODO)) {
    return
  }
  const position = anchor.range().start
  const before = anchor.prev()
  const after = anchor.next()
  const inlineText =
    jsxChild &&
    (Boolean(
      before?.is('jsx_text') && before.range().end.line === position.line && before.text().split('\n').at(-1)?.trim(),
    ) ||
      Boolean(
        after?.is('jsx_text') &&
        after.range().start.line === anchor.range().end.line &&
        after.text().split('\n')[0]?.trim(),
      ))
  if (inlineText) {
    edits.push({ startPos: position.index, endPos: position.index, insertedText: `{/* ${HREF_TODO} */}` })
    metric.increment({ action: 'href-flagged' })
    return
  }
  const prefix = linePrefix(source, anchor)
  const inline = prefix.trim().length > 0
  const trailing = inline ? (prefix.match(/[ \t]*$/)?.[0].length ?? 0) : 0
  const baseIndent = prefix.match(/^[ \t]*/)?.[0] ?? ''
  const indent =
    inline && (jsxChild || anchor.parent()?.is('statement_block'))
      ? baseIndent + getFileStyle(node.getRoot().root()).indentUnit
      : getLineIndent(source, anchor) || baseIndent
  const comment = jsxChild ? `{/* ${HREF_TODO} */}` : `// ${HREF_TODO}`
  edits.push({
    startPos: position.index - trailing,
    endPos: position.index,
    insertedText: `${inline ? `\n${indent}` : ''}${comment}\n${indent}`,
  })
  metric.increment({ action: 'href-flagged' })
}

const transform: Codemod<TSX> = (root) => {
  const filename = root.filename().replaceAll('\\', '/')
  if (/\.(test|spec|stories)\.[^/]+$/.test(filename) || /(?:^|\/)(?:__fixtures__|__mocks__)\//.test(filename)) {
    return Promise.resolve(null)
  }
  const program = root.root()
  const source = program.text()
  if (!source.includes('@backstage/ui') || !source.includes('href')) {
    return Promise.resolve(null)
  }
  const edits: Edit[] = []
  const handled = new Set<number>()
  for (const element of program.findAll({
    rule: { any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }] },
  })) {
    const tag = opening(element)
    const href = tag?.children().find((n) => n.is('jsx_attribute') && n.child(0)?.text() === 'href')
    if (!href) {
      continue
    }
    const name = tag?.child(1)
    if (!name?.is('identifier') || importBindingOf(name)?.source !== '@backstage/ui') {
      continue
    }
    const literal =
      href.children().find((n) => n.is('string')) ??
      href.find({ rule: { any: [{ kind: 'string' }, { kind: 'template_string' }] } })
    if (!literal || (literal.is('template_string') && literal.children().some((n) => n.is('template_substitution')))) {
      continue
    }
    // Only the entire expression may be a literal; a string inside a dynamic expression is not enough.
    const expression = href.children().find((n) => n.is('jsx_expression'))
    if (
      expression &&
      expression
        .children()
        .find((n) => n.isNamed())
        ?.id() !== literal.id()
    ) {
      continue
    }
    if (/^\s*(?:javascript|data|vbscript):/i.test(literal.text().slice(1, -1))) {
      insertTodo(element, source, edits, handled)
    }
  }
  return Promise.resolve(edits.length ? program.commitEdits(edits) : null)
}

export default transform
