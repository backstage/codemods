import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { getImport } from "@jssg/utils/javascript/imports";
import { useMetricAtom } from "codemod:metrics";

const migrationMetric = useMetricAtom("add-entity-ref-to-location");

const CATALOG_CLIENT = "@backstage/catalog-client";

const ENTITY_REF_PROPERTY =
  "entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef";

/**
 * Check whether an object literal already contains an `entityRef` property.
 */
function hasEntityRef(objectNode: SgNode<TSX>): boolean {
  return (
    objectNode.findAll({
      rule: {
        kind: "pair",
        has: {
          kind: "property_identifier",
          regex: "^entityRef$",
        },
      },
    }).length > 0
  );
}

/**
 * Check whether an object literal uses a spread element (e.g. `{ ...existing }`).
 */
function hasSpread(objectNode: SgNode<TSX>): boolean {
  return (
    objectNode.findAll({
      rule: { kind: "spread_element" },
    }).length > 0
  );
}

/**
 * Given an `object` node, compute an edit that inserts an `entityRef` property
 * just before the closing `}`. Returns `null` if the object should be skipped.
 */
function buildEntityRefEdit(objectNode: SgNode<TSX>): Edit | null {
  if (hasEntityRef(objectNode) || hasSpread(objectNode)) {
    return null;
  }

  // Find the last pair (property) in the object to insert after it
  const pairs = objectNode.findAll({ rule: { kind: "pair" } });
  const lastPair = pairs[pairs.length - 1];
  if (!lastPair) {
    return null; // empty object, skip
  }

  // Detect indentation from the last property
  const lastPairText = lastPair.text();
  const objectText = objectNode.text();
  const lastPairOffset = objectText.lastIndexOf(lastPairText);
  const beforeLastPair = objectText.slice(0, lastPairOffset);
  const lastNewline = beforeLastPair.lastIndexOf("\n");
  const indent =
    lastNewline >= 0 ? beforeLastPair.slice(lastNewline + 1) : "  ";

  // Check if last pair is followed by a comma
  const afterLastPair = lastPair.next();
  const hasTrailingComma = afterLastPair?.text() === ",";

  // Insert after the last pair (and its trailing comma if present)
  const insertAfterNode = hasTrailingComma ? afterLastPair : lastPair;
  if (!insertAfterNode) {
    return null;
  }

  const insertPos = insertAfterNode.range().end.index;
  const prefix = hasTrailingComma ? "" : ",";

  return {
    startPos: insertPos,
    endPos: insertPos,
    insertedText: `${prefix}\n${indent}${ENTITY_REF_PROPERTY}`,
  };
}

/**
 * Find all object nodes directly typed as Location via `: Location` annotation.
 */
function findTypeAnnotatedObjects(
  rootNode: SgNode<TSX, "program">,
  locationAlias: string,
): SgNode<TSX>[] {
  // Pattern: variable_declarator with type_annotation containing Location
  const results: SgNode<TSX>[] = [];

  const declarators = rootNode.findAll({
    rule: {
      kind: "variable_declarator",
      has: {
        kind: "type_annotation",
        has: {
          kind: "type_identifier",
          regex: `^${locationAlias}$`,
        },
      },
    },
  });

  for (const decl of declarators) {
    const obj = decl.find({ rule: { kind: "object" } });
    if (obj) {
      results.push(obj);
    }
  }

  return results;
}

/**
 * Find all object nodes typed via `satisfies Location`.
 */
function findSatisfiesObjects(
  rootNode: SgNode<TSX, "program">,
  locationAlias: string,
): SgNode<TSX>[] {
  const results: SgNode<TSX>[] = [];

  const satisfiesExprs = rootNode.findAll({
    rule: {
      kind: "satisfies_expression",
      has: {
        kind: "type_identifier",
        regex: `^${locationAlias}$`,
      },
    },
  });

  for (const expr of satisfiesExprs) {
    const obj = expr.find({ rule: { kind: "object" } });
    if (obj) {
      results.push(obj);
    }
  }

  return results;
}

/**
 * Find all object nodes typed via `as Location`.
 */
function findAsObjects(
  rootNode: SgNode<TSX, "program">,
  locationAlias: string,
): SgNode<TSX>[] {
  const results: SgNode<TSX>[] = [];

  const asExprs = rootNode.findAll({
    rule: {
      kind: "as_expression",
      has: {
        kind: "type_identifier",
        regex: `^${locationAlias}$`,
      },
    },
  });

  for (const expr of asExprs) {
    const obj = expr.find({ rule: { kind: "object" } });
    if (obj) {
      results.push(obj);
    }
  }

  return results;
}

/**
 * Find object literals returned from functions/arrows with `: Location` return type.
 */
