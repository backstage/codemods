import { mockApis as m, type mockApis as backstageMockApis } from '@backstage/frontend-test-utils';
function build<m>(fetch: ReturnType<typeof backstageMockApis.fetch>): m {
  return {} as m;
}
