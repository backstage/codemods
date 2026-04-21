import type { Transform, Edit, SgNode } from "codemod:ast-grep";
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
 * outside of import/export statements.
 */
function renameBodyReferences(
  rootNode: SgNode<TSX>,
  edits: Edit[],
): void {
  // Find all identifier and type_identifier nodes with text "HeaderTab"
  // that are NOT inside import or export statements
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
 * Remove `matchStrategy` properties from object literals.
 * Handles both `matchStrategy: 'prefix'` and `matchStrategy: 'exact'` etc.
 */
function removeMatchStrategyProperties(
  rootNode: SgNode<TSX>,
  edits: Edit[],
): void {
  const matchStrategyPairs = rootNode.findAll({
    rule: {
      kind: "pair",
      has: {
        kind: "property_identifier",
        regex: escapeRegex(MATCH_STRATEGY_PROP),
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
 * Warn about namespace imports (`import * as X from '@backstage/ui'`)
 * that use HeaderTab. These cannot be automatically migrated.
 */
function warnNamespaceImports(
  importStatements: SgNode<TSX, "import_statement">[],
): void {
  for (const imp of importStatements) {
    const nsImport = imp.find({ rule: { kind: "namespace_import" } });
    if (nsImport) {
      const alias = nsImport.find({ rule: { kind: "identifier" } })?.text();
      console.log(
        `[header-tab-to-nav-tab-item] Cannot automatically migrate namespace import '${alias ?? "*"}' from '${UI_SOURCE}'. Manual migration required: rename HeaderTab to HeaderNavTabItem.`,
      );
      migrationMetric.increment({ action: "namespace-import-skipped", alias: alias ?? "*" });
    }
  }
}

const transform: Transform<TSX> = async (root) => {
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
    // Skip namespace imports - just warn
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

  // Warn about namespace imports
  warnNamespaceImports(uiImportStatements);

  // If we found and renamed any HeaderTab imports, also rename body references
  // and remove matchStrategy properties
  if (hasHeaderTabImport) {
    renameBodyReferences(rootNode, edits);
    removeMatchStrategyProperties(rootNode, edits);
  }

  return edits.length > 0 ? rootNode.commitEdits(edits) : null;
};

export default transform;
