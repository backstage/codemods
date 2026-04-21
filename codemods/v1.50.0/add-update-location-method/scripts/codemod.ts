import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { getImport, addImport } from "@jssg/utils/javascript/imports";
import { useMetricAtom } from "codemod:metrics";

const migrationMetric = useMetricAtom("add-update-location-method");

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

const transform: Transform<TSX> = async (root) => {
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
      migrationMetric.increment({
        outcome: "skipped",
        reason: "already-has-method",
        interface: matchedInterface.name,
      });
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

    migrationMetric.increment({
      outcome: "auto-migrated",
      reason: "class-stub-added",
      interface: matchedInterface.name,
    });
  }

  // --- 2. Process mock object literals ---
  // Find variable declarations with type annotations containing Mocked<CatalogApi>
  const variableDeclarators = rootNode.findAll({
    rule: { kind: "variable_declarator" },
  });

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
    if (
      hasUpdateLocationProperty(objectLiteral) ||
      hasUpdateLocationShorthand(objectLiteral)
    ) {
      migrationMetric.increment({
        outcome: "skipped",
        reason: "already-has-property",
        interface: matchedInterfaceName,
      });
      continue;
    }

    // Detect the mock factory (jest.fn() or vi.fn())
    const mockFactory = detectMockFactory(objectLiteral);

    // Find the last pair in the object to insert after it
    const pairs = objectLiteral.findAll({ rule: { kind: "pair" } });
    const lastPair = pairs[pairs.length - 1];

    if (lastPair) {
      // Insert after the last property
      const lastPairEnd = lastPair.range().end.index;
      // Check if there's already a trailing comma
      const nextSibling = lastPair.next();
      const hasTrailingComma = nextSibling && nextSibling.text() === ",";

      const insertText = hasTrailingComma
        ? `\n  updateLocation: ${mockFactory},`
        : `,\n  updateLocation: ${mockFactory},`;

      edits.push({
        startPos: hasTrailingComma
          ? nextSibling.range().end.index
          : lastPairEnd,
        endPos: hasTrailingComma
          ? nextSibling.range().end.index
          : lastPairEnd,
        insertedText: insertText,
      });
    } else {
      // Empty object, insert directly
      const objStart = objectLiteral.range().start.index + 1;
      edits.push({
        startPos: objStart,
        endPos: objStart,
        insertedText: `\n  updateLocation: ${mockFactory},\n`,
      });
    }

    migrationMetric.increment({
      outcome: "auto-migrated",
      reason: "mock-property-added",
      interface: matchedInterfaceName,
    });
  }

  if (edits.length === 0) {
    return null;
  }

  // --- 3. Add Location import if needed (for class stubs) ---
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
