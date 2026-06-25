import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-icons-to-remix-icons')

const REMIX_SOURCE = '@remixicon/react'

/**
 * MUI icon name (matching the module path after @material-ui/icons/) → Remix icon named export.
 * Representative subset of the most common Backstage icons.
 */
const ICON_MAP: Record<string, string> = {
  Search: 'RiSearchLine',
  Close: 'RiCloseLine',
  Delete: 'RiDeleteBinLine',
  Edit: 'RiEditLine',
  Add: 'RiAddLine',
  Remove: 'RiSubtractLine',
  Check: 'RiCheckLine',
  Clear: 'RiCloseLine',
  Settings: 'RiSettings3Line',
  Home: 'RiHomeLine',
  Menu: 'RiMenuLine',
  MoreVert: 'RiMore2Line',
  MoreHoriz: 'RiMoreLine',
  ArrowBack: 'RiArrowLeftLine',
  ArrowForward: 'RiArrowRightLine',
  ArrowDropDown: 'RiArrowDownSLine',
  ArrowDropUp: 'RiArrowUpSLine',
  ExpandMore: 'RiArrowDownSLine',
  ExpandLess: 'RiArrowUpSLine',
  ChevronLeft: 'RiArrowLeftSLine',
  ChevronRight: 'RiArrowRightSLine',
  Visibility: 'RiEyeLine',
  VisibilityOff: 'RiEyeOffLine',
  Star: 'RiStarLine',
  StarBorder: 'RiStarLine',
  Favorite: 'RiHeartLine',
  FavoriteBorder: 'RiHeartLine',
  Person: 'RiUserLine',
  People: 'RiGroupLine',
  Group: 'RiGroupLine',
  Lock: 'RiLockLine',
  LockOpen: 'RiLockUnlockLine',
  Notifications: 'RiNotification3Line',
  Email: 'RiMailLine',
  Link: 'RiLinkLine',
  OpenInNew: 'RiExternalLinkLine',
  FileCopy: 'RiFileCopyLine',
  ContentCopy: 'RiFileCopyLine',
  Refresh: 'RiRefreshLine',
  Info: 'RiInformationLine',
  Warning: 'RiAlertLine',
  Error: 'RiErrorWarningLine',
  ErrorOutline: 'RiErrorWarningLine',
  Help: 'RiQuestionLine',
  HelpOutline: 'RiQuestionLine',
  Save: 'RiSaveLine',
  Folder: 'RiFolderLine',
  FolderOpen: 'RiFolderOpenLine',
  InsertDriveFile: 'RiFileLine',
  Description: 'RiFileTextLine',
  Code: 'RiCodeLine',
  Build: 'RiHammerLine',
  Dashboard: 'RiDashboardLine',
  Category: 'RiGridLine',
  FilterList: 'RiFilterLine',
  Sort: 'RiSortAsc',
  PlayArrow: 'RiPlayLine',
  Pause: 'RiPauseLine',
  Stop: 'RiStopLine',
  Language: 'RiGlobalLine',
  Schedule: 'RiTimeLine',
  AccessTime: 'RiTimeLine',
  CalendarToday: 'RiCalendarLine',
  Dns: 'RiServerLine',
  Storage: 'RiDatabase2Line',
  Security: 'RiShieldLine',
  VpnKey: 'RiKeyLine',
  AccountTree: 'RiGitBranchLine',
  GitHub: 'RiGithubLine',
  BugReport: 'RiBugLine',
  Extension: 'RiPuzzleLine',
  Layers: 'RiStackLine',
  Apps: 'RiApps2Line',
  ExitToApp: 'RiLogoutBoxLine',
  Publish: 'RiUploadLine',
  GetApp: 'RiDownloadLine',
  Share: 'RiShareLine',
  AttachFile: 'RiAttachmentLine',
}

/** fontSize string value → numeric Remix size prop. */
const FONT_SIZE_MAP: Record<string, number> = {
  small: 16,
  inherit: 20,
  default: 24,
  large: 35,
}

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findImportStatementsFrom(rootNode: SgNode<TSX>, source: string): SgNode<TSX>[] {
  return rootNode.findAll({
    rule: {
      kind: 'import_statement',
      has: {
        kind: 'string',
        has: {
          kind: 'string_fragment',
          regex: `^${escapeRegex(source)}$`,
        },
      },
    },
  })
}

