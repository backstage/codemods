import type { Codemod, SgNode } from 'codemod:ast-grep'
import type JSON from 'codemod:ast-grep/langs/json'
import { setState } from 'codemod:workflow'

function pair(object: SgNode<JSON>, name: string): SgNode<JSON> | undefined {
  return object.children().find((node) => node.is('pair') && node.field('key').text() === `"${name}"`)
}

const transform: Codemod<JSON> = (root) => {
  const pkg = root.root().find({ rule: { kind: 'object' } })
  let compatible = false
  if (pkg) {
    // A devDependency alone cannot support a runtime configSchema import in a published package.
    for (const group of ['dependencies', 'peerDependencies']) {
      const dependencies = pair(pkg, group)?.field('value')
      const version = dependencies?.is('object') ? pair(dependencies, 'zod')?.field('value') : undefined
      // Accept only a single v4-only specifier; unions and open-ended ranges can resolve to v3/v5.
      if (version?.is('string') && /^"(?:\^|~|=)?4(?:\.(?:\d+|x|\*))?(?:\.(?:\d+|x|\*))?"$/.test(version.text())) {
        compatible = true
      }
    }
  }
  const file = root.relativeFilename().replaceAll('\\', '/')
  const directory = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : ''
  setState(`zod-v4-package:${directory}`, compatible)
  return Promise.resolve(null)
}

export default transform
