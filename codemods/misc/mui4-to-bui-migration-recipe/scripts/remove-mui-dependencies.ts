import type { Codemod } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const muiUsageMetric = useMetricAtom('mui-import-usage')

const MUI_PACKAGES = ['@material-ui/core', '@material-ui/icons', '@material-ui/lab', '@material-ui/styles'] as const

type MuiPackage = (typeof MUI_PACKAGES)[number]

function normalizeFilepath(filepath: string): string {
  let normalized = filepath.replaceAll('\\', '/')
  if (normalized.startsWith('/?/')) {
    normalized = normalized.slice(3)
  } else if (/^\/[A-Za-z]:\//.test(normalized)) {
    normalized = normalized.slice(1)
  }
  return normalized
}

function dirname(filepath: string): string {
  const normalized = normalizeFilepath(filepath)
  const idx = normalized.lastIndexOf('/')
  return idx === -1 ? '.' : normalized.slice(0, idx)
}

function getWorkspacePackage(root: { filename(): string; relativeFilename(): string }): string {
  const relative = root.relativeFilename()
  if (relative && relative !== 'anonymous') {
    const normalized = normalizeFilepath(relative)
    for (const marker of ['/src/', '/dev/']) {
      const idx = normalized.indexOf(marker)
      if (idx !== -1) {
        return normalized.slice(0, idx)
      }
    }
    return dirname(normalized)
  }
  return dirname(normalizeFilepath(root.filename()))
}

function getMuiPackagesFromSource(source: string): Set<MuiPackage> {
  const used = new Set<MuiPackage>()
  for (const pkg of MUI_PACKAGES) {
    if (source.includes(pkg)) {
      used.add(pkg)
    }
  }
  return used
}

const transform: Codemod<TSX> = (root) => {
  const used = getMuiPackagesFromSource(root.root().text())
  if (used.size === 0) {
    return Promise.resolve(null)
  }

  const workspacePackage = getWorkspacePackage(root)
  for (const pkg of used) {
    muiUsageMetric.increment({ workspacePackage, muiPackage: pkg })
  }

  return Promise.resolve(null)
}

export default transform
