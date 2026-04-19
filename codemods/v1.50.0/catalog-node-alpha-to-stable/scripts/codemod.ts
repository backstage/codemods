import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { addImport } from "@jssg/utils/javascript/imports";
import { useMetricAtom } from "codemod:metrics";

function escapeRegex(str: string): string {
  return `^${str.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`;
}

const migrationMetric = useMetricAtom("catalog-node-alpha-migration");

type Outcome = "auto-migrated" | "manual-required";
type Reason =
  | "stabilized-import"
  | "stabilized-reexport"
  | "superseded-core-service-rewrite"
  | "superseded-type-removed"
  | "dangling-type-reference"
  | "removed-reexport"
  | "namespace-import";

function recordMigration(
  outcome: Outcome,
  exportName: string,
  reason: Reason,
): void {
  migrationMetric.increment({ outcome, export: exportName, reason });
}

/**
 * Exports that graduated from `/alpha` to the stable entry point in 1.50.
 * Same identifier, same API — only the import path changes.
 */
const STABILIZED_EXPORTS = new Set([
  "catalogServiceRef",
  "CatalogLocationsExtensionPoint",
  "catalogLocationsExtensionPoint",
  "CatalogProcessingExtensionPoint",
  "catalogProcessingExtensionPoint",
  "CatalogAnalysisExtensionPoint",
  "catalogAnalysisExtensionPoint",
]);

/**
 * Exports that were removed in 1.50 because the permission extension-point
 * mechanism was superseded by `coreServices.permissionsRegistry` from
 * `@backstage/backend-plugin-api`.
 */
const SUPERSEDED_EXPORTS = new Set([
  "CatalogPermissionRuleInput",
  "CatalogPermissionExtensionPoint",
  "catalogPermissionExtensionPoint",
]);

/**
 * The only superseded export that has a direct runtime replacement
 * (`coreServices.permissionsRegistry`). The other superseded exports are types
 * with no stable replacement.
 */
const SUPERSEDED_VALUE_EXPORT = "catalogPermissionExtensionPoint";

const ALPHA_SOURCE = "@backstage/plugin-catalog-node/alpha";
const STABLE_SOURCE = "@backstage/plugin-catalog-node";
const BACKEND_API_SOURCE = "@backstage/backend-plugin-api";

interface SpecifierInfo {
  importedName: string;
  localName: string;
  localNameNode: SgNode<TSX>;
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
      localNameNode,
      specText: spec.text(),
    });
  }

  return result;
}

function classify(specifiers: SpecifierInfo[]) {
  const stabilized: SpecifierInfo[] = [];
  const superseded: SpecifierInfo[] = [];
  const remaining: SpecifierInfo[] = [];

  for (const spec of specifiers) {
    if (STABILIZED_EXPORTS.has(spec.importedName)) {
      stabilized.push(spec);
    } else if (SUPERSEDED_EXPORTS.has(spec.importedName)) {
      superseded.push(spec);
    } else {
      remaining.push(spec);
    }
  }

  return { stabilized, superseded, remaining };
}

function isTypeOnlyStatement(
  node: SgNode<TSX, "import_statement" | "export_statement">,
): boolean {
  return node.children().some((c) => c.text() === "type");
}

function buildNamedStatement(
  keyword: "import" | "export",
  specTexts: string[],
  source: string,
  typeOnly: boolean,
): string {
  const typeKw = typeOnly ? "type " : "";
  if (specTexts.length <= 2) {
    return `${keyword} ${typeKw}{ ${specTexts.join(", ")} } from '${source}';`;
  }
  return `${keyword} ${typeKw}{\n  ${specTexts.join(",\n  ")},\n} from '${source}';`;
}

function collectBodyReferences(
  spec: SpecifierInfo,
  rootFilename: string,
): SgNode<TSX>[] {
  const declarationId = spec.localNameNode.id();
  const refs: SgNode<TSX>[] = [];

  for (const refGroup of spec.localNameNode.references()) {
    /**
     * Defend against `codemod@1.7.15`'s `.references()` returning cross-file
     * reference groups whose ranges belong to a different source file - applying
     * those edits to our current file corrupts unrelated spans.
     */
    if (refGroup.root.filename() !== rootFilename) continue;
    for (const refNode of refGroup.nodes) {
      if (refNode.id() === declarationId) continue;
      refs.push(refNode);
    }
  }

  return refs;
}

