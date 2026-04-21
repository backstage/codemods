import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { getImport, addImport, removeImport } from "@jssg/utils/javascript/imports";
import { useMetricAtom } from "codemod:metrics";

const migrationMetric = useMetricAtom("replace-create-schema-from-zod");

const FRONTEND_API_SOURCE = "@backstage/frontend-plugin-api";

/**
 * Find all `config: { schema: ... }` pairs inside any object literal.
 * Returns the outer `config` pair node.
 */
function findConfigSchemaPairs(rootNode: SgNode<TSX>): SgNode<TSX>[] {
  return rootNode.findAll({
    rule: {
      kind: "pair",
      all: [
        {
          has: {
            field: "key",
            kind: "property_identifier",
            regex: "^config$",
          },
        },
        {
          has: {
            field: "value",
            kind: "object",
            has: {
              kind: "pair",
              has: {
                field: "key",
                kind: "property_identifier",
                regex: "^schema$",
              },
            },
          },
        },
      ],
    },
  });
}

/**
 * Find the `schema` pair inside a config object.
 */
function findSchemaPair(configValue: SgNode<TSX>): SgNode<TSX> | null {
  return configValue.find({
    rule: {
      kind: "pair",
      has: {
        field: "key",
        kind: "property_identifier",
        regex: "^schema$",
      },
    },
  });
}

/**
 * Given a `createSchemaFromZod(z => z.object({...}))` call node, extract the
 * inner object literal contents (the properties inside z.object({...})).
 */
function extractSchemaFromZodCallBody(
  callNode: SgNode<TSX>,
): string | null {
  // The call has arguments containing an arrow function: z => z.object({...})
  const arrowFn = callNode.find({ rule: { kind: "arrow_function" } });
  if (!arrowFn) return null;

  // The body of the arrow function should be a call to z.object({...})
  const body = arrowFn.field("body");
  if (!body) return null;

  // Find the object argument inside z.object(...)
  const objectArg = body.find({ rule: { kind: "object" } });
  if (!objectArg) return null;

  // Return the inner content of the object (without the braces)
  return extractObjectContent(objectArg);
}

/**
 * Extract the content between { and } of an object node, re-indented for
 * placement at the `configSchema` property level (2-space base indent).
 */
function extractObjectContent(objectNode: SgNode<TSX>): string {
  const text = objectNode.text();
  // Remove outer braces
  const inner = text.slice(1, -1);

  // Split into lines and re-indent
  const lines = inner.split("\n");
  if (lines.length <= 1) {
    // Single line: just trim
    return inner.trim() ? `\n    ${inner.trim()},\n  ` : "";
  }

  // Find the minimum indentation of non-empty lines (skip the first which is often empty)
  let minIndent = Infinity;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim().length === 0) continue;
    const leadingSpaces = line.length - line.trimStart().length;
    if (leadingSpaces < minIndent) {
      minIndent = leadingSpaces;
    }
  }

  if (minIndent === Infinity) minIndent = 0;

  // Re-indent: strip minIndent, add 4 spaces (for configSchema property level)
  const reindented: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim().length === 0) {
      if (i === 0 || i === lines.length - 1) continue;
      reindented.push("");
      continue;
    }
    const stripped = line.slice(minIndent);
    reindented.push(`    ${stripped}`);
  }

  return `\n${reindented.join("\n")}\n  `;
}

/**
 * Process callback pattern fields: { field: z => z.type() }
 * Converts each arrow function value to a direct z.type() call.
 */
