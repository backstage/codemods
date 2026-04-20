import type { Codemod, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { getImport } from "@jssg/utils/javascript/imports";
import { useMetricAtom } from "codemod:metrics";

const CATALOG_CLIENT_SOURCE = "@backstage/catalog-client";

const PLACEHOLDER_ENTITYREF = "'location:default/example'";
const TODO_COMMENT = "// TODO(backstage-codemod): replace with actual entityRef";

type Detection =
  | "type-annotation"
  | "array-type-annotation"
  | "as-cast"
  | "satisfies"
  | "array-as-cast"
  | "array-satisfies"
  | "add-location-response"
  | "get-locations-response"
  | "return-type-annotation";

type Outcome = "added" | "skipped-spread" | "skipped-existing";

const migrationMetric = useMetricAtom("location-entityref-migration");

function recordMigration(outcome: Outcome, detection: Detection): void {
  migrationMetric.increment({ outcome, detection });
}

function escapeRegex(str: string): string {
  return `^${str.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`;
}

interface ImportedTypes {
  locationAlias: string | null;
  addLocationResponseAlias: string | null;
  getLocationsResponseAlias: string | null;
}

function resolveImportedTypes(
  rootNode: SgNode<TSX, "program">,
): ImportedTypes {
  const location = getImport(rootNode, {
    type: "named",
    name: "Location",
    from: CATALOG_CLIENT_SOURCE,
  });
  const addLocationResponse = getImport(rootNode, {
    type: "named",
    name: "AddLocationResponse",
    from: CATALOG_CLIENT_SOURCE,
  });
  const getLocationsResponse = getImport(rootNode, {
    type: "named",
    name: "GetLocationsResponse",
    from: CATALOG_CLIENT_SOURCE,
  });

  return {
    locationAlias: location?.alias ?? null,
    addLocationResponseAlias: addLocationResponse?.alias ?? null,
    getLocationsResponseAlias: getLocationsResponse?.alias ?? null,
  };
}

/**
 * A candidate Location object literal, paired with the detection path so we
 * can distinguish metrics and guard against duplicates.
 */
interface Candidate {
  object: SgNode<TSX, "object">;
  detection: Detection;
}

/**
 * Given a `type_annotation` node, return the text of its type expression
 * stripped of the leading colon and whitespace.
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
 * Matches `Location[]` — i.e. an array_type whose element type is the given
 * identifier.
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
 * Extracts object literals from a value expression that may be an object,
 * parenthesized object, or an array whose elements are objects.
 */
function extractObjectsFromValue(
  valueNode: SgNode<TSX>,
  arrayMode: boolean,
): SgNode<TSX, "object">[] {
  const objects: SgNode<TSX, "object">[] = [];

  if (arrayMode) {
    if (valueNode.kind() !== "array") return objects;
    for (const child of valueNode.children()) {
      if (child.kind() === "object") {
        objects.push(child as SgNode<TSX, "object">);
      }
    }
    return objects;
  }

  if (valueNode.kind() === "object") {
    objects.push(valueNode as SgNode<TSX, "object">);
  } else if (valueNode.kind() === "parenthesized_expression") {
    const inner = valueNode.children().find((c) => c.kind() === "object");
    if (inner) objects.push(inner as SgNode<TSX, "object">);
  }

  return objects;
}

/**
 * Walks the given container looking for property assignments whose key matches
 * one of `propertyNames` and whose value is an object literal. Used to recurse
 * into `AddLocationResponse.location` and `GetLocationsResponse[].data`.
 */
function findPropertyObjectValues(
  container: SgNode<TSX>,
  propertyNames: string[],
): SgNode<TSX, "object">[] {
  const objects: SgNode<TSX, "object">[] = [];
  const nameRegex = `^(${propertyNames.map((n) => n).join("|")})$`;

  const pairs = container.findAll({
    rule: {
      kind: "pair",
      has: {
        field: "key",
        any: [
          { kind: "property_identifier", regex: nameRegex },
          {
            kind: "string",
            has: { kind: "string_fragment", regex: nameRegex },
          },
        ],
      },
    },
  });

  for (const pair of pairs) {
    const value = pair.field("value");
    if (!value) continue;
    if (value.kind() === "object") {
      objects.push(value as SgNode<TSX, "object">);
    }
  }

  return objects;
}

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
      has: { field: "type", kind: "type_annotation" },
    },
  });

  for (const decl of declarators) {
    const typeAnnotation = decl.field("type");
    if (!typeAnnotation) continue;
    const typeNode = typeAnnotationTypeNode(typeAnnotation);
    if (!typeNode) continue;

    const value = decl.field("value");
    if (!value) continue;

    if (locationAlias) {
      if (isTypeIdentifierNamed(typeNode, locationAlias)) {
        for (const obj of extractObjectsFromValue(value, false)) {
          candidates.push({ object: obj, detection: "type-annotation" });
        }
        continue;
      }
      if (
        isArrayOfType(typeNode, locationAlias) ||
        isGenericArrayOfType(typeNode, locationAlias)
      ) {
        for (const obj of extractObjectsFromValue(value, true)) {
          candidates.push({ object: obj, detection: "array-type-annotation" });
        }
        continue;
      }
    }

    if (
      addLocationResponseAlias &&
      isTypeIdentifierNamed(typeNode, addLocationResponseAlias)
    ) {
      for (const obj of findPropertyObjectValues(value, ["location"])) {
        candidates.push({ object: obj, detection: "add-location-response" });
      }
      continue;
    }

    if (
      getLocationsResponseAlias &&
      isTypeIdentifierNamed(typeNode, getLocationsResponseAlias)
    ) {
      for (const obj of findPropertyObjectValues(value, ["data"])) {
        candidates.push({ object: obj, detection: "get-locations-response" });
      }
      continue;
    }
  }

  return candidates;
}

