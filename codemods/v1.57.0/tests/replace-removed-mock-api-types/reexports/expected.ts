// TODO(backstage-codemod): MockFetchApi was removed from @backstage/frontend-test-utils in 1.57; export type MockFetchApi = ReturnType<typeof mockApis.fetch> instead.
// TODO(backstage-codemod): ErrorWithContext was removed from @backstage/frontend-test-utils in 1.57; export type ErrorWithContext = ReturnType<ReturnType<typeof mockApis.error>['getErrors']>[number] instead.
export { MockFetchApi, type ErrorWithContext } from '@backstage/frontend-test-utils';
// TODO(backstage-codemod): MockErrorApiOptions was removed from @backstage/frontend-test-utils in 1.57; export type MockErrorApiOptions = NonNullable<Parameters<typeof mockApis.error>[0]> instead.
export type { MockErrorApiOptions as Options } from '@backstage/frontend-test-utils';
