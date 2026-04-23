import { getImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('add-entity-ref-to-location')

const CATALOG_CLIENT = '@backstage/catalog-client'

const ENTITY_REF_PROPERTY =
  "entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef"

const ENTITY_REF_PROPERTY_INLINE =
  "entityRef: 'location:default/example' /* TODO(backstage-codemod): replace with actual entityRef */"

type Detection =
  | 'type-annotation'
  | 'array-type-annotation'
  | 'as-cast'
  | 'satisfies'
  | 'array-as-cast'
  | 'array-satisfies'
  | 'return-type-annotation'
  | 'add-location-response'
  | 'get-locations-response'
  | 'inferred-return-variable'
  | 'mock-location-type'
  | 'test-assertion'

type Outcome = 'added' | 'skipped-spread' | 'skipped-existing'

function recordMigration(outcome: Outcome, detection: Detection): void {
  migrationMetric.increment({ outcome, detection })
}

/**
 * Check whether an object literal already contains an `entityRef` property.
 */
function hasEntityRef(objectNode: SgNode<TSX>): boolean {
  return (
    objectNode.findAll({
      rule: {
        kind: 'pair',
        has: {
          kind: 'property_identifier',
          regex: '^entityRef$',
        },
      },
    }).length > 0
  )
}

/**
 * Check whether an object literal uses a spread element (e.g. `{ ...existing }`).
 */
function hasSpread(objectNode: SgNode<TSX>): boolean {
  return (
    objectNode.findAll({
      rule: { kind: 'spread_element' },
    }).length > 0
  )
}

/**
 * Given an `object` node, compute an edit that inserts an `entityRef` property
 * just before the closing `}`. Returns `null` if the object should be skipped.
 */
function buildEntityRefEdit(objectNode: SgNode<TSX>): Edit | null {
  // Find the last pair (property) in the object to insert after it
  const pairs = objectNode.findAll({ rule: { kind: 'pair' } })
  const lastPair = pairs.at(-1)
  if (!lastPair) {
    return null // empty object, skip
  }

  // Detect whether the object is single-line (no newlines between { and })
  const objectText = objectNode.text()
  const isSingleLine = !objectText.includes('\n')

  // Detect indentation from the last property
  const lastPairText = lastPair.text()
  const lastPairOffset = objectText.lastIndexOf(lastPairText)
  const beforeLastPair = objectText.slice(0, lastPairOffset)
  const lastNewline = beforeLastPair.lastIndexOf('\n')
  const indent = lastNewline >= 0 ? beforeLastPair.slice(lastNewline + 1) : '  '

  // Check if last pair is followed by a comma
  const afterLastPair = lastPair.next()
  const hasTrailingComma = afterLastPair?.text() === ','

  // Insert after the last pair (and its trailing comma if present)
  const insertAfterNode = hasTrailingComma ? afterLastPair : lastPair

  const insertPos = insertAfterNode.range().end.index
  const prefix = hasTrailingComma ? '' : ','

  if (isSingleLine) {
    return {
      startPos: insertPos,
      endPos: insertPos,
      insertedText: `${prefix} ${ENTITY_REF_PROPERTY_INLINE}`,
    }
  }

  return {
    startPos: insertPos,
    endPos: insertPos,
    insertedText: `${prefix}\n${indent}${ENTITY_REF_PROPERTY}`,
  }
}

/**
 * A candidate Location object literal, paired with the detection path.
 */
interface Candidate {
  object: SgNode<TSX>
  detection: Detection
}

/**
 * Given a `type_annotation` node, return the inner type node.
 */
function typeAnnotationTypeNode(typeAnnotation: SgNode<TSX>): SgNode<TSX> | null {
  for (const child of typeAnnotation.children()) {
    if (child.isNamed()) {
      return child
    }
  }
  return null
}

function isTypeIdentifierNamed(typeNode: SgNode<TSX>, name: string): boolean {
  return typeNode.kind() === 'type_identifier' && typeNode.text() === name
}

/**
 * Matches `Location[]` array type.
 */
function isArrayOfType(typeNode: SgNode<TSX>, name: string): boolean {
  if (typeNode.kind() !== 'array_type') {
    return false
  }
  const inner = typeNode.children().find((c) => c.isNamed())
  return !!inner && isTypeIdentifierNamed(inner, name)
}

/**
 * Matches generic wrapper types like `Partial<Location>`, `Pick<Location, ...>`,
 * `Omit<Location, ...>`, etc. These may not require all fields, so we skip them.
 */
const SKIP_GENERIC_WRAPPERS = new Set(['Partial', 'Pick', 'Omit', 'Required', 'Readonly', 'Record'])

function isGenericWrapperOfType(typeNode: SgNode<TSX>, name: string): boolean {
  if (typeNode.kind() !== 'generic_type') {
    return false
  }
  const [outer, args] = typeNode.children().filter((c) => c.isNamed())
  if (outer?.kind() !== 'type_identifier') {
    return false
  }
  if (!SKIP_GENERIC_WRAPPERS.has(outer.text())) {
    return false
  }
  if (args?.kind() !== 'type_arguments') {
    return false
  }
  const innerType = args.children().find((c) => c.isNamed())
  return !!innerType && isTypeIdentifierNamed(innerType, name)
}

/**
 * Matches `Array<Location>` / `ReadonlyArray<Location>`.
 */
function isGenericArrayOfType(typeNode: SgNode<TSX>, name: string): boolean {
  if (typeNode.kind() !== 'generic_type') {
    return false
  }
  const [outer, args] = typeNode.children().filter((c) => c.isNamed())
  if (outer?.kind() !== 'type_identifier') {
    return false
  }
  if (outer.text() !== 'Array' && outer.text() !== 'ReadonlyArray') {
    return false
  }
  if (args?.kind() !== 'type_arguments') {
    return false
  }
  const innerType = args.children().find((c) => c.isNamed())
  return !!innerType && isTypeIdentifierNamed(innerType, name)
}

/**
 * Extract object literals from a value expression. When arrayMode is true,
 * extracts each element from an array literal.
 */
function extractObjectsFromValue(valueNode: SgNode<TSX>, arrayMode: boolean): SgNode<TSX>[] {
  const objects: SgNode<TSX>[] = []

  if (arrayMode) {
    if (valueNode.kind() !== 'array') {
      return objects
    }
    for (const child of valueNode.children()) {
      if (child.kind() === 'object') {
        objects.push(child)
      }
    }
    return objects
  }

  if (valueNode.kind() === 'object') {
    objects.push(valueNode)
  } else if (valueNode.kind() === 'parenthesized_expression') {
    const inner = valueNode.children().find((c) => c.kind() === 'object')
    if (inner) {
      objects.push(inner)
    }
  }

  return objects
}

/**
 * Find nested property values inside objects that have a key matching one of
 * the given property names. Used for AddLocationResponse.location and
 * GetLocationsResponse[].data.
 */
function findPropertyObjectValues(container: SgNode<TSX>, propertyNames: string[]): SgNode<TSX>[] {
  const objects: SgNode<TSX>[] = []
  const nameRegex = `^(${propertyNames.join('|')})$`

  const pairs = container.findAll({
    rule: {
      kind: 'pair',
      has: {
        kind: 'property_identifier',
        regex: nameRegex,
      },
    },
  })

  for (const pair of pairs) {
    const valueObj = pair.find({ rule: { kind: 'object' } })
    if (valueObj) {
      objects.push(valueObj)
    }
  }

  return objects
}

interface ImportedTypes {
  locationAlias: string | null
  addLocationResponseAlias: string | null
  getLocationsResponseAlias: string | null
}

function resolveImportedTypes(rootNode: SgNode<TSX, 'program'>): ImportedTypes {
  const locationImport = getImport(rootNode, {
    type: 'named',
    name: 'Location',
    from: CATALOG_CLIENT,
  })
  const addLocationResponseImport = getImport(rootNode, {
    type: 'named',
    name: 'AddLocationResponse',
    from: CATALOG_CLIENT,
  })
  const getLocationsResponseImport = getImport(rootNode, {
    type: 'named',
    name: 'GetLocationsResponse',
    from: CATALOG_CLIENT,
  })

  return {
    locationAlias: locationImport?.alias ?? null,
    addLocationResponseAlias: addLocationResponseImport?.alias ?? null,
    getLocationsResponseAlias: getLocationsResponseImport?.alias ?? null,
  }
}

/**
 * Collect candidates from variable declarations with type annotations.
 */
function collectTypeAnnotatedCandidates(rootNode: SgNode<TSX, 'program'>, types: ImportedTypes): Candidate[] {
  const { locationAlias, addLocationResponseAlias, getLocationsResponseAlias } = types
  const candidates: Candidate[] = []

  const declarators = rootNode.findAll({
    rule: {
      kind: 'variable_declarator',
      has: { kind: 'type_annotation' },
    },
  })

  for (const decl of declarators) {
    const typeAnnotation = decl.find({ rule: { kind: 'type_annotation' } })
    if (!typeAnnotation) {
      continue
    }
    const typeNode = typeAnnotationTypeNode(typeAnnotation)
    if (!typeNode) {
      continue
    }

    // Skip generic wrappers like Partial<Location>, Pick<Location, ...>, etc.
    if (locationAlias && isGenericWrapperOfType(typeNode, locationAlias)) {
      continue
    }

    if (locationAlias) {
      if (isTypeIdentifierNamed(typeNode, locationAlias)) {
        const obj = decl.find({ rule: { kind: 'object' } })
        if (obj) {
          candidates.push({ object: obj, detection: 'type-annotation' })
        }
        continue
      }
      if (isArrayOfType(typeNode, locationAlias) || isGenericArrayOfType(typeNode, locationAlias)) {
        const arr = decl.find({ rule: { kind: 'array' } })
        if (arr) {
          for (const obj of extractObjectsFromValue(arr, true)) {
            candidates.push({ object: obj, detection: 'array-type-annotation' })
          }
        }
        continue
      }
    }

    if (addLocationResponseAlias && isTypeIdentifierNamed(typeNode, addLocationResponseAlias)) {
      const value = decl.find({
        rule: { any: [{ kind: 'object' }, { kind: 'array' }] },
      })
      if (value) {
        for (const obj of findPropertyObjectValues(value, ['location'])) {
          candidates.push({ object: obj, detection: 'add-location-response' })
        }
      }
      continue
    }

    if (getLocationsResponseAlias && isTypeIdentifierNamed(typeNode, getLocationsResponseAlias)) {
      const value = decl.find({
        rule: { any: [{ kind: 'object' }, { kind: 'array' }] },
      })
      if (value) {
        for (const obj of findPropertyObjectValues(value, ['data'])) {
          candidates.push({ object: obj, detection: 'get-locations-response' })
        }
      }
      continue
    }
  }

  return candidates
}

/**
 * Collect candidates from `as` and `satisfies` expressions.
 */
function collectAssertionCandidates(rootNode: SgNode<TSX, 'program'>, types: ImportedTypes): Candidate[] {
  const { locationAlias } = types
  if (!locationAlias) {
    return []
  }
  const candidates: Candidate[] = []

  const assertions = rootNode.findAll({
    rule: {
      any: [{ kind: 'as_expression' }, { kind: 'satisfies_expression' }],
    },
  })

  for (const assertion of assertions) {
    const named = assertion.children().filter((c) => c.isNamed())
    if (named.length < 2) {
      continue
    }
    const [valueNode] = named
    const typeNode = named.at(-1)
    if (!valueNode || !typeNode) {
      continue
    }

    const isSatisfies = assertion.kind() === 'satisfies_expression'

    // Skip generic wrappers like Partial<Location>, Pick<Location, ...>, etc.
    if (isGenericWrapperOfType(typeNode, locationAlias)) {
      continue
    }

    if (isTypeIdentifierNamed(typeNode, locationAlias)) {
      for (const obj of extractObjectsFromValue(valueNode, false)) {
        candidates.push({
          object: obj,
          detection: isSatisfies ? 'satisfies' : 'as-cast',
        })
      }
      continue
    }
    if (isArrayOfType(typeNode, locationAlias) || isGenericArrayOfType(typeNode, locationAlias)) {
      for (const obj of extractObjectsFromValue(valueNode, true)) {
        candidates.push({
          object: obj,
          detection: isSatisfies ? 'array-satisfies' : 'array-as-cast',
        })
      }
      continue
    }
  }

  return candidates
}

/**
 * Collect candidates from function/arrow return type annotations.
 */
function collectReturnTypeCandidates(rootNode: SgNode<TSX, 'program'>, types: ImportedTypes): Candidate[] {
  const { locationAlias } = types
  if (!locationAlias) {
    return []
  }
  const candidates: Candidate[] = []

  // function_declaration with Location return type
  const funcDecls = rootNode.findAll({
    rule: {
      kind: 'function_declaration',
      has: {
        kind: 'type_annotation',
        has: {
          kind: 'type_identifier',
          regex: `^${locationAlias}$`,
        },
      },
    },
  })

  // arrow_function with Location return type
  const arrowFns = rootNode.findAll({
    rule: {
      kind: 'arrow_function',
      has: {
        kind: 'type_annotation',
        has: {
          kind: 'type_identifier',
          regex: `^${locationAlias}$`,
        },
      },
    },
  })

  for (const fn of funcDecls) {
    const returnStmts = fn.findAll({ rule: { kind: 'return_statement' } })
    for (const ret of returnStmts) {
      const obj = ret.find({ rule: { kind: 'object' } })
      if (obj) {
        candidates.push({ object: obj, detection: 'return-type-annotation' })
      }
    }
  }

  for (const fn of arrowFns) {
    const parenExprs = fn.children().filter((c) => c.kind() === 'parenthesized_expression')
    for (const paren of parenExprs) {
      const obj = paren.find({ rule: { kind: 'object' } })
      if (obj) {
        candidates.push({ object: obj, detection: 'return-type-annotation' })
      }
    }

    const returnStmts = fn.findAll({ rule: { kind: 'return_statement' } })
    for (const ret of returnStmts) {
      const obj = ret.find({ rule: { kind: 'object' } })
      if (obj) {
        candidates.push({ object: obj, detection: 'return-type-annotation' })
      }
    }
  }

  return candidates
}

/**
 * Collect candidates from variables assigned object literals that are
 * returned from functions with a Location return type. The variable itself
 * has no explicit type annotation — it inherits the Location type through
 * context. We use `.definition()` on the returned identifier to trace back
 * to the variable declaration containing the object literal.
 */
function collectInferredReturnVariableCandidates(rootNode: SgNode<TSX, 'program'>, types: ImportedTypes): Candidate[] {
  const { locationAlias } = types
  if (!locationAlias) {
    return []
  }
  const candidates: Candidate[] = []

  // Find functions (declarations and arrows) with Location return type
  const funcDecls = rootNode.findAll({
    rule: {
      kind: 'function_declaration',
      has: {
        kind: 'type_annotation',
        has: {
          kind: 'type_identifier',
          regex: `^${locationAlias}$`,
        },
      },
    },
  })

  const arrowFns = rootNode.findAll({
    rule: {
      kind: 'arrow_function',
      has: {
        kind: 'type_annotation',
        has: {
          kind: 'type_identifier',
          regex: `^${locationAlias}$`,
        },
      },
    },
  })

  const allFns = [...funcDecls, ...arrowFns]

  for (const fn of allFns) {
    // Find return statements that return an identifier (not an object literal)
    const returnStmts = fn.findAll({ rule: { kind: 'return_statement' } })
    for (const ret of returnStmts) {
      const returnedExpr = ret.children().find((c) => c.isNamed() && c.kind() === 'identifier')
      if (!returnedExpr) {
        continue
      }

      // Use semantic analysis to trace the identifier to its definition
      const def = returnedExpr.definition()
      if (def?.kind !== 'local') {
        continue
      }

      // The definition node should be a variable_declarator
      const defNode = def.node
      let declarator: SgNode<TSX> | null = null

      if (defNode.kind() === 'variable_declarator') {
        declarator = defNode
      } else {
        // Try to find the variable_declarator ancestor
        declarator = defNode.ancestors().find((a) => a.kind() === 'variable_declarator') ?? null
      }

      if (!declarator) {
        continue
      }

      // Skip if the declarator already has a type annotation (handled elsewhere)
      const existingTypeAnnotation = declarator.find({
        rule: { kind: 'type_annotation' },
      })
      if (existingTypeAnnotation) {
        continue
      }

      // Find the object literal in the declarator's value
      const obj = declarator.find({ rule: { kind: 'object' } })
      if (obj) {
        candidates.push({ object: obj, detection: 'inferred-return-variable' })
      }
    }
  }

  return candidates
}

/**
 * Collect candidates from mock implementations that return Location objects.
 * Matches patterns like:
 *   jest.fn<() => Location>().mockImplementation(() => ({ ... }))
 *   jest.fn<() => Location>().mockReturnValue({ ... })
 *
 * Uses AST analysis to find Location type references in the generic type
 * arguments of jest.fn/vi.fn calls, then extracts the object literals from
 * the chained mock setup methods.
 */
function collectMockLocationCandidates(rootNode: SgNode<TSX, 'program'>, types: ImportedTypes): Candidate[] {
  const { locationAlias } = types
  if (!locationAlias) {
    return []
  }
  const candidates: Candidate[] = []

  // Find call_expression chains that include mockImplementation, mockReturnValue,
  // or mockResolvedValue. The AST structure is:
  //
  //   call_expression                    <-- mockCall (outer)
  //     member_expression                <-- direct child
  //       call_expression                <-- jest.fn<() => Location>()
  //         member_expression (jest.fn)
  //         type_arguments (<() => Location>)
  //         arguments (())
  //       property_identifier            <-- mockImplementation/mockReturnValue
  //     arguments                        <-- contains the callback/value

  const mockMethods = ['mockImplementation', 'mockReturnValue', 'mockResolvedValue']
  const methodRegex = `^(${mockMethods.join('|')})$`

  const mockCalls = rootNode.findAll({
    rule: {
      kind: 'call_expression',
      has: {
        kind: 'member_expression',
        has: {
          kind: 'property_identifier',
          regex: methodRegex,
        },
      },
    },
  })

  for (const mockCall of mockCalls) {
    // Get the direct member_expression child of the outer call_expression
    const memberExpr = mockCall.children().find((c) => c.isNamed() && c.kind() === 'member_expression')
    if (!memberExpr) {
      continue
    }

    // Get the method name (property_identifier) from the direct children of member_expression
    const methodProp = memberExpr
      .children()
      .find((c) => c.kind() === 'property_identifier' && mockMethods.includes(c.text()))
    if (!methodProp) {
      continue
    }
    const method = methodProp.text()

    // Get the call_expression (jest.fn<>()) which is the object of the member_expression
    const fnCall = memberExpr.children().find((c) => c.isNamed() && c.kind() === 'call_expression')
    if (!fnCall) {
      continue
    }

    // Check if this fn call has type_arguments containing Location
    const typeArgs = fnCall.children().find((c) => c.kind() === 'type_arguments')
    if (!typeArgs) {
      continue
    }

    const hasLocationInType =
      typeArgs.findAll({
        rule: {
          kind: 'type_identifier',
          regex: `^${locationAlias}$`,
        },
      }).length > 0

    if (!hasLocationInType) {
      continue
    }

    // Get the arguments of mockImplementation/mockReturnValue/mockResolvedValue
    // This is the direct arguments child of the outer call_expression
    const args = mockCall.children().find((c) => c.kind() === 'arguments')
    if (!args) {
      continue
    }

    if (method === 'mockImplementation') {
      // The argument is a function: () => ({ ... })
      const arrowFn = args.find({ rule: { kind: 'arrow_function' } })
      if (arrowFn) {
        const objects = arrowFn.findAll({ rule: { kind: 'object' } })
        for (const obj of objects) {
          candidates.push({ object: obj, detection: 'mock-location-type' })
        }
      }
    } else {
      // mockReturnValue or mockResolvedValue: argument is the object directly
      const objects = args.findAll({ rule: { kind: 'object' } })
      for (const obj of objects) {
        candidates.push({ object: obj, detection: 'mock-location-type' })
      }
    }
  }

  return candidates
}

/**
 * Find assertion object literals from toEqual calls on a reference node.
 * Returns the object nodes found in the assertion arguments.
 */
function findAssertionObjects(refNode: SgNode<TSX>): SgNode<TSX>[] {
  const objects: SgNode<TSX>[] = []

  // Check if this reference is inside an expect() call's arguments
  const expectCallArg = refNode.ancestors().find(
    (a) =>
      a.kind() === 'arguments' &&
      a.parent()?.kind() === 'call_expression' &&
      a.parent()?.find({
        rule: {
          kind: 'identifier',
          regex: '^expect$',
        },
      }) !== null,
  )

  if (!expectCallArg) {
    return objects
  }

  // Now find the chained .toEqual() or .toMatchObject() call
  const expectCall = expectCallArg.parent()
  if (!expectCall) {
    return objects
  }

  // The assertion call chains off the expect call:
  //   call_expression (toEqual call)
  //     member_expression
  //       call_expression (expect call)
  //       property_identifier (toEqual)
  //     arguments ({ ... })

  // expect() -> member_expression -> outer call_expression
  const assertionCall = expectCall.parent()?.parent()
  if (assertionCall?.kind() !== 'call_expression') {
    return objects
  }

  // Check the method name — only handle toEqual (exact match).
  // toMatchObject is a partial matcher; adding entityRef would change
  // the test semantics.
  const assertionMethodNode = assertionCall.find({
    rule: {
      kind: 'member_expression',
      has: {
        kind: 'property_identifier',
        regex: '^toEqual$',
      },
    },
  })
  if (!assertionMethodNode) {
    return objects
  }

  // Get the direct arguments child of the assertion call_expression
  const assertionArgs = assertionCall.children().find((c) => c.kind() === 'arguments')
  if (!assertionArgs) {
    return objects
  }

  // Find object literals in the assertion arguments
  // Only match direct children (not deeply nested objects)
  for (const child of assertionArgs.children()) {
    if (child.kind() === 'object') {
      objects.push(child)
    }
  }

  return objects
}

/**
 * Collect candidates from test assertion patterns where a Location-typed
 * variable is compared with an object literal via toEqual.
 *
 * Only toEqual assertions get entityRef added because they are exact matchers.
 * toMatchObject is a partial matcher — adding entityRef would change test
 * semantics.
 *
 * Matches patterns like:
 *   const result: Location = ...;
 *   expect(result).toEqual({ id, type, target });
 *
 * Uses `.references()` to find where Location-typed variables appear in
 * expect() calls, then extracts the assertion object literals.
 *
 * With `semantic_analysis: workspace`, references may span multiple files.
 * Same-file references are returned as candidates for the caller to batch.
 * Cross-file references are committed and written immediately via
 * `root.write()`.
 */
function collectTestAssertionCandidates(
  rootNode: SgNode<TSX, 'program'>,
  types: ImportedTypes,
  currentFilename: string,
): Candidate[] {
  const { locationAlias } = types
  if (!locationAlias) {
    return []
  }
  const candidates: Candidate[] = []

  // Find variables explicitly typed as Location
  const locationVarDeclarators = rootNode.findAll({
    rule: {
      kind: 'variable_declarator',
      has: {
        kind: 'type_annotation',
        has: {
          kind: 'type_identifier',
          regex: `^${locationAlias}$`,
        },
      },
    },
  })

  for (const decl of locationVarDeclarators) {
    // Get the variable name node
    const nameNode = decl.children().find((c) => c.isNamed() && c.kind() === 'identifier')
    if (!nameNode) {
      continue
    }

    // Use semantic analysis to find all references to this variable
    const refs = nameNode.references()

    for (const fileRef of refs) {
      const isSameFile = fileRef.root.filename() === currentFilename

      for (const refNode of fileRef.nodes) {
        const assertionObjects = findAssertionObjects(refNode)

        for (const assertionObj of assertionObjects) {
          if (hasSpread(assertionObj)) {
            recordMigration('skipped-spread', 'test-assertion')
            continue
          }
          if (hasEntityRef(assertionObj)) {
            recordMigration('skipped-existing', 'test-assertion')
            continue
          }

          const edit = buildEntityRefEdit(assertionObj)
          if (!edit) {
            continue
          }

          if (isSameFile) {
            candidates.push({ object: assertionObj, detection: 'test-assertion' })
          } else {
            // Cross-file edit: commit and write immediately
            const crossContent = fileRef.root.root().commitEdits([edit])
            fileRef.root.write(crossContent)
            recordMigration('added', 'test-assertion')
          }
        }
      }
    }
  }

  return candidates
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const currentFilename = root.filename()
  const edits: Edit[] = []

  const types = resolveImportedTypes(rootNode)

  // Early exit if none of the relevant types are imported
  if (!types.locationAlias && !types.addLocationResponseAlias && !types.getLocationsResponseAlias) {
    return null
  }

  // Collect all candidates from different detection patterns
  const candidates: Candidate[] = [
    ...collectTypeAnnotatedCandidates(rootNode, types),
    ...collectAssertionCandidates(rootNode, types),
    ...collectReturnTypeCandidates(rootNode, types),
    ...collectInferredReturnVariableCandidates(rootNode, types),
    ...collectMockLocationCandidates(rootNode, types),
    ...collectTestAssertionCandidates(rootNode, types, currentFilename),
  ]

  // Deduplicate by node id
  const seen = new Set<number>()
  for (const { object, detection } of candidates) {
    if (seen.has(object.id())) {
      continue
    }
    seen.add(object.id())

    if (hasSpread(object)) {
      recordMigration('skipped-spread', detection)
      continue
    }
    if (hasEntityRef(object)) {
      recordMigration('skipped-existing', detection)
      continue
    }

    const edit = buildEntityRefEdit(object)
    if (edit) {
      edits.push(edit)
      recordMigration('added', detection)
    }
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
