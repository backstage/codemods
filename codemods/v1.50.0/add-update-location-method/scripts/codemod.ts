import type { Codemod, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { getImport, addImport } from "@jssg/utils/javascript/imports";
import { useMetricAtom } from "codemod:metrics";

const migrationMetric = useMetricAtom("add-update-location-method");

type Outcome = "added" | "skipped-existing";
type Reason =
  | "class-implements"
  | "mock-object"
  | "typed-variable"
  | "satisfies"
  | "as-cast"
  | "factory-return"
  | "generic-call";

function recordMigration(
  outcome: Outcome,
  reason: Reason,
  interfaceName: string,
): void {
  migrationMetric.increment({ outcome, reason, interface: interfaceName });
}

/**
 * The two interfaces that now require `updateLocation`.
 */
const TARGET_INTERFACES: ReadonlyMap<
  string,
  { source: string; optionsType: string; optionsRequired: boolean }
> = new Map([
  [
    "CatalogApi",
    {
      source: "@backstage/catalog-client",
      optionsType: "CatalogRequestOptions",
      optionsRequired: false,
    },
  ],
  [
    "CatalogService",
    {
      source: "@backstage/plugin-catalog-node",
      optionsType: "CatalogServiceRequestOptions",
      optionsRequired: true,
    },
  ],
]);

const CATALOG_MODEL_SOURCE = "@backstage/catalog-model";

/**
 * Check whether an object node already has a property named `updateLocation`.
 */
function hasUpdateLocationProperty(objectNode: SgNode<TSX>): boolean {
  const pairs = objectNode.findAll({
    rule: {
      kind: "pair",
      has: {
        kind: "property_identifier",
        regex: "^updateLocation$",
      },
    },
  });
  return pairs.length > 0;
}

/**
 * Check whether a shorthand property named `updateLocation` exists.
 */
function hasUpdateLocationShorthand(objectNode: SgNode<TSX>): boolean {
  const shorthands = objectNode.findAll({
    rule: {
      kind: "shorthand_property_identifier",
      regex: "^updateLocation$",
    },
  });
  return shorthands.length > 0;
}

/**
 * Check whether a class body already has a method named `updateLocation`.
 */
function hasUpdateLocationMethod(classBody: SgNode<TSX>): boolean {
  const methods = classBody.findAll({
    rule: {
      kind: "method_definition",
      has: {
        kind: "property_identifier",
        regex: "^updateLocation$",
      },
    },
  });
  return methods.length > 0;
}

/**
 * Check if an object literal already has updateLocation (property or shorthand).
 */
function objectHasUpdateLocation(objectNode: SgNode<TSX>): boolean {
  return (
    hasUpdateLocationProperty(objectNode) ||
    hasUpdateLocationShorthand(objectNode)
  );
}

/**
 * Build the stub method body for a class implementation.
 */
function buildClassStub(optionsType: string, optionsRequired: boolean): string {
  const optionalMark = optionsRequired ? "" : "?";
  return [
    "",
    "  async updateLocation(",
    "    id: string,",
    "    location: { type?: string; target: string },",
    `    options${optionalMark}: ${optionsType},`,
    "  ): Promise<Location> {",
    "    throw new Error('updateLocation not implemented'); // TODO(backstage-codemod): implement updateLocation",
    "  }",
  ].join("\n");
}

/**
 * Build a stub property for object literals (duck-typed / factory / satisfies / as).
 */
function buildObjectStub(): string {
  return "async () => { throw new Error('updateLocation not implemented'); }";
}

/**
 * Detect which mock function factory to use by inspecting the object literal
 * for existing `jest.fn()` or `vi.fn()` calls.
 */
function detectMockFactory(objectNode: SgNode<TSX>): string {
  const calls = objectNode.findAll({
    rule: {
      kind: "call_expression",
      has: {
        kind: "member_expression",
        has: {
          kind: "identifier",
          regex: "^(jest|vi)$",
        },
      },
    },
  });
  for (const call of calls) {
    const memberExpr = call.find({ rule: { kind: "member_expression" } });
    if (memberExpr) {
      // member_expression children: identifier (namespace) + property_identifier (method)
      const namespaceNode = memberExpr.find({ rule: { kind: "identifier" } });
      const methodNode = memberExpr.find({
        rule: { kind: "property_identifier" },
      });
      const namespace = namespaceNode?.text();
      const method = methodNode?.text();
      if (method === "fn" && (namespace === "jest" || namespace === "vi")) {
        return `${namespace}.fn()`;
      }
    }
  }
  return "jest.fn()";
}

/**
 * Choose the right stub value for an object literal:
 * - If the object contains jest.fn() / vi.fn() calls, use the matching mock factory
 * - Otherwise, use the throwing async arrow stub
 */
function chooseStubValue(objectNode: SgNode<TSX>): string {
  const mockFactory = detectMockFactory(objectNode);
  // If the object has mock calls, use the mock factory
  const hasMockCalls = objectNode.find({
    rule: {
      kind: "call_expression",
      has: {
        kind: "member_expression",
        has: {
          kind: "identifier",
          regex: "^(jest|vi)$",
        },
      },
    },
  });
  if (hasMockCalls) {
    return mockFactory;
  }
  return buildObjectStub();
}

/**
 * Insert `updateLocation` property into an object literal.
 * Returns an Edit or null if insertion is not possible.
 */
function insertPropertyIntoObject(
  objectNode: SgNode<TSX>,
  stubValue: string,
): Edit | null {
  const pairs = objectNode.findAll({ rule: { kind: "pair" } });
  const shorthands = objectNode.findAll({
    rule: { kind: "shorthand_property_identifier" },
  });
  const lastProperty = [...pairs, ...shorthands].sort(
    (a, b) => a.range().end.index - b.range().end.index,
  );
  const lastProp = lastProperty[lastProperty.length - 1];

  if (lastProp) {
    // Detect indentation from the last property's column position
    const indent = " ".repeat(lastProp.range().start.column);
    const lastPropEnd = lastProp.range().end.index;
    const nextSibling = lastProp.next();
    const hasTrailingComma = nextSibling && nextSibling.text() === ",";

    const insertText = hasTrailingComma
      ? `\n${indent}updateLocation: ${stubValue},`
      : `,\n${indent}updateLocation: ${stubValue},`;

    return {
      startPos: hasTrailingComma
        ? nextSibling.range().end.index
        : lastPropEnd,
      endPos: hasTrailingComma
        ? nextSibling.range().end.index
        : lastPropEnd,
      insertedText: insertText,
    };
  }

  // Empty object, insert directly
  const objStart = objectNode.range().start.index + 1;
  return {
    startPos: objStart,
    endPos: objStart,
    insertedText: `\n  updateLocation: ${stubValue},\n`,
  };
}

/**
 * Process an object literal: check dedup set, check existing property,
 * choose stub value, insert property, push edit, and record metric.
 */
function processObjectLiteral(
  obj: SgNode<TSX>,
  interfaceName: string,
  reason: Reason,
  edits: Edit[],
  processedObjectIds: Set<number>,
): void {
  if (processedObjectIds.has(obj.id())) return;

  if (objectHasUpdateLocation(obj)) {
    recordMigration("skipped-existing", reason, interfaceName);
    processedObjectIds.add(obj.id());
    return;
  }

  const stubValue = chooseStubValue(obj);
  const edit = insertPropertyIntoObject(obj, stubValue);
  if (edit) {
    edits.push(edit);
    processedObjectIds.add(obj.id());
  }

  recordMigration("added", reason, interfaceName);
}

/**
 * Find type_identifier nodes named CatalogApi or CatalogService that are
 * nested inside a generic type (e.g., jest.Mocked<CatalogApi>).
 * Returns the interface name if found, null otherwise.
 */
function findCatalogTypeInGeneric(
  typeAnnotation: SgNode<TSX>,
): string | null {
  for (const [interfaceName] of TARGET_INTERFACES) {
    const match = typeAnnotation.find({
      rule: {
        kind: "type_identifier",
        regex: `^${interfaceName}$`,
        inside: {
          kind: "type_arguments",
          stopBy: "end",
        },
      },
    });
    if (match) return interfaceName;
  }
  return null;
}

/**
 * Check if a type annotation contains jest.Mocked or vi.Mocked pattern
 * (nested_type_identifier with "Mocked").
 */
function hasMockedType(typeAnnotation: SgNode<TSX>): boolean {
  // Check for jest.Mocked or vi.Mocked (nested_type_identifier)
  const nestedType = typeAnnotation.find({
    rule: {
      kind: "nested_type_identifier",
      has: {
        kind: "type_identifier",
        regex: "^Mocked$",
      },
    },
  });
  if (nestedType) return true;

  // Check for Mocked<...> as a standalone type_identifier (less common)
  const standaloneType = typeAnnotation.find({
    rule: {
      kind: "type_identifier",
      regex: "^Mocked$",
    },
  });
  return standaloneType !== null;
}

/**
 * Resolve the local alias for a target interface import.
 */
function resolveInterfaceAlias(
  rootNode: SgNode<TSX, "program">,
  interfaceName: string,
): string | null {
  const info = TARGET_INTERFACES.get(interfaceName);
  if (!info) return null;

  const imp = getImport(rootNode, {
    type: "named",
    name: interfaceName,
    from: info.source,
  });
  return imp?.alias ?? null;
}

/**
 * Use semantic analysis `.definition()` to verify a type_identifier resolves
 * to an import from the expected package. Falls back to import-based check
 * when semantic analysis is unavailable (e.g., in test mode).
 */
function verifyTypeDefinition(
  typeIdNode: SgNode<TSX>,
  expectedSource: string,
): boolean {
  const def = typeIdNode.definition();
  if (!def) {
    // Semantic analysis unavailable (test mode) — trust the import-based check
    return true;
  }

  if (def.kind === "import") {
    // Trace back to the import statement and check the source string
    const importStmt = def.node.parent();
    if (!importStmt) return false;

    // Walk up to the import_statement node
    let current: SgNode<TSX> | null = importStmt;
    while (current && current.kind() !== "import_statement") {
      current = current.parent();
    }
    if (!current) return false;

    const sourceNode = current.find({ rule: { kind: "string" } });
    if (!sourceNode) return false;

    const fragment = sourceNode.find({ rule: { kind: "string_fragment" } });
    return fragment?.text() === expectedSource;
  }

  // For 'local' or 'external' definitions, accept if import-check already passed
  return true;
}

/**
 * Check if a type_identifier directly refers to one of our target interfaces
 * (not nested inside type_arguments, i.e., not Mocked<CatalogApi> but just CatalogApi).
 * Uses `.definition()` to harden the check when semantic analysis is available.
 */
function findDirectCatalogType(
  node: SgNode<TSX>,
  importedInterfaces: Map<string, { alias: string; source: string; optionsType: string; optionsRequired: boolean }>,
): string | null {
  for (const [interfaceName, info] of importedInterfaces) {
    const match = node.find({
      rule: {
        kind: "type_identifier",
        regex: `^${info.alias}$`,
      },
    });
    if (match && verifyTypeDefinition(match, info.source)) {
      return interfaceName;
    }
  }
  return null;
}

/**
 * Check whether a node is nested inside an ancestor of the given kind,
 * stopping the walk at the boundary kind.
 */
function isInsideKind(
  node: SgNode<TSX>,
  ancestorKind: string,
  boundaryKind: string,
): boolean {
  let current: SgNode<TSX> | null = node.parent();
  while (current) {
    const kind = current.kind();
    if (kind === ancestorKind) return true;
    if (kind === boundaryKind) return false;
    current = current.parent();
  }
  return false;
}

/**
 * Get the return type annotation from an arrow function, avoiding parameter annotations.
 * Uses the `return_type` field if available; otherwise falls back to finding
 * the first `type_annotation` that is a direct child of the arrow function
 * (not nested inside `formal_parameters`).
 */
function getArrowReturnType(arrowFn: SgNode<TSX>): SgNode<TSX> | null {
  // Prefer the tree-sitter field when available
  const returnType = arrowFn.field("return_type");
  if (returnType) return returnType;

  // Fallback: find type_annotation children that are NOT inside formal_parameters
  const allAnnotations = arrowFn.findAll({
    rule: { kind: "type_annotation" },
  });
  for (const ann of allAnnotations) {
    // Walk up from the annotation; skip if it is nested inside formal_parameters
    if (!isInsideKind(ann, "formal_parameters", "arrow_function")) return ann;
  }
  return null;
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root() as SgNode<TSX, "program">;
  const edits: Edit[] = [];

  // Determine which target interfaces are imported in this file
  const importedInterfaces: Map<
    string,
    { alias: string; source: string; optionsType: string; optionsRequired: boolean }
  > = new Map();

  for (const [interfaceName, info] of TARGET_INTERFACES) {
    const alias = resolveInterfaceAlias(rootNode, interfaceName);
    if (alias) {
      importedInterfaces.set(interfaceName, {
        alias,
        ...info,
      });
    }
  }

  if (importedInterfaces.size === 0) {
    return null;
  }

  let needsLocationImport = false;

  // --- 1. Process class declarations with implements clause ---
  const classDeclarations = rootNode.findAll({
    rule: {
      kind: "class_declaration",
      has: {
        kind: "class_heritage",
        has: {
          kind: "implements_clause",
        },
      },
    },
  });

  for (const classDecl of classDeclarations) {
    const implementsClause = classDecl.find({
      rule: { kind: "implements_clause" },
    });
    if (!implementsClause) continue;

    // Check each target interface
    let matchedInterface: {
      name: string;
      optionsType: string;
      optionsRequired: boolean;
    } | null = null;

    for (const [interfaceName, info] of importedInterfaces) {
      const match = implementsClause.find({
        rule: {
          kind: "type_identifier",
          regex: `^${info.alias}$`,
        },
      });
      if (match) {
        matchedInterface = {
          name: interfaceName,
          optionsType: info.optionsType,
          optionsRequired: info.optionsRequired,
        };
        break;
      }
    }

    if (!matchedInterface) continue;

    const classBody = classDecl.find({ rule: { kind: "class_body" } });
    if (!classBody) continue;

    if (hasUpdateLocationMethod(classBody)) {
      recordMigration("skipped-existing", "class-implements", matchedInterface.name);
      continue;
    }

    // Insert stub method before the closing brace of the class body
    const closingBrace = classBody.range().end.index;
    const stub = buildClassStub(
      matchedInterface.optionsType,
      matchedInterface.optionsRequired,
    );

    edits.push({
      startPos: closingBrace - 1,
      endPos: closingBrace - 1,
      insertedText: stub + "\n",
    });

    needsLocationImport = true;

    recordMigration("added", "class-implements", matchedInterface.name);
  }

  // --- 2. Process mock object literals (Mocked<CatalogApi> pattern) ---
  // Find variable declarations with type annotations containing Mocked<CatalogApi>
  const variableDeclarators = rootNode.findAll({
    rule: { kind: "variable_declarator" },
  });

  // Track objects we've already processed to avoid double-processing
  const processedObjectIds = new Set<number>();

  for (const declarator of variableDeclarators) {
    const typeAnnotation = declarator.find({
      rule: { kind: "type_annotation" },
    });

    // Also check for `as` expressions (e.g., `{...} as unknown as jest.Mocked<CatalogApi>`)
    const asExpressions = declarator.findAll({
      rule: { kind: "as_expression" },
    });

    let matchedInterfaceName: string | null = null;

    // Check type annotation first
    if (typeAnnotation) {
      matchedInterfaceName = findCatalogTypeInGeneric(typeAnnotation);
    }

    // If not found in type annotation, check as expressions
    if (!matchedInterfaceName) {
      for (const asExpr of asExpressions) {
        matchedInterfaceName = findCatalogTypeInGeneric(asExpr);
        if (matchedInterfaceName) break;
      }
    }

    if (!matchedInterfaceName) continue;

    // Verify the interface is actually imported from the correct package
    if (!importedInterfaces.has(matchedInterfaceName)) continue;

    // Verify it has a Mocked type wrapper (either in type annotation or as expression)
    let hasMocked = false;
    if (typeAnnotation && hasMockedType(typeAnnotation)) {
      hasMocked = true;
    }
    if (!hasMocked) {
      for (const asExpr of asExpressions) {
        if (hasMockedType(asExpr)) {
          hasMocked = true;
          break;
        }
      }
    }
    if (!hasMocked) continue;

    // Find the object literal
    const objectLiteral = declarator.find({
      rule: { kind: "object" },
    });
    if (!objectLiteral) continue;

    // Check if updateLocation already exists
    if (objectHasUpdateLocation(objectLiteral)) {
      recordMigration("skipped-existing", "mock-object", matchedInterfaceName);
      processedObjectIds.add(objectLiteral.id());
      continue;
    }

    // Detect the mock factory (jest.fn() or vi.fn())
    const mockFactory = detectMockFactory(objectLiteral);

    const edit = insertPropertyIntoObject(objectLiteral, mockFactory);
    if (edit) {
      edits.push(edit);
      processedObjectIds.add(objectLiteral.id());
    }

    recordMigration("added", "mock-object", matchedInterfaceName);
  }

  // --- 3. Process explicit-type duck-typed objects ---
  // 3a. Variables with `: CatalogApi` type annotation (direct, not Mocked-wrapped)
  for (const declarator of variableDeclarators) {
    const typeAnnotation = declarator.find({
      rule: { kind: "type_annotation" },
    });
    if (!typeAnnotation) continue;

    // Skip if the type annotation is inside an arrow function (handled by section 4b)
    if (isInsideKind(typeAnnotation, "arrow_function", "variable_declarator")) continue;

    // Check for a direct type_identifier (not inside type_arguments/generic)
    const matchedInterfaceName = findDirectCatalogType(typeAnnotation, importedInterfaces);
    if (!matchedInterfaceName) continue;

    // Make sure the type_identifier is NOT inside a type_arguments (which would be Mocked<CatalogApi>)
    const typeId = typeAnnotation.find({
      rule: {
        kind: "type_identifier",
        regex: `^${importedInterfaces.get(matchedInterfaceName)!.alias}$`,
      },
    });
    if (!typeId) continue;

    // Skip if the type_identifier is nested inside type_arguments (handled by mock section)
    const isInsideTypeArgs = typeId.inside({
      rule: { kind: "type_arguments" },
    });
    if (isInsideTypeArgs) continue;

    // Find the object literal in the declarator
    const objectLiteral = declarator.find({ rule: { kind: "object" } });
    if (!objectLiteral) continue;

    processObjectLiteral(objectLiteral, matchedInterfaceName, "typed-variable", edits, processedObjectIds);
  }

  // 3b. `satisfies CatalogApi` expressions
  for (const declarator of variableDeclarators) {
    const satisfiesExprs = declarator.findAll({
      rule: { kind: "satisfies_expression" },
    });

    for (const satisfiesExpr of satisfiesExprs) {
      const matchedInterfaceName = findDirectCatalogType(satisfiesExpr, importedInterfaces);
      if (!matchedInterfaceName) continue;

      const objectLiteral = satisfiesExpr.find({ rule: { kind: "object" } });
      if (!objectLiteral) continue;

      processObjectLiteral(objectLiteral, matchedInterfaceName, "satisfies", edits, processedObjectIds);
    }
  }

  // 3c. `as CatalogApi` expressions (direct, not `as unknown as Mocked<CatalogApi>`)
  for (const declarator of variableDeclarators) {
    const asExprs = declarator.findAll({
      rule: { kind: "as_expression" },
    });

    for (const asExpr of asExprs) {
      // Skip if this as_expression has a Mocked wrapper (handled in mock section)
      if (hasMockedType(asExpr)) continue;

      // Check if the as-target is a direct CatalogApi/CatalogService type
      const matchedInterfaceName = findDirectCatalogType(asExpr, importedInterfaces);
      if (!matchedInterfaceName) continue;

      // Verify the type_identifier is not inside type_arguments
      const typeId = asExpr.find({
        rule: {
          kind: "type_identifier",
          regex: `^${importedInterfaces.get(matchedInterfaceName)!.alias}$`,
        },
      });
      if (!typeId) continue;
      const isInsideTypeArgs = typeId.inside({
        rule: { kind: "type_arguments" },
      });
      if (isInsideTypeArgs) continue;

      const objectLiteral = asExpr.find({ rule: { kind: "object" } });
      if (!objectLiteral) continue;

      processObjectLiteral(objectLiteral, matchedInterfaceName, "as-cast", edits, processedObjectIds);
    }
  }

  // --- 4. Process factory functions with CatalogApi/CatalogService return type ---
  // 4a. function declarations: function foo(): CatalogApi { return {...}; }
  const functionDeclarations = rootNode.findAll({
    rule: { kind: "function_declaration" },
  });

  for (const funcDecl of functionDeclarations) {
    const returnType = funcDecl.find({ rule: { kind: "type_annotation" } });
    if (!returnType) continue;

    const matchedInterfaceName = findDirectCatalogType(returnType, importedInterfaces);
    if (!matchedInterfaceName) continue;

    // Verify the type is direct (not inside type_arguments)
    const typeId = returnType.find({
      rule: {
        kind: "type_identifier",
        regex: `^${importedInterfaces.get(matchedInterfaceName)!.alias}$`,
      },
    });
    if (!typeId) continue;
    if (typeId.inside({ rule: { kind: "type_arguments" } })) continue;

    // Find return statements with object literals
    const returnStatements = funcDecl.findAll({
      rule: { kind: "return_statement" },
    });

    for (const returnStmt of returnStatements) {
      const objectLiteral = returnStmt.find({ rule: { kind: "object" } });
      if (!objectLiteral) continue;

      processObjectLiteral(objectLiteral, matchedInterfaceName, "factory-return", edits, processedObjectIds);
    }
  }

  // 4b. Arrow functions with return type: const foo = (): CatalogApi => ({...})
  const arrowFunctions = rootNode.findAll({
    rule: { kind: "arrow_function" },
  });

  for (const arrowFn of arrowFunctions) {
    // Use safe return-type extraction that avoids parameter annotations
    const returnType = getArrowReturnType(arrowFn);
    if (!returnType) continue;

    const matchedInterfaceName = findDirectCatalogType(returnType, importedInterfaces);
    if (!matchedInterfaceName) continue;

    const typeId = returnType.find({
      rule: {
        kind: "type_identifier",
        regex: `^${importedInterfaces.get(matchedInterfaceName)!.alias}$`,
      },
    });
    if (!typeId) continue;
    if (typeId.inside({ rule: { kind: "type_arguments" } })) continue;

    // Find object literals in the arrow body
    // Case 1: arrow => ({...}) - parenthesized_expression containing object
    const parenExpr = arrowFn.find({
      rule: { kind: "parenthesized_expression" },
    });
    if (parenExpr) {
      const objectLiteral = parenExpr.find({ rule: { kind: "object" } });
      if (objectLiteral) {
        processObjectLiteral(objectLiteral, matchedInterfaceName, "factory-return", edits, processedObjectIds);
      }
    }

    // Case 2: arrow => { return {...}; } - statement_block with return_statement
    const stmtBlock = arrowFn.find({ rule: { kind: "statement_block" } });
    if (stmtBlock) {
      const returnStatements = stmtBlock.findAll({
        rule: { kind: "return_statement" },
      });

      for (const returnStmt of returnStatements) {
        const objectLiteral = returnStmt.find({ rule: { kind: "object" } });
        if (!objectLiteral) continue;

        processObjectLiteral(objectLiteral, matchedInterfaceName, "factory-return", edits, processedObjectIds);
      }
    }
  }

  // --- 5. Process generic call expressions: foo<CatalogApi>({...}) ---
  const callExpressions = rootNode.findAll({
    rule: {
      kind: "call_expression",
      has: {
        kind: "type_arguments",
      },
    },
  });

  for (const callExpr of callExpressions) {
    const typeArgs = callExpr.find({ rule: { kind: "type_arguments" } });
    if (!typeArgs) continue;

    const matchedInterfaceName = findDirectCatalogType(typeArgs, importedInterfaces);
    if (!matchedInterfaceName) continue;

    // Find inline object literal arguments
    const args = callExpr.find({ rule: { kind: "arguments" } });
    if (!args) continue;

    const objectLiterals = args.findAll({ rule: { kind: "object" } });
    for (const objectLiteral of objectLiterals) {
      processObjectLiteral(objectLiteral, matchedInterfaceName, "generic-call", edits, processedObjectIds);
    }
  }

  if (edits.length === 0) {
    return null;
  }

  // --- 6. Add Location import if needed (for class stubs) ---
  if (needsLocationImport) {
    const existingLocationImport = getImport(rootNode, {
      type: "named",
      name: "Location",
      from: CATALOG_MODEL_SOURCE,
    });

    if (!existingLocationImport) {
      const locationEdit = addImport(rootNode, {
        type: "named",
        specifiers: [{ name: "Location" }],
        from: CATALOG_MODEL_SOURCE,
      });
      if (locationEdit) edits.push(locationEdit);
    }

    // Also ensure the options type is imported for CatalogApi classes
    for (const [interfaceName, info] of importedInterfaces) {
      // Only add options type import for interfaces that had class stubs added
      const needsOptionsImport = classDeclarations.some((classDecl) => {
        const implementsClause = classDecl.find({
          rule: { kind: "implements_clause" },
        });
        if (!implementsClause) return false;

        const match = implementsClause.find({
          rule: {
            kind: "type_identifier",
            regex: `^${info.alias}$`,
          },
        });
        if (!match) return false;

        const classBody = classDecl.find({ rule: { kind: "class_body" } });
        return classBody && !hasUpdateLocationMethod(classBody);
      });

      if (!needsOptionsImport) continue;

      const existingOptionsImport = getImport(rootNode, {
        type: "named",
        name: info.optionsType,
        from: info.source,
      });

      if (!existingOptionsImport) {
        const optionsEdit = addImport(rootNode, {
          type: "named",
          specifiers: [{ name: info.optionsType }],
          from: info.source,
        });
        if (optionsEdit) edits.push(optionsEdit);
      }
    }
  }

  return rootNode.commitEdits(edits);
};

export default transform;
