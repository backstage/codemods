// Generic structural validation for migration-recipe workflows. Every recipe
// gets this through run-recipe-tests, so a recipe only needs tests for its
// recipe-specific behavior (ordering, parameter bindings).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import YAML from 'yaml'

interface WorkflowStep {
  name?: string
  codemod?: unknown
  'js-ast-grep'?: { js_file?: string }
  env?: Record<string, string>
}

interface WorkflowNode {
  id?: string
  steps?: WorkflowStep[]
}

interface WorkflowDoc {
  nodes?: WorkflowNode[]
}

/**
 * Validates workflow.yaml against the recipe conventions and returns every
 * violation:
 * - steps must not nest registry codemods (`codemod:` source); recipes bundle
 *   their transform scripts locally
 * - every `js-ast-grep` step must reference an existing local script
 * - every run step's CODEMOD_SCRIPT must exist under scripts/
 */
export function validateWorkflow(recipeDir: string): string[] {
  const problems: string[] = []
  const doc = YAML.parse(readFileSync(join(recipeDir, 'workflow.yaml'), 'utf8')) as WorkflowDoc
  for (const node of doc.nodes ?? []) {
    const steps = node.steps ?? []
    steps.forEach((step: WorkflowStep, index: number) => {
      const label = `node '${node.id ?? '?'}' step ${index}${step.name === undefined ? '' : ` ('${step.name}')`}`
      if (step.codemod !== undefined) {
        problems.push(`${label}: registry codemod steps are not allowed; bundle the script locally under scripts/`)
      }
      const jsFile = step['js-ast-grep']?.js_file
      if (jsFile !== undefined && !existsSync(join(recipeDir, jsFile))) {
        problems.push(`${label}: js_file '${jsFile}' does not exist`)
      }
      const shellScript = step.env?.CODEMOD_SCRIPT
      if (shellScript !== undefined && !existsSync(join(recipeDir, shellScript))) {
        problems.push(`${label}: CODEMOD_SCRIPT '${shellScript}' does not exist`)
      }
    })
  }
  return problems
}
