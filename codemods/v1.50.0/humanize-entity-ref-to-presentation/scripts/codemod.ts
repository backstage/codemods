import type { Codemod, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

const migrationMetric = useMetricAtom("humanize-entity-ref-migration");

type Context = "jsx" | "react-component" | "utility";

const SOURCE_PKG = "@backstage/plugin-catalog-react";

function escapeRegex(str: string): string {
  return `^${str.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`;
}

interface DeprecatedImportInfo {
  importedName: string;
  alias: string;
}

/**
 * Find import statements from a specific source.
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
 * Extract import specifier info from an import statement.
 */
function extractSpecifiers(importNode: SgNode<TSX>): Array<{
  importedName: string;
  localName: string;
  specText: string;
}> {
  const specifiers = importNode.findAll({ rule: { kind: "import_specifier" } });
  const result: Array<{
    importedName: string;
    localName: string;
    specText: string;
  }> = [];

  for (const spec of specifiers) {
    const identifiers = spec.findAll({
      rule: {
        any: [{ kind: "identifier" }, { kind: "type_identifier" }],
      },
    });
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

/**
 * Determine the call-site context for a call_expression node.
 */
function determineContext(callNode: SgNode<TSX>): Context {
  for (const ancestor of callNode.ancestors()) {
    const kind = ancestor.kind();

    // If we hit a jsx_expression before a function boundary, it's JSX context
    if (kind === "jsx_expression") {
      return "jsx";
    }

    // If we hit a function boundary, check if it's a React component
    if (
      kind === "function_declaration" ||
      kind === "arrow_function" ||
      kind === "function_expression" ||
      kind === "method_definition"
    ) {
      return isReactComponent(ancestor) ? "react-component" : "utility";
    }
  }

  return "utility";
}

/**
 * Check if a function node is a React component by looking for JSX in its body.
 */
function isReactComponent(fnNode: SgNode<TSX>): boolean {
  const hasJsx = fnNode.find({
    rule: {
      any: [
        { kind: "jsx_element" },
        { kind: "jsx_self_closing_element" },
      ],
    },
  });
  return hasJsx !== null;
}

/**
 * Build the replacement text for a call expression based on context.
 */
function buildReplacement(
  context: Context,
  entityArg: string,
  optionsArg: string | null,
  isHumanizeEntity: boolean,
): string {
  // For humanizeEntity, the 2nd arg is a fallback name, which the Presentation API handles
  const contextArg = isHumanizeEntity ? null : optionsArg;

  switch (context) {
    case "jsx": {
      let props = `entityRef={${entityArg}}`;
      if (contextArg) {
        const jsxProps = optionsToJsxProps(contextArg);
        if (jsxProps) {
          props += ` ${jsxProps}`;
        }
      }
      return `<EntityDisplayName ${props} />`;
    }
    case "react-component": {
      const args = contextArg ? `${entityArg}, ${contextArg}` : entityArg;
      return `useEntityPresentation(${args}).primaryTitle`;
    }
    case "utility": {
      const args = contextArg ? `${entityArg}, ${contextArg}` : entityArg;
      return `entityPresentationSnapshot(${args}).primaryTitle`;
    }
  }
}

/**
 * Convert an options object like `{ defaultKind: 'Component' }` into JSX props.
 */
function optionsToJsxProps(optionsText: string): string | null {
  const trimmed = optionsText.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }

  const props: string[] = [];
  const pairPattern = /(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)")/g;
  let match: RegExpExecArray | null;
  while ((match = pairPattern.exec(trimmed)) !== null) {
    const key = match[1];
    const value = match[2] ?? match[3];
    if (key && value !== undefined) {
      props.push(`${key}="${value}"`);
    }
  }

  return props.length > 0 ? props.join(" ") : null;
}

/**
 * Build a named import/export statement.
 */
function buildNamedStatement(
  keyword: "import" | "export",
  specTexts: string[],
  source: string,
  typeOnly: boolean,
): string {
  const typeKw = typeOnly ? "type " : "";
  if (specTexts.length <= 3) {
    return `${keyword} ${typeKw}{ ${specTexts.join(", ")} } from '${source}';`;
  }
  return `${keyword} ${typeKw}{\n  ${specTexts.join(",\n  ")},\n} from '${source}';`;
}

/**
 * Replace a deprecated call expression with the appropriate Presentation API.
 * Works for both direct calls (identifier) and namespace calls (member_expression).
 * Returns the context used, or null if the call could not be processed.
 */
function replaceDeprecatedCall(
  call: SgNode<TSX>,
  importedName: string,
  edits: Edit[],
  neededImports: Set<string>,
  metricReason: string,
): Context | null {
  const isHumanizeEntity = importedName === "humanizeEntity";
  const context = determineContext(call);

  // Extract arguments
  const args = call.find({ rule: { kind: "arguments" } });
  if (!args) return null;

  const argChildren: SgNode<TSX>[] = [];
  for (const child of args.children()) {
    if (child.isNamed()) {
      argChildren.push(child);
    }
  }

  const entityArg = argChildren[0]?.text() ?? "";
  const optionsArg = argChildren[1]?.text() ?? null;

  const replacement = buildReplacement(
    context,
    entityArg,
    optionsArg,
    isHumanizeEntity,
  );

  if (context === "jsx") {
    // For JSX context, replace the parent jsx_expression node (which includes the { } braces)
    // so we get <EntityDisplayName .../> instead of {<EntityDisplayName .../>}
    const jsxExpr = call.ancestors().find((a) => a.kind() === "jsx_expression");
    if (jsxExpr) {
      edits.push(jsxExpr.replace(replacement));
    } else {
      edits.push(call.replace(replacement));
    }
  } else {
    edits.push(call.replace(replacement));
  }

  // Track which imports we need
  switch (context) {
    case "jsx":
      neededImports.add("EntityDisplayName");
      break;
    case "react-component":
      neededImports.add("useEntityPresentation");
      break;
    case "utility":
      neededImports.add("entityPresentationSnapshot");
      break;
  }

  migrationMetric.increment({
    outcome: "auto-migrated",
    function: importedName,
    context,
    reason: metricReason,
  });

  return context;
}

const DEPRECATED_FUNCTIONS = ["humanizeEntityRef", "humanizeEntity"];

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root() as SgNode<TSX, "program">;
  const edits: Edit[] = [];

  // Track which replacement APIs we need to import
  const neededImports = new Set<string>();

  // Find all import statements from the source package
  const importStatements = findImportStatementsFrom(rootNode, SOURCE_PKG);

  // Collect deprecated import info (named imports)
  const deprecatedImports: DeprecatedImportInfo[] = [];

  // Track namespace import statements that reference deprecated functions
  const namespaceImportStmts: Array<{
    stmt: SgNode<TSX, "import_statement">;
    alias: string;
  }> = [];

  // Track which import statements contain deprecated imports and their kept specs
  const importAnalysis: Array<{
    stmt: SgNode<TSX, "import_statement">;
    deprecated: Array<{ importedName: string; localName: string; specText: string }>;
    kept: Array<{ importedName: string; localName: string; specText: string }>;
    isTypeOnly: boolean;
  }> = [];

  for (const importStmt of importStatements) {
    // Handle namespace imports: extract alias for later call-site resolution
    const namespaceNode = importStmt.find({
      rule: { kind: "namespace_import" },
    });
    if (namespaceNode) {
      const aliasNode = namespaceNode.find({
        rule: { kind: "identifier" },
      });
      if (aliasNode) {
        namespaceImportStmts.push({
          stmt: importStmt,
          alias: aliasNode.text(),
        });
      }
      continue;
    }

    const specifiers = extractSpecifiers(importStmt);
    const deprecated: Array<{ importedName: string; localName: string; specText: string }> = [];
    const kept: Array<{ importedName: string; localName: string; specText: string }> = [];

    for (const spec of specifiers) {
      if (
        spec.importedName === "humanizeEntityRef" ||
        spec.importedName === "humanizeEntity"
      ) {
        deprecated.push(spec);
        deprecatedImports.push({
          importedName: spec.importedName,
          alias: spec.localName,
        });
      } else {
        kept.push(spec);
      }
    }

    if (deprecated.length === 0) continue;

    const isTypeOnly = importStmt.children().some((c) => c.text() === "type");
    importAnalysis.push({ stmt: importStmt, deprecated, kept, isTypeOnly });
  }

  // Handle namespace import call sites: find CatalogReact.humanizeEntityRef(...) patterns
  let hasNamespaceMigrations = false;
  for (const { stmt, alias } of namespaceImportStmts) {
    const deprecatedCalls = rootNode.findAll({
      rule: {
        kind: "call_expression",
        has: {
          field: "function",
          kind: "member_expression",
          has: {
            field: "object",
            kind: "identifier",
            regex: escapeRegex(alias),
          },
        },
      },
    });

    for (const call of deprecatedCalls) {
      // Get the property name from the member_expression
      const memberExpr = call.find({
        rule: {
          kind: "member_expression",
          has: {
            field: "object",
            kind: "identifier",
            regex: escapeRegex(alias),
          },
        },
      });
      if (!memberExpr) continue;

      const propertyNode = memberExpr.find({
        rule: { kind: "property_identifier" },
      });
      if (!propertyNode) continue;

      const propertyName = propertyNode.text();
      if (!DEPRECATED_FUNCTIONS.includes(propertyName)) continue;

      const result = replaceDeprecatedCall(
        call,
        propertyName,
        edits,
        neededImports,
        "namespace-call-replaced",
      );
      if (result !== null) {
        hasNamespaceMigrations = true;
      }
    }
  }

  // Handle re-exports
  const reExports = rootNode.findAll({
    rule: {
      kind: "export_statement",
      has: {
        kind: "string",
        has: {
          kind: "string_fragment",
          regex: escapeRegex(SOURCE_PKG),
        },
      },
    },
  });

  for (const reExport of reExports) {
    const exportSpecs = reExport.findAll({
      rule: { kind: "export_specifier" },
    });

    const deprecatedSpecs: SgNode<TSX>[] = [];
    const keptSpecs: SgNode<TSX>[] = [];

    for (const spec of exportSpecs) {
      const identifiers = spec.findAll({
        rule: {
          any: [{ kind: "identifier" }, { kind: "type_identifier" }],
        },
      });
      const exportedName = identifiers[0]?.text();
      if (
        exportedName === "humanizeEntityRef" ||
        exportedName === "humanizeEntity"
      ) {
        deprecatedSpecs.push(spec);
        migrationMetric.increment({
          outcome: "auto-migrated",
          function: exportedName,
          reason: "re-export-replaced",
        });
      } else {
        keptSpecs.push(spec);
      }
    }

    if (deprecatedSpecs.length > 0) {
      const newExports = [
        "EntityDisplayName",
        "useEntityPresentation",
        "entityPresentationSnapshot",
      ];

      const keptTexts = keptSpecs.map((s) => s.text());
      const allSpecs = [...keptTexts, ...newExports];

      const replacement = buildNamedStatement("export", allSpecs, SOURCE_PKG, false);
      edits.push(reExport.replace(replacement));
    }
  }

  // If no deprecated imports, namespace migrations, or re-exports, bail
  if (deprecatedImports.length === 0 && !hasNamespaceMigrations && edits.length === 0) {
    return null;
  }

  // Find and replace all call expressions for each named deprecated import
  for (const { alias, importedName } of deprecatedImports) {
    const calls = rootNode.findAll({
      rule: {
        kind: "call_expression",
        has: {
          field: "function",
          kind: "identifier",
          regex: escapeRegex(alias),
        },
      },
    });

    for (const call of calls) {
      replaceDeprecatedCall(
        call,
        importedName,
        edits,
        neededImports,
        "call-replaced",
      );
    }
  }

  // Handle named import statement replacements
  // Strategy: replace the import statement in-place with new specifiers
  for (const { stmt, kept, isTypeOnly } of importAnalysis) {
    const newSpecTexts = Array.from(neededImports);
    const allSpecs = [...kept.map((s) => s.specText), ...newSpecTexts];

    if (allSpecs.length > 0) {
      const replacement = buildNamedStatement("import", allSpecs, SOURCE_PKG, isTypeOnly);
      edits.push(stmt.replace(replacement));
    } else {
      // No specifiers left and no new ones needed - remove import
      edits.push(stmt.replace(""));
    }
  }

  // For namespace imports, add a separate named import for the needed APIs
  // (the namespace import stays intact since it may reference other members)
  if (hasNamespaceMigrations && neededImports.size > 0) {
    const newImportText = buildNamedStatement(
      "import",
      Array.from(neededImports),
      SOURCE_PKG,
      false,
    );

    // Insert after the last namespace import statement from SOURCE_PKG
    const lastNsImport = namespaceImportStmts[namespaceImportStmts.length - 1];
    if (lastNsImport) {
      const endPos = lastNsImport.stmt.range().end.index;
      edits.push({
        startPos: endPos,
        endPos: endPos,
        insertedText: `\n${newImportText}`,
      });
    }
  }

  return edits.length > 0 ? rootNode.commitEdits(edits) : null;
};

export default transform;
