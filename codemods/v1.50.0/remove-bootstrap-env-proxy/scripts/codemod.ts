import type { Codemod, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { getImport } from "@jssg/utils/javascript/imports";
import { useMetricAtom } from "codemod:metrics";

const CLI_COMMON_SOURCE = "@backstage/cli-common";
const FUNCTION_NAME = "bootstrapEnvProxyAgents";

const TODO_SIMPLE =
  "// TODO(backstage-codemod): Set NODE_USE_ENV_PROXY=1 in your environment alongside HTTP_PROXY/HTTPS_PROXY";
const TODO_CUSTOM_ARGS =
  "// TODO(backstage-codemod): Custom proxy arguments detected — NODE_USE_ENV_PROXY=1 only reads from process.env. Review your proxy configuration.";

const migrationMetric = useMetricAtom("remove-bootstrap-env-proxy");

function escapeRegex(str: string): string {
  return `^${str.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`;
}

/**
 * Check whether a call_expression node has any real (non-comment) arguments.
 */
function callHasArguments(callNode: SgNode<TSX>): boolean {
  const args = callNode.find({ rule: { kind: "arguments" } });
  if (!args) return false;
  return args.children().filter((c) => c.isNamed() && !c.is("comment")).length > 0;
}

/**
 * Find all import_statement nodes that import from a given source.
 */
function findImportStatementsFrom(
  rootNode: SgNode<TSX>,
  source: string,
): SgNode<TSX, "import_statement">[] {
  return rootNode.findAll({
    rule: {
      kind: "import_statement",
      has: {
        kind: "string",
        has: {
          kind: "string_fragment",
          regex: escapeRegex(source),
        },
      },
    },
  }) as SgNode<TSX, "import_statement">[];
}

/**
 * Find all export_statement nodes that re-export from a given source.
 */
function findExportStatementsFrom(
  rootNode: SgNode<TSX>,
  source: string,
): SgNode<TSX, "export_statement">[] {
  return rootNode.findAll({
    rule: {
      kind: "export_statement",
      has: {
        kind: "string",
        has: {
          kind: "string_fragment",
          regex: escapeRegex(source),
        },
      },
    },
  }) as SgNode<TSX, "export_statement">[];
}

interface SpecifierInfo {
  importedName: string;
  localName: string;
  specText: string;
}

function extractSpecifiers(
  node: SgNode<TSX>,
  specifierKind: "import_specifier" | "export_specifier",
): SpecifierInfo[] {
  const specifiers = node.findAll({ rule: { kind: specifierKind } });
  const result: SpecifierInfo[] = [];

  for (const spec of specifiers) {
    const identifiers = spec.findAll({ rule: { kind: "identifier" } });
    const importedNameNode = identifiers[0];
    if (!importedNameNode) continue;
    const importedName = importedNameNode.text();

    const localNameNode = identifiers[1] ?? importedNameNode;
    const localName = localNameNode.text();

    result.push({
      importedName,
      localName,
      specText: spec.text(),
    });
  }

  return result;
}

function buildNamedStatement(
  keyword: "import" | "export",
  specTexts: string[],
  source: string,
): string {
  if (specTexts.length <= 2) {
    return `${keyword} { ${specTexts.join(", ")} } from '${source}';`;
  }
  return `${keyword} {\n  ${specTexts.join(",\n  ")},\n} from '${source}';`;
}

/**
 * Handle namespace imports: `import * as alias from '@backstage/cli-common'`
 * Finds `alias.bootstrapEnvProxyAgents()` calls and removes them.
 */
function handleNamespaceImport(rootNode: SgNode<TSX>): Edit[] {
  const edits: Edit[] = [];

  // Find namespace imports from @backstage/cli-common
  const importStatements = findImportStatementsFrom(rootNode, CLI_COMMON_SOURCE);

  for (const importStmt of importStatements) {
    const nsImport = importStmt.find({ rule: { kind: "namespace_import" } });
    if (!nsImport) continue;

    // Extract the alias identifier (e.g., "cliCommon" from `import * as cliCommon`)
    const aliasNode = nsImport.find({ rule: { kind: "identifier" } });
    if (!aliasNode) continue;

    const alias = aliasNode.text();

    // Find all expression_statement nodes containing call_expression with
    // member_expression: alias.bootstrapEnvProxyAgents(...)
    const callStatements = rootNode.findAll({
      rule: {
        kind: "expression_statement",
        has: {
          kind: "call_expression",
          has: {
            field: "function",
            kind: "member_expression",
            all: [
              {
                has: {
                  field: "object",
                  kind: "identifier",
                  regex: escapeRegex(alias),
                },
              },
              {
                has: {
                  field: "property",
                  kind: "property_identifier",
                  regex: escapeRegex(FUNCTION_NAME),
                },
              },
            ],
          },
        },
      },
    });

    if (callStatements.length === 0) continue;

    // Determine if any call has arguments (for the TODO message)
    const hasCustomArgs = callStatements.some((callStmt) => {
      const callExpr = callStmt.find({ rule: { kind: "call_expression" } });
      return callExpr ? callHasArguments(callExpr) : false;
    });

    const todoComment = hasCustomArgs ? TODO_CUSTOM_ARGS : TODO_SIMPLE;

    // Check whether the namespace alias is used anywhere else in the file
    const allAliasUsages = rootNode.findAll({
      rule: { kind: "identifier", regex: escapeRegex(alias) },
    });
    // Subtract usages in the import statement itself and in the call statements being removed
    const importIdentifiers = importStmt.findAll({
      rule: { kind: "identifier", regex: escapeRegex(alias) },
    });
    const callIdentifiers = callStatements.flatMap((cs) =>
      cs.findAll({ rule: { kind: "identifier", regex: escapeRegex(alias) } }),
    );
    const externalUsageCount =
      allAliasUsages.length -
      importIdentifiers.length -
      callIdentifiers.length;

    const namespaceIsOnlyUsedForTarget = externalUsageCount === 0;

    // Replace the first call statement with the TODO comment
    const source = rootNode.text();
    for (let i = 0; i < callStatements.length; i++) {
      const callStmt = callStatements[i];
      if (!callStmt) continue;
      const range = callStmt.range();
      let endPos = range.end.index;

      // Consume trailing newline if present
      if (source[endPos] === "\n") {
        endPos += 1;
      }

      if (i === 0) {
        // Replace first call with TODO comment
        edits.push({
          startPos: range.start.index,
          endPos,
          insertedText: `${todoComment}\n`,
        });
      } else {
        // Remove subsequent calls
        edits.push({
          startPos: range.start.index,
          endPos,
          insertedText: "",
        });
      }

      migrationMetric.increment({
        action: "namespace-call-removed",
        hadArguments: hasCustomArgs ? "yes" : "no",
      });
    }

    // If the namespace alias has no other usages, remove the import statement too
    if (namespaceIsOnlyUsedForTarget) {
      const importRange = importStmt.range();
      let importEndPos = importRange.end.index;

      // Consume trailing newline if present
      if (source[importEndPos] === "\n") {
        importEndPos += 1;
      }
      // Consume blank line after import if present
      if (source[importEndPos] === "\n") {
        importEndPos += 1;
      }

      edits.push({
        startPos: importRange.start.index,
        endPos: importEndPos,
        insertedText: "",
      });
    }
  }

  return edits;
}

/**
 * Handle dynamic imports: `const { bootstrapEnvProxyAgents } = await import('@backstage/cli-common')`
 * Finds the destructured binding and subsequent calls, removes both.
 */
function handleDynamicImport(rootNode: SgNode<TSX>): Edit[] {
  const edits: Edit[] = [];
  const source = rootNode.text();

  // Match dynamic imports with the target in the object_pattern — either as
  // shorthand `{ bootstrapEnvProxyAgents }` or aliased `{ bootstrapEnvProxyAgents: alias }`
  const awaitImportRule = {
    field: "value" as const,
    kind: "await_expression" as const,
    has: {
      kind: "call_expression" as const,
      has: {
        kind: "arguments" as const,
        has: {
          kind: "string" as const,
          has: {
            kind: "string_fragment" as const,
            regex: escapeRegex(CLI_COMMON_SOURCE),
          },
        },
      },
    },
  };

  // Match shorthand: `{ bootstrapEnvProxyAgents }`
  const shorthandDecls = rootNode.findAll({
    rule: {
      kind: "lexical_declaration",
      has: {
        kind: "variable_declarator",
        all: [
          {
            has: {
              field: "name",
              kind: "object_pattern",
              has: {
                kind: "shorthand_property_identifier_pattern",
                regex: escapeRegex(FUNCTION_NAME),
              },
            },
          },
          { has: awaitImportRule },
        ],
      },
    },
  });

  // Match aliased: `{ bootstrapEnvProxyAgents: alias }`
  const aliasedDecls = rootNode.findAll({
    rule: {
      kind: "lexical_declaration",
      has: {
        kind: "variable_declarator",
        all: [
          {
            has: {
              field: "name",
              kind: "object_pattern",
              has: {
                kind: "pair_pattern",
                has: {
                  field: "key",
                  kind: "property_identifier",
                  regex: escapeRegex(FUNCTION_NAME),
                },
              },
            },
          },
          { has: awaitImportRule },
        ],
      },
    },
  });

  const dynamicImportDecls = [...shorthandDecls, ...aliasedDecls];

  for (const decl of dynamicImportDecls) {
    // Check if bootstrapEnvProxyAgents is the only destructured binding
    const varDeclarator = decl.find({ rule: { kind: "variable_declarator" } });
    if (!varDeclarator) continue;

    const objectPattern = varDeclarator.find({
      rule: { kind: "object_pattern" },
    });
    if (!objectPattern) continue;

    // Count all bindings: shorthand + pair_pattern
    const shorthandBindings = objectPattern.findAll({
      rule: { kind: "shorthand_property_identifier_pattern" },
    });
    const pairBindings = objectPattern.findAll({
      rule: { kind: "pair_pattern" },
    });
    const totalBindings = shorthandBindings.length + pairBindings.length;

    const hasOnlyTarget = totalBindings === 1;

    // Determine the local name used for the destructured binding
    // Shorthand: `{ bootstrapEnvProxyAgents }` -> localName = "bootstrapEnvProxyAgents"
    // Aliased:   `{ bootstrapEnvProxyAgents: setup }` -> localName = "setup"
    let localName = FUNCTION_NAME;

    // Check for aliased pair_pattern: `{ bootstrapEnvProxyAgents: alias }`
    const pairPattern = objectPattern.find({
      rule: {
        kind: "pair_pattern",
        has: {
          field: "key",
          kind: "property_identifier",
          regex: escapeRegex(FUNCTION_NAME),
        },
      },
    });
    if (pairPattern) {
      // The pair_pattern children are: property_identifier (key), ":", identifier (value)
      const valueNode = pairPattern.find({ rule: { kind: "identifier" } });
      if (valueNode) {
        localName = valueNode.text();
      }
    }

    // Find call statements using the destructured binding
    const callStatements = rootNode.findAll({
      rule: {
        kind: "expression_statement",
        has: {
          kind: "call_expression",
          has: {
            field: "function",
            kind: "identifier",
            regex: escapeRegex(localName),
          },
        },
      },
    });

    // Determine if any call has arguments
    const hasCustomArgs = callStatements.some((callStmt) => {
      const callExpr = callStmt.find({ rule: { kind: "call_expression" } });
      return callExpr ? callHasArguments(callExpr) : false;
    });

    const todoComment = hasCustomArgs ? TODO_CUSTOM_ARGS : TODO_SIMPLE;

    // Remove the dynamic import declaration
    const declRange = decl.range();
    let declStartPos = declRange.start.index;
    let declEndPos = declRange.end.index;

    // Consume leading whitespace on the same line
    while (declStartPos > 0 && source[declStartPos - 1] === " ") {
      declStartPos -= 1;
    }

    // Consume trailing newline if present
    if (source[declEndPos] === "\n") {
      declEndPos += 1;
    }

    // Capture the indentation for the TODO comment
    const indent = source.substring(declStartPos, declRange.start.index);

    if (hasOnlyTarget) {
      // Remove entire declaration, replace with TODO
      edits.push({
        startPos: declStartPos,
        endPos: declEndPos,
        insertedText: `${indent}${todoComment}\n`,
      });
    } else {
      // TODO: handle mixed destructuring (remove only the target binding)
      // For now, add the TODO before the declaration
      edits.push({
        startPos: declStartPos,
        endPos: declStartPos,
        insertedText: `${indent}${todoComment}\n`,
      });
    }

    // Remove call statements
    for (const callStmt of callStatements) {
      const range = callStmt.range();
      let startPos = range.start.index;
      let endPos = range.end.index;

      // Consume leading whitespace on the same line
      while (startPos > 0 && source[startPos - 1] === " ") {
        startPos -= 1;
      }

      // Consume trailing newline if present
      if (source[endPos] === "\n") {
        endPos += 1;
      }
      edits.push({
        startPos,
        endPos,
        insertedText: "",
      });
    }

    migrationMetric.increment({ action: "dynamic-import-removed" });
  }

  return edits;
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  // --- Step 1: Find the import of bootstrapEnvProxyAgents ---
  const imp = getImport(rootNode, {
    type: "named",
    name: FUNCTION_NAME,
    from: CLI_COMMON_SOURCE,
  });

  if (!imp) {
    // No static import found -- try dynamic import patterns and re-exports
    const dynEdits = handleDynamicImport(rootNode);
    const reExportEdits = processReExports(rootNode);
    const allEdits = [...dynEdits, ...reExportEdits];
    if (allEdits.length === 0) return null;
    return rootNode.commitEdits(allEdits);
  }

  // --- Namespace import: `import * as alias from '@backstage/cli-common'` ---
  if (imp.isNamespace) {
    const nsEdits = handleNamespaceImport(rootNode);
    const reExportEdits = processReExports(rootNode);
    const allEdits = [...nsEdits, ...reExportEdits];
    if (allEdits.length === 0) return null;
    return rootNode.commitEdits(allEdits);
  }

  // --- Dynamic import: `const { bootstrapEnvProxyAgents } = await import(...)` ---
  // getImport matches dynamic imports but the existing import_statement-based
  // handling won't find them. Check if there's actually a static import_statement.
  const staticImports = findImportStatementsFrom(rootNode, CLI_COMMON_SOURCE);
  const hasStaticNamedImport = staticImports.some((stmt) => {
    const specifiers = extractSpecifiers(stmt, "import_specifier");
    return specifiers.some((s) => s.importedName === FUNCTION_NAME);
  });

  if (!hasStaticNamedImport) {
    // getImport found it but there's no static import_statement -- must be dynamic
    const dynEdits = handleDynamicImport(rootNode);
    const reExportEdits = processReExports(rootNode);
    const allEdits = [...dynEdits, ...reExportEdits];
    if (allEdits.length === 0) return null;
    return rootNode.commitEdits(allEdits);
  }

  const localAlias = imp.alias;

  // --- Step 2: Find all call expression statements to determine TODO type ---
  const callStatements = rootNode.findAll({
    rule: {
      kind: "expression_statement",
      has: {
        kind: "call_expression",
        has: {
          field: "function",
          kind: "identifier",
          regex: escapeRegex(localAlias),
        },
      },
    },
  });

  // Determine if any call has arguments (for the TODO message)
  const hasCustomArgs = callStatements.some((callStmt) => {
    const callExpr = callStmt.find({ rule: { kind: "call_expression" } });
    return callExpr ? callHasArguments(callExpr) : false;
  });

  const todoComment = hasCustomArgs ? TODO_CUSTOM_ARGS : TODO_SIMPLE;

  // --- Step 3: Determine whether the entire import is being removed ---
  const importStatements = findImportStatementsFrom(rootNode, CLI_COMMON_SOURCE);
  let entireImportRemoved = false;

  for (const importStmt of importStatements) {
    const specifiers = extractSpecifiers(importStmt, "import_specifier");
    const hasTarget = specifiers.some((s) => s.importedName === FUNCTION_NAME);
    if (!hasTarget) continue;

    const remaining = specifiers.filter((s) => s.importedName !== FUNCTION_NAME);
    if (remaining.length === 0) {
      entireImportRemoved = true;
    }
  }

  // --- Step 4: Remove call statements ---
  const source = rootNode.text();
  for (const callStmt of callStatements) {
    const range = callStmt.range();
    let startPos = range.start.index;
    let endPos = range.end.index;

    // Consume trailing newline if present
    if (source[endPos] === "\n") {
      endPos += 1;
    }

    // Only consume preceding blank lines when the entire import is being
    // removed -- otherwise, the blank line separates the rebuilt import
    // from the next statement and should be preserved.
    if (entireImportRemoved) {
      while (
        startPos >= 2 &&
        source[startPos - 1] === "\n" &&
        source[startPos - 2] === "\n"
      ) {
        startPos -= 1;
      }
    }

    edits.push({
      startPos,
      endPos,
      insertedText: "",
    });
    migrationMetric.increment({
      action: "call-removed",
      hadArguments: hasCustomArgs ? "yes" : "no",
    });
  }

  // --- Step 5: Handle the import statement -- place TODO here ---

  for (const importStmt of importStatements) {
    const specifiers = extractSpecifiers(importStmt, "import_specifier");
    const hasTarget = specifiers.some((s) => s.importedName === FUNCTION_NAME);
    if (!hasTarget) continue;

    const remaining = specifiers.filter((s) => s.importedName !== FUNCTION_NAME);

    if (remaining.length === 0) {
      // Replace entire import statement with the TODO comment
      edits.push(importStmt.replace(todoComment));
    } else {
      // Rebuild import with remaining specifiers, prepend TODO
      const rebuilt = buildNamedStatement(
        "import",
        remaining.map((s) => s.specText),
        CLI_COMMON_SOURCE,
      );
      edits.push(importStmt.replace(`${todoComment}\n${rebuilt}`));
    }

    migrationMetric.increment({ action: "import-removed" });
  }

  // --- Step 6: Handle re-exports in the same file ---
  const reExportEdits = processReExports(rootNode);
  edits.push(...reExportEdits);

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

/**
 * Process re-exports of bootstrapEnvProxyAgents.
 */
function processReExports(rootNode: SgNode<TSX>): Edit[] {
  const edits: Edit[] = [];
  const exportStatements = findExportStatementsFrom(rootNode, CLI_COMMON_SOURCE);

  for (const exportStmt of exportStatements) {
    const specifiers = extractSpecifiers(exportStmt, "export_specifier");
    const hasTarget = specifiers.some((s) => s.importedName === FUNCTION_NAME);
    if (!hasTarget) continue;

    const remaining = specifiers.filter((s) => s.importedName !== FUNCTION_NAME);

    const todoComment =
      "// TODO(backstage-codemod): Re-export of bootstrapEnvProxyAgents removed — use NODE_USE_ENV_PROXY=1 instead.";

    if (remaining.length === 0) {
      edits.push(exportStmt.replace(todoComment));
    } else {
      const rebuilt = buildNamedStatement(
        "export",
        remaining.map((s) => s.specText),
        CLI_COMMON_SOURCE,
      );
      edits.push(exportStmt.replace(`${todoComment}\n${rebuilt}`));
    }

    migrationMetric.increment({ action: "re-export-removed" });
  }

  return edits;
}

export default transform;
