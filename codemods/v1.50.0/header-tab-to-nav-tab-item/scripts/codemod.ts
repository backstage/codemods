import type { Codemod, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

const migrationMetric = useMetricAtom("header-tab-migration");

const OLD_TYPE = "HeaderTab";
const NEW_TYPE = "HeaderNavTabItem";
const UI_SOURCE = "@backstage/ui";
const MATCH_STRATEGY_PROP = "matchStrategy";

function escapeRegex(str: string): string {
  return `^${str.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`;
}

/**
 * Find import/export statements from a given source module.
 */
function findStatementsFrom<K extends "import_statement" | "export_statement">(
  rootNode: SgNode<TSX>,
  kind: K,
  source: string,
): SgNode<TSX, K>[] {
  return rootNode.findAll({
    rule: {
      kind,
      has: {
        kind: "string",
        has: {
          kind: "string_fragment",
          regex: escapeRegex(source),
        },
      },
    },
  }) as SgNode<TSX, K>[];
}

/**
 * Rename HeaderTab to HeaderNavTabItem in import/export specifiers.
 * This handles both `import { HeaderTab }` and `import { HeaderTab as Alias }`.
 *
 * For specifiers: the imported name "HeaderTab" is renamed to "HeaderNavTabItem"
 * while any alias (local name) is preserved.
 */
function renameSpecifiers(
  node: SgNode<TSX>,
  specifierKind: "import_specifier" | "export_specifier",
  edits: Edit[],
): boolean {
  const specifiers = node.findAll({ rule: { kind: specifierKind } });
  let found = false;

  for (const spec of specifiers) {
    // Find identifiers within the specifier. For `import { HeaderTab as Alias }`,
    // identifiers[0] is "HeaderTab", identifiers[1] is "Alias".
    // Search both "identifier" and "type_identifier" node kinds.
    const identifiers = spec.findAll({
      rule: {
        any: [
          { kind: "identifier" },
          { kind: "type_identifier" },
        ],
      },
    });

    const importedNameNode = identifiers[0];
    if (!importedNameNode) continue;

    if (importedNameNode.text() === OLD_TYPE) {
      edits.push(importedNameNode.replace(NEW_TYPE));
      found = true;
      migrationMetric.increment({ action: "import-renamed", specifier: spec.text() });
    }
  }

  return found;
}

/**
 * Rename all body references (type annotations) from HeaderTab to HeaderNavTabItem.
 * These are `type_identifier` or `identifier` nodes with text "HeaderTab" that appear
 * outside of import/export statements and outside qualified access expressions
 * (nested_type_identifier / member_expression are handled by handleNamespaceImports).
 */
function renameBodyReferences(
  rootNode: SgNode<TSX>,
  edits: Edit[],
): void {
  // Find all identifier and type_identifier nodes with text "HeaderTab"
  // that are NOT inside import/export statements and NOT inside qualified
  // namespace accesses (those are handled separately by handleNamespaceImports)
  const refs = rootNode.findAll({
    rule: {
      any: [
        { kind: "identifier", regex: escapeRegex(OLD_TYPE) },
        { kind: "type_identifier", regex: escapeRegex(OLD_TYPE) },
      ],
      not: {
        inside: {
          any: [
            { kind: "import_statement" },
            { kind: "export_statement" },
            { kind: "nested_type_identifier" },
            { kind: "member_expression" },
          ],
          stopBy: "end",
        },
      },
    },
  });

  for (const ref of refs) {
    edits.push(ref.replace(NEW_TYPE));
    migrationMetric.increment({ action: "body-reference-renamed" });
  }
}

/**
 * Remove `matchStrategy` properties from object literals that are
 * contextually typed as HeaderTab or HeaderNavTabItem.
 *
 * Scoping: only removes `matchStrategy` pairs inside a variable_declarator,
 * as_expression, or required_parameter whose type annotation references
 * HeaderTab or HeaderNavTabItem. This prevents accidental removal of
 * `matchStrategy` on unrelated types that happen to share the property name.
 */
function removeMatchStrategyProperties(
  rootNode: SgNode<TSX>,
  edits: Edit[],
): void {
  // Match `matchStrategy` pairs scoped to HeaderTab-typed contexts.
  // The type annotation still references the OLD_TYPE at this point because
  // edits are committed atomically after all helpers run.
  const typeRegex = `^(${OLD_TYPE}|${NEW_TYPE})$`;
  const matchStrategyPairs = rootNode.findAll({
    rule: {
      kind: "pair",
      has: {
        kind: "property_identifier",
        regex: escapeRegex(MATCH_STRATEGY_PROP),
      },
      inside: {
        any: [
          // variable_declarator with HeaderTab type annotation
          // (covers HeaderTab, HeaderTab[], Array<HeaderTab>, Partial<HeaderTab>,
          //  and namespace-qualified UI.HeaderTab / UI.HeaderTab[])
          {
            kind: "variable_declarator",
            has: {
              kind: "type_identifier",
              regex: typeRegex,
              stopBy: "end",
            },
          },
          // as_expression: { ... } as HeaderTab  /  { ... } as UI.HeaderTab
          {
            kind: "as_expression",
            has: {
              kind: "type_identifier",
              regex: typeRegex,
              stopBy: "end",
            },
          },
          // function/method parameter: (tab: HeaderTab)
          {
            kind: "required_parameter",
            has: {
              kind: "type_identifier",
              regex: typeRegex,
              stopBy: "end",
            },
          },
        ],
        stopBy: "end",
      },
    },
  });

  for (const pair of matchStrategyPairs) {
    const prev = pair.prev();
    const next = pair.next();

    if (prev && prev.text() === ",") {
      // Not the first property: remove preceding comma through property end.
      // This also absorbs the whitespace/newline between the comma and this property.
      edits.push({
        startPos: prev.range().start.index,
        endPos: pair.range().end.index,
        insertedText: "",
      });
    } else if (next && next.text() === ",") {
      // First property with a following comma: remove property and trailing comma.
      // Also consume the whitespace between the comma and the next property
      // by extending the removal to the start of the next sibling after the comma.
      const afterComma = next.next();
      const removalEnd = afterComma
        ? afterComma.range().start.index
        : next.range().end.index;
      edits.push({
        startPos: pair.range().start.index,
        endPos: removalEnd,
        insertedText: "",
      });
    } else {
      // Only property in the object - just remove it
      edits.push({
        startPos: pair.range().start.index,
        endPos: pair.range().end.index,
        insertedText: "",
      });
    }

    migrationMetric.increment({ action: "matchStrategy-removed" });
  }
}

/**
 * Handle namespace imports (`import * as X from '@backstage/ui'`).
 * Finds the namespace alias, then uses `.references()` to trace all usages
 * of the alias. For each reference whose parent is a `nested_type_identifier`
 * or `member_expression` with a `HeaderTab` property, renames the property
 * to `HeaderNavTabItem`.
 *
 * Falls back to AST pattern matching if `.references()` returns no results
 * (e.g., in test mode without full semantic analysis).
 */
function handleNamespaceImports(
  importStatements: SgNode<TSX, "import_statement">[],
  rootNode: SgNode<TSX>,
  edits: Edit[],
): boolean {
  let found = false;

  for (const imp of importStatements) {
    const nsImport = imp.find({ rule: { kind: "namespace_import" } });
    if (!nsImport) continue;

    const aliasNode = nsImport.find({ rule: { kind: "identifier" } });
    if (!aliasNode) continue;

    const alias = aliasNode.text();
    const aliasRegex = escapeRegex(alias);

    // Try semantic analysis first: use .references() on the alias
    const refs = aliasNode.references();
    let usedSemanticRefs = false;

    for (const fileRef of refs) {
      for (const refNode of fileRef.nodes) {
        usedSemanticRefs = true;
        const parent = refNode.parent();
        if (!parent) continue;

        // Type context: nested_type_identifier (e.g., UI.HeaderTab in type annotations)
        if (parent.kind() === "nested_type_identifier") {
          const typeId = parent.find({ rule: { kind: "type_identifier", regex: escapeRegex(OLD_TYPE) } });
          if (typeId) {
            edits.push(typeId.replace(NEW_TYPE));
            found = true;
            migrationMetric.increment({ action: "namespace-property-renamed", alias });
          }
        }

        // Value context: member_expression (e.g., UI.HeaderTab in expressions)
        if (parent.kind() === "member_expression") {
          const propId = parent.find({ rule: { kind: "property_identifier", regex: escapeRegex(OLD_TYPE) } });
          if (propId) {
            edits.push(propId.replace(NEW_TYPE));
            found = true;
            migrationMetric.increment({ action: "namespace-property-renamed", alias });
          }
        }
      }
    }

    // Fallback: AST pattern matching when .references() returns no results
    if (!usedSemanticRefs) {
      // Type context: nested_type_identifier nodes like UI.HeaderTab
      const typeRefs = rootNode.findAll({
        rule: {
          all: [
            { kind: "nested_type_identifier" },
            { has: { kind: "identifier", regex: aliasRegex } },
            { has: { kind: "type_identifier", regex: escapeRegex(OLD_TYPE) } },
          ],
          not: {
            inside: {
              any: [
                { kind: "import_statement" },
                { kind: "export_statement" },
              ],
              stopBy: "end",
            },
          },
        },
      });

      for (const ref of typeRefs) {
        const typeId = ref.find({ rule: { kind: "type_identifier", regex: escapeRegex(OLD_TYPE) } });
        if (typeId) {
          edits.push(typeId.replace(NEW_TYPE));
          found = true;
          migrationMetric.increment({ action: "namespace-property-renamed", alias });
        }
      }

      // Value context: member_expression nodes like UI.HeaderTab
      const valueRefs = rootNode.findAll({
        rule: {
          all: [
            { kind: "member_expression" },
            { has: { kind: "identifier", regex: aliasRegex } },
            { has: { kind: "property_identifier", regex: escapeRegex(OLD_TYPE) } },
          ],
          not: {
            inside: {
              any: [
                { kind: "import_statement" },
                { kind: "export_statement" },
              ],
              stopBy: "end",
            },
          },
        },
      });

      for (const ref of valueRefs) {
        const propId = ref.find({ rule: { kind: "property_identifier", regex: escapeRegex(OLD_TYPE) } });
        if (propId) {
          edits.push(propId.replace(NEW_TYPE));
          found = true;
          migrationMetric.increment({ action: "namespace-property-renamed", alias });
        }
      }
    }
  }

  return found;
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root() as SgNode<TSX, "program">;
  const edits: Edit[] = [];

  // Find all import statements from @backstage/ui
  const uiImportStatements = findStatementsFrom(
    rootNode,
    "import_statement",
    UI_SOURCE,
  );

  // Check if there are any HeaderTab references at all in imports
  let hasHeaderTabImport = false;

  for (const imp of uiImportStatements) {
    // Skip namespace imports — handled separately by handleNamespaceImports
    const hasNamespace = imp.find({ rule: { kind: "namespace_import" } });
    if (hasNamespace) continue;

    // Rename HeaderTab -> HeaderNavTabItem in import specifiers
    const renamed = renameSpecifiers(imp, "import_specifier", edits);
    if (renamed) hasHeaderTabImport = true;
  }

  // Handle re-exports: export { HeaderTab } from '@backstage/ui'
  const uiExportStatements = findStatementsFrom(
    rootNode,
    "export_statement",
    UI_SOURCE,
  );

  for (const exp of uiExportStatements) {
    const renamed = renameSpecifiers(exp, "export_specifier", edits);
    if (renamed) hasHeaderTabImport = true;
  }

  // Handle namespace imports: rename UI.HeaderTab -> UI.HeaderNavTabItem
  const hasNamespaceHeaderTab = handleNamespaceImports(uiImportStatements, rootNode, edits);

  // If we found and renamed any HeaderTab imports (named or namespace),
  // also rename body references and remove matchStrategy properties
  if (hasHeaderTabImport || hasNamespaceHeaderTab) {
    renameBodyReferences(rootNode, edits);
    removeMatchStrategyProperties(rootNode, edits);
  }

  return edits.length > 0 ? rootNode.commitEdits(edits) : null;
};

export default transform;