function mergeIntoTypeImport(
  existingImport: SgNode<TSX>,
  newSpecTexts: string[],
): Edit {
  const namedImports = existingImport.find({
    rule: { kind: "named_imports" },
  });
  if (!namedImports) {
    return existingImport.replace(existingImport.text());
  }

  const existingSpecs = namedImports
    .findAll({ rule: { kind: "import_specifier" } })
    .map((s) => s.text());

  const allSpecs = [...existingSpecs, ...newSpecTexts];
  const source = existingImport
    .find({ rule: { kind: "string_fragment" } })
    ?.text();

  const rebuilt = buildNamedStatement("import", allSpecs, source ?? "", true);
  return existingImport.replace(rebuilt);
}

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

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root() as SgNode<TSX, "program">;
  const edits: Edit[] = [];

  const supersededValueSpecs: SpecifierInfo[] = [];

  const filename = root.filename();

  const alphaImportStatements = findStatementsFrom(
    rootNode,
    "import_statement",
    ALPHA_SOURCE,
  );

  processImports(rootNode, edits, supersededValueSpecs, filename, alphaImportStatements);
  processExports(rootNode, edits);
  warnNamespaceImports(alphaImportStatements);
  replaceSupersededReferences(edits, supersededValueSpecs, filename);

  return edits.length > 0 ? rootNode.commitEdits(edits) : null;
};

function processImports(
  rootNode: SgNode<TSX, "program">,
  edits: Edit[],
  supersededValueSpecs: SpecifierInfo[],
  filename: string,
  alphaImportStatements: SgNode<TSX, "import_statement">[],
): void {
  const stableImportStatements = findStatementsFrom(
    rootNode,
    "import_statement",
    STABLE_SOURCE,
  );
  const firstStableTypeImport = stableImportStatements.find((s) =>
    isTypeOnlyStatement(s),
  );
  const firstStableValueImport = stableImportStatements.find(
    (s) => !isTypeOnlyStatement(s),
  );

  const backendImportStatements = findStatementsFrom(
    rootNode,
    "import_statement",
    BACKEND_API_SOURCE,
  );
  const firstBackendImport = backendImportStatements[0];

  for (const alphaImport of alphaImportStatements) {
    const hasNamespace = alphaImport.find({
      rule: { kind: "namespace_import" },
    });
    if (hasNamespace) continue;

    const typeOnly = isTypeOnlyStatement(alphaImport);
    const specifiers = extractSpecifiers(alphaImport, "import_specifier");
    const { stabilized, superseded, remaining } = classify(specifiers);

    if (stabilized.length === 0 && superseded.length === 0) continue;

    for (const spec of superseded) {
      if (spec.importedName === SUPERSEDED_VALUE_EXPORT) {
        supersededValueSpecs.push(spec);
      }
    }

    warnDanglingSupersededTypes(superseded, filename);

    let alphaReplacement = "";

    if (remaining.length > 0) {
      alphaReplacement = buildNamedStatement(
        "import",
        remaining.map((s) => s.specText),
        ALPHA_SOURCE,
        typeOnly,
      );
    }

    if (stabilized.length > 0) {
      const existingStableType = typeOnly ? firstStableTypeImport : undefined;
      const existingStableValue = !typeOnly ? firstStableValueImport : undefined;

      if (existingStableValue) {
        const edit = addImport(rootNode, {
          type: "named",
          specifiers: stabilized.map((s) => ({
            name: s.importedName,
            alias:
              s.localName !== s.importedName ? s.localName : undefined,
          })),
          from: STABLE_SOURCE,
        });
        if (edit) edits.push(edit);
      } else if (existingStableType) {
        edits.push(
          mergeIntoTypeImport(
            existingStableType,
            stabilized.map((s) => s.specText),
          ),
        );
      } else {
        const newImport = buildNamedStatement(
          "import",
          stabilized.map((s) => s.specText),
          STABLE_SOURCE,
          typeOnly,
        );
        alphaReplacement = alphaReplacement
          ? newImport + "\n" + alphaReplacement
          : newImport;
      }

      for (const s of stabilized) {
        recordMigration("auto-migrated", s.importedName, "stabilized-import");
      }
    }

    if (superseded.length > 0) {
      const hasValueExport = superseded.some(
        (s) => s.importedName === SUPERSEDED_VALUE_EXPORT,
      );

      if (hasValueExport) {
        if (firstBackendImport) {
          const edit = addImport(rootNode, {
            type: "named",
            specifiers: [{ name: "coreServices" }],
            from: BACKEND_API_SOURCE,
          });
          if (edit) edits.push(edit);
        } else {
          const newImport = buildNamedStatement(
            "import",
            ["coreServices"],
            BACKEND_API_SOURCE,
            false,
          );
          alphaReplacement = alphaReplacement
            ? alphaReplacement + "\n" + newImport
            : newImport;
        }
      }

      for (const s of superseded) {
        if (s.importedName === SUPERSEDED_VALUE_EXPORT) {
          recordMigration(
            "auto-migrated",
            s.importedName,
            "superseded-core-service-rewrite",
          );
        }
      }
    }

    edits.push(alphaImport.replace(alphaReplacement));
  }
}