function processCallbackFields(schemaObject: SgNode<TSX>): string | null {
  const pairs = schemaObject.findAll({
    rule: { kind: "pair" },
  });

  if (pairs.length === 0) return null;

  // Check if any pair has an arrow function value (callback pattern)
  let hasCallbackPattern = false;
  for (const pair of pairs) {
    const value = pair.field("value");
    if (value && value.is("arrow_function")) {
      hasCallbackPattern = true;
      break;
    }
  }

  if (!hasCallbackPattern) return null;

  // Build the replacement: for each pair, if value is arrow fn z => expr,
  // replace with just expr (substituting the param with `z`)
  const resultParts: string[] = [];
  for (const pair of pairs) {
    const key = pair.field("key");
    const value = pair.field("value");
    if (!key || !value) continue;

    if (value.is("arrow_function")) {
      const param = value.field("parameter");
      const body = value.field("body");
      if (!param || !body) continue;

      const paramName = param.text();
      let bodyText = body.text();

      // If the parameter name isn't 'z', replace it with 'z'
      if (paramName !== "z") {
        bodyText = replaceParamInBody(body, paramName);
      }

      resultParts.push(`${key.text()}: ${bodyText}`);
    } else {
      // Keep non-arrow-function values as-is
      resultParts.push(pair.text());
    }
  }

  return resultParts.join(",\n    ");
}

/**
 * Replace a parameter name in an arrow function body.
 * Uses AST to find identifier references to the param.
 */