function collectAssertionCandidates(
  rootNode: SgNode<TSX, "program">,
  types: ImportedTypes,
): Candidate[] {
  const { locationAlias, addLocationResponseAlias, getLocationsResponseAlias } =
    types;
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

    if (locationAlias) {
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

    if (
      addLocationResponseAlias &&
      isTypeIdentifierNamed(typeNode, addLocationResponseAlias) &&
      valueNode.kind() === "object"
    ) {
      for (const obj of findPropertyObjectValues(valueNode, ["location"])) {
        candidates.push({ object: obj, detection: "add-location-response" });
      }
      continue;
    }

    if (
      getLocationsResponseAlias &&
      isTypeIdentifierNamed(typeNode, getLocationsResponseAlias)
    ) {
      const container = valueNode;
      for (const obj of findPropertyObjectValues(container, ["data"])) {
        candidates.push({ object: obj, detection: "get-locations-response" });
      }
      continue;
    }
  }

  return candidates;
}

function collectReturnTypeCandidates(
  rootNode: SgNode<TSX, "program">,
  types: ImportedTypes,
): Candidate[] {
  const { locationAlias } = types;
  if (!locationAlias) return [];
  const candidates: Candidate[] = [];

  const typedFunctions = rootNode.findAll({
    rule: {
      any: [
        { kind: "function_declaration" },
        { kind: "arrow_function" },
        { kind: "function_expression" },
        { kind: "method_definition" },
      ],
      has: {
        field: "return_type",
        kind: "type_annotation",
        has: { kind: "type_identifier", regex: escapeRegex(locationAlias) },
      },
    },
  });

  for (const fn of typedFunctions) {
    const typeAnnotation = fn.field("return_type");
    if (!typeAnnotation) continue;
    const typeNode = typeAnnotationTypeNode(typeAnnotation);
    if (!typeNode || !isTypeIdentifierNamed(typeNode, locationAlias)) continue;

    const body = fn.field("body");
    if (!body) continue;

    if (body.kind() === "object") {
      candidates.push({
        object: body as SgNode<TSX, "object">,
        detection: "return-type-annotation",
      });
      continue;
    }
    if (body.kind() === "parenthesized_expression") {
      const inner = body.children().find((c) => c.kind() === "object");
      if (inner) {
        candidates.push({
          object: inner as SgNode<TSX, "object">,
          detection: "return-type-annotation",
        });
      }
      continue;
    }
    if (body.kind() === "statement_block") {
      const returns = body.findAll({ rule: { kind: "return_statement" } });
      for (const ret of returns) {
        const ancestors = ret.ancestors();
        const enclosing = ancestors.find((a) =>
          a.kind() === "function_declaration" ||
          a.kind() === "arrow_function" ||
          a.kind() === "function_expression" ||
          a.kind() === "method_definition",
        );
        if (enclosing && enclosing.id() !== fn.id()) continue;

        const directObj = ret.children().find((c) => c.kind() === "object");
        if (directObj) {
          candidates.push({
            object: directObj as SgNode<TSX, "object">,
            detection: "return-type-annotation",
          });
          continue;
        }
        const paren = ret
          .children()
          .find((c) => c.kind() === "parenthesized_expression");
        if (paren) {
          const inner = paren.children().find((c) => c.kind() === "object");
          if (inner) {
            candidates.push({
              object: inner as SgNode<TSX, "object">,
              detection: "return-type-annotation",
            });
          }
        }
      }
    }
  }

  return candidates;
}

