import type { Transform, Edit, SgNode } from "codemod:ast-grep";
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

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  // --- Step 1: Find the import of bootstrapEnvProxyAgents ---
  const imp = getImport(rootNode, {
    type: "named",
    name: FUNCTION_NAME,
    from: CLI_COMMON_SOURCE,
  });

  if (!imp) {
    // No import found -- check for re-exports only
    return handleReExports(rootNode);
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
  let hasCustomArgs = false;
  for (const callStmt of callStatements) {
    const callExpr = callStmt.find({ rule: { kind: "call_expression" } });
    if (!callExpr) continue;

    const args = callExpr.find({ rule: { kind: "arguments" } });
    if (args) {
      const namedChildren = args
        .children()
        .filter((c) => c.isNamed() && !c.is("comment"));
      if (namedChildren.length > 0) {
        hasCustomArgs = true;
      }
    }
  }

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

  // --- Step 5: Handle re-exports in the same file ---
  const reExportEdits = processReExports(rootNode);
  edits.push(...reExportEdits);

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

/**
 * Handle files that only have re-exports (no import).
 */
function handleReExports(rootNode: SgNode<TSX>): string | null {
  const edits = processReExports(rootNode);
  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
}

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
