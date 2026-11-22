import { MockFetchApi, MockErrorApi } from '@backstage/test-utils';
type X = MockFetchApi;
const fetch = new MockFetchApi();
import { mockApis } from '@backstage/frontend-test-utils';
let migrated: ReturnType<typeof mockApis.fetch>;
