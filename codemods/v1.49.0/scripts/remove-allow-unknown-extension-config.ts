import { getImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const FRONTEND_DEFAULTS = '@backstage/frontend-defaults'
const PROPERTY_NAME = 'allowUnknownExtensionConfig'

const removedProps = useMetricAtom('allow-unknown-extension-config-removals')

/**
 * Remove a property from an object literal by surgically removing the property
 * range, its trailing comma and surrounding whitespace from the source.
 * This preserves comments and original formatting.
 */
function removeProperty(propNode: SgNode<TSX>, fullSource: string): Edit {
  const parent = propNode.parent()
  if (parent?.kind() !== 'object') {
    return propNode.replace('')
  }

  // If this is the only property, just replace the parent with {}
  const propertyKinds = new Set(['pair', 'shorthand_property_identifier', 'spread_element', 'method_definition'])
  const allProperties = parent.children().filter((c) => propertyKinds.has(c.kind()))
  if (allProperties.length <= 1) {
    return parent.replace('{}')
  }

  let startPos = propNode.range().start.index
  let endPos = propNode.range().end.index

  // Check for trailing comma after the property
  let trailingPos = endPos
  while (trailingPos < fullSource.length && /[ \t]/.test(fullSource[trailingPos] ?? '')) {
    trailingPos++
  }
  const hasTrailingComma = trailingPos < fullSource.length && fullSource[trailingPos] === ','

  // Check if the object is multi-line
  const parentText = parent.text()
  const isMultiLine = parentText.includes('\n')

  if (hasTrailingComma) {
    // Property has a trailing comma.
    endPos = trailingPos + 1
    if (isMultiLine) {
      // Multi-line: remove indentation + property + comma + trailing newline
      while (endPos < fullSource.length && /[ \t]/.test(fullSource[endPos] ?? '')) {
        endPos++
      }
      if (endPos < fullSource.length && fullSource[endPos] === '\n') {
        endPos++
      }
      // Back up to start of indentation on this line (but keep the preceding newline)
      while (startPos > 0 && /[ \t]/.test(fullSource[startPos - 1] ?? '')) {
        startPos--
      }
    } else {
      // Single-line: remove property + comma + trailing space
      while (endPos < fullSource.length && fullSource[endPos] === ' ') {
        endPos++
      }
    }
  } else if (isMultiLine) {
    // No trailing comma, multi-line — last property.
    // Remove indentation + property + trailing whitespace/newline,
    // and the preceding comma.
    while (endPos < fullSource.length && /[ \t]/.test(fullSource[endPos] ?? '')) {
      endPos++
    }
    if (endPos < fullSource.length && fullSource[endPos] === '\n') {
      endPos++
    }
    while (startPos > 0 && /[ \t]/.test(fullSource[startPos - 1] ?? '')) {
      startPos--
    }
    if (startPos > 0 && fullSource[startPos - 1] === '\n') {
      startPos--
    }
    // Find and consume the preceding comma
    let commaPos = startPos
    while (commaPos > 0 && /[ \t]/.test(fullSource[commaPos - 1] ?? '')) {
      commaPos--
    }
    if (commaPos > 0 && fullSource[commaPos - 1] === ',') {
      startPos = commaPos - 1
    }
  } else {
    // No trailing comma, single-line — last property.
    // Remove from preceding comma to end of property.
    let commaPos = startPos - 1
    while (commaPos >= 0 && /[ \t]/.test(fullSource[commaPos] ?? '')) {
      commaPos--
    }
    if (commaPos >= 0 && fullSource[commaPos] === ',') {
      startPos = commaPos
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

  const edits: Edit[] = []
  const fullSource = rootNode.text()

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
        kind: 'shorthand_property_identifier',
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
