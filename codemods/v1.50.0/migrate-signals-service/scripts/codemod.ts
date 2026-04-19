import { getImport } from "@jssg/utils/javascript/imports";
import type { Codemod, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

const SIGNALS_NODE = "@backstage/plugin-signals-node";

const RENAME_MAP = {
  SignalService: "SignalsService",
  DefaultSignalService: "DefaultSignalsService",
  signalService: "signalsServiceRef",
  SignalServiceOptions: "SignalsServiceOptions",
} as const;

type DeprecatedExport = keyof typeof RENAME_MAP;
const DEPRECATED_EXPORTS = Object.keys(RENAME_MAP) as DeprecatedExport[];

const renamedExports = useMetricAtom("signals-service-renames");

const transform: Codemod<TSX> = async root => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  for (const name of DEPRECATED_EXPORTS) {
    const imp = getImport(rootNode, { type: "named", name, from: SIGNALS_NODE });
    if (!imp || imp.isNamespace || imp.moduleType !== "esm") continue;

    const specifier = imp.node.parent();
    if (!specifier || !specifier.is("import_specifier")) continue;

    const identifiers = specifier.children().filter(c => c.is("identifier"));
    const importedNameNode = identifiers[0] as SgNode<TSX> | undefined;
    if (!importedNameNode) continue;
    const localNameNode = (identifiers[1] as SgNode<TSX> | undefined) ?? importedNameNode;

    const replacement = RENAME_MAP[name];
    renamedExports.increment({ from: name, to: replacement });
    edits.push(importedNameNode.replace(replacement));

    /**
     * Only rewrite local references when the binding is not aliased. With
     * `import { X as Y }`, callers use `Y` and must stay untouched - only the
     * imported name `X` inside the specifier is renamed.
     */
    if (imp.alias !== name) continue;

    for (const refGroup of localNameNode.references()) {
      /**
       * Defend against `codemod@1.7.15`'s `.references()` returning cross-file
       * reference groups whose ranges belong to a different source file - applying
       * those edits to our current file corrupts unrelated spans (e.g. the import
       * source string). When a fixed CLI release lands, this guard can go.
       */
      if (refGroup.root.filename() !== root.filename()) continue;
      for (const refNode of refGroup.nodes) {
        if (refNode.id() === localNameNode.id()) continue;
        edits.push(refNode.replace(replacement));
      }
    }
  }

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default transform;
