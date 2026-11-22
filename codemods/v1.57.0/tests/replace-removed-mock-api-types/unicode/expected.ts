// © Café — ✨
import type { mockApis } from '@backstage/frontend-test-utils';
import { MockErrorApi } from '@backstage/frontend-test-utils';
type Fetch = ReturnType<typeof mockApis.fetch>;
type Config = ReturnType<typeof mockApis.config>;
// Renders für users — ✨
function create() {
  // TODO(backstage-codemod): use mockApis.error()
  return new MockErrorApi();
}