function processExports(rootNode: SgNode<TSX, "program">, edits: Edit[]): void {
  const alphaExports = findStatementsFrom(
    rootNode,
    "export_statement",
    ALPHA_SOURCE,
  );

  for (const alphaExport of alphaExports) {
    const typeOnly = isTypeOnlyStatement(alphaExport);
    const specifiers = extractSpecifiers(alphaExport, "export_specifier");
    const { stabilized, superseded, remaining } = classify(specifiers);

    if (stabilized.length === 0 && superseded.length === 0) continue;

    let replacement = "";

    if (remaining.length > 0) {
      replacement = buildNamedStatement(
        "export",
        remaining.map((s) => s.specText),
        ALPHA_SOURCE,
        typeOnly,
      );
    }

    if (stabilized.length > 0) {
      const stableExport = buildNamedStatement(
        "export",
        stabilized.map((s) => s.specText),
        STABLE_SOURCE,
        typeOnly,
      );
      replacement = replacement
        ? stableExport + "\n" + replacement
        : stableExport;

      for (const s of stabilized) {
        recordMigration("auto-migrated", s.importedName, "stabilized-reexport");
      }
    }

    if (superseded.length > 0) {
      for (const s of superseded) {
        console.log(
          `[catalog-node-alpha-to-stable] Removed re-export of '${s.importedName}' — no direct re-export replacement exists. Use coreServices.permissionsRegistry from @backstage/backend-plugin-api instead.`,
        );
        recordMigration("manual-required", s.importedName, "removed-reexport");
      }
    }

    edits.push(alphaExport.replace(replacement));
  }
}

function warnNamespaceImports(
  alphaImportStatements: SgNode<TSX, "import_statement">[],
): void {
  for (const imp of alphaImportStatements) {
    const nsImport = imp.find({ rule: { kind: "namespace_import" } });
    if (nsImport) {
      const alias = nsImport.find({ rule: { kind: "identifier" } })?.text();
      console.log(
        `[catalog-node-alpha-to-stable] Cannot automatically migrate namespace import '${alias ?? "*"}' from '${ALPHA_SOURCE}'. Manual migration required.`,
      );
      recordMigration("manual-required", "*", "namespace-import");
    }
  }
}

function warnDanglingSupersededTypes(
  superseded: SpecifierInfo[],
  filename: string,
): void {
  const typeExports = superseded.filter(
    (s) => s.importedName !== SUPERSEDED_VALUE_EXPORT,
  );

  for (const spec of typeExports) {
    const bodyRefs = collectBodyReferences(spec, filename);

    if (bodyRefs.length > 0) {
      console.log(
        `[catalog-node-alpha-to-stable] '${spec.importedName}' is used in ${filename} but has no stable replacement type. Manual migration required.`,
      );
      recordMigration(
        "manual-required",
        spec.importedName,
        "dangling-type-reference",
      );
    } else {
      recordMigration(
        "auto-migrated",
        spec.importedName,
        "superseded-type-removed",
      );
    }
  }
}

function replaceSupersededReferences(
  edits: Edit[],
  specs: SpecifierInfo[],
  filename: string,
): void {
  for (const spec of specs) {
    for (const ref of collectBodyReferences(spec, filename)) {
      edits.push(ref.replace("coreServices.permissionsRegistry"));
    }
  }
}

export default transform;
