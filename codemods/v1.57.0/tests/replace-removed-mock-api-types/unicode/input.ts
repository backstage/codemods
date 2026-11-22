// © Café — ✨
import type { MockFetchApi } from '@backstage/frontend-test-utils';
import type { MockConfigApi } from '@backstage/frontend-test-utils';
import { MockErrorApi } from '@backstage/frontend-test-utils';
type Fetch = MockFetchApi;
type Config = MockConfigApi;
// Renders für users — ✨
function create() {
  return new MockErrorApi();
}
