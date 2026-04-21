import type { Codemod, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { getImport } from "@jssg/utils/javascript/imports";
import { useMetricAtom } from "codemod:metrics";

const migrationMetric = useMetricAtom("add-entity-ref-to-location");

const CATALOG_CLIENT = "@backstage/catalog-client";

const ENTITY_REF_PROPERTY =
  "entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef";

type Detection =
  | "type-annotation"
  | "array-type-annotation"
  | "as-cast"
  | "satisfies"
  | "array-as-cast"
  | "array-satisfies"
  | "return-type-annotation"
  | "add-location-response"
  | "get-locations-response";

type Outcome = "added" | "skipped-spread" | "skipped-existing";

function recordMigration(outcome: Outcome, detection: Detection): void {
  migrationMetric.increment({ outcome, detection });
}

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
 * A candidate Location object literal, paired with the detection path.
 */
interface Candidate {
  object: SgNode<TSX>;
  detection: Detection;
}

/**
 * Given a `type_annotation` node, return the inner type node.
 */
function typeAnnotationTypeNode(
  typeAnnotation: SgNode<TSX>,
): SgNode<TSX> | null {
  for (const child of typeAnnotation.children()) {
    if (child.isNamed()) return child;
  }
  return null;
}

function isTypeIdentifierNamed(
  typeNode: SgNode<TSX>,
  name: string,
): boolean {
  return typeNode.kind() === "type_identifier" && typeNode.text() === name;
}

/**
 * Matches `Location[]` array type.
 */
function isArrayOfType(typeNode: SgNode<TSX>, name: string): boolean {
  if (typeNode.kind() !== "array_type") return false;
  const inner = typeNode.children().find((c) => c.isNamed());
  return !!inner && isTypeIdentifierNamed(inner, name);
}

/**
 * Matches `Array<Location>` / `ReadonlyArray<Location>`.
 */
function isGenericArrayOfType(typeNode: SgNode<TSX>, name: string): boolean {
  if (typeNode.kind() !== "generic_type") return false;
  const named = typeNode.children().filter((c) => c.isNamed());
  const outer = named[0];
  const args = named[1];
  if (!outer || outer.kind() !== "type_identifier") return false;
  if (outer.text() !== "Array" && outer.text() !== "ReadonlyArray") return false;
  if (!args || args.kind() !== "type_arguments") return false;
  const innerType = args.children().find((c) => c.isNamed());
  return !!innerType && isTypeIdentifierNamed(innerType, name);
}

/**
 * Extract object literals from a value expression. When arrayMode is true,
 * extracts each element from an array literal.
 */
function extractObjectsFromValue(
  valueNode: SgNode<TSX>,
  arrayMode: boolean,
): SgNode<TSX>[] {
  const objects: SgNode<TSX>[] = [];

  if (arrayMode) {
    if (valueNode.kind() !== "array") return objects;
    for (const child of valueNode.children()) {
      if (child.kind() === "object") {
        objects.push(child);
      }
    }
    return objects;
  }

  if (valueNode.kind() === "object") {
    objects.push(valueNode);
  } else if (valueNode.kind() === "parenthesized_expression") {
    const inner = valueNode.children().find((c) => c.kind() === "object");
    if (inner) objects.push(inner);
  }

  return objects;
}

/**
 * Find nested property values inside objects that have a key matching one of
 * the given property names. Used for AddLocationResponse.location and
 * GetLocationsResponse[].data.
 */
function findPropertyObjectValues(
  container: SgNode<TSX>,
  propertyNames: string[],
): SgNode<TSX>[] {
  const objects: SgNode<TSX>[] = [];
  const nameRegex = `^(${propertyNames.join("|")})$`;

  const pairs = container.findAll({
    rule: {
      kind: "pair",
      has: {
        kind: "property_identifier",
        regex: nameRegex,
      },
    },
  });

  for (const pair of pairs) {
    const valueObj = pair.find({ rule: { kind: "object" } });
    if (valueObj) {
      objects.push(valueObj);
    }
  }

  return objects;
}

interface ImportedTypes {
  locationAlias: string | null;
  addLocationResponseAlias: string | null;
  getLocationsResponseAlias: string | null;
}

function resolveImportedTypes(
  rootNode: SgNode<TSX, "program">,
): ImportedTypes {
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
  const getLocationsResponseImport = getImport(rootNode, {
    type: "named",
    name: "GetLocationsResponse",
    from: CATALOG_CLIENT,
  });

  return {
    locationAlias: locationImport?.alias ?? null,
    addLocationResponseAlias: addLocationResponseImport?.alias ?? null,
    getLocationsResponseAlias: getLocationsResponseImport?.alias ?? null,
  };
}

/**
 * Collect candidates from variable declarations with type annotations.
 */
function collectTypeAnnotatedCandidates(
  rootNode: SgNode<TSX, "program">,
  types: ImportedTypes,
): Candidate[] {
  const { locationAlias, addLocationResponseAlias, getLocationsResponseAlias } =
    types;
  const candidates: Candidate[] = [];

  const declarators = rootNode.findAll({
    rule: {
      kind: "variable_declarator",
      has: { kind: "type_annotation" },
    },
  });

  for (const decl of declarators) {
    const typeAnnotation = decl.find({ rule: { kind: "type_annotation" } });
    if (!typeAnnotation) continue;
    const typeNode = typeAnnotationTypeNode(typeAnnotation);
    if (!typeNode) continue;

    // Find the value (object or array literal)
    const value = decl.find({
      rule: {
        any: [{ kind: "object" }, { kind: "array" }],
      },
    });

    if (locationAlias) {
      if (isTypeIdentifierNamed(typeNode, locationAlias)) {
        const obj = decl.find({ rule: { kind: "object" } });
        if (obj) {
          candidates.push({ object: obj, detection: "type-annotation" });
        }
        continue;
      }
      if (
        isArrayOfType(typeNode, locationAlias) ||
        isGenericArrayOfType(typeNode, locationAlias)
      ) {
        const arr = decl.find({ rule: { kind: "array" } });
        if (arr) {
          for (const obj of extractObjectsFromValue(arr, true)) {
            candidates.push({ object: obj, detection: "array-type-annotation" });
          }
        }
        continue;
      }
    }

    if (
      addLocationResponseAlias &&
      isTypeIdentifierNamed(typeNode, addLocationResponseAlias)
    ) {
      if (value) {
        for (const obj of findPropertyObjectValues(value, ["location"])) {
          candidates.push({ object: obj, detection: "add-location-response" });
        }
      }
      continue;
    }

    if (
      getLocationsResponseAlias &&
      isTypeIdentifierNamed(typeNode, getLocationsResponseAlias)
    ) {
      if (value) {
        for (const obj of findPropertyObjectValues(value, ["data"])) {
          candidates.push({ object: obj, detection: "get-locations-response" });
        }
      }
      continue;
    }
  }

  return candidates;
}

/**
 * Collect candidates from `as` and `satisfies` expressions.
 */
function collectAssertionCandidates(
  rootNode: SgNode<TSX, "program">,
  types: ImportedTypes,
): Candidate[] {
  const { locationAlias } = types;
  if (!locationAlias) return [];
  const candidates: Candidate[] = [];

  const assertions = rootNode.findAll({
    rule: {
      any: [{ kind: "as_expression" }, { kind: "satisfies_expression" }],
    },
  });

  for (const assertion of assertions) {
    const named = assertion.children().filter((c) => c.isNamed());
    if (named.length < 2) continue;
    const valueNode = named[0];
    const typeNode = named[named.length - 1];
    if (!valueNode || !typeNode) continue;

    const isSatisfies = assertion.kind() === "satisfies_expression";

    if (isTypeIdentifierNamed(typeNode, locationAlias)) {
      for (const obj of extractObjectsFromValue(valueNode, false)) {
        candidates.push({
          object: obj,
          detection: isSatisfies ? "satisfies" : "as-cast",
        });
      }
      continue;
    }
    if (
      isArrayOfType(typeNode, locationAlias) ||
      isGenericArrayOfType(typeNode, locationAlias)
    ) {
      for (const obj of extractObjectsFromValue(valueNode, true)) {
        candidates.push({
          object: obj,
          detection: isSatisfies ? "array-satisfies" : "array-as-cast",
        });
      }
      continue;
    }
  }

  return candidates;
}

/**
 * Collect candidates from function/arrow return type annotations.
 */
function collectReturnTypeCandidates(
  rootNode: SgNode<TSX, "program">,
  types: ImportedTypes,
): Candidate[] {
  const { locationAlias } = types;
  if (!locationAlias) return [];
  const candidates: Candidate[] = [];

  // function_declaration with Location return type
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

  for (const fn of funcDecls) {
    const returnStmts = fn.findAll({ rule: { kind: "return_statement" } });
    for (const ret of returnStmts) {
      const obj = ret.find({ rule: { kind: "object" } });
      if (obj) {
        candidates.push({ object: obj, detection: "return-type-annotation" });
      }
    }
  }

  for (const fn of arrowFns) {
    const parenExprs = fn.children().filter((c) => c.kind() === "parenthesized_expression");
    for (const paren of parenExprs) {
      const obj = paren.find({ rule: { kind: "object" } });
      if (obj) {
        candidates.push({ object: obj, detection: "return-type-annotation" });
      }
    }

    const returnStmts = fn.findAll({ rule: { kind: "return_statement" } });
    for (const ret of returnStmts) {
      const obj = ret.find({ rule: { kind: "object" } });
      if (obj) {
        candidates.push({ object: obj, detection: "return-type-annotation" });
      }
    }
  }

  return candidates;
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root() as SgNode<TSX, "program">;
  const edits: Edit[] = [];

  const types = resolveImportedTypes(rootNode);

  // Early exit if none of the relevant types are imported
  if (
    !types.locationAlias &&
    !types.addLocationResponseAlias &&
    !types.getLocationsResponseAlias
  ) {
    return null;
  }

  // Collect all candidates from different detection patterns
  const candidates: Candidate[] = [
    ...collectTypeAnnotatedCandidates(rootNode, types),
    ...collectAssertionCandidates(rootNode, types),
    ...collectReturnTypeCandidates(rootNode, types),
  ];

  // Deduplicate by node id
  const seen = new Set<number>();
  for (const { object, detection } of candidates) {
    if (seen.has(object.id())) continue;
    seen.add(object.id());

    if (hasSpread(object)) {
      recordMigration("skipped-spread", detection);
      continue;
    }
    if (hasEntityRef(object)) {
      recordMigration("skipped-existing", detection);
      continue;
    }

    const edit = buildEntityRefEdit(object);
    if (edit) {
      edits.push(edit);
      recordMigration("added", detection);
    }
  }

  return edits.length > 0 ? rootNode.commitEdits(edits) : null;
};

export default transform;
