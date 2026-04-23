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
 * Escape special regex characters in a string for safe interpolation into a RegExp.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check if a reference node participates in a dismissal check pattern
 * using the idiomatic ref.inside() API.
 */
function isDismissalCheck(refNode: SgNode<TSX>): boolean {
  const name = refNode.text();

  // Use ref.inside() for patterns where the ref appears in a comparison
  // expression — these are precise because the expression itself is the match.
  const insideComparison = refNode.inside({
    rule: {
      any: [
        // Strict/loose equality with undefined/null
        { pattern: `${name} === undefined` },
        { pattern: `${name} !== undefined` },
        { pattern: `${name} == null` },
        { pattern: `${name} != null` },
        // Nullish coalescing: result ?? fallback
        { pattern: `${name} ?? $$$` },
        // Optional chaining: result?.prop
        {
          kind: "member_expression",
          all: [
            { has: { kind: "optional_chain" } },
            { has: { kind: "identifier", regex: `^${escapeRegex(name)}$` } },
          ],
        },
        // Unary negation: !result
        { pattern: `!${name}` },
      ],
    },
  });

  if (insideComparison) return true;

  // For truthiness and ternary checks, use parent-walking to verify the ref
  // is the actual condition, not just any occurrence inside the block.
  const parent = refNode.parent();
  if (!parent) return false;

  // if (result) — identifier inside parenthesized_expression of if_statement
  if (parent.kind() === "parenthesized_expression") {
    const grandparent = parent.parent();
    if (grandparent && grandparent.kind() === "if_statement") {
      return true;
    }
  }

  // result ? x : y — ternary expression where result is the condition
  if (parent.kind() === "ternary_expression") {
    const children = parent.children();
    const firstNamedChild = children.find((c) => c.kind() === "identifier");
    if (firstNamedChild && firstNamedChild.id() === refNode.id()) {
      return true;
    }
  }

  return false;
}

/**
 * Information about a .show()/.showModal() call site, collected before any
 * edits are made so that references() works on the original source.
 */
interface CallSiteInfo {
  /** The property_identifier node to rename (show -> open) */
  propertyNode: SgNode<TSX>;
  /** Original method name: "show" | "showModal" */
  methodName: string;
  /** The call_expression node (for finding the containing statement) */
  callNode: SgNode<TSX>;
  /** Binding identifiers for the result variable (from `const x = await ...show(...)`) */
  resultBinding: SgNode<TSX> | null;
  /** Binding identifiers from .then(result => ...) callback parameter */
  thenParamBinding: SgNode<TSX> | null;
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root() as SgNode<TSX, "program">;
  const currentFile = root.filename();

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

  const fullSource = rootNode.text();

  // Collect the set of variable names that are known DialogApi receivers.
  // Two patterns:
  //   1. `const dialogApi = useApi(dialogApiRef)` — variable initialized from useApi(dialogApiRef)
  //   2. `function foo(api: DialogApi)` — parameter typed as DialogApi
  const dialogApiReceiverNames = new Set<string>();

  // Pattern 1: useApi(dialogApiRef) assignments
  const useApiCalls = rootNode.findAll({
    rule: {
      kind: "call_expression",
      has: {
        field: "function",
        kind: "identifier",
        regex: "^useApi$",
      },
      all: [
        {
          has: {
            field: "arguments",
            has: {
              kind: "identifier",
              regex: "^dialogApiRef$",
            },
          },
        },
      ],
    },
  });
  for (const useApiCall of useApiCalls) {
    // Walk up to find the variable_declarator
    const ancestors = useApiCall.ancestors();
    const varDecl = ancestors.find((a) => a.kind() === "variable_declarator");
    if (varDecl) {
      const nameNode = varDecl.field("name");
      if (nameNode && nameNode.kind() === "identifier") {
        dialogApiReceiverNames.add(nameNode.text());
      }
    }
  }

