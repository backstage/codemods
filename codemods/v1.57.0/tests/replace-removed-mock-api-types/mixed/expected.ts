import { MockFetchApi, mockApis } from '@backstage/frontend-test-utils';
let fetchApi: ReturnType<typeof mockApis.fetch>;
// TODO(backstage-codemod): use mockApis.fetch()
const fetch = new MockFetchApi();
let errors: ReturnType<typeof mockApis.error>;
