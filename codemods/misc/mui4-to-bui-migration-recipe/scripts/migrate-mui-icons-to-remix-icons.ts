import { addImport, listImports } from '@jssg/utils/javascript/imports'
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

interface IconImportInfo {
  localName: string
  muiIconName: string
  remixName: string | null
  importNode: SgNode<TSX>
}

function collectIconImports(rootNode: SgNode<TSX, 'program'>): {
  icons: IconImportInfo[]
  namespaceImports: SgNode<TSX>[]
} {
  const icons: IconImportInfo[] = []
  const namespaceImports: SgNode<TSX>[] = []

  for (const item of listImports(rootNode)) {
    if (item.node.kind() !== 'import_statement' || !item.source.startsWith('@material-ui/icons')) {
      continue
    }

    if (item.namespaceName !== null) {
      namespaceImports.push(item.node)
      continue
    }

    if (item.source !== '@material-ui/icons') {
      const muiIconName = item.source.replace('@material-ui/icons/', '')
      if (item.defaultName) {
        icons.push({
          localName: item.defaultName,
          muiIconName,
          remixName: ICON_MAP[muiIconName] ?? null,
          importNode: item.node,
        })
      }
      continue
    }

    for (const spec of item.specifiers) {
      icons.push({
        localName: spec.localName,
        muiIconName: spec.importedName,
        remixName: ICON_MAP[spec.importedName] ?? null,
        importNode: item.node,
      })
    }
  }

  return { icons, namespaceImports }
}

function addRemixImports(rootNode: SgNode<TSX, 'program'>, remixImports: Map<string, string>, edits: Edit[]): void {
  if (remixImports.size === 0) {
    return
  }

  const addEdit = addImport(rootNode, {
    type: 'named',
    specifiers: [...remixImports.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([remixName, localName]) => ({ name: remixName, alias: localName !== remixName ? localName : undefined })),
    from: REMIX_SOURCE,
  })
  if (addEdit) {
    edits.push(addEdit)
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

function transformIconJsx(rootNode: SgNode<TSX, 'program'>, iconLocalNames: Set<string>, edits: Edit[]): void {
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

    const droppedProps = new Set<string>()
    if (sizeNum) {
      droppedProps.add('fontSize')
    }
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

function isBlueprintMakeCall(call: SgNode<TSX>): boolean {
  const fn = call.field('function')
  if (fn?.kind() !== 'member_expression') {
    return false
  }

  const method = fn.find({ rule: { kind: 'property_identifier' } })?.text()
  if (method !== 'make' && method !== 'makeWithOverrides') {
    return false
  }

  return /Blueprint\.(?:make|makeWithOverrides)$/.test(fn.text().replaceAll(/\s/g, ''))
}

function isObjectInExtensionConfig(objectNode: SgNode<TSX>): boolean {
  let current: SgNode<TSX> | null = objectNode
  while (current) {
    if (current.kind() === 'arguments') {
      const call = current.parent()
      if (call?.kind() === 'call_expression' && isBlueprintMakeCall(call)) {
        return true
      }
    }
    current = current.parent()
  }
  return false
}

function isExtensionConfigIconPair(pair: SgNode<TSX>): boolean {
  let current: SgNode<TSX> | null = pair
  while (current) {
    if (current.kind() === 'object' && isObjectInExtensionConfig(current)) {
      return true
    }
    current = current.parent()
  }
  return false
}

function transformExtensionIconSlots(
  rootNode: SgNode<TSX, 'program'>,
  iconLocalNames: Set<string>,
  edits: Edit[],
): void {
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
    if (!isExtensionConfigIconPair(pair)) {
      continue
    }

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
