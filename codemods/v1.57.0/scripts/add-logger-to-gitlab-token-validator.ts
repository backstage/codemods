import { importBindingOf } from '@jssg/utils/javascript/bindings'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

import { hasTodo, startsOwnLine, statementAnchor, todoEdit } from './add-logger-to-gitlab-token-validator-todo.ts'

const metric = useMetricAtom('add-logger-to-gitlab-token-validator')
const todo =
  '// TODO(backstage-codemod): createGitlabTokenValidator now requires a LoggerService as its second argument.'

// Only inspect binding patterns, never names used in initializers or nested scopes.
function bindsLogger(node: SgNode<TSX> | null): boolean {
  if (!node) {
    return false
  }
  if (node.is('identifier') || node.is('shorthand_property_identifier_pattern')) {
    return node.text() === 'logger'
  }
  if (node.is('pair_pattern')) {
    return bindsLogger(node.field('value'))
  }
  if (node.is('assignment_pattern') || node.is('object_assignment_pattern')) {
    return bindsLogger(node.field('left'))
  }
  if (
    [
      'object_pattern',
      'array_pattern',
      'formal_parameters',
      'required_parameter',
      'optional_parameter',
      'rest_pattern',
    ].includes(node.kind())
  ) {
    return node
      .children()
      .filter((child) => child.isNamed() && !child.is('type_annotation'))
      .some(bindsLogger)
  }
  return false
}

function hasLogger(call: SgNode<TSX>): boolean {
  for (const scope of call.ancestors()) {
    if (['function_declaration', 'function_expression', 'arrow_function', 'method_definition'].includes(scope.kind())) {
      if (bindsLogger(scope.field('parameters')) || bindsLogger(scope.field('parameter'))) {
        return true
      }
    }
    if (!scope.is('statement_block') && !scope.is('program')) {
      continue
    }
    for (const statement of scope.children()) {
      if (!statement.is('lexical_declaration') && !statement.is('variable_declaration')) {
        continue
      }
      const declaration = statement
        .children()
        .find((decl) => decl.is('variable_declarator') && bindsLogger(decl.field('name')))
      if (declaration) {
        // A later or self-referential declaration shadows outer loggers but is not usable here.
        return declaration.range().end.index < call.range().start.index
      }
    }
  }
  return false
}

function isSafeHolder(node: SgNode<TSX>): boolean {
  if (node.is('identifier') || node.is('this')) {
    return true
  }
  if (!node.is('member_expression')) {
    return false
  }
  return isSafeHolder(node.field('object'))
}

const transform: Codemod<TSX> = async (root) => {
  const program = root.root()
  const source = program.text()
  if (!source.includes('createGitlabTokenValidator')) {
    return null
  }
  const lines = source.split('\n')
  const edits: Edit[] = []
  const flagged = new Set<number>()
  for (const call of program.findAll({ rule: { kind: 'call_expression' } })) {
    const fn = call.field('function')
    if (!fn?.is('identifier')) {
      continue
    }
    const binding = importBindingOf(fn)
    if (
      binding?.source !== '@backstage/plugin-events-backend-module-gitlab' ||
      binding.importedName !== 'createGitlabTokenValidator'
    ) {
      continue
    }
    const args = call.field('arguments')
    const values = args?.children().filter((child) => child.isNamed() && !child.is('comment')) ?? []
    const [arg] = values
    if (!args || values.length !== 1 || !arg || arg.is('spread_element')) {
      continue
    }
    let logger: string | null = null
    if (arg.is('member_expression') && arg.field('property').text() === 'config' && isSafeHolder(arg.field('object'))) {
      logger = `${arg.text().slice(0, -'config'.length)}logger`
    } else if (hasLogger(call)) {
      logger = 'logger'
    }
    if (logger) {
      edits.push({ startPos: arg.range().end.index, endPos: arg.range().end.index, insertedText: `, ${logger}` })
      metric.increment({ action: 'logger-added' })
      continue
    }
    const parent = call.parent()
    const anchor =
      parent?.is('pair') && parent.field('value').id() === call.id() && startsOwnLine(parent, lines)
        ? parent
        : statementAnchor(call)
    const { line } = anchor.range().start
    if (flagged.has(line) || hasTodo(lines, line, todo)) {
      continue
    }
    edits.push(todoEdit(lines, anchor, [todo]))
    flagged.add(line)
    metric.increment({ action: 'logger-todo' })
  }
  return edits.length ? Promise.resolve(program.commitEdits(edits)) : null
}

export default transform
