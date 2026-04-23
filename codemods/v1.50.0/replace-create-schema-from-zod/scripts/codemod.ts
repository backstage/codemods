import type { Codemod, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { getImport, addImport } from "@jssg/utils/javascript/imports";
import { useMetricAtom } from "codemod:metrics";

const migrationMetric = useMetricAtom("replace-create-schema-from-zod");

const FRONTEND_API_SOURCE = "@backstage/frontend-plugin-api";

/**
 * Check if a config pair node is inside an extension API call expression.
 * Matches: createExtension(...), createExtensionBlueprint(...),
 *          SomeBlueprint.make(...), SomeBlueprint.override(...)
 */
function isInsideExtensionApiCall(node: SgNode<TSX>): boolean {
  // Walk up to find the containing call_expression via arguments
  return node.inside({
    rule: {
      kind: "arguments",
      inside: {
        kind: "call_expression",
        any: [
          {
            has: {
              field: "function",
              kind: "identifier",
              regex: "^(createExtension|createExtensionBlueprint)$",
            },
          },
          {
            has: {
              field: "function",
              kind: "member_expression",
              has: {
                field: "property",
                kind: "property_identifier",
                regex: "^(make|override)$",
              },
            },
          },
        ],
      },
    },
  });
}

/**
 * Find all `config: { schema: ... }` pairs inside extension API calls.
 * Only matches inside createExtension(...), createExtensionBlueprint(...),
 * .override(...), or .make(...) call expressions.
 * Returns the outer `config` pair node.
 */
function findConfigSchemaPairs(rootNode: SgNode<TSX>): SgNode<TSX>[] {
  const candidates = rootNode.findAll({
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

  return candidates.filter(isInsideExtensionApiCall);
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
 * Detect the indentation unit and base indent from a config pair node.
 * Returns { baseIndent, contentIndent } as whitespace strings.
 */
function detectIndent(configPair: SgNode<TSX>): {
  baseIndent: string;
  contentIndent: string;
} {
  const configCol = configPair.range().start.column;
  const baseIndent = " ".repeat(configCol);

  // Try to detect the indent unit from the schema child's column
  const configValue = configPair.field("value");
  if (configValue) {
    const schemaPair = findSchemaPair(configValue);
    if (schemaPair) {
      const schemaCol = schemaPair.range().start.column;
      const indentUnit = schemaCol - configCol;
      if (indentUnit > 0) {
        return {
          baseIndent,
          contentIndent: " ".repeat(configCol + indentUnit),
        };
      }
    }
  }

  // Fallback: assume 2-space indent unit
  return {
    baseIndent,
    contentIndent: " ".repeat(configCol + 2),
  };
}

/**
 * Given a `createSchemaFromZod(z => z.object({...}))` call node, extract the
 * inner object literal contents (the properties inside z.object({...})).
 * If the callback parameter is not named `z`, renames all references to `z`.
 */
function extractSchemaFromZodCallBody(
  callNode: SgNode<TSX>,
  baseIndent: string,
  contentIndent: string,
): string | null {
  // The call has arguments containing an arrow function: z => z.object({...})
  const arrowFn = callNode.find({ rule: { kind: "arrow_function" } });
  if (!arrowFn) return null;

  // Get the parameter name (could be 'z', 'zod', 'schema', etc.)
  const param = arrowFn.field("parameter");
  const paramName = param?.text() ?? "z";

  // The body of the arrow function should be a call to z.object({...})
  const body = arrowFn.field("body");
  if (!body) return null;

  // Find the object argument inside z.object(...)
  const objectArg = body.find({ rule: { kind: "object" } });
  if (!objectArg) return null;

  // If the param is not 'z', we need to rename references inside the object
  if (paramName !== "z") {
    // Find all identifiers matching the param name inside the object
    const paramRefs = objectArg.findAll({
      rule: {
        kind: "identifier",
        regex: `^${escapeRegex(paramName)}$`,
      },
    });

    if (paramRefs.length > 0) {
      const renameEdits: Edit[] = [];
      for (const ref of paramRefs) {
        renameEdits.push(ref.replace("z"));
      }
      const renamedText = objectArg.commitEdits(renameEdits);
      // Extract content from the renamed text (strip outer braces)
      return extractObjectContentFromText(renamedText, baseIndent, contentIndent);
    }
  }

  // Return the inner content of the object (without the braces)
  return extractObjectContent(objectArg, baseIndent, contentIndent);
}

/**
 * Extract and re-indent content from an object text string (already stringified).
 */
function extractObjectContentFromText(
  text: string,
  baseIndent: string,
  contentIndent: string,
): string {
  // Remove outer braces
  const inner = text.slice(1, -1);
  return reindentContent(inner, baseIndent, contentIndent);
}

/**
 * Extract the content between { and } of an object node, re-indented for
 * placement at the `configSchema` property level.
 */
function extractObjectContent(
  objectNode: SgNode<TSX>,
  baseIndent: string,
  contentIndent: string,
): string {
  const text = objectNode.text();
  // Remove outer braces
  const inner = text.slice(1, -1);
  return reindentContent(inner, baseIndent, contentIndent);
}

/**
 * Re-indent extracted content for placement at configSchema property level.
 * Uses detected indentation from the source.
 */
function reindentContent(
  inner: string,
  baseIndent: string,
  contentIndent: string,
): string {
  // Split into lines and re-indent
  const lines = inner.split("\n");
  if (lines.length <= 1) {
    // Single line: just trim
    return inner.trim() ? `\n${contentIndent}${inner.trim()},\n${baseIndent}` : "";
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

  // Re-indent: strip minIndent, add contentIndent
  const reindented: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim().length === 0) {
      if (i === 0 || i === lines.length - 1) continue;
      reindented.push("");
      continue;
    }
    const stripped = line.slice(minIndent);
    reindented.push(`${contentIndent}${stripped}`);
  }

  return `\n${reindented.join("\n")}\n${baseIndent}`;
}

/**
 * Process callback pattern fields: { field: z => z.type() }
 * Converts each arrow function value to a direct z.type() call.
 */
function processCallbackFields(
  schemaObject: SgNode<TSX>,
  contentIndent: string,
): string | null {
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

  return resultParts.join(`,\n${contentIndent}`);
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

const transform: Codemod<TSX> = async (root) => {
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

    // Detect indentation from the source config property
    const { baseIndent, contentIndent } = detectIndent(configPair);

    // Pattern 1: createSchemaFromZod(z => z.object({...}))
    if (schemaValue.is("call_expression")) {
      // Verify this is a call to createSchemaFromZod (or its alias)
      const callee = schemaValue.find({
        rule: {
          kind: "identifier",
          regex: `^${escapeRegex(schemaAlias)}$`,
        },
      });

      if (callee) {
        const innerContent = extractSchemaFromZodCallBody(
          schemaValue,
          baseIndent,
          contentIndent,
        );
        if (innerContent !== null) {
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

    // Pattern 2: { schema: { field: z => z.type(), ... } } (callback pattern)
    if (schemaValue.is("object")) {
      const callbackResult = processCallbackFields(schemaValue, contentIndent);
      if (callbackResult !== null) {
        edits.push(
          configPair.replace(
            `configSchema: {\n${contentIndent}${callbackResult},\n${baseIndent}}`,
          ),
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

  // --- Step 4: Flag remaining references to createSchemaFromZod ---
  // After removing the import, scan for any remaining identifiers matching
  // the symbol name (e.g., type annotations like ReturnType<typeof createSchemaFromZod>)
  if (hasSchemaImport && transformedAny) {
    const remainingRefs = rootNode.findAll({
      rule: {
        kind: "identifier",
        regex: `^${escapeRegex(schemaAlias)}$`,
        not: {
          inside: {
            kind: "import_specifier",
          },
        },
      },
    });

    // Track which statements we've already flagged to avoid duplicate comments
    const flaggedStmtPositions = new Set<number>();

    for (const refNode of remainingRefs) {
      // Skip references inside the config.schema patterns we already transformed
      if (refNode.inside({
        rule: {
          kind: "call_expression",
          has: {
            field: "function",
            kind: "identifier",
            regex: `^${escapeRegex(schemaAlias)}$`,
          },
        },
      })) {
        continue;
      }

      // Find the containing statement to add a comment before it
      const containingStmt = refNode.ancestors().find(
        (a) =>
          a.is("type_alias_declaration") ||
          a.is("variable_declaration") ||
          a.is("expression_statement") ||
          a.is("lexical_declaration"),
      );

      if (containingStmt) {
        const stmtStart = containingStmt.range().start.index;
        if (flaggedStmtPositions.has(stmtStart)) continue;
        flaggedStmtPositions.add(stmtStart);

        edits.push({
          startPos: stmtStart,
          endPos: stmtStart,
          insertedText:
            "// TODO: createSchemaFromZod was removed - update this type annotation\n",
        });
        migrationMetric.increment({
          pattern: "type-annotation-reference",
          outcome: "flagged",
        });
      }
    }
  }

  // Update zod import: 'zod' -> 'zod/v4' (unconditional — all files in scope)
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
        migrationMetric.increment({
          pattern: "zod-import",
          outcome: "auto-migrated",
        });
      }
    }
  } else if (needsZodImport) {
    // No existing zod import but we need one (config.schema was transformed)
    const edit = addImport(rootNode, {
      type: "named",
      specifiers: [{ name: "z" }],
      from: "zod/v4",
    });
    if (edit) edits.push(edit);
  }

  if (edits.length === 0) return null;

  return rootNode.commitEdits(edits);
};

export default transform;
