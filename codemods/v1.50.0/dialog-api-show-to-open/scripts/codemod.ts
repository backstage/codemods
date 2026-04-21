import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { getImport } from "@jssg/utils/javascript/imports";
import { useMetricAtom } from "codemod:metrics";

const migrationMetric = useMetricAtom("dialog-api-show-to-open");

const SHOW_TODO =
  "// TODO(backstage-codemod): open() returns TResult (not TResult | undefined). Add your own dialog chrome and dismissal handling.";
const SHOW_MODAL_TODO =
  "// TODO(backstage-codemod): open() renders without built-in dialog chrome. Wrap your content in a dialog component.";

const FRONTEND_PLUGIN_API = "@backstage/frontend-plugin-api";

/**
 * Walk ancestors to find the nearest statement node (expression_statement,
 * lexical_declaration, variable_declaration, etc.) that is a direct child
 * of a statement_block or program. This is where we insert the TODO comment.
 */
function findContainingStatement(node: SgNode<TSX>): SgNode<TSX> | null {
  let current: SgNode<TSX> | null = node;
  while (current) {
    const parent: SgNode<TSX> | null = current.parent();
    if (!parent) return null;
    const parentKind = parent.kind();
    if (parentKind === "statement_block" || parentKind === "program") {
      return current;
    }
    current = parent;
  }
  return null;
}

/**
 * Get the indentation of a node by looking at the text preceding it on the same line.
 */
function getIndentation(node: SgNode<TSX>, fullSource: string): string {
  const startIndex = node.range().start.index;
  // Walk backwards from startIndex to find the start of the line
  let lineStart = startIndex;
  while (lineStart > 0 && fullSource[lineStart - 1] !== "\n") {
    lineStart--;
  }
  // Extract the whitespace prefix
  const linePrefix = fullSource.slice(lineStart, startIndex);
  const match = linePrefix.match(/^(\s*)/);
  return match ? match[1] ?? "" : "";
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root() as SgNode<TSX, "program">;

  // Check if this file imports dialogApiRef or DialogApi from the right package
  const dialogApiRefImport = getImport(rootNode, {
    type: "named",
    name: "dialogApiRef",
    from: FRONTEND_PLUGIN_API,
  });
  const dialogApiTypeImport = getImport(rootNode, {
    type: "named",
    name: "DialogApi",
    from: FRONTEND_PLUGIN_API,
  });

  if (!dialogApiRefImport && !dialogApiTypeImport) {
    return null;
  }

  const edits: Edit[] = [];
  const fullSource = rootNode.text();

  // Track which statements already have a TODO comment inserted,
  // so we don't insert duplicates when multiple calls share a statement.
  const commentedStatementIds = new Set<number>();

  // Find all call expressions with .show(...) or .showModal(...)
  const calls = rootNode.findAll({
    rule: {
      kind: "call_expression",
      has: {
        field: "function",
        kind: "member_expression",
        has: {
          field: "property",
          kind: "property_identifier",
          regex: "^(show|showModal)$",
        },
      },
    },
  });

  for (const call of calls) {
    const memberExpr = call.field("function");
    if (!memberExpr) continue;

    const propertyNode = memberExpr.field("property");
    if (!propertyNode) continue;

    const methodName = propertyNode.text();
    if (methodName !== "show" && methodName !== "showModal") continue;

    // Replace the method name with "open"
    edits.push(propertyNode.replace("open"));
    migrationMetric.increment({ method: methodName });

    // Find the containing statement to insert the TODO comment above
    const stmt = findContainingStatement(call);
    if (!stmt) continue;

    const stmtId = stmt.id();
    if (commentedStatementIds.has(stmtId)) continue;
    commentedStatementIds.add(stmtId);

    // Determine the appropriate TODO comment
    const todoComment = methodName === "show" ? SHOW_TODO : SHOW_MODAL_TODO;
    const indent = getIndentation(stmt, fullSource);

    // Insert the TODO comment before the statement
    const commentEdit: Edit = {
      startPos: stmt.range().start.index,
      endPos: stmt.range().start.index,
      insertedText: `${todoComment}\n${indent}`,
    };
    edits.push(commentEdit);
  }

  return edits.length > 0 ? rootNode.commitEdits(edits) : null;
};

export default transform;
