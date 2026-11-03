import { addImport, getImport, removeImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-alert-to-bui-alert')

const SEVERITY_TO_STATUS: Record<string, string> = {
  error: 'danger',
  warning: 'warning',
  info: 'info',
  success: 'success',
}

const BUI_SOURCE = '@backstage/ui'
const MUI_LAB_ALERT_SOURCE = '@material-ui/lab/Alert'
const MUI_CORE_ALERT_SOURCE = '@material-ui/core/Alert'
const MUI_LAB_ALERT_TITLE_SOURCE = '@material-ui/lab/AlertTitle'
const MUI_CORE_BARREL = '@material-ui/core'
const MUI_LAB_BARREL = '@material-ui/lab'

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function withTodoComment(comment: string, elementText: string): string {
  return `<>
  ${comment}
  ${elementText}
</>`
}

function getSeverityValue(opening: SgNode<TSX>): { value: string | null; isDynamic: boolean } {
  const severityAttr = opening.find({
    rule: {
      kind: 'jsx_attribute',
      has: {
        kind: 'property_identifier',
        regex: '^severity$',
      },
    },
  })

  if (!severityAttr) {
    return { value: null, isDynamic: false }
  }

  const stringNode = severityAttr.find({ rule: { kind: 'string' } })
  if (stringNode) {
    const frag = stringNode.find({ rule: { kind: 'string_fragment' } })
    return { value: frag?.text() ?? null, isDynamic: false }
  }

  const exprNode = severityAttr.find({ rule: { kind: 'jsx_expression' } })
  if (exprNode) {
    return { value: exprNode.text(), isDynamic: true }
  }

  return { value: null, isDynamic: false }
}

function hasProp(opening: SgNode<TSX>, propName: string): boolean {
  const attr = opening.find({
    rule: {
      kind: 'jsx_attribute',
      has: {
        kind: 'property_identifier',
        regex: `^${escapeRegex(propName)}$`,
      },
    },
  })
  return attr !== null
}

function getPropRawValue(opening: SgNode<TSX>, propName: string): string | null {
  const attr = opening.find({
    rule: {
      kind: 'jsx_attribute',
      has: {
        kind: 'property_identifier',
        regex: `^${escapeRegex(propName)}$`,
      },
    },
  })
  if (!attr) {
    return null
  }
  for (const child of attr.children()) {
    const kind = child.kind()
    if (kind === 'string' || kind === 'jsx_expression') {
      return child.text()
    }
  }
  return ''
}

function shouldAddDefaultIcon(opening: SgNode<TSX>): boolean {
  if (hasProp(opening, 'iconMapping')) {
    return false
  }
  if (!hasProp(opening, 'icon')) {
    return true
  }
  const iconValue = getPropRawValue(opening, 'icon')
  return iconValue === '' || iconValue === '{true}' || iconValue === 'true'
}

function extractChildContent(
  element: SgNode<TSX>,
  alertTitleLocalName: string | null,
): { title: string | null; description: string | null; hasComplexContent: boolean } {
  if (!element.is('jsx_element')) {
    return { title: null, description: null, hasComplexContent: false }
  }

  let title: string | null = null
  let hasComplexContent = false
  const descriptionParts: string[] = []

  for (const child of element.children()) {
    const kind = child.kind()

    if (kind === 'jsx_opening_element' || kind === 'jsx_closing_element') {
      continue
    }

    if (kind === 'jsx_text') {
      const trimmed = child.text().trim()
      if (trimmed.length > 0) {
        descriptionParts.push(trimmed)
      }
      continue
    }

    if (kind === 'jsx_element' && alertTitleLocalName) {
      const opening = child.child(0)
      const nameNode = opening?.child(1)
      if (nameNode?.text() === alertTitleLocalName) {
        const titleParts: string[] = []
        for (const titleChild of child.children()) {
          if (titleChild.kind() === 'jsx_opening_element' || titleChild.kind() === 'jsx_closing_element') {
            continue
          }
          if (titleChild.kind() === 'jsx_text') {
            const t = titleChild.text().trim()
            if (t.length > 0) {
              titleParts.push(t)
            }
          } else {
            hasComplexContent = true
          }
        }
        if (titleParts.length > 0) {
          title = titleParts.join(' ')
        }
        continue
      }
    }

    if (kind === 'jsx_element' || kind === 'jsx_self_closing_element' || kind === 'jsx_expression') {
      hasComplexContent = true
      continue
    }
  }

  const description = descriptionParts.length > 0 ? descriptionParts.join(' ') : null
  return { title, description, hasComplexContent }
}

function transformAlertElements(
  rootNode: SgNode<TSX>,
  alertLocalName: string,
  alertTitleLocalName: string | null,
  edits: Edit[],
): { preserveImport: boolean; migrated: boolean } {
  let preserveImport = false
  let migrated = false
  const jsxElements = rootNode.findAll({
    rule: {
      any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
    },
  })

  for (const el of jsxElements) {
    const isSelfClosing = el.is('jsx_self_closing_element')
    const opening = isSelfClosing ? el : el.child(0)
    if (!opening) {
      continue
    }

    const nameNode = opening.child(1)
    if (!nameNode || nameNode.text() !== alertLocalName) {
      continue
    }

    const insertTodo = (reason: string) => {
      preserveImport = true
      edits.push(
        el.replace(
          withTodoComment(
            '{/* TODO(backstage-codemod): migrate Alert actions or complex children manually */}',
            el.text(),
          ),
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason })
    }

    if (hasProp(opening, 'action') || hasProp(opening, 'onClose')) {
      insertTodo('action-or-onClose')
      continue
    }

    const { value: severityValue, isDynamic } = getSeverityValue(opening)

    if (isDynamic) {
      insertTodo('dynamic-severity')
      continue
    }

    const status = severityValue ? (SEVERITY_TO_STATUS[severityValue] ?? severityValue) : null

    if (isSelfClosing) {
      const props: string[] = []
      if (status) {
        props.push(`status="${status}"`)
      }
      if (shouldAddDefaultIcon(opening)) {
        props.push('icon')
      }
      edits.push(el.replace(`<Alert ${props.join(' ')} />`))
      migrated = true
      migrationMetric.increment({ action: 'alert-migrated', variant: 'self-closing' })
      continue
    }

    const { title, description, hasComplexContent } = extractChildContent(el, alertTitleLocalName)

    if (hasComplexContent) {
      insertTodo('complex-children')
      continue
    }

    const props: string[] = []
    if (status) {
      props.push(`status="${status}"`)
    }
    if (shouldAddDefaultIcon(opening)) {
      props.push('icon')
    }
    if (title) {
      props.push(`title="${title}"`)
    }
    if (description) {
      props.push(`description="${description}"`)
    }
    edits.push(el.replace(`<Alert ${props.join(' ')} />`))
    migrated = true
    migrationMetric.increment({ action: 'alert-migrated', variant: title ? 'with-title' : 'simple' })
  }

  return { preserveImport, migrated }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  // Local names use the same precedence as the original collection order:
  // barrel named imports win over per-path default imports.
  const labBarrelAlert = getImport(rootNode, { type: 'named', name: 'Alert', from: MUI_LAB_BARREL })
  const coreBarrelAlert = getImport(rootNode, { type: 'named', name: 'Alert', from: MUI_CORE_BARREL })
  const coreAlertDefault = getImport(rootNode, { type: 'default', from: MUI_CORE_ALERT_SOURCE })
  const labAlertDefault = getImport(rootNode, { type: 'default', from: MUI_LAB_ALERT_SOURCE })
  const labBarrelAlertTitle = getImport(rootNode, { type: 'named', name: 'AlertTitle', from: MUI_LAB_BARREL })
  const labAlertTitleDefault = getImport(rootNode, { type: 'default', from: MUI_LAB_ALERT_TITLE_SOURCE })

  const alertLocalName =
    labBarrelAlert?.alias ?? coreBarrelAlert?.alias ?? coreAlertDefault?.alias ?? labAlertDefault?.alias ?? null
  const alertTitleLocalName = labBarrelAlertTitle?.alias ?? labAlertTitleDefault?.alias ?? null

  if (!alertLocalName) {
    return null
  }

  const { preserveImport, migrated } = transformAlertElements(rootNode, alertLocalName, alertTitleLocalName, edits)

  if (migrated) {
    const addEdit = addImport(rootNode, {
      type: 'named',
      specifiers: [{ name: 'Alert' }],
      from: BUI_SOURCE,
    })
    if (addEdit) {
      edits.push(addEdit)
      const hasBuiNamedImport =
        rootNode.find({
          rule: {
            kind: 'import_statement',
            all: [
              {
                has: {
                  kind: 'string',
                  has: { kind: 'string_fragment', regex: `^${escapeRegex(BUI_SOURCE)}$` },
                },
              },
              { has: { kind: 'import_clause', has: { kind: 'named_imports' } } },
            ],
          },
        }) !== null
      migrationMetric.increment({ action: hasBuiNamedImport ? 'import-merged' : 'import-added' })
    }
  }

  if (!preserveImport) {
    if (labBarrelAlert || labBarrelAlertTitle) {
      const names = [labBarrelAlert ? 'Alert' : null, labBarrelAlertTitle ? 'AlertTitle' : null].filter(
        (name): name is string => name !== null,
      )
      let removedAny = false
      for (const name of names) {
        const edit = removeImport(rootNode, { type: 'named', specifiers: [name], from: MUI_LAB_BARREL })
        if (edit) {
          edits.push(...edit)
          removedAny = true
        }
      }
      if (removedAny) {
        migrationMetric.increment({ action: 'import-removed' })
      }
    }
    if (coreBarrelAlert) {
      const edit = removeImport(rootNode, { type: 'named', specifiers: ['Alert'], from: MUI_CORE_BARREL })
      if (edit) {
        edits.push(...edit)
        migrationMetric.increment({ action: 'import-removed' })
      }
    }
    for (const source of [MUI_LAB_ALERT_SOURCE, MUI_CORE_ALERT_SOURCE, MUI_LAB_ALERT_TITLE_SOURCE]) {
      const edit = removeImport(rootNode, { type: 'default', from: source })
      if (edit) {
        edits.push(...edit)
        migrationMetric.increment({ action: 'import-removed' })
      }
    }
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
