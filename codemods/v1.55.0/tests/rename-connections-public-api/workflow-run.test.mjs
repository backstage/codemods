import { execFileSync } from 'node:child_process'
import { test } from 'node:test'

test('rename connections workflow changes only matching files and isolates Git state', () => {
  execFileSync('bash', ['scripts/workflow-run.test.sh'], { stdio: 'inherit' })
})
