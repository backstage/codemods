import { getImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const FRONTEND_DEFAULTS = '@backstage/frontend-defaults'
const PROPERTY_NAME = 'allowUnknownExtensionConfig'

const removedProps = useMetricAtom('allow-unknown-extension-config-removals')

/**
 * Remove a property from an object literal, including its surrounding comma
 * and whitespace so the result stays clean.
 */
function removeProperty(propNode: SgNode<TSX>, fullSource: string): Edit {
  let startPos = propNode.range().start.index
  let endPos = propNode.range().end.index

  // Check for trailing comma first
  let trailingCommaPos = endPos
  while (trailingCommaPos < fullSource.length && /[ \t]/.test(fullSource[trailingCommaPos] ?? '')) {
    trailingCommaPos++
  }
  const hasTrailingComma = trailingCommaPos < fullSource.length && fullSource[trailingCommaPos] === ','

  if (hasTrailingComma) {
    // Remove property + trailing comma + whitespace after comma
    endPos = trailingCommaPos + 1
    while (endPos < fullSource.length && /[ \t]/.test(fullSource[endPos] ?? '')) {
      endPos++
    }
    if (endPos < fullSource.length && fullSource[endPos] === '\n') {
      endPos++
    }
    // Also consume leading whitespace on the line
    let lineStart = startPos
    while (lineStart > 0 && /[ \t]/.test(fullSource[lineStart - 1] ?? '')) {
      lineStart--
    }
    if (lineStart > 0 && fullSource[lineStart - 1] === '\n') {
      startPos = lineStart - 1
    }
  } else {
    // No trailing comma — remove leading comma + whitespace instead
    let leadingPos = startPos - 1
    while (leadingPos >= 0 && /[ \t]/.test(fullSource[leadingPos] ?? '')) {
      leadingPos--
    }
    if (leadingPos >= 0 && fullSource[leadingPos] === ',') {
      startPos = leadingPos
    }
    // Also consume leading whitespace on the line for multi-line
    let lineStart = startPos
    while (lineStart > 0 && /[ \t]/.test(fullSource[lineStart - 1] ?? '')) {
      lineStart--
    }
    if (lineStart > 0 && fullSource[lineStart - 1] === '\n') {
      startPos = lineStart - 1
    }
  }

  return {
    startPos,
    endPos,
    insertedText: '',
  }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()

  // Only process files that import createApp from @backstage/frontend-defaults
  const imp = getImport(rootNode, {
    type: 'named',
    name: 'createApp',
    from: FRONTEND_DEFAULTS,
  })
  if (!imp) {
    return null
  }

  const fullSource = rootNode.text()
  const edits: Edit[] = []

  // Find all object properties named allowUnknownExtensionConfig inside
  // createApp() call arguments
  const createAppCalls = rootNode.findAll({
    rule: {
      kind: 'call_expression',
      has: {
        field: 'function',
        kind: 'identifier',
        regex: '^createApp$',
      },
    },
  })

  for (const call of createAppCalls) {
    const args = call.field('arguments')
    if (!args) {
      continue
    }

    // Find property assignments named allowUnknownExtensionConfig inside the arguments
    const props = args.findAll({
      rule: {
        kind: 'pair',
        has: {
          field: 'key',
          kind: 'property_identifier',
          regex: `^${PROPERTY_NAME}$`,
        },
      },
    })

    // Also find shorthand properties
    const shorthandProps = args.findAll({
      rule: {
        kind: 'shorthand_property_identifier_pattern',
        regex: `^${PROPERTY_NAME}$`,
      },
    })

    for (const prop of props) {
      edits.push(removeProperty(prop, fullSource))
      removedProps.increment({ property: PROPERTY_NAME })
    }

    for (const prop of shorthandProps) {
      edits.push(removeProperty(prop, fullSource))
      removedProps.increment({ property: PROPERTY_NAME })
    }
  }

  if (edits.length === 0) {
    return null
  }
  const result = await Promise.resolve(rootNode.commitEdits(edits))
  return result
}

export default transform