function findReturnTypeObjects(
  rootNode: SgNode<TSX, "program">,
  locationAlias: string,
): SgNode<TSX>[] {
  const results: SgNode<TSX>[] = [];

  // function_declaration and method_definition with Location return type
  const funcDecls = rootNode.findAll({
    rule: {
      kind: "function_declaration",
      has: {
        kind: "type_annotation",
        has: {
          kind: "type_identifier",
          regex: `^${locationAlias}$`,
        },
      },
    },
  });

  // arrow_function with Location return type
  const arrowFns = rootNode.findAll({
    rule: {
      kind: "arrow_function",
      has: {
        kind: "type_annotation",
        has: {
          kind: "type_identifier",
          regex: `^${locationAlias}$`,
        },
      },
    },
  });

  // For function_declarations, find objects inside return statements
  for (const fn of funcDecls) {
    const returnStmts = fn.findAll({ rule: { kind: "return_statement" } });
    for (const ret of returnStmts) {
      const obj = ret.find({ rule: { kind: "object" } });
      if (obj) {
        results.push(obj);
      }
    }
  }

  // For arrow_functions, find expression body objects and return statement objects
  for (const fn of arrowFns) {
    // Expression body: () => ({ ... }) - object inside parenthesized_expression
    const parenExprs = fn.children().filter((c) => c.kind() === "parenthesized_expression");
    for (const paren of parenExprs) {
      const obj = paren.find({ rule: { kind: "object" } });
      if (obj) {
        results.push(obj);
      }
    }

    // Block body with return statements: () => { return { ... }; }
    const returnStmts = fn.findAll({ rule: { kind: "return_statement" } });
    for (const ret of returnStmts) {
      const obj = ret.find({ rule: { kind: "object" } });
      if (obj) {
        results.push(obj);
      }
    }
  }

  return results;
}

/**
 * Find nested Location objects inside AddLocationResponse-typed variables.
 * Looks for `location: { ... }` property inside objects annotated as AddLocationResponse.
 */
function findAddLocationResponseObjects(
  rootNode: SgNode<TSX, "program">,
  addLocationResponseAlias: string,
): SgNode<TSX>[] {
  const results: SgNode<TSX>[] = [];

  // Find variable_declarators with AddLocationResponse type annotation
  const declarators = rootNode.findAll({
    rule: {
      kind: "variable_declarator",
      has: {
        kind: "type_annotation",
        has: {
          kind: "type_identifier",
          regex: `^${addLocationResponseAlias}$`,
        },
      },
    },
  });

  for (const decl of declarators) {
    const topObj = decl.find({ rule: { kind: "object" } });
    if (!topObj) continue;
    findLocationPropertyObjects(topObj, results);
  }

  return results;
}

/**
 * Recursively find `location: { ... }` pairs inside an object literal.
 */
function findLocationPropertyObjects(
  objectNode: SgNode<TSX>,
  results: SgNode<TSX>[],
): void {
  const locationPairs = objectNode.findAll({
    rule: {
      kind: "pair",
      has: {
        kind: "property_identifier",
        regex: "^location$",
      },
    },
  });

  for (const pair of locationPairs) {
    const valueObj = pair.find({ rule: { kind: "object" } });
    if (valueObj) {
      results.push(valueObj);
    }
  }
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root() as SgNode<TSX, "program">;
  const edits: Edit[] = [];

  // Check for Location import from @backstage/catalog-client
  const locationImport = getImport(rootNode, {
    type: "named",
    name: "Location",
    from: CATALOG_CLIENT,
  });

  const addLocationResponseImport = getImport(rootNode, {
    type: "named",
    name: "AddLocationResponse",
    from: CATALOG_CLIENT,
  });

  // Early exit if neither Location nor AddLocationResponse is imported
  if (!locationImport && !addLocationResponseImport) {
    return null;
  }

  const locationAlias = locationImport?.alias ?? null;
  const addLocationResponseAlias = addLocationResponseImport?.alias ?? null;

  // Collect all object nodes that need the entityRef field
  const objectsToTransform: SgNode<TSX>[] = [];

  if (locationAlias !== null) {
    objectsToTransform.push(
      ...findTypeAnnotatedObjects(rootNode, locationAlias),
    );
    objectsToTransform.push(...findSatisfiesObjects(rootNode, locationAlias));
    objectsToTransform.push(...findAsObjects(rootNode, locationAlias));
    objectsToTransform.push(...findReturnTypeObjects(rootNode, locationAlias));
  }

  if (addLocationResponseAlias !== null) {
    objectsToTransform.push(
      ...findAddLocationResponseObjects(rootNode, addLocationResponseAlias),
    );
  }

  // Deduplicate by node id (an object could match multiple patterns)
  const seen = new Set<number>();
  for (const obj of objectsToTransform) {
    if (seen.has(obj.id())) continue;
    seen.add(obj.id());

    const edit = buildEntityRefEdit(obj);
    if (edit) {
      edits.push(edit);
      migrationMetric.increment({ action: "entityRef-added" });
    } else {
      migrationMetric.increment({ action: "skipped" });
    }
  }

  return edits.length > 0 ? rootNode.commitEdits(edits) : null;
};

export default transform;
