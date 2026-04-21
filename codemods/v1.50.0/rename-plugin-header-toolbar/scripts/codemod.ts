import type { Codemod, Edit } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

const migrationMetric = useMetricAtom("plugin-header-toolbar-rename");

const OLD_CLASS = "PluginHeaderToolbarWrapper";
const NEW_CLASS = "PluginHeaderToolbar";
const OLD_PROPERTY = "toolbarWrapper";
const NEW_PROPERTY = "toolbar";

const TODO_COMMENT =
  "/* TODO(backstage-codemod): wrapper element was removed — review child/descendant selectors */";

/**
 * Checks whether a string value contains a child or descendant combinator
 * after `PluginHeaderToolbarWrapper`, indicating a selector that may break
 * because the wrapper DOM element was removed.
 */
function hasDescendantOrChildCombinator(value: string): boolean {
  const pattern =
    /PluginHeaderToolbarWrapper\s*(?:>|\s+(?!\s*[{,'"`]))\s*\S/;
  return pattern.test(value);
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  // 1. Find all string_fragment nodes containing PluginHeaderToolbarWrapper
  //    This covers: string literals, template literals, object property keys
  const stringFragments = rootNode.findAll({
    rule: {
      kind: "string_fragment",
      regex: OLD_CLASS,
    },
  });

  for (const fragment of stringFragments) {
    const text = fragment.text();
    const newText = text.replaceAll(OLD_CLASS, NEW_CLASS);

    // Check if the string contains a child/descendant combinator
    if (hasDescendantOrChildCombinator(text)) {
      // Find the pair (object property) that contains this string to insert TODO before it
      const commentTarget = fragment
        .ancestors()
        .find((a) => a.is("pair"));

      if (commentTarget) {
        const startPos = commentTarget.range().start.index;
        const fullText = rootNode.text();
        let lineStart = startPos;
        while (lineStart > 0 && fullText[lineStart - 1] !== "\n") {
          lineStart--;
        }
        const indent = fullText.slice(lineStart, startPos);

        edits.push({
          startPos,
          endPos: startPos,
          insertedText: TODO_COMMENT + "\n" + indent,
        });
      }

      migrationMetric.increment({
        type: "descendant-selector",
        action: "renamed-with-todo",
      });
    } else {
      migrationMetric.increment({
        type: "class-name",
        action: "renamed",
      });
    }

    edits.push(fragment.replace(newText));
  }

  // 2. Find classNames.toolbarWrapper property accesses and rename to classNames.toolbar
  //    Covers both `classNames.toolbarWrapper` and `X.classNames.toolbarWrapper`
  const classNameAccesses = rootNode.findAll({
    rule: {
      any: [
        { pattern: "$OBJ.classNames.toolbarWrapper" },
        { pattern: "classNames.toolbarWrapper" },
      ],
    },
  });

  const handledPropIds = new Set<number>();

  for (const match of classNameAccesses) {
    const propNode = match.find({
      rule: {
        kind: "property_identifier",
        regex: `^${OLD_PROPERTY}$`,
      },
    });

    if (propNode && !handledPropIds.has(propNode.id())) {
      handledPropIds.add(propNode.id());
      edits.push(propNode.replace(NEW_PROPERTY));
      migrationMetric.increment({
        type: "property-access",
        action: "renamed",
      });
    }
  }

  return edits.length > 0 ? rootNode.commitEdits(edits) : null;
};

export default transform;
