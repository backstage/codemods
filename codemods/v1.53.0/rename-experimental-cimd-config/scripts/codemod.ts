import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type YAML from 'codemod:ast-grep/langs/yaml'

const OLD_KEY = 'experimentalClientIdMetadataDocuments'
const NEW_KEY = 'clientIdMetadataDocuments'
const COLLISION_COMMENT =
  '# TODO(backstage-codemod): reconcile experimentalClientIdMetadataDocuments with clientIdMetadataDocuments'

type YamlNode = SgNode<YAML>

function keyText(pair: YamlNode): string | null {
  const text = pair.field('key')?.text()
  if (text === undefined) {
    return null
  }
  if (text.startsWith('"') && text.endsWith('"')) {
    try {
      const jsonText = text
        .replaceAll(/\\x([0-9a-fA-F]{2})/g, '\\u00$1')
        .replaceAll(/\\U([0-9a-fA-F]{8})/g, (_, hex: string) =>
          JSON.stringify(String.fromCodePoint(Number.parseInt(hex, 16))).slice(1, -1),
        )
      return JSON.parse(jsonText) as string
    } catch {
      return null
    }
  }
  if (text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replaceAll("''", "'")
  }
  return text
}

function mappingOf(node: YamlNode | null): YamlNode | undefined {
  return node?.children().find((child) => child.kind() === 'block_mapping' || child.kind() === 'flow_mapping')
}

const transform: Codemod<YAML> = async (root) => {
  const source = root.source()
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const lines = source.split('\n')
  const edits: Edit[] = []

  for (const document of root
    .root()
    .children()
    .filter((child) => child.kind() === 'document')) {
    const topLevel = mappingOf(
      document.children().find((child) => child.kind() === 'block_node' || child.kind() === 'flow_node') ?? null,
    )
    for (const auth of topLevel
      ?.children()
      .filter(
        (pair) => (pair.kind() === 'block_mapping_pair' || pair.kind() === 'flow_pair') && keyText(pair) === 'auth',
      ) ?? []) {
      const mapping = mappingOf(auth.field('value'))
      const pairs =
        mapping?.children().filter((child) => child.kind() === 'block_mapping_pair' || child.kind() === 'flow_pair') ??
        []
      const hasStableKey = pairs.some((pair) => keyText(pair) === NEW_KEY)

      for (const pair of pairs.filter((item) => keyText(item) === OLD_KEY)) {
        const key = pair.field('key')
        if (!key) {
          continue
        }
        if (!hasStableKey) {
          const [quote] = key.text()
          edits.push(key.replace(quote === '"' || quote === "'" ? `${quote}${NEW_KEY}${quote}` : NEW_KEY))
          continue
        }

        // AST offsets count UTF-8 bytes; source slices use JavaScript character positions.
        const { index: start, line, column } = key.range().start
        const precedingLine = lines[line - 1]?.trim()
        if (precedingLine === COLLISION_COMMENT) {
          continue
        }

        const prefix = (lines[line] ?? '').slice(0, column)
        if (/^[ \t]*$/.test(prefix)) {
          edits.push({
            startPos: start,
            endPos: start,
            insertedText: `${COLLISION_COMMENT}${newline}${prefix}`,
          })
        } else {
          // A flow pair shares a line with `{` or a sibling: break before its key so the TODO stays adjacent.
          const authIndent = lines[auth.range().start.line]?.match(/^[ \t]*/)?.[0] ?? ''
          const precedingWhitespace = prefix.match(/[ \t]*$/)?.[0] ?? ''
          edits.push({
            startPos: start - precedingWhitespace.length,
            endPos: start,
            insertedText: `${newline}${authIndent}  ${COLLISION_COMMENT}${newline}${authIndent}  `,
          })
        }
      }
    }
  }

  await Promise.resolve()
  return edits.length ? root.root().commitEdits(edits) : null
}

export default transform