function getDefaultImportName(imp: SgNode<TSX>): string | null {
  const clause = imp.find({ rule: { kind: 'import_clause' } })
  if (!clause) {
    return null
  }
  for (const child of clause.children()) {
    if (child.is('identifier')) {
      return child.text()
    }
  }
  return null
}

interface IconImportInfo {
  localName: string
  muiIconName: string
  remixName: string | null
  importNode: SgNode<TSX>
}

function collectIconImports(rootNode: SgNode<TSX>): {
  icons: IconImportInfo[]
  namespaceImports: SgNode<TSX>[]
} {
  const icons: IconImportInfo[] = []
  const namespaceImports: SgNode<TSX>[] = []

  const allImports = rootNode.findAll({
    rule: {
      kind: 'import_statement',
      has: {
        kind: 'string',
        has: {
          kind: 'string_fragment',
          regex: '^@material-ui/icons',
        },
      },
    },
  })

  for (const imp of allImports) {
    const nsImport = imp.find({ rule: { kind: 'namespace_import' } })
    if (nsImport) {
      namespaceImports.push(imp)
      continue
    }

    const stringFrag = imp.find({
      rule: {
        kind: 'string_fragment',
        regex: '^@material-ui/icons',
      },
    })
    if (!stringFrag) {
      continue
    }

    const sourcePath = stringFrag.text()

    if (sourcePath !== '@material-ui/icons') {
      const muiIconName = sourcePath.replace('@material-ui/icons/', '')
      const localName = getDefaultImportName(imp)
      if (localName) {
        icons.push({
          localName,
          muiIconName,
          remixName: ICON_MAP[muiIconName] ?? null,
          importNode: imp,
        })
      }
      continue
    }

    const specifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
    for (const spec of specifiers) {
      const identifiers = spec.findAll({
        rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
      })
      const [importedNameNode] = identifiers
      if (!importedNameNode) {
        continue
      }
      const muiIconName = importedNameNode.text()
      const localNameNode = identifiers[1] ?? importedNameNode
      icons.push({
        localName: localNameNode.text(),
        muiIconName,
        remixName: ICON_MAP[muiIconName] ?? null,
        importNode: imp,
      })
    }
  }

  return { icons, namespaceImports }
}

function addRemixImports(rootNode: SgNode<TSX>, remixImports: Map<string, string>, edits: Edit[]): void {
  if (remixImports.size === 0) {
    return
  }

  const existingImports = findImportStatementsFrom(rootNode, REMIX_SOURCE)
  const existingImport = existingImports[0] ?? null

  const specifiers: string[] = []
  for (const [remixName, localName] of remixImports) {
    if (remixName === localName) {
      specifiers.push(remixName)
    } else {
      specifiers.push(`${remixName} as ${localName}`)
    }
  }
  specifiers.sort()

  if (existingImport) {
    const namedImports = existingImport.find({ rule: { kind: 'named_imports' } })
    if (namedImports) {
      const text = namedImports.text()
      const inner = text.slice(1, -1).trim()
      const existing = inner
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
      for (const spec of specifiers) {
        if (!existing.includes(spec)) {
          existing.push(spec)
        }
      }
      existing.sort()
      edits.push(namedImports.replace(`{ ${existing.join(', ')} }`))
    }
  } else {
    const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
    if (allImports.length > 0) {
      const lastImport = allImports.at(-1)
      if (lastImport) {
        edits.push(
          lastImport.replace(`${lastImport.text()}\nimport { ${specifiers.join(', ')} } from '${REMIX_SOURCE}';`),
        )
      }
    }
  }

  migrationMetric.increment({ action: 'remix-import-added' })
}

function getElementName(opening: SgNode<TSX>): string | null {
  for (const child of opening.children()) {
    if (child.is('identifier') || child.is('member_expression')) {
      return child.text()
    }
  }
  return null
}

function getPropAttr(opening: SgNode<TSX>, propName: string): SgNode<TSX> | null {
  return opening.find({
    rule: {
      kind: 'jsx_attribute',
      has: {
        kind: 'property_identifier',
        regex: `^${escapeRegex(propName)}$`,
      },
    },
  })
}

