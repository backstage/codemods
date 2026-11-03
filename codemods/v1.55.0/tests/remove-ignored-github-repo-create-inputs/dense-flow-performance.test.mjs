import { execFileSync } from 'node:child_process'
import { test } from 'node:test'

test('dense GitHub repo create flow preserves exact bytes without quadratic edits', () => {
  execFileSync('bash', ['scripts/test-dense-flow-performance.sh'], { stdio: 'inherit' })
})
