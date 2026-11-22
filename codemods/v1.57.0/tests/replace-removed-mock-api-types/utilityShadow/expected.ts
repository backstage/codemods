import { MockFetchApi, mockApis } from '@backstage/frontend-test-utils';
type ReturnType<T> = T;
type Fetch = MockFetchApi;
type Options = NonNullable<Parameters<typeof mockApis.fetch>[0]>;