function hasSpreadElement(object: SgNode<TSX, "object">): boolean {
  return object.children().some((c) => c.kind() === "spread_element");
}

function hasEntityRefProperty(object: SgNode<TSX, "object">): boolean {
  const directPairs = object.children().filter((c) => c.kind() === "pair");
  for (const pair of directPairs) {
    const key = pair.field("key");
    if (!key) continue;
    const name =
      key.kind() === "property_identifier"
        ? key.text()
        : key.kind() === "string"
          ? key.find({ rule: { kind: "string_fragment" } })?.text() ?? ""
          : "";
    if (name === "entityRef") return true;
  }
  return false;
}

function leadingIndentFor(
  node: SgNode<TSX>,
  source: string,
): { indent: string; onOwnLine: boolean } {
  const start = node.range().start.index;
  let i = start;
  while (i > 0 && source[i - 1] !== "\n") i--;
  const indent = source.slice(i, start);
  const onOwnLine = i !== start && /^[ \t]*$/.test(indent);
  return { indent, onOwnLine };
}

function buildEntityRefEdit(
  object: SgNode<TSX, "object">,
  source: string,
): Edit | null {
  const directChildren = object.children();
  const directPairs = directChildren.filter((c) => c.kind() === "pair");
  if (directPairs.length === 0) return null;

  const lastPair = directPairs[directPairs.length - 1];
  if (!lastPair) return null;
  const lastPairEnd = lastPair.range().end.index;

  let trailingCommaEnd: number | null = null;
  const lastPairIndex = directChildren.indexOf(lastPair);
  for (let idx = lastPairIndex + 1; idx < directChildren.length; idx++) {
    const sibling = directChildren[idx];
    if (!sibling) break;
    if (sibling.text() === ",") {
      trailingCommaEnd = sibling.range().end.index;
    }
    break;
  }

  const objectText = object.text();
  const isMultiLine = objectText.includes("\n");
  const { indent, onOwnLine } = leadingIndentFor(lastPair, source);

  const newField = `entityRef: ${PLACEHOLDER_ENTITYREF}, ${TODO_COMMENT}`;

  let insertAt: number;
  let insertedText: string;

  if (trailingCommaEnd !== null) {
    insertAt = trailingCommaEnd;
    insertedText =
      isMultiLine && onOwnLine ? `\n${indent}${newField}` : ` ${newField}`;
  } else {
    insertAt = lastPairEnd;
    insertedText =
      isMultiLine && onOwnLine ? `,\n${indent}${newField}` : `, ${newField}`;
  }

  return {
    startPos: insertAt,
    endPos: insertAt,
    insertedText,
  };
}

function processCandidates(
  candidates: Candidate[],
  source: string,
  edits: Edit[],
): void {
  const seen = new Set<number>();

  for (const { object, detection } of candidates) {
    const id = object.id();
    if (seen.has(id)) continue;
    seen.add(id);

    if (hasSpreadElement(object)) {
      recordMigration("skipped-spread", detection);
      continue;
    }
    if (hasEntityRefProperty(object)) {
      recordMigration("skipped-existing", detection);
      continue;
    }

    const edit = buildEntityRefEdit(object, source);
    if (!edit) continue;

    edits.push(edit);
    recordMigration("added", detection);
  }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root() as SgNode<TSX, "program">;

  const types = resolveImportedTypes(rootNode);
  if (
    !types.locationAlias &&
    !types.addLocationResponseAlias &&
    !types.getLocationsResponseAlias
  ) {
    return null;
  }

  const source = rootNode.text();
  const edits: Edit[] = [];

  const candidates: Candidate[] = [
    ...collectTypeAnnotatedCandidates(rootNode, types),
    ...collectAssertionCandidates(rootNode, types),
    ...collectReturnTypeCandidates(rootNode, types),
  ];

  processCandidates(candidates, source, edits);

  return edits.length > 0 ? rootNode.commitEdits(edits) : null;
};

export default transform;
