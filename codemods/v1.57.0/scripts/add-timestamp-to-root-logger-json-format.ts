import { importBindingOf } from '@jssg/utils/javascript/bindings'
import { getLineIndent } from '@jssg/utils/javascript/style'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const metric = useMetricAtom('add-timestamp-to-root-logger-json-format')

function imported(node: SgNode<TSX> | null, source: string, name: string): boolean {
  if (!node?.is('identifier')) {
    return false
  }
  const binding = importBindingOf(node)
  return binding?.source === source && binding.importedName === name
}

function isFormatCall(node: SgNode<TSX>, method: string): boolean {
  if (!node.is('call_expression')) {
    return false
  }
  const fn = node.field('function')
  if (!fn.is('member_expression')) {
    return false
  }
  const member = fn as SgNode<TSX, 'member_expression'>
  return member.field('property').text() === method && imported(member.field('object'), 'winston', 'format')
}

const transform: Codemod<TSX> = async (root) => {
  const program = root.root()
  const source = program.text()
  if (!source.includes('WinstonLogger') || !source.includes('json')) {
    return null
  }
  const edits: Edit[] = []
  const combines = new Set<number>()

  for (const call of program.findAll({ rule: { kind: 'call_expression' } })) {
    const fn = call.field('function')
    if (
      !fn?.is('member_expression') ||
      fn.field('property').text() !== 'create' ||
      !imported(fn.field('object'), '@backstage/backend-defaults/rootLogger', 'WinstonLogger')
    ) {
      continue
    }
    const args = call.field('arguments')
    const object = args?.children().find((child) => child.isNamed() && !child.is('comment'))
    if (!object?.is('object')) {
      continue
    }
    for (const pair of object.children().filter((child) => child.is('pair'))) {
      const key = pair.field('key')
      if (
        !(key.is('property_identifier') && key.text() === 'format') &&
        !(
          key.is('string') &&
          key
            .children()
            .find((node) => node.is('string_fragment'))
            ?.text() === 'format'
        )
      ) {
        continue
      }
      const expr = pair.field('value')
      const calls = expr.findAll({ rule: { kind: 'call_expression' } })
      for (const json of calls.filter((node) => isFormatCall(node, 'json'))) {
        const enclosing = json
          .ancestors()
          .filter(
            (node) =>
              node.range().start.index >= expr.range().start.index &&
              node.range().end.index <= expr.range().end.index &&
              isFormatCall(node, 'combine'),
          )
        const timestampBeforeJson = enclosing.some((pipeline) => {
          const args = pipeline.field('arguments')?.children() ?? []
          const containing = args.find(
            (arg) =>
              arg.range().start.index <= json.range().start.index && arg.range().end.index >= json.range().end.index,
          )
          return (
            containing &&
            args.some(
              (arg) => arg.range().start.index < containing.range().start.index && isFormatCall(arg, 'timestamp'),
            )
          )
        })
        if (timestampBeforeJson) {
          continue
        }
        const [combine] = enclosing.reverse()
        const jsonCall = json as SgNode<TSX, 'call_expression'>
        const jsonMember = jsonCall.field('function') as SgNode<TSX, 'member_expression'>
        const format = jsonMember.field('object').text()
        if (combine) {
          if (combines.has(combine.id())) {
            continue
          }
          const combineArgs = combine.field('arguments')
          if (!combineArgs) {
            continue
          }
          const first = combineArgs.children().find((child) => child.isNamed())
          const multiline = first && first.range().start.line > combineArgs.range().start.line
          const start = multiline ? first.range().start.index : combineArgs.range().start.index + 1
          const insertedText = multiline
            ? `${format}.timestamp(),\n${getLineIndent(source, first)}`
            : `${format}.timestamp(), `
          edits.push({ startPos: start, endPos: start, insertedText })
          combines.add(combine.id())
        } else {
          edits.push(json.replace(`${format}.combine(${format}.timestamp(), ${json.text()})`))
        }
        metric.increment({ action: 'timestamp-added' })
      }
    }
  }
  return edits.length ? Promise.resolve(program.commitEdits(edits)) : null
}

export default transform
