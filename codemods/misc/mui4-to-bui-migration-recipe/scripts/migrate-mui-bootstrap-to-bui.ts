import { getAllImports, listImports } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-bootstrap-to-bui')

const BUI_CSS_IMPORT = '@backstage/ui/css/styles.css'

function normalizeFilePath(filename: string): string {
  return filename.replace(/^\\\\\?\\/, '').replaceAll('\\', '/')
}

/**
 * Match Backstage app/plugin entry files where the global BUI stylesheet belongs.
 */
function isAppEntryFile(filename: string, rootNode: SgNode<TSX, 'program'>): boolean {
  const normalized = normalizeFilePath(filename)

  if (/(?:^|\/)packages\/app\/src\/App\.tsx?$/.test(normalized)) {
    return true
  }
  if (/(?:^|\/)src\/index\.tsx?$/.test(normalized)) {
    return true
  }
  if (/(?:^|\/)src\/plugin\.tsx?$/.test(normalized)) {
    return true
  }

  // Typical app bootstrap entry when the filename is index.tsx content (e.g. jssg fixtures).
  if (getAllImports(rootNode, { type: 'named', name: 'createRoot', from: 'react-dom/client' }).length > 0) {
    return true
  }

  return false
}

function hasMuiImports(rootNode: SgNode<TSX, 'program'>): boolean {
  return listImports(rootNode).some((item) => item.source.startsWith('@material-ui/'))
}

function hasBuiCssImport(rootNode: SgNode<TSX, 'program'>): boolean {
  return listImports(rootNode, { from: BUI_CSS_IMPORT }).length > 0
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  if (!isAppEntryFile(root.filename(), rootNode)) {
    return Promise.resolve(null)
  }

  // Only process entry files that contain @material-ui imports
  if (!hasMuiImports(rootNode)) {
    return Promise.resolve(null)
  }

  // Skip if the BUI CSS import is already present
  if (hasBuiCssImport(rootNode)) {
    migrationMetric.increment({ action: 'already-bootstrapped' })
    return Promise.resolve(null)
  }

  // Find the first import statement to insert before it
  const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
  if (allImports.length === 0) {
    return Promise.resolve(null)
  }

  const [firstImport] = allImports
  if (!firstImport) {
    return Promise.resolve(null)
  }

  // Insert the BUI CSS import before the first import
  edits.push(firstImport.replace(`import '${BUI_CSS_IMPORT}';\n${firstImport.text()}`))
  migrationMetric.increment({ action: 'css-import-added' })

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
