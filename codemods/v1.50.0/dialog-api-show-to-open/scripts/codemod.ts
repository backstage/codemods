import type { Codemod, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { getImport } from "@jssg/utils/javascript/imports";
import { useMetricAtom } from "codemod:metrics";

const migrationMetric = useMetricAtom("dialog-api-show-to-open");

const SHOW_TODO =
  "// TODO(backstage-codemod): open() returns TResult (not TResult | undefined). Add your own dialog chrome and dismissal handling.";
const SHOW_MODAL_TODO =
  "// TODO(backstage-codemod): open() renders without built-in dialog chrome. Wrap your content in a dialog component.";
const DISMISSAL_TODO =
  "// TODO(backstage-codemod): open() no longer returns undefined on dismissal. This check may be unreachable.";

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

/**
 * Check if a reference node participates in a dismissal check pattern:
 * - `result === undefined` / `result !== undefined`
 * - `result == null` / `result != null`
 * - `if (result)` / `if (!result)` (truthiness check in condition position)
 * - `result ?? fallback` (nullish coalescing)
 */
function isDismissalCheck(refNode: SgNode<TSX>): boolean {
  const parent = refNode.parent();
  if (!parent) return false;
  const parentKind = parent.kind();

  // Pattern: result === undefined / result !== undefined / result == null / result != null
  if (parentKind === "binary_expression") {
    const operatorNode = parent.children().find((c) => {
      const k = c.kind();
      return k === "===" || k === "!==" || k === "==" || k === "!=" || k === "??";
    });
    if (!operatorNode) return false;
    const op = operatorNode.kind();

    // Nullish coalescing: result ?? fallback
    if (op === "??") {
      return true;
    }

    // Strict equality with undefined: result === undefined / result !== undefined
    if (op === "===" || op === "!==") {
      const hasUndefined = parent.find({
        rule: { kind: "undefined", regex: "^undefined$" },
      });
      if (hasUndefined) return true;
    }

    // Loose equality with null: result == null / result != null
    if (op === "==" || op === "!=") {
      const hasNull = parent.find({
        rule: { kind: "null", regex: "^null$" },
      });
      if (hasNull) return true;
    }

    return false;
  }

  // Pattern: !result (unary negation — typically in if(!result))
  if (parentKind === "unary_expression") {
    const opChild = parent.children().find((c) => c.kind() === "!");
    if (opChild) return true;
  }

  // Pattern: if (result) — bare identifier inside parenthesized_expression of if_statement
  if (parentKind === "parenthesized_expression") {
    const grandparent = parent.parent();
    if (grandparent && grandparent.kind() === "if_statement") {
      return true;
    }
  }

  return false;
}

const transform: Codemod<TSX> = async (root) => {
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

  // Collect binding identifiers from variable_declarators that hold .show() results,
  // so we can trace their references for dismissal checks after the rename pass.
  const bindingIdentifiers: SgNode<TSX>[] = [];

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

    // For .show() calls only, find the binding identifier for dismissal check tracing
    if (methodName === "show") {
      // Walk up from the call to find the variable_declarator ancestor
      const ancestors = call.ancestors();
      const varDeclarator = ancestors.find(
        (a) => a.kind() === "variable_declarator",
      );
      if (varDeclarator) {
        const nameNode = varDeclarator.field("name");
        if (nameNode && nameNode.kind() === "identifier") {
          bindingIdentifiers.push(nameNode);
        }
      }
    }
  }

  // Phase 2: Use semantic analysis to find dismissal checks on .show() result variables.
  // Try references() first (requires semantic_analysis: file in workflow.yaml).
  // Fall back to AST-based identifier search when semantic analysis is unavailable
  // (e.g. in the test runner).
  const dismissalEdits: Edit[] = [];
  const dismissalCommentedStmtIds = new Set<number>();

  for (const bindingId of bindingIdentifiers) {
    const varName = bindingId.text();

    // Try semantic references() first
    const refs = bindingId.references();
    let refNodes: SgNode<TSX>[] = [];

    for (const fileRef of refs) {
      // Only process references in the current file
      if (fileRef.root.filename() !== root.filename()) continue;
      refNodes.push(...fileRef.nodes);
    }

    // Fallback: if references() returned nothing (semantic analysis not enabled),
    // find all identifiers with the same name in the file via AST search.
    if (refNodes.length === 0) {
      refNodes = rootNode.findAll({
        rule: {
          kind: "identifier",
          regex: `^${varName}$`,
        },
      });
    }

    for (const refNode of refNodes) {
      // Skip the declaration itself
      if (refNode.id() === bindingId.id()) continue;

      if (!isDismissalCheck(refNode)) continue;

      // Find the containing statement for this reference
      const refStmt = findContainingStatement(refNode);
      if (!refStmt) continue;

      const refStmtId = refStmt.id();
      // Don't add duplicate comments and don't re-comment the declaration statement
      if (
        dismissalCommentedStmtIds.has(refStmtId) ||
        commentedStatementIds.has(refStmtId)
      ) {
        continue;
      }
      dismissalCommentedStmtIds.add(refStmtId);

      const indent = getIndentation(refStmt, fullSource);
      dismissalEdits.push({
        startPos: refStmt.range().start.index,
        endPos: refStmt.range().start.index,
        insertedText: `${DISMISSAL_TODO}\n${indent}`,
      });
    }
  }

  const allEdits = [...edits, ...dismissalEdits];
  return allEdits.length > 0 ? rootNode.commitEdits(allEdits) : null;
};

export default transform;