  // Pattern 2: parameters typed as DialogApi
  // Find all type_identifier nodes matching "DialogApi" and walk up to the parameter
  const dialogApiTypeIds = rootNode.findAll({
    rule: {
      kind: "type_identifier",
      regex: "^DialogApi$",
    },
  });
  for (const typeId of dialogApiTypeIds) {
    // Walk up: type_identifier -> type_annotation -> required_parameter/optional_parameter
    const typeAnnotation = typeId.parent();
    if (!typeAnnotation || typeAnnotation.kind() !== "type_annotation") continue;
    const param = typeAnnotation.parent();
    if (!param) continue;
    const paramKind = param.kind();
    if (
      paramKind !== "required_parameter" &&
      paramKind !== "optional_parameter"
    ) {
      continue;
    }
    // field("name") is not available on required_parameter in this runtime,
    // so find the identifier child directly.
    const nameNode = param.children().find((c) => c.kind() === "identifier");
    if (nameNode) {
      dialogApiReceiverNames.add(nameNode.text());
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Phase 1: Collect all call sites and their result bindings BEFORE
  // making any edits. This ensures references() works on original source.
  // ──────────────────────────────────────────────────────────────────────

  const callSites: CallSiteInfo[] = [];

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

    // Only rename calls on known DialogApi receivers
    const objectNode = memberExpr.field("object");
    if (!objectNode) continue;
    const receiverName = objectNode.text();
    if (!dialogApiReceiverNames.has(receiverName)) continue;

    // Find the result variable binding (for `const result = await ...show(...)`)
    let resultBinding: SgNode<TSX> | null = null;
    if (methodName === "show") {
      const ancestors = call.ancestors();
      const varDeclarator = ancestors.find(
        (a) => a.kind() === "variable_declarator",
      );
      if (varDeclarator) {
        const nameNode = varDeclarator.field("name");
        if (nameNode && nameNode.kind() === "identifier") {
          resultBinding = nameNode;
        }
      }
    }

    // Find .then(result => ...) callback parameter binding
    let thenParamBinding: SgNode<TSX> | null = null;
    if (methodName === "show") {
      // Check if the call is the object of a .then() member expression.
      // AST shape: call_expression { function: member_expression { object: <our call>, property: "then" }, arguments: [arrow_function { parameters: [identifier] }] }
      const callParent = call.parent();
      if (callParent && callParent.kind() === "member_expression") {
        const thenProp = callParent.field("property");
        if (thenProp && thenProp.text() === "then") {
          // The member_expression is the function of the outer call_expression
          const outerCall = callParent.parent();
          if (outerCall && outerCall.kind() === "call_expression") {
            const argsNode = outerCall.field("arguments");
            if (argsNode) {
              // The first argument should be the callback (arrow_function or function)
              const callback = argsNode.children().find(
                (c) =>
                  c.kind() === "arrow_function" ||
                  c.kind() === "function" ||
                  c.kind() === "function_expression",
              );
              if (callback) {
                const params = callback.field("parameters");
                if (params) {
                  // For arrow_function with a single param, it may be a direct identifier
                  if (params.kind() === "identifier") {
                    thenParamBinding = params;
                  } else {
                    // formal_parameters — find the first identifier child
                    const firstParam = params
                      .children()
                      .find(
                        (c) =>
                          c.kind() === "identifier" ||
                          c.kind() === "required_parameter",
                      );
                    if (firstParam) {
                      if (firstParam.kind() === "identifier") {
                        thenParamBinding = firstParam;
                      } else {
                        // required_parameter — find the identifier child
                        const paramName = firstParam
                          .children()
                          .find((c) => c.kind() === "identifier");
                        if (paramName) {
                          thenParamBinding = paramName;
                        }
                      }
                    }
                  }
                }
                // Also try: arrow function with single unparenthesized parameter
                if (!thenParamBinding && callback.kind() === "arrow_function") {
                  const paramNode = callback.field("parameter");
                  if (paramNode && paramNode.kind() === "identifier") {
                    thenParamBinding = paramNode;
                  }
                }
              }
            }
          }
        }
      }
    }

    callSites.push({
      propertyNode,
      methodName,
      callNode: call,
      resultBinding,
      thenParamBinding,
    });
  }

  if (callSites.length === 0) {
    return null;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Phase 2: For each binding, use references() to find dismissal checks.
  // This runs BEFORE any edits so the source is still original.
  // ──────────────────────────────────────────────────────────────────────

  const dismissalEdits: Edit[] = [];
  const dismissalCommentedStmtIds = new Set<number>();

  // Track which statement IDs will get method-level TODO comments so we
  // don't double-comment them.
  const commentedStatementIds = new Set<number>();

  // Pre-compute which statements will get method-level TODOs
  for (const site of callSites) {
    const stmt = findContainingStatement(site.callNode);
    if (stmt) {
      commentedStatementIds.add(stmt.id());
    }
  }

  // Process all bindings (both variable assignment and .then() callback parameter)
  const allBindings: SgNode<TSX>[] = [];
  for (const site of callSites) {
    if (site.resultBinding) allBindings.push(site.resultBinding);
    if (site.thenParamBinding) allBindings.push(site.thenParamBinding);
  }

  for (const bindingId of allBindings) {
    const varName = bindingId.text();

    // Try semantic references() first
    const refs = bindingId.references();
    let refNodes: SgNode<TSX>[] = [];

    for (const fileRef of refs) {
      if (fileRef.root.filename() === currentFile) {
        // Same file: collect nodes for later editing
        refNodes.push(...fileRef.nodes);
      } else {
        // Cross-file: insert TODO comments and write to the other file
        const crossFileEdits: Edit[] = [];
        const crossFileSource = fileRef.root.root().text();
        const crossCommentedIds = new Set<number>();

        for (const refNode of fileRef.nodes) {
          if (!isDismissalCheck(refNode)) continue;

          const refStmt = findContainingStatement(refNode);
          if (!refStmt) continue;

          const refStmtId = refStmt.id();
          if (crossCommentedIds.has(refStmtId)) continue;
          crossCommentedIds.add(refStmtId);

          const indent = getIndentation(refStmt, crossFileSource);
          crossFileEdits.push({
            startPos: refStmt.range().start.index,
            endPos: refStmt.range().start.index,
            insertedText: `${DISMISSAL_TODO}\n${indent}`,
          });
        }

        if (crossFileEdits.length > 0) {
          const newContent = fileRef.root.root().commitEdits(crossFileEdits);
          fileRef.root.write(newContent);
        }
      }
    }

    // Fallback: if references() returned nothing (semantic analysis not enabled),
    // find all identifiers with the same name in the file via AST search.
    if (refNodes.length === 0) {
      refNodes = rootNode.findAll({
        rule: {
          kind: "identifier",
          regex: `^${escapeRegex(varName)}$`,
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

  // ──────────────────────────────────────────────────────────────────────
  // Phase 3: Rename .show()/.showModal() -> .open() and insert
  // method-level TODO comments.
  // ──────────────────────────────────────────────────────────────────────

  const renameEdits: Edit[] = [];
  // Re-track commented statements for the rename pass (fresh set because
  // commentedStatementIds was only used for pre-computing)
  const renameCommentedStmtIds = new Set<number>();

  for (const site of callSites) {
    // Replace the method name with "open"
    renameEdits.push(site.propertyNode.replace("open"));
    migrationMetric.increment({ method: site.methodName });

    // Find the containing statement to insert the TODO comment above
    const stmt = findContainingStatement(site.callNode);
    if (!stmt) continue;

    const stmtId = stmt.id();
    if (renameCommentedStmtIds.has(stmtId)) continue;
    renameCommentedStmtIds.add(stmtId);

    // Determine the appropriate TODO comment
    const todoComment =
      site.methodName === "show" ? SHOW_TODO : SHOW_MODAL_TODO;
    const indent = getIndentation(stmt, fullSource);

    // Insert the TODO comment before the statement
    renameEdits.push({
      startPos: stmt.range().start.index,
      endPos: stmt.range().start.index,
      insertedText: `${todoComment}\n${indent}`,
    });
  }

  const allEdits = [...renameEdits, ...dismissalEdits];
  return allEdits.length > 0 ? rootNode.commitEdits(allEdits) : null;
};

export default transform;
