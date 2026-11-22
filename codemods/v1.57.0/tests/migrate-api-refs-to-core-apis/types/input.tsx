import type { configApiRef, ApiRef } from '@backstage/frontend-plugin-api';
import { type discoveryApiRef, useApi } from '@backstage/frontend-plugin-api/alpha';
type Config = typeof configApiRef;
type Discovery = typeof discoveryApiRef;
const consume = (ref: ApiRef<unknown>) => useApi(ref);
