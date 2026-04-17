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

const renamedExports = useMetricAtom("signals-service-renames");

function getImportSource(node: SgNode<TSX, "import_statement">): string | null {
  const source = node.find({
    rule: { kind: "string_fragment" },
  });
  return source?.text() ?? null;
}

function getImportSpecifiers(
  node: SgNode<TSX, "import_statement">,
): SgNode<TSX, "import_specifier">[] {
  return node.findAll({
    rule: { kind: "import_specifier" },
  });
}

function getSpecifierImportedAndLocalNames(
  specifier: SgNode<TSX, "import_specifier">,
): { imported: string; local: string; importedNode: SgNode<TSX>; localNode: SgNode<TSX> } | null {
  const identifiers = specifier.children().filter(c => c.is("identifier"));
  const importedNode = identifiers[0];
  if (!importedNode) return null;

  const localNode = identifiers[1] ?? importedNode;
  const imported = importedNode.text();
  const local = localNode.text();

  return { imported, local, importedNode, localNode };
}

function isDeprecatedExport(name: string): name is DeprecatedExport {
  return Object.prototype.hasOwnProperty.call(RENAME_MAP, name);
}

const transform: Codemod<TSX> = async root => {
  const rootNode = root.root();
  const edits: Edit[] = [];
  const importStatements = rootNode
    .findAll({
      rule: { kind: "import_statement" },
    })
    .filter((node): node is SgNode<TSX, "import_statement"> =>
      node.is("import_statement"),
    );

  for (const importStatement of importStatements) {
    if (getImportSource(importStatement) !== SIGNALS_NODE) continue;

    for (const specifier of getImportSpecifiers(importStatement)) {
      const names = getSpecifierImportedAndLocalNames(specifier);
      if (!names) continue;
      if (!isDeprecatedExport(names.imported)) continue;

      const replacement = RENAME_MAP[names.imported];
      renamedExports.increment({
        from: names.imported,
        to: replacement,
      });

      edits.push(names.importedNode.replace(replacement));

      if (names.local !== names.imported) continue;

      for (const refGroup of names.localNode.references()) {
        if (refGroup.root.filename() !== root.filename()) continue;
        for (const refNode of refGroup.nodes) {
          if (refNode.id() === names.localNode.id()) continue;
          edits.push(refNode.replace(replacement));
        }
      }
    }
  }

  if (edits.length === 0) {
    return null;
  }

  return rootNode.commitEdits(edits);
};

export default transform;