function replaceParamInBody(body: SgNode<TSX>, paramName: string): string {
  const identifiers = body.findAll({
    rule: {
      kind: "identifier",
      regex: `^${escapeRegex(paramName)}$`,
    },
  });

  if (identifiers.length === 0) return body.text();

  const edits: Edit[] = [];
  for (const id of identifiers) {
    edits.push(id.replace("z"));
  }

  return body.commitEdits(edits);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rebuild a named import statement, removing specific specifiers.
 */
function rebuildImportWithout(
  importStmt: SgNode<TSX>,
  specifiersToRemove: Set<string>,
): string {
  const specifiers = importStmt.findAll({
    rule: { kind: "import_specifier" },
  });

  const remaining: string[] = [];
  for (const spec of specifiers) {
    const identifiers = spec.findAll({ rule: { kind: "identifier" } });
    const importedName = identifiers[0]?.text();
    if (importedName && !specifiersToRemove.has(importedName)) {
      remaining.push(spec.text());
    }
  }

  if (remaining.length === 0) return "";

  const sourceNode = importStmt.find({ rule: { kind: "string" } });
  const sourceText = sourceNode?.text() ?? "";

  // Check for type-only import
  const isTypeOnly = importStmt
    .children()
    .some((c) => c.text() === "type" && c.kind() !== "import_clause");

  const typeKw = isTypeOnly ? "type " : "";

  if (remaining.length <= 2) {
    return `import ${typeKw}{ ${remaining.join(", ")} } from ${sourceText};`;
  }
  return `import ${typeKw}{\n  ${remaining.join(",\n  ")},\n} from ${sourceText};`;
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root() as SgNode<TSX, "program">;
  const edits: Edit[] = [];

  // --- Step 1: Detect createSchemaFromZod import ---
  const schemaImport = getImport(rootNode, {
    type: "named",
    name: "createSchemaFromZod",
    from: FRONTEND_API_SOURCE,
  });

  const schemaAlias = schemaImport?.alias ?? "createSchemaFromZod";
  const hasSchemaImport = schemaImport !== null;

  // --- Step 2: Find all config.schema patterns and transform them ---
  let needsZodImport = false;
  let transformedAny = false;

  // Find all `config: { schema: ... }` pairs
  const configPairs = findConfigSchemaPairs(rootNode);

  for (const configPair of configPairs) {
    const configValue = configPair.field("value");
    if (!configValue || !configValue.is("object")) continue;

    const schemaPair = findSchemaPair(configValue);
    if (!schemaPair) continue;

    const schemaValue = schemaPair.field("value");
    if (!schemaValue) continue;

    // Pattern 1: createSchemaFromZod(z => z.object({...}))
    if (schemaValue.is("call_expression")) {
      // Verify this is a call to createSchemaFromZod (or its alias)
      const callee = schemaValue.find({
        rule: {
          kind: "identifier",
          regex: `^${escapeRegex(schemaAlias)}$`,
        },
      });

      if (callee || !hasSchemaImport) {
        // Only process if it's the right function call
        if (callee) {
          const innerContent = extractSchemaFromZodCallBody(schemaValue);
          if (innerContent !== null) {
            // Replace the entire `config: { schema: createSchemaFromZod(...) }`
            // with `configSchema: { innerContent }`
            const trimmedContent = innerContent.trim();

            // Re-indent: the inner content from z.object({...}) needs to be
            // placed at the configSchema level
            edits.push(configPair.replace(`configSchema: {${innerContent}}`));
            needsZodImport = true;
            transformedAny = true;
            migrationMetric.increment({
              pattern: "createSchemaFromZod",
              outcome: "auto-migrated",
            });
          }
        }
      }
    }

    // Pattern 2: { schema: { field: z => z.type(), ... } } (callback pattern)
    if (schemaValue.is("object")) {
      const callbackResult = processCallbackFields(schemaValue);
      if (callbackResult !== null) {
        edits.push(
          configPair.replace(`configSchema: {\n    ${callbackResult},\n  }`),
        );
        needsZodImport = true;
        transformedAny = true;
        migrationMetric.increment({
          pattern: "callback",
          outcome: "auto-migrated",
        });
      }
    }
  }

  // --- Step 3: Handle imports ---

  // Remove createSchemaFromZod from the import if it was present
  if (hasSchemaImport && transformedAny) {
    // Find the import statement directly to do a structural rewrite
    const importStatements = rootNode.findAll({
      rule: {
        kind: "import_statement",
        has: {
          kind: "string",
          has: {
            kind: "string_fragment",
            regex: `^${escapeRegex(FRONTEND_API_SOURCE)}$`,
          },
        },
      },
    });

    for (const importStmt of importStatements) {
      const specifiers = importStmt.findAll({
        rule: { kind: "import_specifier" },
      });

      // Check if this import contains createSchemaFromZod
      let hasSchemaSpecifier = false;
      for (const spec of specifiers) {
        const identifiers = spec.findAll({ rule: { kind: "identifier" } });
        const importedName = identifiers[0]?.text();
        if (importedName === "createSchemaFromZod") {
          hasSchemaSpecifier = true;
          break;
        }
      }

      if (!hasSchemaSpecifier) continue;

      if (specifiers.length === 1) {
        // Only createSchemaFromZod, remove the whole import line (and trailing newline)
        const startPos = importStmt.range().start.index;
        const endPos = importStmt.range().end.index;
        // Consume the trailing newline if present
        const fullText = rootNode.text();
        const adjustedEnd =
          endPos < fullText.length && fullText[endPos] === "\n"
            ? endPos + 1
            : endPos;
        edits.push({
          startPos,
          endPos: adjustedEnd,
          insertedText: "",
        });
      } else {
        // Rebuild without createSchemaFromZod
        const rebuilt = rebuildImportWithout(
          importStmt,
          new Set(["createSchemaFromZod"]),
        );
        edits.push(importStmt.replace(rebuilt));
      }
    }
  }

  // Update zod import: 'zod' -> 'zod/v4'
  if (needsZodImport || transformedAny) {
    // Find existing zod import
    const zodImportStatements = rootNode.findAll({
      rule: {
        kind: "import_statement",
        has: {
          kind: "string",
          has: {
            kind: "string_fragment",
            regex: "^zod$",
          },
        },
      },
    });

    if (zodImportStatements.length > 0) {
      // Replace 'zod' with 'zod/v4'
      for (const zodImport of zodImportStatements) {
        const stringFragment = zodImport.find({
          rule: { kind: "string_fragment", regex: "^zod$" },
        });
        if (stringFragment) {
          edits.push(stringFragment.replace("zod/v4"));
        }
      }
    } else {
      // No existing zod import, add one
      const edit = addImport(rootNode, {
        type: "named",
        specifiers: [{ name: "z" }],
        from: "zod/v4",
      });
      if (edit) edits.push(edit);
    }
  }

  if (edits.length === 0) return null;

  return rootNode.commitEdits(edits);
};

export default transform;
