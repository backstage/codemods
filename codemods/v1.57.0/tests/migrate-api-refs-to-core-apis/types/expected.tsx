import type { ApiRef } from '@backstage/frontend-plugin-api';
import { useApi } from '@backstage/frontend-plugin-api/alpha';
import { coreApis } from '@backstage/frontend-plugin-api';
type Config = typeof coreApis.config;
type Discovery = typeof coreApis.discovery;
const consume = (ref: ApiRef<unknown>) => useApi(ref);