function getPropStringValue(opening: SgNode<TSX>, propName: string): string | null {
  const attr = getPropAttr(opening, propName)
  if (!attr) {
    return null
  }
  const stringNode = attr.find({ rule: { kind: 'string' } })
  if (stringNode) {
    const frag = stringNode.find({ rule: { kind: 'string_fragment' } })
    return frag?.text() ?? null
  }
  return null
}

function transformIconJsx(rootNode: SgNode<TSX>, iconLocalNames: Set<string>, edits: Edit[]): void {
  const jsxElements = rootNode.findAll({
    rule: {
      kind: 'jsx_self_closing_element',
    },
  })

  for (const el of jsxElements) {
    const name = getElementName(el)
    if (!name || !iconLocalNames.has(name)) {
      continue
    }

    const fontSizeValue = getPropStringValue(el, 'fontSize')
    const sizeNum = fontSizeValue ? (FONT_SIZE_MAP[fontSizeValue] ?? null) : null

    const newProps: string[] = []
    if (sizeNum) {
      newProps.push(`size={${sizeNum}}`)
    }

    const droppedProps = new Set(['fontSize', 'color'])
    const allAttrs = el.findAll({ rule: { kind: 'jsx_attribute' } })
    for (const attr of allAttrs) {
      const propIdent = attr.find({ rule: { kind: 'property_identifier' } })
      if (!propIdent) {
        continue
      }
      if (droppedProps.has(propIdent.text())) {
        continue
      }
      newProps.push(attr.text())
    }

    const spreadAttrs = el.findAll({ rule: { kind: 'jsx_expression' } })
    for (const spread of spreadAttrs) {
      if (spread.text().startsWith('{...')) {
        newProps.push(spread.text())
      }
    }

    const propsStr = newProps.length > 0 ? ` ${newProps.join(' ')}` : ''
    edits.push(el.replace(`<${name}${propsStr} />`))
    migrationMetric.increment({ action: 'jsx-migrated' })
  }
}

function transformExtensionIconSlots(rootNode: SgNode<TSX>, iconLocalNames: Set<string>, edits: Edit[]): void {
  const iconPairs = rootNode.findAll({
    rule: {
      kind: 'pair',
      has: {
        kind: 'property_identifier',
        regex: '^icon$',
      },
    },
  })

  for (const pair of iconPairs) {
    const valueNode = pair.field('value')
    if (!valueNode || !valueNode.is('identifier')) {
      continue
    }

    const iconName = valueNode.text()
    if (!iconLocalNames.has(iconName)) {
      continue
    }

    edits.push(pair.replace(`icon: () => <${iconName} />`))
    migrationMetric.increment({ action: 'extension-icon-wrapped' })
  }
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { icons, namespaceImports } = collectIconImports(rootNode)

  if (icons.length === 0 && namespaceImports.length === 0) {
    return Promise.resolve(null)
  }

  for (const nsImp of namespaceImports) {
    edits.push(
      nsImp.replace(
        `${nsImp.text()}\n/* TODO(backstage-codemod): migrate this MUI icon namespace import to Remix icons manually */`,
      ),
    )
    migrationMetric.increment({ action: 'todo-inserted', reason: 'namespace-import' })
  }

  const remixImports = new Map<string, string>()
  const iconLocalNames = new Set<string>()
  const processedImportIds = new Set<number>()

  for (const icon of icons) {
    if (icon.remixName) {
      remixImports.set(icon.remixName, icon.localName)
      iconLocalNames.add(icon.localName)

      if (!processedImportIds.has(icon.importNode.id())) {
        edits.push(icon.importNode.replace(''))
        processedImportIds.add(icon.importNode.id())
      }
      migrationMetric.increment({ action: 'import-replaced', from: icon.muiIconName, to: icon.remixName })
    } else {
      edits.push(
        icon.importNode.replace(
          `${icon.importNode.text()}\n/* TODO(backstage-codemod): migrate this MUI icon to a Remix icon manually */`,
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: 'unknown-icon' })
    }
  }

  addRemixImports(rootNode, remixImports, edits)
  transformIconJsx(rootNode, iconLocalNames, edits)
  transformExtensionIconSlots(rootNode, iconLocalNames, edits)

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
